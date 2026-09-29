import { NotFoundException } from '@nestjs/common';
import {
  AiProvider,
  HealthStatus,
  MessageRole,
  Prisma,
  ProviderType,
  UsageCategory,
} from '@prisma/client';
import { CHAT_TITLE_MAX_LENGTH } from '../../common/constants/chat.constants';
import { SseEvent } from '../../common/sse/sse-writer';
import { PrismaService } from '../../prisma/prisma.service';
import { AiCompletionService } from '../providers/ai-completion.service';
import { ProvidersService } from '../providers/providers.service';
import { ChatService } from './chat.service';

const USER_ID = 'user-1';

const provider: AiProvider = {
  id: 'prov-1',
  name: 'OpenAI',
  type: ProviderType.OPENAI,
  apiKeyEncrypted: 'v1:iv:tag:ct',
  baseUrl: null,
  defaultModel: 'gpt-test',
  isEnabled: true,
  isDefault: true,
  lastHealthCheckAt: null,
  lastHealthCheckStatus: HealthStatus.UNKNOWN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const completion = {
  content: 'Hello there',
  model: 'gpt-test-2026',
  usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
};

describe('ChatService', () => {
  let tx: {
    chat: { create: jest.Mock; update: jest.Mock };
    chatMessage: { create: jest.Mock };
  };
  let prisma: {
    chat: { findFirst: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let aiCompletion: { complete: jest.Mock; stream: jest.Mock };
  let service: ChatService;

  beforeEach(() => {
    tx = {
      chat: {
        create: jest.fn(({ data }) =>
          Promise.resolve({ id: 'chat-new', title: data.title }),
        ),
        update: jest.fn(({ where }) =>
          Promise.resolve({ id: where.id, title: 'Existing' }),
        ),
      },
      chatMessage: {
        create: jest.fn(({ data }) =>
          Promise.resolve({
            id: `msg-${data.role}`,
            providerId: null,
            tokenCount: null,
            createdAt: new Date(),
            ...data,
          }),
        ),
      },
    };
    prisma = {
      chat: { findFirst: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    aiCompletion = {
      complete: jest.fn().mockResolvedValue(completion),
      stream: jest.fn(),
    };
    service = new ChatService(
      prisma as unknown as PrismaService,
      {
        resolveForCompletion: jest.fn().mockResolvedValue(provider),
      } as unknown as ProvidersService,
      aiCompletion as unknown as AiCompletionService,
    );
  });

  describe('sendMessage', () => {
    it('starts a new chat titled from the first message and saves both turns', async () => {
      const content = `  Explain   the event loop ${'x'.repeat(100)}`;

      const response = await service.sendMessage(USER_ID, { content });

      const { data } = tx.chat.create.mock.calls[0][0];
      expect(data.userId).toBe(USER_ID);
      expect(data.title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX_LENGTH);
      expect(data.title.startsWith('Explain the event loop')).toBe(true);

      const saved = tx.chatMessage.create.mock.calls.map(([{ data }]) => data);
      expect(saved.map((m) => m.role)).toEqual([
        MessageRole.USER,
        MessageRole.ASSISTANT,
      ]);
      expect(saved[1]).toMatchObject({
        providerId: 'prov-1',
        tokenCount: 3,
        content: 'Hello there',
      });
      expect(response).toMatchObject({
        chatId: 'chat-new',
        model: 'gpt-test-2026',
        usage: completion.usage,
      });
    });

    it('sends recent history oldest-first, followed by the new message', async () => {
      prisma.chat.findFirst.mockResolvedValue({
        messages: [
          { role: MessageRole.ASSISTANT, content: 'second' },
          { role: MessageRole.USER, content: 'first' },
        ],
      });

      await service.sendMessage(USER_ID, { content: 'third', chatId: 'c1' });

      expect(prisma.chat.findFirst.mock.calls[0][0].where).toEqual({
        id: 'c1',
        userId: USER_ID,
      });
      const [, input, context] = aiCompletion.complete.mock.calls[0];
      expect(input.messages.map((m) => m.content)).toEqual([
        'first',
        'second',
        'third',
      ]);
      expect(context.category).toBe(UsageCategory.CHAT);
      expect(tx.chat.update).toHaveBeenCalled();
      expect(tx.chat.create).not.toHaveBeenCalled();
    });

    it("404s on someone else's chat before calling the provider", async () => {
      prisma.chat.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(USER_ID, { content: 'hi', chatId: 'not-mine' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(aiCompletion.complete).not.toHaveBeenCalled();
    });

    it('saves nothing when the provider call fails', async () => {
      aiCompletion.complete.mockRejectedValue(new Error('provider down'));

      await expect(
        service.sendMessage(USER_ID, { content: 'hi' }),
      ).rejects.toThrow('provider down');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s if the chat is deleted while the provider is answering', async () => {
      prisma.chat.findFirst.mockResolvedValue({ messages: [] });
      tx.chat.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.sendMessage(USER_ID, { content: 'hi', chatId: 'c1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('streamMessage', () => {
    it('yields deltas, then a done event with the saved exchange', async () => {
      aiCompletion.stream.mockImplementation(async function* () {
        yield { type: 'delta', content: 'Hello ' };
        yield { type: 'delta', content: 'there' };
        yield { type: 'done', result: completion };
      });

      const events: SseEvent[] = [];
      const stream = await service.streamMessage(
        USER_ID,
        { content: 'hi' },
        new AbortController().signal,
      );
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.map((e) => e.event)).toEqual(['delta', 'delta', 'done']);
      expect(events[2].data).toMatchObject({ chatId: 'chat-new' });
      expect(tx.chatMessage.create).toHaveBeenCalledTimes(2);
    });

    it('validates chat ownership eagerly, before the stream is returned', async () => {
      prisma.chat.findFirst.mockResolvedValue(null);

      await expect(
        service.streamMessage(
          USER_ID,
          { content: 'hi', chatId: 'not-mine' },
          new AbortController().signal,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteChat', () => {
    it('is scoped to the owner and 404s otherwise', async () => {
      prisma.chat.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteChat(USER_ID, 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.chat.deleteMany).toHaveBeenCalledWith({
        where: { id: 'c1', userId: USER_ID },
      });
    });
  });
});

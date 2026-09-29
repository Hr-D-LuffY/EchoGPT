import { BadGatewayException, HttpStatus } from '@nestjs/common';
import {
  AiProvider,
  HealthStatus,
  MessageRole,
  ProviderType,
  UsageCategory,
} from '@prisma/client';
import { UsageLogsService } from '../usage-logs/usage-logs.service';
import { CompletionStreamEvent } from './adapters/ai-provider-adapter.interface';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { AiCompletionService, AiStreamEvent } from './ai-completion.service';
import { ProvidersService } from './providers.service';

const provider: AiProvider = {
  id: 'prov-1',
  name: 'Claude',
  type: ProviderType.CLAUDE,
  apiKeyEncrypted: 'v1:iv:tag:ct',
  baseUrl: null,
  defaultModel: null,
  isEnabled: true,
  isDefault: true,
  lastHealthCheckAt: null,
  lastHealthCheckStatus: HealthStatus.UNKNOWN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const input = {
  messages: [{ role: MessageRole.USER, content: 'Hi' }],
  maxOutputTokens: 100,
};

const context = {
  userId: 'user-1',
  category: UsageCategory.CHAT,
  endpoint: 'POST /chats/messages',
};

async function* fromArray(
  events: CompletionStreamEvent[],
  failWith?: Error,
): AsyncGenerator<CompletionStreamEvent> {
  yield* events;
  if (failWith) {
    throw failWith;
  }
}

describe('AiCompletionService', () => {
  let adapter: { complete: jest.Mock; stream: jest.Mock };
  let usageLogs: { record: jest.Mock };
  let service: AiCompletionService;

  beforeEach(() => {
    adapter = { complete: jest.fn(), stream: jest.fn() };
    usageLogs = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AiCompletionService(
      {
        getCredentials: () => ({ apiKey: 'k', baseUrl: 'https://x.test' }),
      } as unknown as ProvidersService,
      { get: () => adapter } as unknown as ProviderAdapterRegistry,
      usageLogs as unknown as UsageLogsService,
    );
  });

  it('uses the fallback model when the provider has none configured', async () => {
    adapter.complete.mockResolvedValue({
      content: 'Hello',
      model: 'claude-haiku-4-5',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });

    await service.complete(provider, input, context);

    expect(adapter.complete.mock.calls[0][1].model).toBe('claude-haiku-4-5');
  });

  it('logs a successful call with its token total', async () => {
    adapter.complete.mockResolvedValue({
      content: 'Hello',
      model: 'm',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });

    await service.complete(provider, input, context);

    expect(usageLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        ...context,
        providerId: 'prov-1',
        statusCode: HttpStatus.OK,
        tokensUsed: 5,
      }),
    );
  });

  it('logs a failed call with its status and rethrows the same error', async () => {
    const failure = new BadGatewayException('provider down');
    adapter.complete.mockRejectedValue(failure);

    await expect(service.complete(provider, input, context)).rejects.toBe(
      failure,
    );
    expect(usageLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_GATEWAY,
        tokensUsed: null,
      }),
    );
  });

  it('streams deltas, merges partial usage, and ends with a done event', async () => {
    adapter.stream.mockReturnValue(
      fromArray([
        { type: 'usage', usage: { promptTokens: 9 } },
        { type: 'delta', content: 'Hel' },
        { type: 'delta', content: 'lo' },
        { type: 'usage', usage: { completionTokens: 2 } },
      ]),
    );

    const events: AiStreamEvent[] = [];
    for await (const event of service.stream(provider, input, context)) {
      events.push(event);
    }

    expect(events.slice(0, 2)).toEqual([
      { type: 'delta', content: 'Hel' },
      { type: 'delta', content: 'lo' },
    ]);
    expect(events[2]).toEqual({
      type: 'done',
      result: {
        content: 'Hello',
        model: 'claude-haiku-4-5',
        usage: { promptTokens: 9, completionTokens: 2, totalTokens: 11 },
      },
    });
    expect(usageLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.OK, tokensUsed: 11 }),
    );
  });

  it('treats a stream with no text as a failure', async () => {
    adapter.stream.mockReturnValue(
      fromArray([{ type: 'usage', usage: { promptTokens: 9 } }]),
    );

    const drain = async () => {
      for await (const event of service.stream(provider, input, context)) {
        expect(event).toBeUndefined();
      }
    };

    await expect(drain()).rejects.toBeInstanceOf(BadGatewayException);
    expect(usageLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.BAD_GATEWAY }),
    );
  });

  it('logs and rethrows a mid-stream failure', async () => {
    const failure = new BadGatewayException('cut off');
    adapter.stream.mockReturnValue(
      fromArray([{ type: 'delta', content: 'Hel' }], failure),
    );

    const seen: AiStreamEvent[] = [];
    const drain = async () => {
      for await (const event of service.stream(provider, input, context)) {
        seen.push(event);
      }
    };

    await expect(drain()).rejects.toBe(failure);
    expect(seen).toEqual([{ type: 'delta', content: 'Hel' }]);
    expect(usageLogs.record).toHaveBeenCalledTimes(1);
  });
});

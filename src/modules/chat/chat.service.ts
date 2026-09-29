import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiProvider,
  ChatMessage,
  MessageRole,
  Prisma,
  UsageCategory,
} from '@prisma/client';
import {
  CHAT_CONTEXT_MESSAGE_LIMIT,
  CHAT_ENDPOINT,
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_STREAM_ENDPOINT,
  CHAT_TITLE_MAX_LENGTH,
} from '../../common/constants/chat.constants';
import {
  SSE_EVENT_DELTA,
  SSE_EVENT_DONE,
} from '../../common/constants/sse.constants';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SseEvent } from '../../common/sse/sse-writer';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CompletionMessage,
  CompletionResult,
} from '../providers/adapters/ai-provider-adapter.interface';
import {
  AiCompletionService,
  CompletionContext,
  CompletionInput,
} from '../providers/ai-completion.service';
import { ProvidersService } from '../providers/providers.service';
import { ChatDetailResponseDto } from './dto/chat-detail-response.dto';
import { ChatListResponseDto } from './dto/chat-list-response.dto';
import { ChatMessageResponseDto } from './dto/chat-message-response.dto';
import { SendMessageResponseDto } from './dto/send-message-response.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** Everything needed to call the provider and then save the exchange. */
interface PreparedExchange {
  userId: string;
  chatId: string | null;
  provider: AiProvider;
  userContent: string;
  userMessageAt: Date;
  input: CompletionInput;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providersService: ProvidersService,
    private readonly aiCompletion: AiCompletionService,
  ) {}

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    const exchange = await this.prepareExchange(userId, dto);
    const result = await this.aiCompletion.complete(
      exchange.provider,
      exchange.input,
      this.completionContext(userId, CHAT_ENDPOINT),
    );
    return this.persistExchange(exchange, result);
  }

  /**
   * Validation (chat ownership, provider choice) runs eagerly, so its
   * errors surface before the stream opens. The returned iterable then
   * yields `delta` events and a final `done` event with the saved exchange.
   */
  async streamMessage(
    userId: string,
    dto: SendMessageDto,
    signal: AbortSignal,
  ): Promise<AsyncIterable<SseEvent>> {
    const exchange = await this.prepareExchange(userId, dto);
    return this.streamExchange(exchange, signal);
  }

  async listChats(
    userId: string,
    { page, limit }: PaginationQueryDto,
  ): Promise<ChatListResponseDto> {
    const where: Prisma.ChatWhereInput = { userId };
    const [chats, total] = await this.prisma.$transaction([
      this.prisma.chat.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.chat.count({ where }),
    ]);

    return {
      items: chats.map(({ _count, ...chat }) => ({
        id: chat.id,
        title: chat.title,
        messageCount: _count.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      })),
      meta: PaginationMetaDto.of(page, limit, total),
    };
  }

  async getChat(
    userId: string,
    chatId: string,
  ): Promise<ChatDetailResponseDto> {
    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: chat.messages.map((m) => this.toMessageResponse(m)),
    };
  }

  /** Messages go with it (ON DELETE CASCADE); usage logs are kept. */
  async deleteChat(userId: string, chatId: string): Promise<void> {
    const { count } = await this.prisma.chat.deleteMany({
      where: { id: chatId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Chat not found');
    }
  }

  private async prepareExchange(
    userId: string,
    { content, chatId, providerId }: SendMessageDto,
  ): Promise<PreparedExchange> {
    const history = chatId ? await this.loadHistory(userId, chatId) : [];
    const provider =
      await this.providersService.resolveForCompletion(providerId);

    return {
      userId,
      chatId: chatId ?? null,
      provider,
      userContent: content,
      userMessageAt: new Date(),
      input: {
        messages: [...history, { role: MessageRole.USER, content }],
        maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      },
    };
  }

  /**
   * The most recent messages, oldest first. Exchanges are saved in
   * user/assistant pairs, so an even-sized window always starts on a user
   * turn — which Claude and Gemini require.
   */
  private async loadHistory(
    userId: string,
    chatId: string,
  ): Promise<CompletionMessage[]> {
    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, userId },
      select: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: CHAT_CONTEXT_MESSAGE_LIMIT,
          select: { role: true, content: true },
        },
      },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    return chat.messages.reverse();
  }

  private async *streamExchange(
    exchange: PreparedExchange,
    signal: AbortSignal,
  ): AsyncGenerator<SseEvent> {
    const events = this.aiCompletion.stream(
      exchange.provider,
      exchange.input,
      this.completionContext(exchange.userId, CHAT_STREAM_ENDPOINT),
      signal,
    );

    for await (const event of events) {
      if (event.type === 'delta') {
        yield { event: SSE_EVENT_DELTA, data: { content: event.content } };
        continue;
      }
      yield {
        event: SSE_EVENT_DONE,
        data: await this.persistExchange(exchange, event.result),
      };
    }
  }

  /**
   * Saves the user message and the reply together, only once the provider
   * has answered — a failed call leaves no half-finished exchange behind.
   * Explicit timestamps keep the pair ordered even inside one transaction.
   */
  private async persistExchange(
    exchange: PreparedExchange,
    result: CompletionResult,
  ): Promise<SendMessageResponseDto> {
    const { chat, userMessage, assistantMessage } = await this.prisma
      .$transaction(async (tx) => {
        const chat = exchange.chatId
          ? await tx.chat.update({
              where: { id: exchange.chatId },
              data: { updatedAt: new Date() },
            })
          : await tx.chat.create({
              data: {
                userId: exchange.userId,
                title: this.titleFrom(exchange.userContent),
              },
            });

        const userMessage = await tx.chatMessage.create({
          data: {
            chatId: chat.id,
            role: MessageRole.USER,
            content: exchange.userContent,
            createdAt: exchange.userMessageAt,
          },
        });
        const assistantMessage = await tx.chatMessage.create({
          data: {
            chatId: chat.id,
            role: MessageRole.ASSISTANT,
            content: result.content,
            providerId: exchange.provider.id,
            tokenCount: result.usage.completionTokens,
          },
        });
        return { chat, userMessage, assistantMessage };
      })
      .catch((error: unknown) => {
        throw this.chatDeletedMidRequest(error) ?? error;
      });

    return {
      chatId: chat.id,
      title: chat.title,
      model: result.model,
      userMessage: this.toMessageResponse(userMessage),
      assistantMessage: this.toMessageResponse(assistantMessage),
      usage: result.usage,
    };
  }

  /** The chat was deleted while the provider was answering. */
  private chatDeletedMidRequest(error: unknown): NotFoundException | null {
    const isMissingRecord =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025';
    return isMissingRecord ? new NotFoundException('Chat not found') : null;
  }

  private titleFrom(content: string): string {
    return content.replace(/\s+/g, ' ').slice(0, CHAT_TITLE_MAX_LENGTH).trim();
  }

  private completionContext(
    userId: string,
    endpoint: string,
  ): CompletionContext {
    return { userId, category: UsageCategory.CHAT, endpoint };
  }

  private toMessageResponse(message: ChatMessage): ChatMessageResponseDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      providerId: message.providerId,
      tokenCount: message.tokenCount,
      createdAt: message.createdAt,
    };
  }
}

import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AiProvider, UsageCategory } from '@prisma/client';
import { PROVIDER_FALLBACK_MODELS } from '../../common/constants/provider.constants';
import { UsageLogsService } from '../usage-logs/usage-logs.service';
import {
  CompletionMessage,
  CompletionRequest,
  CompletionResult,
  TokenUsage,
} from './adapters/ai-provider-adapter.interface';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { ProvidersService } from './providers.service';

export interface CompletionInput {
  messages: CompletionMessage[];
  maxOutputTokens: number;
}

/** Who the call is for and where it came from — for the usage log. */
export interface CompletionContext {
  userId: string;
  category: UsageCategory;
  endpoint: string;
}

export type AiStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; result: CompletionResult };

/**
 * The one entry point feature modules (chat, search) use to run a
 * completion: picks the model, decrypts credentials, calls the vendor
 * adapter, and records every attempt — success or failure — in
 * `ApiUsageLog`.
 */
@Injectable()
export class AiCompletionService {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly adapterRegistry: ProviderAdapterRegistry,
    private readonly usageLogs: UsageLogsService,
  ) {}

  async complete(
    provider: AiProvider,
    input: CompletionInput,
    context: CompletionContext,
  ): Promise<CompletionResult> {
    const request = this.buildRequest(provider, input);
    const credentials = this.providersService.getCredentials(provider);
    const startedAt = Date.now();

    try {
      const result = await this.adapterRegistry
        .get(provider.type)
        .complete(credentials, request);
      await this.logUsage(provider, context, startedAt, HttpStatus.OK, result);
      return result;
    } catch (error) {
      await this.logUsage(provider, context, startedAt, this.statusOf(error));
      throw error;
    }
  }

  /**
   * Yields text deltas as they arrive, then one `done` event carrying the
   * assembled result. Usage is logged once the stream ends either way.
   */
  async *stream(
    provider: AiProvider,
    input: CompletionInput,
    context: CompletionContext,
    signal?: AbortSignal,
  ): AsyncGenerator<AiStreamEvent> {
    const request = this.buildRequest(provider, input);
    const credentials = this.providersService.getCredentials(provider);
    const startedAt = Date.now();
    let content = '';
    let usage: TokenUsage = {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };

    try {
      const events = this.adapterRegistry
        .get(provider.type)
        .stream(credentials, request, signal);
      for await (const event of events) {
        if (event.type === 'usage') {
          usage = { ...usage, ...event.usage };
          continue;
        }
        content += event.content;
        yield event;
      }
      if (!content) {
        throw new BadGatewayException('AI provider returned an empty response');
      }
    } catch (error) {
      await this.logUsage(provider, context, startedAt, this.statusOf(error));
      throw error;
    }

    const result: CompletionResult = {
      content,
      model: request.model,
      usage: this.withTotal(usage),
    };
    await this.logUsage(provider, context, startedAt, HttpStatus.OK, result);
    yield { type: 'done', result };
  }

  private buildRequest(
    provider: AiProvider,
    { messages, maxOutputTokens }: CompletionInput,
  ): CompletionRequest {
    return {
      model: provider.defaultModel ?? PROVIDER_FALLBACK_MODELS[provider.type],
      messages,
      maxOutputTokens,
    };
  }

  /** Claude reports prompt and completion counts separately, never a total. */
  private withTotal(usage: TokenUsage): TokenUsage {
    if (usage.totalTokens !== null) {
      return usage;
    }
    const { promptTokens, completionTokens } = usage;
    return {
      ...usage,
      totalTokens:
        promptTokens !== null && completionTokens !== null
          ? promptTokens + completionTokens
          : null,
    };
  }

  private logUsage(
    provider: AiProvider,
    context: CompletionContext,
    startedAt: number,
    statusCode: number,
    result?: CompletionResult,
  ): Promise<void> {
    return this.usageLogs.record({
      ...context,
      providerId: provider.id,
      statusCode,
      durationMs: Date.now() - startedAt,
      tokensUsed: result?.usage.totalTokens ?? null,
    });
  }

  private statusOf(error: unknown): number {
    return error instanceof HttpException
      ? error.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

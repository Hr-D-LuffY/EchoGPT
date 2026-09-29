import { HttpException } from '@nestjs/common';
import { HealthStatus, ProviderType } from '@prisma/client';
import {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResult,
  CompletionStreamEvent,
  HealthCheckResult,
} from '../../src/modules/providers/adapters/ai-provider-adapter.interface';

export const FAKE_REPLY = 'REST exposes fixed endpoints; GraphQL exposes one.';
export const FAKE_USAGE = {
  promptTokens: 12,
  completionTokens: 9,
  totalTokens: 21,
};

/**
 * Stands in for the vendor HTTP adapters so e2e tests exercise the whole
 * app (guards, quota, persistence, usage logs) without network or keys.
 * `failWith` makes the next calls fail like a real vendor error would.
 */
export class FakeAiAdapter implements AiProviderAdapter {
  readonly type = ProviderType.OPENAI;
  failWith: HttpException | null = null;
  readonly requests: CompletionRequest[] = [];

  healthCheck(): Promise<HealthCheckResult> {
    return Promise.resolve({
      status: HealthStatus.HEALTHY,
      latencyMs: 1,
      message: null,
    });
  }

  complete(
    _credentials: unknown,
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    this.requests.push(request);
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve({
      content: FAKE_REPLY,
      model: request.model,
      usage: FAKE_USAGE,
    });
  }

  async *stream(
    _credentials: unknown,
    request: CompletionRequest,
  ): AsyncIterable<CompletionStreamEvent> {
    this.requests.push(request);
    if (this.failWith) {
      throw this.failWith;
    }
    for (const word of FAKE_REPLY.split(/(?<= )/)) {
      await Promise.resolve();
      yield { type: 'delta', content: word };
    }
    yield { type: 'usage', usage: FAKE_USAGE };
  }

  reset(): void {
    this.failWith = null;
    this.requests.length = 0;
  }
}

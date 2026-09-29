import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HealthStatus, ProviderType } from '@prisma/client';
import { setTimeout as delay } from 'timers/promises';
import {
  CLIENT_CLOSED_REQUEST_STATUS,
  PROVIDER_COMPLETION_TIMEOUT_MS,
  PROVIDER_ERROR_BODY_LOG_LENGTH,
  PROVIDER_HEALTH_CHECK_TIMEOUT_MS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_RETRY_DELAY_MS,
} from '../../../common/constants/provider.constants';
import {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResult,
  CompletionStreamEvent,
  HealthCheckResult,
  ProviderCredentials,
  TokenUsage,
} from './ai-provider-adapter.interface';

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** What a vendor's non-streamed response boils down to, before validation. */
export interface ParsedCompletion {
  content: string | null;
  model: string | null;
  usage: TokenUsage;
}

/** OpenAI's stream terminator; the other vendors just end the stream. */
const SSE_DONE_SENTINEL = '[DONE]';

/**
 * Shared HTTP plumbing: timeout, retry, SSE parsing and error mapping.
 * Concrete adapters only describe *what* to call and how to read the
 * vendor's response shape.
 *
 * Every failure of a completion call surfaces as an HttpException:
 * 502 (provider rejected or unreachable), 504 (timed out) or 499 (the
 * client disconnected). Never an empty completion.
 */
export abstract class HttpProviderAdapter implements AiProviderAdapter {
  abstract readonly type: ProviderType;

  private readonly logger = new Logger(this.constructor.name);

  /** A cheap authenticated call — the provider's model-list endpoint. */
  protected abstract buildHealthCheckRequest(
    credentials: ProviderCredentials,
  ): ProviderRequest;

  protected abstract buildCompletionRequest(
    credentials: ProviderCredentials,
    request: CompletionRequest,
    stream: boolean,
  ): ProviderRequest;

  protected abstract parseCompletion(body: unknown): ParsedCompletion;

  /** Maps one parsed SSE `data:` payload to zero or more stream events. */
  protected abstract parseStreamChunk(chunk: unknown): CompletionStreamEvent[];

  async healthCheck(
    credentials: ProviderCredentials,
  ): Promise<HealthCheckResult> {
    const { url, headers } = this.buildHealthCheckRequest(credentials);
    const startedAt = Date.now();

    // Network failures are the *answer* to a health check, not an error in
    // it: they are recorded as UNHEALTHY with the reason, never dropped.
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(PROVIDER_HEALTH_CHECK_TIMEOUT_MS),
      });
      await response.body?.cancel();

      return {
        status: response.ok ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        latencyMs: Date.now() - startedAt,
        message: response.ok
          ? null
          : `Provider responded with HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        latencyMs: Date.now() - startedAt,
        message: this.describeNetworkError(
          error,
          PROVIDER_HEALTH_CHECK_TIMEOUT_MS,
        ),
      };
    }
  }

  async complete(
    credentials: ProviderCredentials,
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    const response = await this.send(
      this.buildCompletionRequest(credentials, request, false),
    );

    let parsed: ParsedCompletion;
    try {
      parsed = this.parseCompletion(await response.json());
    } catch (error) {
      throw this.toProviderError(error);
    }
    if (!parsed.content) {
      throw new BadGatewayException(
        'AI provider returned an empty or unrecognized response',
      );
    }

    return {
      content: parsed.content,
      model: parsed.model ?? request.model,
      usage: parsed.usage,
    };
  }

  async *stream(
    credentials: ProviderCredentials,
    request: CompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    const response = await this.send(
      this.buildCompletionRequest(credentials, request, true),
      signal,
    );

    try {
      for await (const data of this.readSseData(response.body)) {
        if (data === SSE_DONE_SENTINEL) {
          return;
        }
        yield* this.parseStreamChunk(JSON.parse(data));
      }
    } catch (error) {
      throw this.toProviderError(error, signal);
    }
  }

  protected trimTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }

  /**
   * POSTs with a timeout and retries transient failures (429, 5xx, network)
   * before any response body is read. Streamed calls are never retried
   * mid-body — output already sent to the user can't be taken back.
   */
  private async send(
    { url, headers, body }: ProviderRequest,
    clientSignal?: AbortSignal,
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(PROVIDER_COMPLETION_TIMEOUT_MS);
    const signal = clientSignal
      ? AbortSignal.any([timeout, clientSignal])
      : timeout;

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < PROVIDER_MAX_RETRIES;
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (canRetry && !signal.aborted) {
          await this.waitBeforeRetry(signal, clientSignal);
          continue;
        }
        throw this.toProviderError(error, clientSignal);
      }

      if (response.ok) {
        return response;
      }
      if (canRetry && this.isRetryableStatus(response.status)) {
        await response.body?.cancel();
        await this.waitBeforeRetry(signal, clientSignal);
        continue;
      }
      await this.logRejection(response);
      throw new BadGatewayException(
        `AI provider responded with HTTP ${response.status}`,
      );
    }
  }

  private async waitBeforeRetry(
    signal: AbortSignal,
    clientSignal?: AbortSignal,
  ): Promise<void> {
    try {
      await delay(PROVIDER_RETRY_DELAY_MS, undefined, { signal });
    } catch (error) {
      throw this.toProviderError(error, clientSignal);
    }
  }

  private isRetryableStatus(status: number): boolean {
    return (
      status === HttpStatus.TOO_MANY_REQUESTS ||
      status >= HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  /**
   * The vendor's error body (e.g. "invalid model") goes to server logs for
   * operators; the client only sees the status, since the body can describe
   * our account or configuration.
   */
  private async logRejection(response: Response): Promise<void> {
    const detail = await response
      .text()
      .catch(
        (error: unknown) =>
          `<unreadable body: ${this.networkErrorReason(error)}>`,
      );
    this.logger.warn(
      `${this.type} responded with HTTP ${response.status}: ${detail.slice(0, PROVIDER_ERROR_BODY_LOG_LENGTH)}`,
    );
  }

  /** Yields the payload of each `data:` line of an SSE body. */
  private async *readSseData(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      yield* this.extractSseData(lines);
    }
    yield* this.extractSseData([buffer + decoder.decode()]);
  }

  private *extractSseData(lines: string[]): Generator<string> {
    for (const line of lines) {
      if (line.startsWith('data:')) {
        yield line.slice('data:'.length).trim();
      }
    }
  }

  private toProviderError(
    error: unknown,
    clientSignal?: AbortSignal,
  ): HttpException {
    if (error instanceof HttpException) {
      return error;
    }
    if (clientSignal?.aborted) {
      return new HttpException(
        'Client closed the request',
        CLIENT_CLOSED_REQUEST_STATUS,
      );
    }
    if (error instanceof SyntaxError) {
      return new BadGatewayException(
        'AI provider returned a malformed response',
        { cause: error },
      );
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return new GatewayTimeoutException(
        `AI provider timed out after ${PROVIDER_COMPLETION_TIMEOUT_MS}ms`,
        { cause: error },
      );
    }
    return new BadGatewayException(
      `AI provider request failed: ${this.networkErrorReason(error)}`,
      { cause: error },
    );
  }

  private describeNetworkError(error: unknown, timeoutMs: number): string {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return `Timed out after ${timeoutMs}ms`;
    }
    if (!(error instanceof Error)) {
      return 'Request failed';
    }
    return `Request failed: ${this.networkErrorReason(error)}`;
  }

  private networkErrorReason(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'unknown error';
    }
    // undici wraps the real reason (ECONNREFUSED, ENOTFOUND, ...) in `cause`.
    const { cause } = error as Error & { cause?: unknown };
    return cause instanceof Error ? cause.message : error.message;
  }
}

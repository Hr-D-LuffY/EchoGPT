import { HealthStatus, MessageRole, ProviderType } from '@prisma/client';

export interface ProviderCredentials {
  apiKey: string;
  baseUrl: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs: number;
  message: string | null;
}

export interface CompletionMessage {
  role: MessageRole;
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: CompletionMessage[];
  maxOutputTokens: number;
}

/** Any field a provider doesn't report is null. */
export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface CompletionResult {
  content: string;
  model: string;
  usage: TokenUsage;
}

/**
 * A streamed completion is a sequence of text deltas plus usage reports.
 * Providers report usage in pieces (Claude: prompt tokens first, completion
 * tokens last), so each `usage` event carries only what it knows.
 */
export type CompletionStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'usage'; usage: Partial<TokenUsage> };

/**
 * One implementation per provider type. Callers never touch provider
 * HTTP details (URLs, auth headers, error shapes) directly.
 */
export interface AiProviderAdapter {
  readonly type: ProviderType;
  healthCheck(credentials: ProviderCredentials): Promise<HealthCheckResult>;
  complete(
    credentials: ProviderCredentials,
    request: CompletionRequest,
  ): Promise<CompletionResult>;
  stream(
    credentials: ProviderCredentials,
    request: CompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent>;
}

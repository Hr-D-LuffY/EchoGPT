import { ProviderType } from '@prisma/client';

/** Used when a provider has no `baseUrl` override. */
export const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  [ProviderType.OPENAI]: 'https://api.openai.com/v1',
  [ProviderType.CLAUDE]: 'https://api.anthropic.com/v1',
  [ProviderType.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta',
};

export const ANTHROPIC_API_VERSION = '2023-06-01';

export const PROVIDER_HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Used when a provider has no `defaultModel` set. Cheap, fast tiers. */
export const PROVIDER_FALLBACK_MODELS: Record<ProviderType, string> = {
  [ProviderType.OPENAI]: 'gpt-4o-mini',
  [ProviderType.CLAUDE]: 'claude-haiku-4-5',
  [ProviderType.GEMINI]: 'gemini-2.5-flash',
};

/** Covers the whole call, including a streamed body. */
export const PROVIDER_COMPLETION_TIMEOUT_MS = 60_000;

/** Retries after the first attempt, for 429 / 5xx / network errors only. */
export const PROVIDER_MAX_RETRIES = 1;

export const PROVIDER_RETRY_DELAY_MS = 500;

/** How much of a provider's error body is kept in server logs. */
export const PROVIDER_ERROR_BODY_LOG_LENGTH = 500;

/** Not in HttpStatus — nginx's convention for "client went away". */
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

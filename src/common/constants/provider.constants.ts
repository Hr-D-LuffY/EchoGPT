import { ProviderType } from '@prisma/client';

/** Used when a provider has no `baseUrl` override. */
export const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  [ProviderType.OPENAI]: 'https://api.openai.com/v1',
  [ProviderType.CLAUDE]: 'https://api.anthropic.com/v1',
  [ProviderType.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta',
};

export const ANTHROPIC_API_VERSION = '2023-06-01';

export const PROVIDER_HEALTH_CHECK_TIMEOUT_MS = 5000;

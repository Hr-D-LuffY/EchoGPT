import { HealthStatus, ProviderType } from '@prisma/client';

export interface ProviderCredentials {
  apiKey: string;
  baseUrl: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs: number;
  message: string | null;
}

/**
 * One implementation per provider type. Callers never touch provider
 * HTTP details (URLs, auth headers, error shapes) directly.
 */
export interface AiProviderAdapter {
  readonly type: ProviderType;
  healthCheck(credentials: ProviderCredentials): Promise<HealthCheckResult>;
}

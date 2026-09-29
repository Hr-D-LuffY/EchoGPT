import { HealthStatus, ProviderType } from '@prisma/client';
import { PROVIDER_HEALTH_CHECK_TIMEOUT_MS } from '../../../common/constants/provider.constants';
import {
  AiProviderAdapter,
  HealthCheckResult,
  ProviderCredentials,
} from './ai-provider-adapter.interface';

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Shared HTTP plumbing (timeout, latency, error mapping). Concrete
 * adapters only describe *what* to call — URL and auth headers.
 */
export abstract class HttpProviderAdapter implements AiProviderAdapter {
  abstract readonly type: ProviderType;

  /** A cheap authenticated call — the provider's model-list endpoint. */
  protected abstract buildHealthCheckRequest(
    credentials: ProviderCredentials,
  ): ProviderRequest;

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
        message: this.describeNetworkError(error),
      };
    }
  }

  protected trimTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private describeNetworkError(error: unknown): string {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return `Timed out after ${PROVIDER_HEALTH_CHECK_TIMEOUT_MS}ms`;
    }
    if (!(error instanceof Error)) {
      return 'Request failed';
    }
    // undici wraps the real reason (ECONNREFUSED, ENOTFOUND, ...) in `cause`.
    const { cause } = error as Error & { cause?: unknown };
    const reason = cause instanceof Error ? cause.message : error.message;
    return `Request failed: ${reason}`;
  }
}

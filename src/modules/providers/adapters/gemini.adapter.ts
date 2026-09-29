import { Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { ProviderCredentials } from './ai-provider-adapter.interface';
import { HttpProviderAdapter, ProviderRequest } from './http-provider.adapter';

@Injectable()
export class GeminiAdapter extends HttpProviderAdapter {
  readonly type = ProviderType.GEMINI;

  protected buildHealthCheckRequest({
    apiKey,
    baseUrl,
  }: ProviderCredentials): ProviderRequest {
    // Header rather than the `?key=` query param, so the key never ends up
    // in URL-based logs.
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models`,
      headers: { 'x-goog-api-key': apiKey },
    };
  }
}

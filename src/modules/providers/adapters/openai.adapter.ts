import { Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { ProviderCredentials } from './ai-provider-adapter.interface';
import { HttpProviderAdapter, ProviderRequest } from './http-provider.adapter';

@Injectable()
export class OpenAiAdapter extends HttpProviderAdapter {
  readonly type = ProviderType.OPENAI;

  protected buildHealthCheckRequest({
    apiKey,
    baseUrl,
  }: ProviderCredentials): ProviderRequest {
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models`,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  }
}

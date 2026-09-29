import { Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { ANTHROPIC_API_VERSION } from '../../../common/constants/provider.constants';
import { ProviderCredentials } from './ai-provider-adapter.interface';
import { HttpProviderAdapter, ProviderRequest } from './http-provider.adapter';

@Injectable()
export class ClaudeAdapter extends HttpProviderAdapter {
  readonly type = ProviderType.CLAUDE;

  protected buildHealthCheckRequest({
    apiKey,
    baseUrl,
  }: ProviderCredentials): ProviderRequest {
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
    };
  }
}

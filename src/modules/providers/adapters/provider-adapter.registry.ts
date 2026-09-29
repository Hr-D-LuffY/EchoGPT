import { Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { AiProviderAdapter } from './ai-provider-adapter.interface';
import { ClaudeAdapter } from './claude.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAiAdapter } from './openai.adapter';

/** Resolves the adapter for a provider type. */
@Injectable()
export class ProviderAdapterRegistry {
  private readonly adapters: Record<ProviderType, AiProviderAdapter>;

  constructor(
    openAi: OpenAiAdapter,
    claude: ClaudeAdapter,
    gemini: GeminiAdapter,
  ) {
    this.adapters = {
      [ProviderType.OPENAI]: openAi,
      [ProviderType.CLAUDE]: claude,
      [ProviderType.GEMINI]: gemini,
    };
  }

  get(type: ProviderType): AiProviderAdapter {
    return this.adapters[type];
  }
}

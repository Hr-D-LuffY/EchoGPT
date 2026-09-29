import { Module } from '@nestjs/common';
import { EncryptionService } from '../../common/services/encryption.service';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    EncryptionService,
    OpenAiAdapter,
    ClaudeAdapter,
    GeminiAdapter,
    ProviderAdapterRegistry,
  ],
  exports: [ProvidersService, ProviderAdapterRegistry],
})
export class ProvidersModule {}

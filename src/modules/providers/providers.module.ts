import { Module } from '@nestjs/common';
import { EncryptionService } from '../../common/services/encryption.service';
import { UsageLogsModule } from '../usage-logs/usage-logs.module';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { AiCompletionService } from './ai-completion.service';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  imports: [UsageLogsModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    AiCompletionService,
    EncryptionService,
    OpenAiAdapter,
    ClaudeAdapter,
    GeminiAdapter,
    ProviderAdapterRegistry,
  ],
  exports: [ProvidersService, AiCompletionService],
})
export class ProvidersModule {}

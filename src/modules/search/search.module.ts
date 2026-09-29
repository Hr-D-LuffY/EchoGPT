import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { WikipediaClient } from './sources/wikipedia.client';

@Module({
  imports: [ProvidersModule, SubscriptionsModule],
  controllers: [SearchController],
  providers: [SearchService, WikipediaClient],
})
export class SearchModule {}

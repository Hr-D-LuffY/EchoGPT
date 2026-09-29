import { Module } from '@nestjs/common';
import { UsageQuotaInterceptor } from './interceptors/usage-quota.interceptor';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, UsageQuotaInterceptor],
  exports: [SubscriptionsService, UsageQuotaInterceptor],
})
export class SubscriptionsModule {}

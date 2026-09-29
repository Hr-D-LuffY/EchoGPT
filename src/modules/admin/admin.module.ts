import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminHealthController } from './admin-health.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { SystemHealthService } from './system-health.service';

/**
 * Admin panel APIs. Provider management is not duplicated here: the
 * admin-only `/providers` routes (Part 6) are the provider admin API.
 */
@Module({
  imports: [ProvidersModule, SubscriptionsModule],
  controllers: [
    AdminUsersController,
    AdminSubscriptionsController,
    AdminAnalyticsController,
    AdminHealthController,
  ],
  providers: [
    AdminUsersService,
    AdminSubscriptionsService,
    AdminAnalyticsService,
    SystemHealthService,
  ],
  exports: [SystemHealthService],
})
export class AdminModule {}

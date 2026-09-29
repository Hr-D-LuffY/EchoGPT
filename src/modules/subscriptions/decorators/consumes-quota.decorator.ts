import { applyDecorators, HttpStatus, UseInterceptors } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { UsageQuotaInterceptor } from '../interceptors/usage-quota.interceptor';

/**
 * Marks a route as costing one request from the caller's plan quota
 * (chat, search). The owning module must import SubscriptionsModule.
 */
export const ConsumesQuota = () =>
  applyDecorators(
    UseInterceptors(UsageQuotaInterceptor),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Subscription is not active',
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: 'Request limit reached for the current billing period',
    }),
  );

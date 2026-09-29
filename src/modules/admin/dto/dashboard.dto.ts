import { ApiProperty } from '@nestjs/swagger';
import { UsageMetricsDto } from './analytics.dto';

export class DashboardUsersDto {
  @ApiProperty({ example: 1523, description: 'Excludes deleted accounts' })
  total: number;

  @ApiProperty({ example: 1498 })
  active: number;

  @ApiProperty({ example: 25 })
  suspended: number;

  @ApiProperty({ example: 3 })
  admins: number;

  @ApiProperty({ example: 1210 })
  emailVerified: number;

  @ApiProperty({ example: 184, description: 'Signed up in the last 30 days' })
  newLast30Days: number;
}

export class PlanMixDto {
  @ApiProperty({ example: 1401 })
  FREE: number;

  @ApiProperty({ example: 122 })
  PREMIUM: number;
}

export class DashboardSubscriptionsDto {
  @ApiProperty({
    type: PlanMixDto,
    description: 'ACTIVE subscriptions by tier',
  })
  planMix: PlanMixDto;

  @ApiProperty({
    example: 121878,
    description:
      'ACTIVE Premium subscriptions × list price, in cents. Billing is simulated, so this is an estimate, not collected revenue.',
  })
  estimatedMonthlyRevenueCents: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    example: 21874,
    description: "Sum of every user's requests in their current period",
  })
  quotaRequestsUsed: number;
}

export class DashboardContentDto {
  @ApiProperty({ example: 8410 })
  chats: number;

  @ApiProperty({ example: 60233 })
  chatMessages: number;

  @ApiProperty({ example: 12904 })
  searches: number;
}

export class DashboardProvidersDto {
  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 2 })
  enabled: number;

  @ApiProperty({ example: 2, description: 'Enabled and last check HEALTHY' })
  healthy: number;

  @ApiProperty({ example: 'OpenAI', nullable: true, type: String })
  defaultProvider: string | null;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardUsersDto })
  users: DashboardUsersDto;

  @ApiProperty({ type: DashboardSubscriptionsDto })
  subscriptions: DashboardSubscriptionsDto;

  @ApiProperty({
    type: UsageMetricsDto,
    description: 'AI provider calls in the last 30 days',
  })
  usageLast30Days: UsageMetricsDto;

  @ApiProperty({ example: 97, description: 'AI provider calls, last 24h' })
  requestsLast24h: number;

  @ApiProperty({ type: DashboardContentDto })
  content: DashboardContentDto;

  @ApiProperty({ type: DashboardProvidersDto })
  providers: DashboardProvidersDto;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  generatedAt: Date;
}

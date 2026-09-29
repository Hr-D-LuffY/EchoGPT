import { ApiProperty } from '@nestjs/swagger';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { UsageResponseDto } from './usage-response.dto';

export class SubscriptionResponseDto extends UsageResponseDto {
  @ApiProperty({ example: 'cmg4k2x0d0001abcd1234efgh' })
  id: string;

  @ApiProperty({ enum: PlanTier, example: PlanTier.FREE })
  tier: PlanTier;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  periodStart: Date;
}

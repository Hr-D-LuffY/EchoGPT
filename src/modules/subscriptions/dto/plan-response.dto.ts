import { ApiProperty } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';

export class PlanResponseDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.PREMIUM })
  tier: PlanTier;

  @ApiProperty({ example: 'Premium' })
  name: string;

  @ApiProperty({ example: 999, description: 'Monthly price in minor units' })
  priceMonthlyCents: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 2000, description: 'AI requests per billing period' })
  requestLimit: number;

  @ApiProperty({ example: 30 })
  periodDays: number;

  @ApiProperty({
    type: [String],
    example: ['2,000 AI requests per month', 'Chat and web search'],
  })
  features: string[];
}

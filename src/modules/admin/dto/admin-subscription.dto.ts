import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';
import { IsStrictBoolean } from '../../../common/decorators/is-strict-boolean.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SubscriptionResponseDto } from '../../subscriptions/dto/subscription-response.dto';

class SubscriptionFiltersDto {
  @ApiPropertyOptional({ enum: PlanTier })
  @IsOptional()
  @IsEnum(PlanTier)
  tier?: PlanTier;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class ListSubscriptionsQueryDto extends IntersectionType(
  PaginationQueryDto,
  SubscriptionFiltersDto,
) {}

/** At least one field is required. */
export class UpdateSubscriptionDto {
  @ApiPropertyOptional({
    enum: PlanTier,
    example: PlanTier.PREMIUM,
    description: "Also sets the request limit to the plan's limit",
  })
  @IsOptional()
  @IsEnum(PlanTier)
  tier?: PlanTier;

  @ApiPropertyOptional({
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
    description: 'Anything but ACTIVE blocks chat/search with 403',
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({
    example: true,
    description: "Zero the current period's usage counter",
  })
  @IsOptional()
  @IsStrictBoolean()
  resetUsage?: boolean;
}

export class AdminSubscriptionResponseDto extends SubscriptionResponseDto {
  @ApiProperty({ example: 'cmg1a2b3c0000abcd1234efgh' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  userEmail: string;
}

export class AdminSubscriptionListResponseDto {
  @ApiProperty({ type: [AdminSubscriptionResponseDto] })
  items: AdminSubscriptionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

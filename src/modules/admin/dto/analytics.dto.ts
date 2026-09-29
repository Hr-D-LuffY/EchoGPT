import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { ProviderType, UsageCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class DateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Inclusive. Defaults to 30 days before `to`.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Exclusive. Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export const LOG_OUTCOMES = ['success', 'error'] as const;
export type LogOutcome = (typeof LOG_OUTCOMES)[number];

class LogFiltersDto {
  @ApiPropertyOptional({ example: 'cmg1a2b3c0000abcd1234efgh' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ example: 'cmg4k2x0d0001abcd1234efgh' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerId?: string;

  @ApiPropertyOptional({ enum: UsageCategory })
  @IsOptional()
  @IsEnum(UsageCategory)
  category?: UsageCategory;

  @ApiPropertyOptional({
    enum: LOG_OUTCOMES,
    description: 'success = status < 400, error = status >= 400',
  })
  @IsOptional()
  @IsIn(LOG_OUTCOMES)
  outcome?: LogOutcome;

  @ApiPropertyOptional({ example: 502 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;
}

export class ListLogsQueryDto extends IntersectionType(
  PaginationQueryDto,
  IntersectionType(DateRangeQueryDto, LogFiltersDto),
) {}

export class UsageMetricsDto {
  @ApiProperty({ example: 1240 })
  requests: number;

  @ApiProperty({ example: 18 })
  errors: number;

  @ApiProperty({ example: 0.0145, description: 'errors / requests' })
  errorRate: number;

  @ApiProperty({ example: 512340 })
  tokens: number;

  @ApiProperty({ example: 1830, description: 'Mean provider call duration' })
  avgDurationMs: number;
}

export class CategoryUsageDto extends UsageMetricsDto {
  @ApiProperty({ enum: UsageCategory, example: UsageCategory.CHAT })
  category: UsageCategory;
}

export class ProviderUsageDto extends UsageMetricsDto {
  @ApiProperty({
    example: 'cmg4k2x0d0001abcd1234efgh',
    nullable: true,
    type: String,
    description: 'null for calls whose provider was later deleted',
  })
  providerId: string | null;

  @ApiProperty({ example: 'OpenAI', nullable: true, type: String })
  providerName: string | null;

  @ApiProperty({
    enum: ProviderType,
    example: ProviderType.OPENAI,
    nullable: true,
  })
  providerType: ProviderType | null;
}

export class DailyUsageDto extends UsageMetricsDto {
  @ApiProperty({ example: '2026-09-28', description: 'UTC day' })
  date: string;
}

export class TopUserDto {
  @ApiProperty({ example: 'cmg1a2b3c0000abcd1234efgh' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 310 })
  requests: number;

  @ApiProperty({ example: 98231 })
  tokens: number;
}

export class UsageAnalyticsResponseDto {
  @ApiProperty({ example: '2026-08-30T10:00:00.000Z' })
  from: Date;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  to: Date;

  @ApiProperty({ type: UsageMetricsDto })
  totals: UsageMetricsDto;

  @ApiProperty({ type: [CategoryUsageDto] })
  byCategory: CategoryUsageDto[];

  @ApiProperty({ type: [ProviderUsageDto] })
  byProvider: ProviderUsageDto[];

  @ApiProperty({
    type: [DailyUsageDto],
    description: 'One entry per UTC day in the range, zero-filled',
  })
  daily: DailyUsageDto[];

  @ApiProperty({ type: [TopUserDto], description: 'Up to 10, by requests' })
  topUsers: TopUserDto[];
}

export class UsageLogResponseDto {
  @ApiProperty({ example: 'cmg7d8e9f0001zxc1234vbnm' })
  id: string;

  @ApiProperty({ enum: UsageCategory, example: UsageCategory.CHAT })
  category: UsageCategory;

  @ApiProperty({ example: 'POST /chats/messages' })
  endpoint: string;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 1432, nullable: true, type: Number })
  durationMs: number | null;

  @ApiProperty({ example: 494, nullable: true, type: Number })
  tokensUsed: number | null;

  @ApiProperty({
    example: 'cmg1a2b3c0000abcd1234efgh',
    nullable: true,
    type: String,
  })
  userId: string | null;

  @ApiProperty({ example: 'jane@example.com', nullable: true, type: String })
  userEmail: string | null;

  @ApiProperty({
    example: 'cmg4k2x0d0001abcd1234efgh',
    nullable: true,
    type: String,
  })
  providerId: string | null;

  @ApiProperty({ example: 'OpenAI', nullable: true, type: String })
  providerName: string | null;

  @ApiProperty({ example: '2026-09-29T10:15:02.000Z' })
  createdAt: Date;
}

export class UsageLogListResponseDto {
  @ApiProperty({ type: [UsageLogResponseDto] })
  items: UsageLogResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import {
  PlanTier,
  RoleName,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

class UserFiltersDto {
  @ApiPropertyOptional({
    example: 'jane',
    description: 'Case-insensitive match on email or full name',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class ListUsersQueryDto extends IntersectionType(
  PaginationQueryDto,
  UserFiltersDto,
) {}

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.SUSPENDED,
    description: 'SUSPENDED also signs the user out of every session',
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: RoleName, example: RoleName.ADMIN })
  @IsEnum(RoleName)
  role: RoleName;
}

export class AdminUserSubscriptionDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.FREE })
  tier: PlanTier;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @ApiProperty({ example: 12 })
  requestsUsed: number;

  @ApiProperty({ example: 50 })
  requestLimit: number;

  @ApiProperty({ example: '2026-10-29T10:00:00.000Z' })
  periodEnd: Date;
}

export class AdminUserResponseDto {
  @ApiProperty({ example: 'cmg1a2b3c0000abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName: string;

  @ApiProperty({ enum: RoleName, example: RoleName.USER })
  role: RoleName;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty({ example: true })
  isEmailVerified: boolean;

  @ApiProperty({ type: AdminUserSubscriptionDto, nullable: true })
  subscription: AdminUserSubscriptionDto | null;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  createdAt: Date;
}

export class AdminUserActivityDto {
  @ApiProperty({ example: 14 })
  chats: number;

  @ApiProperty({ example: 37 })
  searches: number;

  @ApiProperty({ example: 2, description: 'Unrevoked, unexpired sessions' })
  activeSessions: number;

  @ApiProperty({ example: 212, description: 'AI provider calls, all time' })
  aiRequests: number;
}

export class AdminUserDetailResponseDto extends AdminUserResponseDto {
  @ApiProperty({ type: AdminUserActivityDto })
  activity: AdminUserActivityDto;
}

export class AdminUserListResponseDto {
  @ApiProperty({ type: [AdminUserResponseDto] })
  items: AdminUserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

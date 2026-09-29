import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthStatus, ProviderType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export enum SystemStatus {
  OK = 'ok',
  DEGRADED = 'degraded',
  DOWN = 'down',
}

export enum ComponentStatus {
  UP = 'up',
  DOWN = 'down',
}

export class SystemHealthQueryDto {
  @ApiPropertyOptional({
    example: false,
    description:
      'true pings every enabled provider now (and records the result); false reports the last stored check',
  })
  @IsOptional()
  // Read the raw query string: implicit conversion would turn "false" into true.
  @Transform(({ obj }) => obj.check === 'true' || obj.check === true)
  @IsBoolean()
  check: boolean = false;
}

export class DatabaseHealthDto {
  @ApiProperty({ enum: ComponentStatus, example: ComponentStatus.UP })
  status: ComponentStatus;

  @ApiProperty({ example: 42 })
  latencyMs: number;
}

export class ProviderHealthDto {
  @ApiProperty({ example: 'cmg4k2x0d0001abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  type: ProviderType;

  @ApiProperty({ example: true })
  isDefault: boolean;

  @ApiProperty({ enum: HealthStatus, example: HealthStatus.HEALTHY })
  status: HealthStatus;

  @ApiProperty({
    example: '2026-09-29T10:00:00.000Z',
    nullable: true,
    type: Date,
  })
  checkedAt: Date | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: 'Failure reason, only when checked live',
  })
  message: string | null;
}

export class SystemMemoryDto {
  @ApiProperty({ example: 182.4 })
  rssMb: number;

  @ApiProperty({ example: 96.1 })
  heapUsedMb: number;
}

export class SystemHealthResponseDto {
  @ApiProperty({
    enum: SystemStatus,
    example: SystemStatus.OK,
    description:
      'down = database unreachable; degraded = no usable default provider or an enabled provider is not HEALTHY',
  })
  status: SystemStatus;

  @ApiProperty({ example: 86400 })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  startedAt: Date;

  @ApiProperty({ example: 'production' })
  environment: string;

  @ApiProperty({ example: 'v24.21.0' })
  nodeVersion: string;

  @ApiProperty({ type: SystemMemoryDto })
  memory: SystemMemoryDto;

  @ApiProperty({ type: DatabaseHealthDto })
  database: DatabaseHealthDto;

  @ApiProperty({
    type: [ProviderHealthDto],
    description: 'Enabled providers only',
  })
  providers: ProviderHealthDto[];

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  timestamp: Date;
}

export class LivenessResponseDto {
  @ApiProperty({ enum: SystemStatus, example: SystemStatus.OK })
  status: SystemStatus;

  @ApiProperty({ enum: ComponentStatus, example: ComponentStatus.UP })
  database: ComponentStatus;

  @ApiProperty({ example: 86400 })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  timestamp: Date;
}

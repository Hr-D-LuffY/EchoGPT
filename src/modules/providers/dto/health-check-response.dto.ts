import { ApiProperty } from '@nestjs/swagger';
import { HealthStatus } from '@prisma/client';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'cmg4k2x0d0001abcd1234efgh' })
  providerId: string;

  @ApiProperty({ enum: HealthStatus, example: HealthStatus.UNHEALTHY })
  status: HealthStatus;

  @ApiProperty({ example: 212 })
  latencyMs: number;

  @ApiProperty({
    example: 'Provider responded with HTTP 401',
    nullable: true,
    type: String,
  })
  message: string | null;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  checkedAt: Date;
}

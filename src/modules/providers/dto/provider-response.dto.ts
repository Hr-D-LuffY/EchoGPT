import { ApiProperty } from '@nestjs/swagger';
import { HealthStatus, ProviderType } from '@prisma/client';

/** Admin view. The API key itself is never included — only whether one is set. */
export class ProviderResponseDto {
  @ApiProperty({ example: 'cmg4k2x0d0001abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  type: ProviderType;

  @ApiProperty({ example: null, nullable: true, type: String })
  baseUrl: string | null;

  @ApiProperty({ example: 'gpt-4o-mini', nullable: true, type: String })
  defaultModel: string | null;

  @ApiProperty({ example: true })
  isEnabled: boolean;

  @ApiProperty({ example: true })
  isDefault: boolean;

  @ApiProperty({ example: true })
  hasApiKey: boolean;

  @ApiProperty({ enum: HealthStatus, example: HealthStatus.HEALTHY })
  lastHealthCheckStatus: HealthStatus;

  @ApiProperty({
    example: '2026-09-29T10:00:00.000Z',
    nullable: true,
    type: Date,
  })
  lastHealthCheckAt: Date | null;

  @ApiProperty({ example: '2026-09-28T16:43:18.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  updatedAt: Date;
}

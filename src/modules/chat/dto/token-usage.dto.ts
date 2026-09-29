import { ApiProperty } from '@nestjs/swagger';

/** Fields a provider doesn't report are null. */
export class TokenUsageDto {
  @ApiProperty({ example: 312, nullable: true, type: Number })
  promptTokens: number | null;

  @ApiProperty({ example: 182, nullable: true, type: Number })
  completionTokens: number | null;

  @ApiProperty({ example: 494, nullable: true, type: Number })
  totalTokens: number | null;
}

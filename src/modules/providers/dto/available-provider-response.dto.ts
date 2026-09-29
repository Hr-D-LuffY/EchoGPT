import { ApiProperty } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';

/** What a regular user sees: enough to pick a provider, nothing operational. */
export class AvailableProviderResponseDto {
  @ApiProperty({ example: 'cmg4k2x0d0001abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  type: ProviderType;

  @ApiProperty({ example: 'gpt-4o-mini', nullable: true, type: String })
  defaultModel: string | null;

  @ApiProperty({ example: true })
  isDefault: boolean;
}

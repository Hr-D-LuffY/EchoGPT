import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrictBoolean } from '../../../common/decorators/is-strict-boolean.decorator';

export const PROVIDER_BASE_URL_OPTIONS = {
  protocols: ['https'],
  require_protocol: true,
};

export class CreateProviderDto {
  @ApiProperty({ example: 'OpenAI (production)' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  @IsEnum(ProviderType)
  type: ProviderType;

  @ApiPropertyOptional({
    example: 'sk-proj-abc123...',
    description:
      'Write-only — stored encrypted, never returned by any endpoint',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  @Matches(/^\S+$/, { message: 'apiKey must not contain whitespace' })
  apiKey?: string;

  @ApiPropertyOptional({
    example: 'https://api.openai.com/v1',
    description: "Overrides the provider's default API base URL (https only)",
  })
  @IsOptional()
  @IsUrl(PROVIDER_BASE_URL_OPTIONS)
  @MaxLength(255)
  baseUrl?: string;

  @ApiPropertyOptional({ example: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  defaultModel?: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Requires apiKey when true',
  })
  @IsOptional()
  @IsStrictBoolean()
  isEnabled?: boolean;
}

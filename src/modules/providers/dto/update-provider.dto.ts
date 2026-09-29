import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PROVIDER_BASE_URL_OPTIONS } from './create-provider.dto';

/**
 * `type` is immutable (a stored key belongs to one vendor) and enable /
 * default state have dedicated endpoints with their own rules.
 * `baseUrl` / `defaultModel` accept `null` to clear back to the default;
 * `name` / `apiKey` must be a string when present.
 */
export class UpdateProviderDto {
  @ApiPropertyOptional({ example: 'OpenAI (production)' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'sk-proj-new456...',
    description: 'Replaces the stored key. Write-only.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  @Matches(/^\S+$/, { message: 'apiKey must not contain whitespace' })
  apiKey?: string;

  @ApiPropertyOptional({
    example: 'https://api.openai.com/v1',
    nullable: true,
    description: 'null resets to the provider default',
  })
  @IsOptional()
  @IsUrl(PROVIDER_BASE_URL_OPTIONS)
  @MaxLength(255)
  baseUrl?: string | null;

  @ApiPropertyOptional({ example: 'gpt-4o', nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  defaultModel?: string | null;
}

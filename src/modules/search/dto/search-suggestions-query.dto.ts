import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_SUGGESTION_DEFAULT_LIMIT,
  SEARCH_SUGGESTION_MAX_LIMIT,
} from '../../../common/constants/search.constants';
import { normalizeQuery } from './run-search.dto';

export class SearchSuggestionsQueryDto {
  @ApiProperty({
    example: 'http',
    description: 'What the user has typed so far',
  })
  @Transform(normalizeQuery)
  @IsString()
  @MinLength(1)
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  q: string;

  @ApiPropertyOptional({
    example: SEARCH_SUGGESTION_DEFAULT_LIMIT,
    minimum: 1,
    maximum: SEARCH_SUGGESTION_MAX_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SEARCH_SUGGESTION_MAX_LIMIT)
  limit: number = SEARCH_SUGGESTION_DEFAULT_LIMIT;
}

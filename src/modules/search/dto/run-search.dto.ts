import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from '../../../common/constants/search.constants';

/** Collapses runs of whitespace so "rust   async" and "rust async" match. */
export const normalizeQuery = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;

export class RunSearchDto {
  @ApiProperty({
    example: 'How does HTTP/3 differ from HTTP/2?',
    minLength: SEARCH_QUERY_MIN_LENGTH,
    maxLength: SEARCH_QUERY_MAX_LENGTH,
  })
  @Transform(normalizeQuery)
  @IsString()
  @MinLength(SEARCH_QUERY_MIN_LENGTH)
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  query: string;

  @ApiPropertyOptional({
    example: 'cmg4k2x0d0001abcd1234efgh',
    description:
      'An id from GET /providers/available. Omit to use the default provider.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerId?: string;
}

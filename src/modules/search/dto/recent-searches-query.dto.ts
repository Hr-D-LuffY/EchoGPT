import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  SEARCH_RECENT_DEFAULT_LIMIT,
  SEARCH_RECENT_MAX_LIMIT,
} from '../../../common/constants/search.constants';

export class RecentSearchesQueryDto {
  @ApiPropertyOptional({
    example: SEARCH_RECENT_DEFAULT_LIMIT,
    minimum: 1,
    maximum: SEARCH_RECENT_MAX_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SEARCH_RECENT_MAX_LIMIT)
  limit: number = SEARCH_RECENT_DEFAULT_LIMIT;
}

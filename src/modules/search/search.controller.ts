import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { ApiCompletionErrors } from '../providers/decorators/api-completion-errors.decorator';
import { ConsumesQuota } from '../subscriptions/decorators/consumes-quota.decorator';
import { RecentSearchesQueryDto } from './dto/recent-searches-query.dto';
import { RunSearchDto } from './dto/run-search.dto';
import {
  RecentSearchDto,
  SearchHistoryResponseDto,
} from './dto/search-history-response.dto';
import {
  SearchResponseDto,
  SearchRunResponseDto,
} from './dto/search-response.dto';
import { SearchSuggestionsQueryDto } from './dto/search-suggestions-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth('access-token')
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'Missing or invalid access token',
})
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ConsumesQuota()
  @ApiCompletionErrors()
  @ApiOperation({
    summary: 'Run an AI-assisted web search',
    description:
      'Fetches web sources (Wikipedia) for the query and has the AI provider write a cited answer. A repeat of the same query within the cache TTL reuses the stored answer (`cached: true`). Costs one request from the plan quota either way; failed calls are refunded.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SearchRunResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  search(
    @CurrentUser() user: RequestUser,
    @Body() dto: RunSearchDto,
  ): Promise<SearchRunResponseDto> {
    return this.searchService.search(user.sub, dto);
  }

  @Get('history')
  @ApiOperation({ summary: "List the current user's searches, newest first" })
  @ApiResponse({ status: HttpStatus.OK, type: SearchHistoryResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid page/limit',
  })
  listHistory(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ): Promise<SearchHistoryResponseDto> {
    return this.searchService.listHistory(user.sub, query);
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'Get one past search with its answer and sources' })
  @ApiResponse({ status: HttpStatus.OK, type: SearchResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Search not found (or not yours)',
  })
  getHistoryItem(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<SearchResponseDto> {
    return this.searchService.getHistoryItem(user.sub, id);
  }

  @Delete('history/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one search from history' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Search not found (or not yours)',
  })
  async deleteHistoryItem(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.searchService.deleteHistoryItem(user.sub, id);
  }

  @Delete('history')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Clear the current user's search history" })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cleared' })
  async clearHistory(@CurrentUser() user: RequestUser): Promise<void> {
    await this.searchService.clearHistory(user.sub);
  }

  @Get('recent')
  @ApiOperation({
    summary: 'Recent distinct queries, for the search-box dropdown',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [RecentSearchDto] })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid limit',
  })
  listRecent(
    @CurrentUser() user: RequestUser,
    @Query() query: RecentSearchesQueryDto,
  ): Promise<RecentSearchDto[]> {
    return this.searchService.listRecent(user.sub, query);
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Autocomplete suggestions for a partial query',
    description:
      "The user's own matching past queries first, then Wikipedia article titles. Free — no quota cost.",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [String],
    example: ['http caching', 'HTTP/3', 'HTTP/2', 'HTTP cookie'],
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Missing q, or invalid limit',
  })
  suggest(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchSuggestionsQueryDto,
  ): Promise<string[]> {
    return this.searchService.suggest(user.sub, query);
  }
}

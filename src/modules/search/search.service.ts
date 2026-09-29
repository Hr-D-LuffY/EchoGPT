import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessageRole, Prisma, UsageCategory, WebSearch } from '@prisma/client';
import {
  SEARCH_CACHE_TTL_MS,
  SEARCH_ENDPOINT,
  SEARCH_MAX_OUTPUT_TOKENS,
  SEARCH_SOURCE_LIMIT,
  SEARCH_SYSTEM_PROMPT,
} from '../../common/constants/search.constants';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CompletionMessage } from '../providers/adapters/ai-provider-adapter.interface';
import { AiCompletionService } from '../providers/ai-completion.service';
import { ProvidersService } from '../providers/providers.service';
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
import { SearchSource, WikipediaClient } from './sources/wikipedia.client';

/** What `WebSearch.resultsJson` holds. */
interface StoredSearchResult {
  answer: string;
  sources: SearchSource[];
  providerId: string;
  model: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersService: ProvidersService,
    private readonly aiCompletion: AiCompletionService,
    private readonly wikipedia: WikipediaClient,
  ) {}

  /**
   * Reuses the user's own unexpired result for the same query when there is
   * one (the copy keeps the original expiry, so a hot query still refreshes
   * once the TTL is up). Either way the search lands in history.
   */
  async search(
    userId: string,
    { query, providerId }: RunSearchDto,
  ): Promise<SearchRunResponseDto> {
    const cached = await this.findCached(userId, query, providerId);
    if (cached) {
      const copy = await this.saveSearch(
        userId,
        query,
        this.readResults(cached),
        cached.expiresAt,
      );
      return { ...this.toResponse(copy), cached: true };
    }

    const results = await this.runFreshSearch(userId, query, providerId);
    const saved = await this.saveSearch(
      userId,
      query,
      results,
      new Date(Date.now() + SEARCH_CACHE_TTL_MS),
    );
    return { ...this.toResponse(saved), cached: false };
  }

  async listHistory(
    userId: string,
    { page, limit }: PaginationQueryDto,
  ): Promise<SearchHistoryResponseDto> {
    const where: Prisma.WebSearchWhereInput = { userId };
    const [searches, total] = await this.prisma.$transaction([
      this.prisma.webSearch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, query: true, createdAt: true },
      }),
      this.prisma.webSearch.count({ where }),
    ]);

    return {
      items: searches,
      meta: PaginationMetaDto.of(page, limit, total),
    };
  }

  async getHistoryItem(
    userId: string,
    searchId: string,
  ): Promise<SearchResponseDto> {
    const search = await this.prisma.webSearch.findFirst({
      where: { id: searchId, userId },
    });
    if (!search) {
      throw new NotFoundException('Search not found');
    }
    return this.toResponse(search);
  }

  async deleteHistoryItem(userId: string, searchId: string): Promise<void> {
    const { count } = await this.prisma.webSearch.deleteMany({
      where: { id: searchId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Search not found');
    }
  }

  async clearHistory(userId: string): Promise<void> {
    await this.prisma.webSearch.deleteMany({ where: { userId } });
  }

  /** Distinct queries, most recently searched first. */
  async listRecent(
    userId: string,
    { limit }: RecentSearchesQueryDto,
  ): Promise<RecentSearchDto[]> {
    const searches = await this.prisma.webSearch.findMany({
      where: { userId },
      distinct: ['query'],
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { query: true, createdAt: true },
    });
    return searches.map(({ query, createdAt }) => ({
      query,
      lastSearchedAt: createdAt,
    }));
  }

  /**
   * The user's own past queries first (most personal), topped up with
   * Wikipedia article titles. Free — no AI call, no quota.
   */
  async suggest(
    userId: string,
    { q, limit }: SearchSuggestionsQueryDto,
  ): Promise<string[]> {
    const [ownQueries, titles] = await Promise.all([
      this.prisma.webSearch.findMany({
        where: { userId, query: { startsWith: q, mode: 'insensitive' } },
        distinct: ['query'],
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { query: true },
      }),
      this.suggestFromSource(q, limit),
    ]);

    const seen = new Set<string>();
    return [...ownQueries.map(({ query }) => query), ...titles]
      .filter((suggestion) => {
        const key = suggestion.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  private findCached(
    userId: string,
    query: string,
    providerId: string | undefined,
  ): Promise<WebSearch | null> {
    return this.prisma.webSearch.findFirst({
      where: {
        userId,
        query: { equals: query, mode: 'insensitive' },
        expiresAt: { gt: new Date() },
        // An explicit provider choice only reuses that provider's answer.
        ...(providerId && {
          resultsJson: { path: ['providerId'], equals: providerId },
        }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Provider is resolved first so a bad providerId fails before any fetch. */
  private async runFreshSearch(
    userId: string,
    query: string,
    providerId: string | undefined,
  ): Promise<StoredSearchResult> {
    const provider =
      await this.providersService.resolveForCompletion(providerId);
    const sources = await this.wikipedia.search(query, SEARCH_SOURCE_LIMIT);
    const completion = await this.aiCompletion.complete(
      provider,
      {
        messages: this.buildPrompt(query, sources),
        maxOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
      },
      { userId, category: UsageCategory.SEARCH, endpoint: SEARCH_ENDPOINT },
    );

    return {
      answer: completion.content,
      sources,
      providerId: provider.id,
      model: completion.model,
    };
  }

  private buildPrompt(
    query: string,
    sources: SearchSource[],
  ): CompletionMessage[] {
    const sourceList = sources.length
      ? sources
          .map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${s.snippet}`)
          .join('\n\n')
      : 'No sources were found.';

    return [
      { role: MessageRole.SYSTEM, content: SEARCH_SYSTEM_PROMPT },
      {
        role: MessageRole.USER,
        content: `Query: ${query}\n\nSources:\n${sourceList}`,
      },
    ];
  }

  /**
   * Suggestions are a convenience: if Wikipedia is down, the user's own
   * history is still a useful answer, so the failure is logged and the
   * endpoint degrades instead of failing.
   */
  private async suggestFromSource(
    prefix: string,
    limit: number,
  ): Promise<string[]> {
    try {
      return await this.wikipedia.suggestTitles(prefix, limit);
    } catch (error) {
      this.logger.warn(
        `Suggestion source failed, serving history only: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private saveSearch(
    userId: string,
    query: string,
    results: StoredSearchResult,
    expiresAt: Date,
  ): Promise<WebSearch> {
    return this.prisma.webSearch.create({
      data: {
        userId,
        query,
        resultsJson: results as unknown as Prisma.InputJsonObject,
        expiresAt,
      },
    });
  }

  private readResults(search: WebSearch): StoredSearchResult {
    if (!search.resultsJson) {
      throw new InternalServerErrorException(
        `Search ${search.id} has no stored result`,
      );
    }
    return search.resultsJson as unknown as StoredSearchResult;
  }

  private toResponse(search: WebSearch): SearchResponseDto {
    const { answer, sources, providerId, model } = this.readResults(search);
    return {
      id: search.id,
      query: search.query,
      answer,
      sources,
      providerId,
      model,
      createdAt: search.createdAt,
      expiresAt: search.expiresAt,
    };
  }
}

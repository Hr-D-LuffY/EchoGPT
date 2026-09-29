import { NotFoundException } from '@nestjs/common';
import { MessageRole, UsageCategory, WebSearch } from '@prisma/client';
import { SEARCH_CACHE_TTL_MS } from '../../common/constants/search.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { AiCompletionService } from '../providers/ai-completion.service';
import { ProvidersService } from '../providers/providers.service';
import { SearchService } from './search.service';
import { WikipediaClient } from './sources/wikipedia.client';

const USER_ID = 'user-1';

const storedResult = {
  answer: 'HTTP/3 uses QUIC [1].',
  sources: [{ title: 'HTTP/3', url: 'https://w/HTTP%2F3', snippet: 's' }],
  providerId: 'prov-1',
  model: 'm',
};

function buildSearch(overrides: Partial<WebSearch> = {}): WebSearch {
  return {
    id: 'search-1',
    userId: USER_ID,
    query: 'http/3',
    resultsJson: storedResult,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SearchService', () => {
  let webSearch: Record<string, jest.Mock>;
  let wikipedia: { search: jest.Mock; suggestTitles: jest.Mock };
  let aiCompletion: { complete: jest.Mock };
  let providers: { resolveForCompletion: jest.Mock };
  let service: SearchService;

  beforeEach(() => {
    webSearch = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }) =>
        Promise.resolve(buildSearch({ ...data, id: 'search-new' })),
      ),
      deleteMany: jest.fn(),
    };
    wikipedia = {
      search: jest.fn().mockResolvedValue(storedResult.sources),
      suggestTitles: jest.fn().mockResolvedValue([]),
    };
    aiCompletion = {
      complete: jest.fn().mockResolvedValue({
        content: 'Fresh answer [1]',
        model: 'gpt-x',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    };
    providers = {
      resolveForCompletion: jest.fn().mockResolvedValue({ id: 'prov-2' }),
    };
    service = new SearchService(
      { webSearch } as unknown as PrismaService,
      providers as unknown as ProvidersService,
      aiCompletion as unknown as AiCompletionService,
      wikipedia as unknown as WikipediaClient,
    );
  });

  describe('search', () => {
    it('on a miss: fetches sources, asks the AI with them, stores with a TTL', async () => {
      const before = Date.now();

      const response = await service.search(USER_ID, { query: 'HTTP/3' });

      const [, input, context] = aiCompletion.complete.mock.calls[0];
      expect(input.messages[0].role).toBe(MessageRole.SYSTEM);
      expect(input.messages[1].content).toContain('[1] HTTP/3');
      expect(context.category).toBe(UsageCategory.SEARCH);

      const { data } = webSearch.create.mock.calls[0][0];
      expect(data.resultsJson).toMatchObject({
        answer: 'Fresh answer [1]',
        providerId: 'prov-2',
      });
      expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + SEARCH_CACHE_TTL_MS,
      );
      expect(response.cached).toBe(false);
    });

    it('on a hit: no provider or source call, history copy keeps the original expiry', async () => {
      const hit = buildSearch();
      webSearch.findFirst.mockResolvedValue(hit);

      const response = await service.search(USER_ID, { query: 'HTTP/3' });

      expect(aiCompletion.complete).not.toHaveBeenCalled();
      expect(wikipedia.search).not.toHaveBeenCalled();
      expect(webSearch.create.mock.calls[0][0].data.expiresAt).toBe(
        hit.expiresAt,
      );
      expect(response).toMatchObject({
        cached: true,
        answer: storedResult.answer,
      });
    });

    it('matches the cache case-insensitively, per user, unexpired only', async () => {
      await service.search(USER_ID, { query: 'HTTP/3' });

      const { where } = webSearch.findFirst.mock.calls[0][0];
      expect(where.userId).toBe(USER_ID);
      expect(where.query).toEqual({ equals: 'HTTP/3', mode: 'insensitive' });
      expect(where.expiresAt).toHaveProperty('gt');
      expect(where).not.toHaveProperty('resultsJson');
    });

    it('only reuses an answer from the explicitly requested provider', async () => {
      await service.search(USER_ID, { query: 'HTTP/3', providerId: 'prov-9' });

      const { where } = webSearch.findFirst.mock.calls[0][0];
      expect(where.resultsJson).toEqual({
        path: ['providerId'],
        equals: 'prov-9',
      });
    });

    it('fails fast on a bad provider, before fetching sources', async () => {
      providers.resolveForCompletion.mockRejectedValue(new NotFoundException());

      await expect(
        service.search(USER_ID, { query: 'HTTP/3', providerId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(wikipedia.search).not.toHaveBeenCalled();
    });
  });

  describe('suggest', () => {
    it('puts own queries first and dedupes case-insensitively', async () => {
      webSearch.findMany.mockResolvedValue([{ query: 'http caching' }]);
      wikipedia.suggestTitles.mockResolvedValue([
        'HTTP Caching',
        'HTTP/3',
        'HTTP/2',
      ]);

      const suggestions = await service.suggest(USER_ID, {
        q: 'http',
        limit: 3,
      });

      expect(suggestions).toEqual(['http caching', 'HTTP/3', 'HTTP/2']);
    });

    it('degrades to history-only when the source is down', async () => {
      webSearch.findMany.mockResolvedValue([{ query: 'http caching' }]);
      wikipedia.suggestTitles.mockRejectedValue(new Error('down'));

      const suggestions = await service.suggest(USER_ID, {
        q: 'http',
        limit: 5,
      });

      expect(suggestions).toEqual(['http caching']);
    });
  });

  describe('history', () => {
    it('404s when deleting a search that is not the user’s', async () => {
      webSearch.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteHistoryItem(USER_ID, 'search-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(webSearch.deleteMany).toHaveBeenCalledWith({
        where: { id: 'search-1', userId: USER_ID },
      });
    });

    it('getHistoryItem is scoped to the owner', async () => {
      webSearch.findFirst.mockResolvedValue(null);

      await expect(
        service.getHistoryItem(USER_ID, 'search-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(webSearch.findFirst).toHaveBeenCalledWith({
        where: { id: 'search-1', userId: USER_ID },
      });
    });
  });
});

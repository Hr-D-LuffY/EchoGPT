import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import {
  SEARCH_SOURCE_TIMEOUT_MS,
  WIKIPEDIA_ARTICLE_BASE_URL,
  WIKIPEDIA_REST_BASE_URL,
  WIKIPEDIA_USER_AGENT,
} from '../../../common/constants/search.constants';

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

interface WikipediaPage {
  key: string;
  title: string;
  excerpt?: string | null;
  description?: string | null;
}

interface WikipediaPagesResponse {
  pages?: WikipediaPage[];
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&nbsp;': ' ',
};

/**
 * Web source for AI-assisted search: Wikipedia's REST search API. Keyless,
 * so search works on a fresh install; swapping in a paid web-search API
 * (Brave, Tavily, ...) only means replacing this class.
 */
@Injectable()
export class WikipediaClient {
  async search(query: string, limit: number): Promise<SearchSource[]> {
    const pages = await this.fetchPages('/search/page', query, limit);
    return pages.map((page) => ({
      title: page.title,
      url: `${WIKIPEDIA_ARTICLE_BASE_URL}/${encodeURIComponent(page.key)}`,
      snippet: this.toPlainText(page.excerpt ?? page.description ?? ''),
    }));
  }

  /** Article titles starting with `prefix` — for search-box suggestions. */
  async suggestTitles(prefix: string, limit: number): Promise<string[]> {
    const pages = await this.fetchPages('/search/title', prefix, limit);
    return pages.map((page) => page.title);
  }

  private async fetchPages(
    path: string,
    query: string,
    limit: number,
  ): Promise<WikipediaPage[]> {
    const url = new URL(`${WIKIPEDIA_REST_BASE_URL}${path}`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': WIKIPEDIA_USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(SEARCH_SOURCE_TIMEOUT_MS),
      });
    } catch (error) {
      throw this.toSourceError(error);
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new BadGatewayException(
        `Search source responded with HTTP ${response.status}`,
      );
    }
    const body = (await response.json()) as WikipediaPagesResponse;
    return body.pages ?? [];
  }

  /** Excerpts mark matches with `<span class="searchmatch">` and escape entities. */
  private toPlainText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(
        /&(amp|lt|gt|quot|#039|nbsp);/g,
        (entity) => HTML_ENTITIES[entity],
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toSourceError(error: unknown): HttpException {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return new GatewayTimeoutException(
        `Search source timed out after ${SEARCH_SOURCE_TIMEOUT_MS}ms`,
        { cause: error },
      );
    }
    return new BadGatewayException('Search source is unreachable', {
      cause: error,
    });
  }
}

export const SEARCH_QUERY_MIN_LENGTH = 2;

export const SEARCH_QUERY_MAX_LENGTH = 300;

/** Sources fetched per search and handed to the AI provider. */
export const SEARCH_SOURCE_LIMIT = 5;

export const SEARCH_SOURCE_TIMEOUT_MS = 5000;

/** How long a stored result is served again for the same user + query. */
export const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

export const SEARCH_MAX_OUTPUT_TOKENS = 800;

export const SEARCH_RECENT_DEFAULT_LIMIT = 10;

export const SEARCH_RECENT_MAX_LIMIT = 50;

export const SEARCH_SUGGESTION_DEFAULT_LIMIT = 8;

export const SEARCH_SUGGESTION_MAX_LIMIT = 20;

export const SEARCH_ENDPOINT = 'POST /search';

/** Keyless, reliable, and returns URLs + snippets usable as citations. */
export const WIKIPEDIA_REST_BASE_URL = 'https://en.wikipedia.org/w/rest.php/v1';

export const WIKIPEDIA_ARTICLE_BASE_URL = 'https://en.wikipedia.org/wiki';

/** Wikimedia's API policy requires an identifying User-Agent. */
export const WIKIPEDIA_USER_AGENT =
  'EchoGPT-Backend/1.0 (https://github.com/Hr-D-Luffy)';

export const SEARCH_SYSTEM_PROMPT = [
  'You are the search assistant of a browser extension.',
  'Answer the query concisely using the numbered sources provided, citing them inline like [1] or [2][3].',
  'If the sources do not cover the query, say so briefly, then answer from general knowledge without citations.',
  'Do not invent sources or URLs.',
].join(' ');

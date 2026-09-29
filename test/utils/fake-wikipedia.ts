import { SearchSource } from '../../src/modules/search/sources/wikipedia.client';

export const FAKE_SOURCES: SearchSource[] = [
  {
    title: 'HTTP/3',
    url: 'https://en.wikipedia.org/wiki/HTTP/3',
    snippet: 'HTTP/3 is the third major version of HTTP, built on QUIC.',
  },
];
export const FAKE_TITLES = ['HTTP/3', 'HTTP/2'];

/** Stands in for the Wikipedia REST API (the web-search source). */
export class FakeWikipediaClient {
  search(): Promise<SearchSource[]> {
    return Promise.resolve(FAKE_SOURCES);
  }

  suggestTitles(): Promise<string[]> {
    return Promise.resolve(FAKE_TITLES);
  }
}

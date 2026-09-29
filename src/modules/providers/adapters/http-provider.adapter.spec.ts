import { HealthStatus } from '@prisma/client';
import { ClaudeAdapter } from './claude.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAiAdapter } from './openai.adapter';

const credentials = {
  apiKey: 'test-key-123',
  baseUrl: 'https://example.test/v1/',
};

describe('provider adapters', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it.each([
    [new OpenAiAdapter(), { Authorization: 'Bearer test-key-123' }],
    [
      new ClaudeAdapter(),
      { 'x-api-key': 'test-key-123', 'anthropic-version': '2023-06-01' },
    ],
    [new GeminiAdapter(), { 'x-goog-api-key': 'test-key-123' }],
  ])('%p calls /models with its own auth headers', async (adapter, headers) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await adapter.healthCheck(credentials);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/models');
    expect(init.headers).toEqual(headers);
    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toBeNull();
  });

  it('reports a non-2xx response as UNHEALTHY with the status code', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

    const result = await new OpenAiAdapter().healthCheck(credentials);

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('Provider responded with HTTP 401');
  });

  it('reports a network failure as UNHEALTHY with the underlying reason', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error('getaddrinfo ENOTFOUND'),
      }),
    );

    const result = await new ClaudeAdapter().healthCheck(credentials);

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('Request failed: getaddrinfo ENOTFOUND');
  });

  it('reports a timeout distinctly', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);

    const result = await new GeminiAdapter().healthCheck(credentials);

    expect(result.message).toMatch(/^Timed out after \d+ms$/);
  });
});

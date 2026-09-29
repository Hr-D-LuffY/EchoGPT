import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthStatus, MessageRole } from '@prisma/client';
import {
  CompletionRequest,
  CompletionStreamEvent,
} from './ai-provider-adapter.interface';
import { ClaudeAdapter } from './claude.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAiAdapter } from './openai.adapter';

const credentials = {
  apiKey: 'test-key-123',
  baseUrl: 'https://example.test/v1/',
};

const request: CompletionRequest = {
  model: 'test-model',
  maxOutputTokens: 256,
  messages: [
    { role: MessageRole.SYSTEM, content: 'Be brief.' },
    { role: MessageRole.USER, content: 'Hi' },
    { role: MessageRole.ASSISTANT, content: 'Hello!' },
    { role: MessageRole.USER, content: 'How are you?' },
  ],
};

function jsonResponse(body: unknown, status = HttpStatus.OK): Response {
  return new Response(JSON.stringify(body), { status });
}

/** An SSE body split mid-line across chunks, like a real network stream. */
function sseResponse(payloads: unknown[]): Response {
  const text = payloads
    .map((p) => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`)
    .join('');
  const middle = Math.floor(text.length / 2);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text.slice(0, middle)));
        controller.enqueue(encoder.encode(text.slice(middle)));
        controller.close();
      },
    }),
    { status: HttpStatus.OK },
  );
}

async function collect(
  events: AsyncIterable<CompletionStreamEvent>,
): Promise<CompletionStreamEvent[]> {
  const collected: CompletionStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function sentBody(fetchMock: jest.SpyInstance, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe('provider adapters', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('healthCheck', () => {
    it.each([
      [new OpenAiAdapter(), { Authorization: 'Bearer test-key-123' }],
      [
        new ClaudeAdapter(),
        { 'x-api-key': 'test-key-123', 'anthropic-version': '2023-06-01' },
      ],
      [new GeminiAdapter(), { 'x-goog-api-key': 'test-key-123' }],
    ])(
      '%p calls /models with its own auth headers',
      async (adapter, headers) => {
        fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

        const result = await adapter.healthCheck(credentials);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://example.test/v1/models');
        expect(init.headers).toEqual(headers);
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.message).toBeNull();
      },
    );

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

  describe('complete — request shape and parsing', () => {
    it('OpenAI: chat/completions, roles as-is, usage mapped', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          model: 'gpt-x-2026',
          choices: [{ message: { content: 'Fine, thanks.' } }],
          usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
        }),
      );

      const result = await new OpenAiAdapter().complete(credentials, request);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://example.test/v1/chat/completions',
      );
      const body = sentBody(fetchMock);
      expect(body.messages.map((m) => m.role)).toEqual([
        'system',
        'user',
        'assistant',
        'user',
      ]);
      expect(body.max_completion_tokens).toBe(256);
      expect(body.stream).toBeUndefined();
      expect(result).toEqual({
        content: 'Fine, thanks.',
        model: 'gpt-x-2026',
        usage: { promptTokens: 20, completionTokens: 4, totalTokens: 24 },
      });
    });

    it('Claude: system prompt lifted out of the turns, total computed', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          model: 'claude-x',
          content: [
            { type: 'text', text: 'Fine, ' },
            { type: 'text', text: 'thanks.' },
          ],
          usage: { input_tokens: 20, output_tokens: 4 },
        }),
      );

      const result = await new ClaudeAdapter().complete(credentials, request);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://example.test/v1/messages',
      );
      const body = sentBody(fetchMock);
      expect(body.system).toBe('Be brief.');
      expect(body.max_tokens).toBe(256);
      expect(body.messages.map((m) => m.role)).toEqual([
        'user',
        'assistant',
        'user',
      ]);
      expect(result.content).toBe('Fine, thanks.');
      expect(result.usage.totalTokens).toBe(24);
    });

    it('Gemini: model in the path, assistant role is "model"', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          modelVersion: 'gemini-x',
          candidates: [{ content: { parts: [{ text: 'Fine, thanks.' }] } }],
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 4,
            totalTokenCount: 24,
          },
        }),
      );

      const result = await new GeminiAdapter().complete(credentials, request);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://example.test/v1/models/test-model:generateContent',
      );
      const body = sentBody(fetchMock);
      expect(body.systemInstruction).toEqual({
        parts: [{ text: 'Be brief.' }],
      });
      expect(body.contents.map((c) => c.role)).toEqual([
        'user',
        'model',
        'user',
      ]);
      expect(body.generationConfig.maxOutputTokens).toBe(256);
      expect(result.content).toBe('Fine, thanks.');
      expect(result.usage.totalTokens).toBe(24);
    });

    it('falls back to the requested model name when the vendor omits it', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
      );

      const result = await new OpenAiAdapter().complete(credentials, request);

      expect(result.model).toBe('test-model');
      expect(result.usage.totalTokens).toBeNull();
    });
  });

  describe('complete — failures', () => {
    async function statusOf(promise: Promise<unknown>): Promise<number> {
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      return (error as HttpException).getStatus();
    }

    it('retries a 503 once, then succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('busy', { status: 503 }))
        .mockResolvedValueOnce(
          jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
        );

      const result = await new OpenAiAdapter().complete(credentials, request);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok');
    });

    it('does not retry a 401 and maps it to 502', async () => {
      fetchMock.mockResolvedValue(new Response('bad key', { status: 401 }));

      const status = await statusOf(
        new OpenAiAdapter().complete(credentials, request),
      );

      expect(status).toBe(HttpStatus.BAD_GATEWAY);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('gives up with 502 after the retry budget is spent', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response('busy', { status: 529 })),
      );

      const status = await statusOf(
        new ClaudeAdapter().complete(credentials, request),
      );

      expect(status).toBe(HttpStatus.BAD_GATEWAY);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('maps a timeout to 504', async () => {
      const timeout = new Error('timed out');
      timeout.name = 'TimeoutError';
      fetchMock.mockRejectedValue(timeout);

      // A timed-out signal is already aborted, so no retry is attempted.
      jest
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValueOnce(AbortSignal.abort(timeout));

      const status = await statusOf(
        new GeminiAdapter().complete(credentials, request),
      );

      expect(status).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty completion instead of returning ""', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));

      const status = await statusOf(
        new OpenAiAdapter().complete(credentials, request),
      );

      expect(status).toBe(HttpStatus.BAD_GATEWAY);
    });
  });

  describe('stream', () => {
    it('OpenAI: deltas, final usage chunk, [DONE]', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          { choices: [{ delta: { role: 'assistant' } }] },
          { choices: [{ delta: { content: 'Hel' } }] },
          { choices: [{ delta: { content: 'lo' } }] },
          {
            choices: [],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          },
          '[DONE]',
        ]),
      );

      const events = await collect(
        new OpenAiAdapter().stream(credentials, request),
      );

      expect(sentBody(fetchMock).stream_options).toEqual({
        include_usage: true,
      });
      expect(events).toEqual([
        { type: 'delta', content: 'Hel' },
        { type: 'delta', content: 'lo' },
        {
          type: 'usage',
          usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
        },
      ]);
    });

    it('Claude: usage split across message_start and message_delta', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          { type: 'message_start', message: { usage: { input_tokens: 9 } } },
          { type: 'content_block_start', content_block: { type: 'text' } },
          {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hi' },
          },
          { type: 'message_delta', usage: { output_tokens: 3 } },
          { type: 'message_stop' },
        ]),
      );

      const events = await collect(
        new ClaudeAdapter().stream(credentials, request),
      );

      expect(events).toEqual([
        { type: 'usage', usage: { promptTokens: 9 } },
        { type: 'delta', content: 'Hi' },
        { type: 'usage', usage: { completionTokens: 3 } },
      ]);
    });

    it('Claude: an error event mid-stream becomes a 502', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hi' },
          },
          { type: 'error', error: { type: 'overloaded_error' } },
        ]),
      );

      const iterator = new ClaudeAdapter()
        .stream(credentials, request)
        [Symbol.asyncIterator]();
      await iterator.next();
      const error = await iterator.next().catch((e: unknown) => e);

      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect((error as HttpException).message).toContain('overloaded_error');
    });

    it('Gemini: uses the SSE endpoint', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] },
          {
            candidates: [{ content: { parts: [{ text: '!' }] } }],
            usageMetadata: { promptTokenCount: 4, totalTokenCount: 6 },
          },
        ]),
      );

      const events = await collect(
        new GeminiAdapter().stream(credentials, request),
      );

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://example.test/v1/models/test-model:streamGenerateContent?alt=sse',
      );
      expect(events.filter((e) => e.type === 'delta')).toHaveLength(2);
    });

    it('maps a client disconnect to 499', async () => {
      const client = new AbortController();
      fetchMock.mockImplementation(() => {
        client.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      });

      const error = await collect(
        new OpenAiAdapter().stream(credentials, request, client.signal),
      ).catch((e: unknown) => e);

      expect((error as HttpException).getStatus()).toBe(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

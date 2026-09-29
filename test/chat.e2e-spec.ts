import { BadGatewayException, HttpStatus } from '@nestjs/common';
import { AiProvider, MessageRole, UsageCategory } from '@prisma/client';
import request from 'supertest';
import { FAKE_REPLY, FAKE_USAGE } from './utils/fake-ai-adapter';
import {
  bearer,
  cleanupTestData,
  createTestProvider,
  registerUser,
  TestUser,
} from './utils/fixtures';
import { createTestApp, TestApp } from './utils/test-app';

/**
 * Collects a whole SSE response body as text. superagent types the first
 * argument as its Response, but at parse time it is the raw Node stream.
 */
function readStream(
  res: request.Response,
  callback: (err: Error | null, body: string) => void,
): void {
  const stream = res as unknown as NodeJS.ReadableStream;
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => (body += chunk));
  stream.on('end', () => callback(null, body));
}

describe('Chat (e2e)', () => {
  let t: TestApp;
  let provider: AiProvider;
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    provider = await createTestProvider(t);
    owner = await registerUser(t.http, 'chat-owner');
    stranger = await registerUser(t.http, 'chat-stranger');
  });

  afterEach(() => t.fakeAi.reset());

  afterAll(async () => {
    await cleanupTestData(t, [provider.id]);
    await t.app.close();
  });

  const send = (user: TestUser, body: Record<string, unknown>) =>
    request(t.http)
      .post('/api/chats/messages')
      .set(bearer(user.accessToken))
      .send({ providerId: provider.id, ...body });

  const usedRequests = async (userId: string) =>
    (await t.prisma.subscription.findUniqueOrThrow({ where: { userId } }))
      .requestsUsed;

  it('401s without a token', async () => {
    await request(t.http)
      .post('/api/chats/messages')
      .send({ content: 'hi' })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('400s on an empty prompt without calling the provider', async () => {
    const res = await send(owner, { content: '   ' }).expect(
      HttpStatus.BAD_REQUEST,
    );
    expect(res.body.message).toBe('Validation failed');
    expect(t.fakeAi.requests).toHaveLength(0);
  });

  it('404s for an unknown provider', async () => {
    await send(owner, { content: 'hi', providerId: 'no-such-provider' }).expect(
      HttpStatus.NOT_FOUND,
    );
  });

  describe('a conversation', () => {
    let chatId: string;

    it('starts a chat, saves both messages, charges one request, and logs usage', async () => {
      const before = await usedRequests(owner.id);

      const res = await send(owner, {
        content: 'Compare REST and GraphQL',
      }).expect(HttpStatus.CREATED);

      chatId = res.body.data.chatId;
      expect(res.body.data).toMatchObject({
        model: 'fake-model',
        userMessage: { role: MessageRole.USER },
        assistantMessage: { role: MessageRole.ASSISTANT, content: FAKE_REPLY },
        usage: FAKE_USAGE,
      });
      expect(await usedRequests(owner.id)).toBe(before + 1);

      const log = await t.prisma.apiUsageLog.findFirst({
        where: { userId: owner.id, providerId: provider.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toMatchObject({
        category: UsageCategory.CHAT,
        statusCode: HttpStatus.OK,
        tokensUsed: FAKE_USAGE.totalTokens,
      });
    });

    it('continues the chat, sending prior messages as context', async () => {
      await send(owner, { content: 'Which is faster?', chatId }).expect(
        HttpStatus.CREATED,
      );

      const sent = t.fakeAi.requests[0].messages.map((m) => m.content);
      expect(sent).toEqual([
        'Compare REST and GraphQL',
        FAKE_REPLY,
        'Which is faster?',
      ]);
    });

    it('lists and returns the conversation with its full history', async () => {
      const list = await request(t.http)
        .get('/api/chats')
        .set(bearer(owner.accessToken))
        .expect(HttpStatus.OK);
      expect(list.body.data.items.map((c: { id: string }) => c.id)).toContain(
        chatId,
      );

      const detail = await request(t.http)
        .get(`/api/chats/${chatId}`)
        .set(bearer(owner.accessToken))
        .expect(HttpStatus.OK);
      expect(detail.body.data.messages).toHaveLength(4);
    });

    it("hides the chat from other users (404, not 403) and won't let them post to it", async () => {
      await request(t.http)
        .get(`/api/chats/${chatId}`)
        .set(bearer(stranger.accessToken))
        .expect(HttpStatus.NOT_FOUND);
      await send(stranger, { content: 'hijack', chatId }).expect(
        HttpStatus.NOT_FOUND,
      );
    });

    it('deletes the chat', async () => {
      await request(t.http)
        .delete(`/api/chats/${chatId}`)
        .set(bearer(owner.accessToken))
        .expect(HttpStatus.NO_CONTENT);
      await request(t.http)
        .get(`/api/chats/${chatId}`)
        .set(bearer(owner.accessToken))
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  it('refunds the request and logs the failure when the provider errors', async () => {
    t.fakeAi.failWith = new BadGatewayException('AI provider unavailable');
    const before = await usedRequests(owner.id);

    await send(owner, { content: 'hello?' }).expect(HttpStatus.BAD_GATEWAY);

    expect(await usedRequests(owner.id)).toBe(before);
    const failure = await t.prisma.apiUsageLog.findFirst({
      where: { userId: owner.id, statusCode: HttpStatus.BAD_GATEWAY },
    });
    expect(failure).not.toBeNull();
  });

  it('streams the reply as SSE delta events followed by done', async () => {
    const res = await request(t.http)
      .post('/api/chats/messages/stream')
      .set(bearer(owner.accessToken))
      .send({ providerId: provider.id, content: 'Stream please' })
      .buffer(true)
      .parse(readStream)
      .expect(HttpStatus.OK)
      .expect('Content-Type', /text\/event-stream/);

    const body = res.body as string;
    const deltas = [...body.matchAll(/event: delta\ndata: (.*)\n/g)].map(
      ([, data]) => (JSON.parse(data) as { content: string }).content,
    );
    expect(deltas.join('')).toBe(FAKE_REPLY);

    const done = /event: done\ndata: (.*)\n/.exec(body);
    expect(done).not.toBeNull();
    expect(JSON.parse(done![1])).toMatchObject({
      assistantMessage: { content: FAKE_REPLY },
    });
  });
});

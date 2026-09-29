import { HttpStatus } from '@nestjs/common';
import { AiProvider, PlanTier, SubscriptionStatus } from '@prisma/client';
import request from 'supertest';
import { PLAN_DEFINITIONS } from '../src/common/constants/plan.constants';
import {
  bearer,
  cleanupTestData,
  createTestProvider,
  registerUser,
  TestUser,
} from './utils/fixtures';
import { createTestApp, TestApp } from './utils/test-app';

const FREE_LIMIT = PLAN_DEFINITIONS[PlanTier.FREE].requestLimit;
const PREMIUM_LIMIT = PLAN_DEFINITIONS[PlanTier.PREMIUM].requestLimit;

describe('Subscription limits (e2e)', () => {
  let t: TestApp;
  let provider: AiProvider;
  let user: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    provider = await createTestProvider(t);
    user = await registerUser(t.http, 'quota');
  });

  afterAll(async () => {
    await cleanupTestData(t, [provider.id]);
    await t.app.close();
  });

  const chat = () =>
    request(t.http)
      .post('/api/chats/messages')
      .set(bearer(user.accessToken))
      .send({ providerId: provider.id, content: 'ping' });

  const getUsage = async () =>
    (
      await request(t.http)
        .get('/api/subscriptions/usage')
        .set(bearer(user.accessToken))
        .expect(HttpStatus.OK)
    ).body.data;

  /** Jumps the counter instead of making dozens of real calls. */
  const setRequestsUsed = (requestsUsed: number) =>
    t.prisma.subscription.update({
      where: { userId: user.id },
      data: { requestsUsed },
    });

  it('starts a new user with the full FREE allowance', async () => {
    expect(await getUsage()).toMatchObject({
      requestLimit: FREE_LIMIT,
      requestsUsed: 0,
      remainingRequests: FREE_LIMIT,
    });
  });

  it('allows the last request of the period, then 429s', async () => {
    await setRequestsUsed(FREE_LIMIT - 1);

    await chat().expect(HttpStatus.CREATED);
    const res = await chat().expect(HttpStatus.TOO_MANY_REQUESTS);

    expect(res.body.success).toBe(false);
    expect(await getUsage()).toMatchObject({
      requestsUsed: FREE_LIMIT,
      remainingRequests: 0,
    });
    expect(t.fakeAi.requests).toHaveLength(1);
  });

  it('never over-grants under concurrency', async () => {
    const remaining = 3;
    await setRequestsUsed(FREE_LIMIT - remaining);

    const statuses = (
      await Promise.all(Array.from({ length: remaining * 2 }, () => chat()))
    ).map((res) => res.status);

    expect(statuses.filter((s) => s === HttpStatus.CREATED)).toHaveLength(
      remaining,
    );
    expect(
      statuses.filter((s) => s === HttpStatus.TOO_MANY_REQUESTS),
    ).toHaveLength(remaining);
    expect((await getUsage()).requestsUsed).toBe(FREE_LIMIT);
  });

  it('lifts the limit on upgrade and keeps usage from the current period', async () => {
    const res = await request(t.http)
      .post('/api/subscriptions/upgrade')
      .set(bearer(user.accessToken))
      .expect(HttpStatus.OK);
    expect(res.body.data.tier).toBe(PlanTier.PREMIUM);

    expect(await getUsage()).toMatchObject({
      requestLimit: PREMIUM_LIMIT,
      requestsUsed: FREE_LIMIT,
      remainingRequests: PREMIUM_LIMIT - FREE_LIMIT,
    });
    await chat().expect(HttpStatus.CREATED);
  });

  it('409s a second upgrade', async () => {
    await request(t.http)
      .post('/api/subscriptions/upgrade')
      .set(bearer(user.accessToken))
      .expect(HttpStatus.CONFLICT);
  });

  it('403s quota-consuming routes when the subscription is not active', async () => {
    await t.prisma.subscription.update({
      where: { userId: user.id },
      data: { status: SubscriptionStatus.CANCELED },
    });

    await chat().expect(HttpStatus.FORBIDDEN);
  });
});

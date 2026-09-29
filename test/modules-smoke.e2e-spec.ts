import { HttpStatus } from '@nestjs/common';
import { AiProvider, HealthStatus, ProviderType } from '@prisma/client';
import request from 'supertest';
import { FAKE_REPLY } from './utils/fake-ai-adapter';
import { FAKE_SOURCES, FAKE_TITLES } from './utils/fake-wikipedia';
import {
  bearer,
  cleanupTestData,
  createTestProvider,
  promoteToAdmin,
  registerUser,
  TEST_PASSWORD,
  TestUser,
} from './utils/fixtures';
import { createTestApp, TestApp } from './utils/test-app';

/**
 * Happy-path smoke coverage for the modules the critical-flow suites
 * (auth, chat, subscription-limits) don't exercise: users, providers,
 * search, and admin.
 */
describe('Module smoke tests (e2e)', () => {
  let t: TestApp;
  let provider: AiProvider;
  let user: TestUser;
  let admin: TestUser;
  const createdProviderIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    provider = await createTestProvider(t);
    createdProviderIds.push(provider.id);
    user = await registerUser(t.http, 'smoke-user');
    admin = await registerUser(t.http, 'smoke-admin');
    await promoteToAdmin(t, admin.id);
  });

  afterAll(async () => {
    await cleanupTestData(t, createdProviderIds);
    await t.app.close();
  });

  const as = (who: TestUser) => bearer(who.accessToken);

  describe('users', () => {
    it('reads and updates the profile, rejecting unknown fields', async () => {
      await request(t.http)
        .patch('/api/users/profile')
        .set(as(user))
        .send({ fullName: 'Smoke Tester' })
        .expect(HttpStatus.OK);

      const profile = await request(t.http)
        .get('/api/users/profile')
        .set(as(user))
        .expect(HttpStatus.OK);
      expect(profile.body.data).toMatchObject({
        email: user.email,
        fullName: 'Smoke Tester',
      });

      await request(t.http)
        .patch('/api/users/profile')
        .set(as(user))
        .send({ email: 'hijack@example.com' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('changes the password only with the correct current one', async () => {
      await request(t.http)
        .patch('/api/users/change-password')
        .set(as(user))
        .send({
          currentPassword: 'wrong-password',
          newPassword: 'N3wPassword!',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      await request(t.http)
        .patch('/api/users/change-password')
        .set(as(user))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'N3wPassword!' })
        .expect(HttpStatus.NO_CONTENT);

      await request(t.http)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'N3wPassword!' })
        .expect(HttpStatus.OK);
    });

    it('lets only admins look up users by id', async () => {
      await request(t.http)
        .get(`/api/users/${user.id}`)
        .set(as(user))
        .expect(HttpStatus.FORBIDDEN);
      await request(t.http)
        .get(`/api/users/${user.id}`)
        .set(as(admin))
        .expect(HttpStatus.OK);
    });
  });

  describe('providers', () => {
    it('runs the admin lifecycle without ever exposing the key', async () => {
      await request(t.http)
        .post('/api/providers')
        .set(as(user))
        .send({ name: 'Nope', type: ProviderType.OPENAI })
        .expect(HttpStatus.FORBIDDEN);

      const created = await request(t.http)
        .post('/api/providers')
        .set(as(admin))
        .send({
          name: 'E2E Fake Provider (API)',
          type: ProviderType.OPENAI,
          apiKey: 'sk-e2e-secret-key',
          defaultModel: 'fake-model',
          isEnabled: true,
        })
        .expect(HttpStatus.CREATED);
      const id: string = created.body.data.id;
      createdProviderIds.push(id);

      expect(created.body.data.hasApiKey).toBe(true);
      expect(JSON.stringify(created.body)).not.toContain('sk-e2e-secret-key');
      const stored = await t.prisma.aiProvider.findUniqueOrThrow({
        where: { id },
      });
      expect(stored.apiKeyEncrypted).not.toContain('sk-e2e-secret-key');

      const available = await request(t.http)
        .get('/api/providers/available')
        .set(as(user))
        .expect(HttpStatus.OK);
      expect(available.body.data.map((p: { id: string }) => p.id)).toContain(
        id,
      );

      const health = await request(t.http)
        .post(`/api/providers/${id}/health-check`)
        .set(as(admin))
        .expect(HttpStatus.OK);
      expect(health.body.data.status).toBe(HealthStatus.HEALTHY);

      await request(t.http)
        .delete(`/api/providers/${id}`)
        .set(as(admin))
        .expect(HttpStatus.NO_CONTENT);
      await request(t.http)
        .get(`/api/providers/${id}`)
        .set(as(admin))
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('search', () => {
    const query = 'How does HTTP/3 differ from HTTP/2?';
    let searchId: string;

    it('answers from web sources, then serves a repeat from cache', async () => {
      const first = await request(t.http)
        .post('/api/search')
        .set(as(user))
        .send({ query, providerId: provider.id })
        .expect(HttpStatus.OK);
      searchId = first.body.data.id;
      expect(first.body.data).toMatchObject({
        answer: FAKE_REPLY,
        sources: FAKE_SOURCES,
        cached: false,
      });

      const repeat = await request(t.http)
        .post('/api/search')
        .set(as(user))
        .send({ query, providerId: provider.id })
        .expect(HttpStatus.OK);
      expect(repeat.body.data.cached).toBe(true);
    });

    it('exposes history, recent queries and suggestions', async () => {
      const history = await request(t.http)
        .get('/api/search/history')
        .set(as(user))
        .expect(HttpStatus.OK);
      expect(history.body.data.items.length).toBeGreaterThan(0);

      const recent = await request(t.http)
        .get('/api/search/recent')
        .set(as(user))
        .expect(HttpStatus.OK);
      expect(recent.body.data[0].query).toBe(query);

      const suggestions = await request(t.http)
        .get('/api/search/suggestions')
        .query({ q: 'HTTP' })
        .set(as(user))
        .expect(HttpStatus.OK);
      expect(suggestions.body.data).toEqual(
        expect.arrayContaining(FAKE_TITLES),
      );
    });

    it('keeps history private and deletable', async () => {
      await request(t.http)
        .get(`/api/search/history/${searchId}`)
        .set(as(admin))
        .expect(HttpStatus.NOT_FOUND);
      await request(t.http)
        .delete(`/api/search/history/${searchId}`)
        .set(as(user))
        .expect(HttpStatus.NO_CONTENT);
      await request(t.http)
        .get(`/api/search/history/${searchId}`)
        .set(as(user))
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('admin', () => {
    it('finds a user and suspends them, cutting off their token', async () => {
      const found = await request(t.http)
        .get('/api/admin/users')
        .query({ search: user.email })
        .set(as(admin))
        .expect(HttpStatus.OK);
      expect(found.body.data.items[0].id).toBe(user.id);

      await request(t.http)
        .patch(`/api/admin/users/${user.id}/status`)
        .set(as(admin))
        .send({ status: 'SUSPENDED' })
        .expect(HttpStatus.OK);

      await request(t.http)
        .get('/api/users/profile')
        .set(as(user))
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('serves analytics, logs and health', async () => {
      for (const path of [
        '/api/admin/analytics/usage',
        '/api/admin/logs',
        '/api/admin/health',
      ]) {
        await request(t.http).get(path).set(as(admin)).expect(HttpStatus.OK);
      }
    });
  });

  it('deletes an account after password confirmation', async () => {
    await request(t.http)
      .delete('/api/users/account')
      .set(as(admin))
      .send({ password: TEST_PASSWORD })
      .expect(HttpStatus.NO_CONTENT);

    await request(t.http)
      .post('/api/auth/login')
      .send({ email: admin.email, password: TEST_PASSWORD })
      .expect(HttpStatus.UNAUTHORIZED);
  });
});

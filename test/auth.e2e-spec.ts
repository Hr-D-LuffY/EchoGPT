import { HttpStatus } from '@nestjs/common';
import { PlanTier, RoleName, UserStatus } from '@prisma/client';
import request from 'supertest';
import { THROTTLE_AUTH } from '../src/common/constants/throttle.constants';
import {
  bearer,
  cleanupTestData,
  promoteToAdmin,
  registerUser,
  TEST_PASSWORD,
  TestUser,
  uniqueEmail,
} from './utils/fixtures';
import { createTestApp, TestApp } from './utils/test-app';

describe('Auth & authorization (e2e)', () => {
  let t: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    user = await registerUser(t.http, 'auth');
  });

  afterAll(async () => {
    await cleanupTestData(t);
    await t.app.close();
  });

  describe('POST /auth/register', () => {
    it('creates the user on the FREE plan and never returns the password hash', async () => {
      const res = await request(t.http)
        .get('/api/auth/me')
        .set(bearer(user.accessToken))
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        success: true,
        statusCode: HttpStatus.OK,
        data: { id: user.id, email: user.email, role: RoleName.USER },
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|password_hash/,
      );

      const subscription = await request(t.http)
        .get('/api/subscriptions/me')
        .set(bearer(user.accessToken))
        .expect(HttpStatus.OK);
      expect(subscription.body.data.tier).toBe(PlanTier.FREE);
    });

    it('rejects a duplicate email with 409', async () => {
      const res = await request(t.http)
        .post('/api/auth/register')
        .send({ email: user.email, password: TEST_PASSWORD, fullName: 'Dup' })
        .expect(HttpStatus.CONFLICT);
      expect(res.body).toMatchObject({ success: false, errors: null });
    });

    it('returns the validation envelope for a bad body', async () => {
      const res = await request(t.http)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short', role: 'ADMIN' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body).toMatchObject({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        path: '/api/auth/register',
      });
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          'email must be an email',
          'property role should not exist',
        ]),
      );
    });
  });

  describe('access tokens', () => {
    it('401s without a token and with a garbage token', async () => {
      await request(t.http).get('/api/auth/me').expect(HttpStatus.UNAUTHORIZED);
      await request(t.http)
        .get('/api/auth/me')
        .set(bearer('not.a.jwt'))
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('leaves public routes open', async () => {
      await request(t.http)
        .get('/api/subscriptions/plans')
        .expect(HttpStatus.OK);
    });
  });

  describe('login / refresh / logout', () => {
    it('rejects a wrong password with 401', async () => {
      await request(t.http)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'WrongPassword1!' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('rotates refresh tokens and rejects a replayed one', async () => {
      const login = await request(t.http)
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(HttpStatus.OK);
      const firstRefresh: string = login.body.data.refreshToken;

      const rotated = await request(t.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(HttpStatus.OK);
      expect(rotated.body.data.refreshToken).not.toBe(firstRefresh);

      await request(t.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('logout revokes the session behind the refresh token', async () => {
      const session = await registerUser(t.http, 'logout');

      await request(t.http)
        .post('/api/auth/logout')
        .set(bearer(session.accessToken))
        .expect(HttpStatus.NO_CONTENT);

      await request(t.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('blocks login for a suspended account', async () => {
      const suspended = await registerUser(t.http, 'suspended');
      await t.prisma.user.update({
        where: { id: suspended.id },
        data: { status: UserStatus.SUSPENDED },
      });

      await request(t.http)
        .post('/api/auth/login')
        .send({ email: suspended.email, password: TEST_PASSWORD })
        .expect(HttpStatus.UNAUTHORIZED);
      await request(t.http)
        .get('/api/auth/me')
        .set(bearer(suspended.accessToken))
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('verifies once, then rejects the same token', async () => {
      const { emailVerificationToken: token } =
        await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      await request(t.http)
        .post('/api/auth/verify-email')
        .send({ token })
        .expect(HttpStatus.OK);
      await request(t.http)
        .post('/api/auth/verify-email')
        .send({ token })
        .expect(HttpStatus.UNAUTHORIZED);

      const me = await request(t.http)
        .get('/api/auth/me')
        .set(bearer(user.accessToken));
      expect(me.body.data.isEmailVerified).toBe(true);
    });
  });

  describe('role-based authorization', () => {
    // Register is limited per minute too, so this reuses the suite's user.
    it('403s a USER on admin routes and lets the same token through once promoted', async () => {
      await request(t.http)
        .get('/api/admin/dashboard')
        .set(bearer(user.accessToken))
        .expect(HttpStatus.FORBIDDEN);

      await promoteToAdmin(t, user.id);

      await request(t.http)
        .get('/api/admin/dashboard')
        .set(bearer(user.accessToken))
        .expect(HttpStatus.OK);
    });
  });

  describe('rate limiting', () => {
    it(`429s login after ${THROTTLE_AUTH.limit} attempts per minute`, async () => {
      const statuses: number[] = [];
      for (let i = 0; i <= THROTTLE_AUTH.limit; i++) {
        const res = await request(t.http)
          .post('/api/auth/login')
          .send({ email: uniqueEmail('nobody'), password: 'Whatever123!' });
        statuses.push(res.status);
      }
      expect(statuses.at(-1)).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });
  });
});

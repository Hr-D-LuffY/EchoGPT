import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { EmailService } from '../../common/services/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const PASSWORD = 'S3curePassword!';
const META = { userAgent: 'jest', ipAddress: '127.0.0.1' };
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  let passwordHash: string;
  let prisma: {
    session: Record<
      'create' | 'findUnique' | 'update' | 'updateMany',
      jest.Mock
    >;
    $transaction: jest.Mock;
  };
  let users: Record<string, jest.Mock>;
  let subscriptions: { createDefaultSubscription: jest.Mock };
  let email: { sendVerificationEmail: jest.Mock };
  let jwt: { sign: jest.Mock };
  let service: AuthService;

  const buildUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'jane@example.com',
    passwordHash,
    fullName: 'Jane Doe',
    status: UserStatus.ACTIVE,
    deletedAt: null,
    isEmailVerified: false,
    createdAt: new Date(),
    role: { id: 'r1', name: RoleName.USER },
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    let tokenCounter = 0;
    prisma = {
      session: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn('tx')),
    };
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(buildUser()),
      create: jest.fn().mockResolvedValue(buildUser()),
      findByValidEmailVerificationToken: jest.fn(),
      markEmailVerified: jest.fn().mockResolvedValue({}),
      toSafeUser: jest.fn((u: { id: string; email: string }) => ({
        id: u.id,
        email: u.email,
      })),
    };
    subscriptions = { createDefaultSubscription: jest.fn() };
    email = { sendVerificationEmail: jest.fn() };
    jwt = { sign: jest.fn(() => `token-${++tokenCounter}`) };
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            'jwt.accessExpiresIn': '15m',
            'jwt.refreshExpiresIn': '7d',
            'jwt.accessSecret': 'a'.repeat(32),
            'jwt.refreshSecret': 'r'.repeat(32),
          })[key],
      ),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      subscriptions as unknown as SubscriptionsService,
      email as unknown as EmailService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('register', () => {
    const dto = {
      email: 'jane@example.com',
      password: PASSWORD,
      fullName: 'Jane Doe',
    };

    it('rejects an email that is already registered', async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      await expect(service.register(dto, META)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(users.create).not.toHaveBeenCalled();
    });

    it('hashes the password and creates user + subscription in one transaction', async () => {
      await service.register(dto, META);

      const [data, tx] = users.create.mock.calls[0];
      expect(data.passwordHash).not.toBe(PASSWORD);
      expect(await bcrypt.compare(PASSWORD, data.passwordHash)).toBe(true);
      expect(tx).toBe('tx');
      expect(subscriptions.createDefaultSubscription).toHaveBeenCalledWith(
        'user-1',
        'tx',
      );
    });

    it('emails the same verification token it stored', async () => {
      await service.register(dto, META);

      const stored = users.create.mock.calls[0][0].emailVerificationToken;
      expect(email.sendVerificationEmail).toHaveBeenCalledWith(
        'jane@example.com',
        stored,
      );
    });

    it('returns a token pair and the safe user, storing only the refresh token hash', async () => {
      const result = await service.register(dto, META);

      expect(result).toEqual({
        accessToken: 'token-1',
        refreshToken: 'token-2',
        user: { id: 'user-1', email: 'jane@example.com' },
      });
      expect(prisma.session.create.mock.calls[0][0].data).toMatchObject({
        userId: 'user-1',
        refreshTokenHash: sha256('token-2'),
        userAgent: 'jest',
      });
    });
  });

  describe('login', () => {
    it('gives the same 401 for an unknown email and a wrong password', async () => {
      const unknown = service.login(
        { email: 'nobody@example.com', password: PASSWORD },
        META,
      );
      await expect(unknown).rejects.toThrow('Invalid email or password');

      users.findByEmail.mockResolvedValue(buildUser());
      const wrong = service.login(
        { email: 'jane@example.com', password: 'wrong-password' },
        META,
      );
      await expect(wrong).rejects.toThrow('Invalid email or password');
    });

    it.each([
      ['suspended', { status: UserStatus.SUSPENDED }],
      ['deleted', { deletedAt: new Date() }],
    ])('rejects a %s account', async (_label, overrides) => {
      users.findByEmail.mockResolvedValue(buildUser(overrides));
      await expect(
        service.login({ email: 'jane@example.com', password: PASSWORD }, META),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('opens a session for valid credentials', async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      const result = await service.login(
        { email: 'jane@example.com', password: PASSWORD },
        META,
      );
      expect(result.accessToken).toBe('token-1');
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    const presented = {
      sub: 'user-1',
      sessionId: 's1',
      refreshToken: 'rt-old',
    };
    const liveSession = () => ({
      id: 's1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: sha256('rt-old'),
    });

    it.each([
      ['missing', null],
      ['revoked', { ...liveSession(), revokedAt: new Date() }],
      ['expired', { ...liveSession(), expiresAt: new Date(Date.now() - 1) }],
      [
        'rotated (hash mismatch)',
        { ...liveSession(), refreshTokenHash: sha256('rt-newer') },
      ],
    ])('rejects a %s session', async (_label, session) => {
      prisma.session.findUnique.mockResolvedValue(session);
      await expect(service.refresh(presented, META)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('revokes the used session and issues a new pair', async () => {
      prisma.session.findUnique.mockResolvedValue(liveSession());

      const result = await service.refresh(presented, META);

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(result.refreshToken).toBe('token-2');
    });

    it('rejects a session whose user has since been suspended', async () => {
      prisma.session.findUnique.mockResolvedValue(liveSession());
      users.findById.mockResolvedValue(
        buildUser({ status: UserStatus.SUSPENDED }),
      );
      await expect(service.refresh(presented, META)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  it('logout revokes only a still-active session', async () => {
    await service.logout('s1');
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  describe('verifyEmail', () => {
    it('rejects an unknown or expired token', async () => {
      users.findByValidEmailVerificationToken.mockResolvedValue(null);
      await expect(
        service.verifyEmail({ token: 'nope' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.markEmailVerified).not.toHaveBeenCalled();
    });

    it('marks the owner verified', async () => {
      users.findByValidEmailVerificationToken.mockResolvedValue(buildUser());
      await service.verifyEmail({ token: 'good' });
      expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
    });
  });
});

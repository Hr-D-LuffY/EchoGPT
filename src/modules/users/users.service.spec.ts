import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

const USER_ID = 'user-1';
const SESSION_ID = 'session-current';
const PASSWORD = 'S3curePassword!';

describe('UsersService', () => {
  let passwordHash: string;
  let prisma: {
    user: Record<'findUnique' | 'findUniqueOrThrow' | 'update', jest.Mock>;
    session: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: UsersService;

  const buildUser = () => ({
    id: USER_ID,
    email: 'jane@example.com',
    passwordHash,
    fullName: 'Jane Doe',
    isEmailVerified: true,
    createdAt: new Date('2026-09-28T16:45:00.000Z'),
    role: { id: 'r1', name: RoleName.USER },
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(buildUser()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(buildUser()),
        update: jest.fn().mockReturnValue('update-user-op'),
      },
      session: { updateMany: jest.fn().mockReturnValue('revoke-op') },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('toSafeUser', () => {
    it('exposes only public fields — never the password hash', () => {
      expect(service.toSafeUser(buildUser() as never)).toEqual({
        id: USER_ID,
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        role: RoleName.USER,
        isEmailVerified: true,
        createdAt: new Date('2026-09-28T16:45:00.000Z'),
      });
    });
  });

  describe('getProfile', () => {
    it('404s when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile(USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the safe profile', async () => {
      const profile = await service.getProfile(USER_ID);
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile.email).toBe('jane@example.com');
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password without writing anything', async () => {
      await expect(
        service.changePassword(USER_ID, SESSION_ID, 'wrong', 'N3wPassword!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('stores a new hash and revokes every other session atomically', async () => {
      await service.changePassword(
        USER_ID,
        SESSION_ID,
        PASSWORD,
        'N3wPassword!',
      );

      const newHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('N3wPassword!', newHash)).toBe(true);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, id: { not: SESSION_ID }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'update-user-op',
        'revoke-op',
      ]);
    });
  });

  describe('deleteAccount', () => {
    it('rejects a wrong password', async () => {
      await expect(
        service.deleteAccount(USER_ID, 'wrong'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('soft-deletes and revokes every session, including the current one', async () => {
      await service.deleteAccount(USER_ID, PASSWORD);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByIdForAdmin', () => {
    it('404s for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findByIdForAdmin('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanTier, RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';

const ADMIN_ID = 'admin-1';
const USER_ID = 'user-1';

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    status: UserStatus.ACTIVE,
    isEmailVerified: true,
    deletedAt: null,
    createdAt: new Date(),
    role: { id: 'r1', name: RoleName.USER },
    subscription: {
      tier: PlanTier.FREE,
      status: 'ACTIVE',
      requestsUsed: 3,
      requestLimit: 50,
      periodEnd: new Date(),
    },
    ...overrides,
  };
}

describe('AdminUsersService', () => {
  let prisma: {
    user: Record<string, jest.Mock>;
    session: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: AdminUsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(buildUser()),
        findMany: jest.fn().mockReturnValue('findMany-op'),
        count: jest.fn().mockReturnValue('count-op'),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(
              buildUser(data.status ? { status: data.status } : {}),
            ),
          ),
      },
      session: { updateMany: jest.fn().mockReturnValue('revoke-op') },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    service = new AdminUsersService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('excludes deleted users and searches email or name case-insensitively', async () => {
      await service.list({
        page: 2,
        limit: 10,
        search: 'jan',
        role: RoleName.ADMIN,
      });

      const [args] = prisma.user.findMany.mock.calls[0];
      expect(args.where).toEqual({
        deletedAt: null,
        role: { name: RoleName.ADMIN },
        OR: [
          { email: { contains: 'jan', mode: 'insensitive' } },
          { fullName: { contains: 'jan', mode: 'insensitive' } },
        ],
      });
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
    });
  });

  describe('updateStatus', () => {
    it('suspending revokes every session in the same transaction', async () => {
      await service.updateStatus(USER_ID, UserStatus.SUSPENDED, ADMIN_ID);

      const [writes] = prisma.$transaction.mock.calls[0];
      expect(writes).toHaveLength(2);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('reactivating does not touch sessions', async () => {
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ status: UserStatus.SUSPENDED }),
      );

      await service.updateStatus(USER_ID, UserStatus.ACTIVE, ADMIN_ID);

      expect(prisma.session.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(1);
    });

    it('is a no-op when the status is already set', async () => {
      const result = await service.updateStatus(
        USER_ID,
        UserStatus.ACTIVE,
        ADMIN_ID,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('refuses to act on your own account, before any lookup', async () => {
      await expect(
        service.updateStatus(ADMIN_ID, UserStatus.SUSPENDED, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('404s for a missing or deleted user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(USER_ID, UserStatus.SUSPENDED, ADMIN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
        id: USER_ID,
        deletedAt: null,
      });
    });
  });

  describe('updateRole', () => {
    it('connects the new role by name', async () => {
      prisma.user.update.mockResolvedValue(
        buildUser({ role: { id: 'r2', name: RoleName.ADMIN } }),
      );

      const result = await service.updateRole(
        USER_ID,
        RoleName.ADMIN,
        ADMIN_ID,
      );

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        role: { connect: { name: RoleName.ADMIN } },
      });
      expect(result.role).toBe(RoleName.ADMIN);
    });

    it('refuses to change your own role', async () => {
      await expect(
        service.updateRole(ADMIN_ID, RoleName.USER, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

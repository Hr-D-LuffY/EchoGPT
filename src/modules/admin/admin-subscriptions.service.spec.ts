import { NotFoundException } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminUsersService } from './admin-users.service';

const ADMIN_ID = 'admin-1';
const USER_ID = 'user-1';

const subscription = {
  id: 'sub-1',
  userId: USER_ID,
  tier: PlanTier.PREMIUM,
  status: SubscriptionStatus.ACTIVE,
  requestLimit: 2000,
  requestsUsed: 5,
  periodStart: new Date(),
  periodEnd: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AdminSubscriptionsService', () => {
  let prisma: {
    subscription: { findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let subscriptions: { applyAdminOverride: jest.Mock; toResponse: jest.Mock };
  let adminUsers: { findActiveOrThrow: jest.Mock };
  let service: AdminSubscriptionsService;

  beforeEach(() => {
    prisma = {
      subscription: {
        findMany: jest.fn().mockReturnValue('findMany-op'),
        count: jest.fn().mockReturnValue('count-op'),
      },
      $transaction: jest
        .fn()
        .mockResolvedValue([
          [{ ...subscription, user: { email: 'jane@example.com' } }],
          21,
        ]),
    };
    subscriptions = {
      applyAdminOverride: jest.fn().mockResolvedValue(subscription),
      toResponse: jest.fn(({ id, tier }) => ({ id, tier })),
    };
    adminUsers = {
      findActiveOrThrow: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, email: 'jane@example.com' }),
    };
    service = new AdminSubscriptionsService(
      prisma as unknown as PrismaService,
      subscriptions as unknown as SubscriptionsService,
      adminUsers as unknown as AdminUsersService,
    );
  });

  describe('list', () => {
    it('filters out deleted users, applies filters, and paginates', async () => {
      const result = await service.list({
        page: 3,
        limit: 10,
        tier: PlanTier.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
      });

      const query = prisma.subscription.findMany.mock.calls[0][0];
      expect(query.where).toEqual({
        user: { deletedAt: null },
        tier: PlanTier.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
      });
      expect(query).toMatchObject({ skip: 20, take: 10 });
      expect(prisma.subscription.count).toHaveBeenCalledWith({
        where: query.where,
      });
      expect(result.items).toEqual([
        {
          id: 'sub-1',
          tier: PlanTier.PREMIUM,
          userId: USER_ID,
          userEmail: 'jane@example.com',
        },
      ]);
      expect(result.meta).toMatchObject({ page: 3, limit: 10, total: 21 });
    });

    it('omits filters that were not given', async () => {
      await service.list({ page: 1, limit: 20 });
      expect(prisma.subscription.findMany.mock.calls[0][0].where).toEqual({
        user: { deletedAt: null },
      });
    });
  });

  describe('update', () => {
    const dto = { tier: PlanTier.PREMIUM };

    it('404s for a missing or deleted user before touching the subscription', async () => {
      adminUsers.findActiveOrThrow.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(
        service.update(USER_ID, dto, ADMIN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(subscriptions.applyAdminOverride).not.toHaveBeenCalled();
    });

    it('delegates the write to SubscriptionsService with the acting admin', async () => {
      const result = await service.update(USER_ID, dto, ADMIN_ID);

      expect(subscriptions.applyAdminOverride).toHaveBeenCalledWith(
        USER_ID,
        dto,
        ADMIN_ID,
      );
      expect(result).toMatchObject({
        userId: USER_ID,
        userEmail: 'jane@example.com',
        tier: PlanTier.PREMIUM,
      });
    });
  });
});

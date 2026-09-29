import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlanTier, Subscription, SubscriptionStatus } from '@prisma/client';
import { PLAN_DEFINITIONS } from '../../common/constants/plan.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const USER_ID = 'user-1';

function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  const now = Date.now();
  return {
    id: 'sub-1',
    userId: USER_ID,
    tier: PlanTier.FREE,
    status: SubscriptionStatus.ACTIVE,
    requestLimit: PLAN_DEFINITIONS[PlanTier.FREE].requestLimit,
    requestsUsed: 0,
    periodStart: new Date(now),
    periodEnd: new Date(now + 60_000),
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  };
}

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let subscription: {
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    fields: { requestLimit: string };
  };

  beforeEach(() => {
    subscription = {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      fields: { requestLimit: 'requestLimit-ref' },
    };
    service = new SubscriptionsService({
      subscription,
    } as unknown as PrismaService);
  });

  describe('toUsage', () => {
    it('computes remaining requests', () => {
      const usage = service.toUsage(
        buildSubscription({ requestLimit: 50, requestsUsed: 12 }),
      );
      expect(usage.remainingRequests).toBe(38);
    });

    it('never reports negative remaining after a downgrade', () => {
      const usage = service.toUsage(
        buildSubscription({ requestLimit: 50, requestsUsed: 300 }),
      );
      expect(usage.remainingRequests).toBe(0);
    });
  });

  describe('getCurrent', () => {
    it('throws 404 when the user has no subscription', async () => {
      subscription.findUnique.mockResolvedValue(null);
      await expect(service.getCurrent(USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rolls an expired period over with a conditional update', async () => {
      const expired = buildSubscription({
        requestsUsed: 50,
        periodEnd: new Date(Date.now() - 1000),
      });
      subscription.findUnique.mockResolvedValue(expired);
      subscription.updateMany.mockResolvedValue({ count: 1 });

      await service.getCurrent(USER_ID);

      const [args] = subscription.updateMany.mock.calls[0];
      expect(args.where).toMatchObject({ id: expired.id });
      expect(args.where.periodEnd).toHaveProperty('lte');
      expect(args.data.requestsUsed).toBe(0);
    });

    it('does not touch a subscription still inside its period', async () => {
      subscription.findUnique.mockResolvedValue(buildSubscription());
      await service.getCurrent(USER_ID);
      expect(subscription.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('upgrade / downgrade', () => {
    it('upgrades FREE to PREMIUM, keeping usage and period', async () => {
      subscription.findUnique.mockResolvedValue(buildSubscription());
      subscription.update.mockImplementation(({ data }) =>
        Promise.resolve(buildSubscription(data)),
      );

      await service.upgrade(USER_ID);

      const [args] = subscription.update.mock.calls[0];
      expect(args.data).toEqual({
        tier: PlanTier.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        requestLimit: PLAN_DEFINITIONS[PlanTier.PREMIUM].requestLimit,
      });
    });

    it('rejects upgrading when already PREMIUM with 409', async () => {
      subscription.findUnique.mockResolvedValue(
        buildSubscription({ tier: PlanTier.PREMIUM }),
      );
      await expect(service.upgrade(USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects downgrading when already FREE with 409', async () => {
      subscription.findUnique.mockResolvedValue(buildSubscription());
      await expect(service.downgrade(USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('consumeRequest', () => {
    it('increments atomically, guarded by requestsUsed < requestLimit', async () => {
      subscription.findUnique.mockResolvedValue(buildSubscription());
      subscription.updateMany.mockResolvedValue({ count: 1 });

      await service.consumeRequest(USER_ID);

      const [args] = subscription.updateMany.mock.calls[0];
      expect(args.where).toEqual({
        userId: USER_ID,
        status: SubscriptionStatus.ACTIVE,
        requestsUsed: { lt: 'requestLimit-ref' },
      });
      expect(args.data).toEqual({ requestsUsed: { increment: 1 } });
    });

    it('throws 429 when the quota is exhausted', async () => {
      subscription.findUnique.mockResolvedValue(
        buildSubscription({ requestsUsed: 50 }),
      );
      subscription.updateMany.mockResolvedValue({ count: 0 });

      const error = await service.consumeRequest(USER_ID).catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });

    it('throws 403 when the subscription is not active', async () => {
      subscription.findUnique.mockResolvedValue(
        buildSubscription({ status: SubscriptionStatus.PAST_DUE }),
      );
      subscription.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.consumeRequest(USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('applyAdminOverride', () => {
    beforeEach(() => {
      subscription.findUnique.mockResolvedValue(buildSubscription());
      subscription.update.mockImplementation(({ data }) =>
        Promise.resolve(buildSubscription(data)),
      );
    });

    it('rejects an empty override with 400', async () => {
      await expect(
        service.applyAdminOverride(USER_ID, {}, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(subscription.update).not.toHaveBeenCalled();
    });

    it('sets the plan limit with the tier, and can reset usage', async () => {
      await service.applyAdminOverride(
        USER_ID,
        { tier: PlanTier.PREMIUM, resetUsage: true },
        'admin-1',
      );

      expect(subscription.update.mock.calls[0][0].data).toEqual({
        tier: PlanTier.PREMIUM,
        requestLimit: PLAN_DEFINITIONS[PlanTier.PREMIUM].requestLimit,
        requestsUsed: 0,
      });
    });

    it('allows setting the tier the user already has (fixes a drifted limit)', async () => {
      await expect(
        service.applyAdminOverride(USER_ID, { tier: PlanTier.FREE }, 'admin-1'),
      ).resolves.toBeDefined();
    });

    it('can change status alone', async () => {
      await service.applyAdminOverride(
        USER_ID,
        { status: SubscriptionStatus.PAST_DUE },
        'admin-1',
      );

      expect(subscription.update.mock.calls[0][0].data).toEqual({
        status: SubscriptionStatus.PAST_DUE,
      });
    });
  });
});

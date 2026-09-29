import { BadRequestException } from '@nestjs/common';
import { PlanTier, UserStatus } from '@prisma/client';
import { PLAN_DEFINITIONS } from '../../common/constants/plan.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAnalyticsService } from './admin-analytics.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const metrics = (requests: number, errors = 0) => ({
  requests,
  errors,
  tokens: requests * 10,
  avgDurationMs: 100,
});

describe('AdminAnalyticsService', () => {
  let prisma: Record<string, any>;
  let service: AdminAnalyticsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([metrics(0)]),
      apiUsageLog: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockReturnValue('findMany-op'),
      },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    service = new AdminAnalyticsService(prisma as unknown as PrismaService);
  });

  describe('date range', () => {
    it('rejects from >= to', async () => {
      const at = new Date('2026-09-01T00:00:00Z');
      await expect(
        service.getUsageAnalytics({ from: at, to: at }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a span over 366 days', async () => {
      const to = new Date('2026-09-01T00:00:00Z');
      const from = new Date(to.getTime() - 367 * DAY_MS);
      await expect(service.getUsageAnalytics({ from, to })).rejects.toThrow(
        'cannot exceed 366 days',
      );
    });

    it('defaults to the last 30 days', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValueOnce([metrics(0)]);

      const result = await service.getUsageAnalytics({});

      expect(result.to.getTime() - result.from.getTime()).toBe(30 * DAY_MS);
    });
  });

  it('zero-fills the daily series and computes error rates', async () => {
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-04T00:00:00Z');
    prisma.$queryRaw
      .mockResolvedValueOnce([metrics(3, 1)]) // totals
      .mockResolvedValueOnce([]) // byCategory
      .mockResolvedValueOnce([]) // byProvider
      .mockResolvedValueOnce([{ date: '2026-09-02', ...metrics(3, 1) }]) // daily
      .mockResolvedValueOnce([]); // topUsers

    const result = await service.getUsageAnalytics({ from, to });

    expect(result.daily.map((d) => [d.date, d.requests])).toEqual([
      ['2026-09-01', 0],
      ['2026-09-02', 3],
      ['2026-09-03', 0],
    ]);
    expect(result.totals.errorRate).toBe(0.3333);
    expect(result.daily[0].errorRate).toBe(0);
  });

  it('dashboard: plan mix and estimated revenue from ACTIVE subscriptions', async () => {
    Object.assign(prisma, {
      user: {
        groupBy: jest.fn().mockResolvedValue([
          { status: UserStatus.ACTIVE, _count: { _all: 8 } },
          { status: UserStatus.SUSPENDED, _count: { _all: 2 } },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      subscription: {
        groupBy: jest.fn().mockResolvedValue([
          { tier: PlanTier.FREE, _count: { _all: 6 } },
          { tier: PlanTier.PREMIUM, _count: { _all: 3 } },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { requestsUsed: 40 } }),
      },
      chat: { count: jest.fn().mockResolvedValue(5) },
      chatMessage: { count: jest.fn().mockResolvedValue(10) },
      webSearch: { count: jest.fn().mockResolvedValue(7) },
      aiProvider: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'OpenAI',
            isEnabled: true,
            isDefault: true,
            lastHealthCheckStatus: 'HEALTHY',
          },
          {
            name: 'Claude',
            isEnabled: true,
            isDefault: false,
            lastHealthCheckStatus: 'UNKNOWN',
          },
          {
            name: 'Gemini',
            isEnabled: false,
            isDefault: false,
            lastHealthCheckStatus: 'HEALTHY',
          },
        ]),
      },
    });

    const dashboard = await service.getDashboard();

    expect(dashboard.users).toMatchObject({
      total: 10,
      active: 8,
      suspended: 2,
    });
    expect(dashboard.subscriptions.planMix).toEqual({ FREE: 6, PREMIUM: 3 });
    expect(dashboard.subscriptions.estimatedMonthlyRevenueCents).toBe(
      3 * PLAN_DEFINITIONS[PlanTier.PREMIUM].priceMonthlyCents,
    );
    expect(dashboard.providers).toEqual({
      total: 3,
      enabled: 2,
      healthy: 1,
      defaultProvider: 'OpenAI',
    });
  });

  it('logs: outcome and status code filters combine', async () => {
    await service.listLogs({
      page: 1,
      limit: 20,
      outcome: 'error',
      statusCode: 502,
    });

    const [args] = prisma.apiUsageLog.findMany.mock.calls[0];
    expect(args.where.AND).toEqual([
      { statusCode: 502 },
      { statusCode: { gte: 400 } },
    ]);
  });
});

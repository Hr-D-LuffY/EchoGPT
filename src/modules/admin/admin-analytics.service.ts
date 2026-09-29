import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HealthStatus,
  PlanTier,
  Prisma,
  ProviderType,
  RoleName,
  SubscriptionStatus,
  UsageCategory,
  UserStatus,
} from '@prisma/client';
import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  ANALYTICS_MAX_RANGE_DAYS,
  ANALYTICS_TOP_USERS_LIMIT,
  DASHBOARD_WINDOW_DAYS,
  ERROR_RATE_DECIMALS,
  ERROR_STATUS_THRESHOLD,
} from '../../common/constants/admin.constants';
import {
  MS_PER_DAY,
  PLAN_CURRENCY,
  PLAN_DEFINITIONS,
} from '../../common/constants/plan.constants';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DateRangeQueryDto,
  ListLogsQueryDto,
  LogOutcome,
  UsageAnalyticsResponseDto,
  UsageLogListResponseDto,
  UsageMetricsDto,
} from './dto/analytics.dto';
import { DashboardResponseDto } from './dto/dashboard.dto';

/** Raw aggregate row: every metric column the shared SELECT produces. */
interface MetricsRow {
  requests: number;
  errors: number;
  tokens: number;
  avgDurationMs: number;
}

interface DateRange {
  from: Date;
  to: Date;
}

/**
 * The same aggregate columns for every breakdown, so totals, categories,
 * providers and days are always computed identically. Casts keep results
 * as plain JS numbers (SUM/COUNT would otherwise come back as BigInt).
 */
const METRICS_COLUMNS = Prisma.sql`
  COUNT(*)::int AS requests,
  (COUNT(*) FILTER (WHERE l.status_code >= ${ERROR_STATUS_THRESHOLD}))::int AS errors,
  COALESCE(SUM(l.tokens_used), 0)::float8 AS tokens,
  COALESCE(ROUND(AVG(l.duration_ms)), 0)::float8 AS "avgDurationMs"
`;

/**
 * Read-only reporting over users, subscriptions and `ApiUsageLog`. Heavy
 * aggregation happens in SQL (GROUP BY / FILTER), never by loading rows
 * into memory.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(): Promise<DashboardResponseDto> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - DASHBOARD_WINDOW_DAYS * MS_PER_DAY,
    );
    const dayStart = new Date(now.getTime() - MS_PER_DAY);
    const liveUser: Prisma.UserWhereInput = { deletedAt: null };

    const [
      usersByStatus,
      admins,
      emailVerified,
      newUsers,
      planMix,
      quota,
      usageLast30Days,
      requestsLast24h,
      chats,
      chatMessages,
      searches,
      providers,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['status'],
        where: liveUser,
        _count: { _all: true },
      }),
      this.prisma.user.count({
        where: { ...liveUser, role: { name: RoleName.ADMIN } },
      }),
      this.prisma.user.count({ where: { ...liveUser, isEmailVerified: true } }),
      this.prisma.user.count({
        where: { ...liveUser, createdAt: { gte: windowStart } },
      }),
      this.prisma.subscription.groupBy({
        by: ['tier'],
        where: { status: SubscriptionStatus.ACTIVE, user: liveUser },
        _count: { _all: true },
      }),
      this.prisma.subscription.aggregate({
        where: { user: liveUser },
        _sum: { requestsUsed: true },
      }),
      this.metricsFor({ from: windowStart, to: now }),
      this.prisma.apiUsageLog.count({
        where: { createdAt: { gte: dayStart } },
      }),
      this.prisma.chat.count(),
      this.prisma.chatMessage.count(),
      this.prisma.webSearch.count(),
      this.prisma.aiProvider.findMany({
        select: {
          name: true,
          isEnabled: true,
          isDefault: true,
          lastHealthCheckStatus: true,
        },
      }),
    ]);

    const countByStatus = (status: UserStatus) =>
      usersByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const countByTier = (tier: PlanTier) =>
      planMix.find((row) => row.tier === tier)?._count._all ?? 0;
    const enabled = providers.filter((p) => p.isEnabled);

    return {
      users: {
        total: usersByStatus.reduce((sum, row) => sum + row._count._all, 0),
        active: countByStatus(UserStatus.ACTIVE),
        suspended: countByStatus(UserStatus.SUSPENDED),
        admins,
        emailVerified,
        newLast30Days: newUsers,
      },
      subscriptions: {
        planMix: {
          [PlanTier.FREE]: countByTier(PlanTier.FREE),
          [PlanTier.PREMIUM]: countByTier(PlanTier.PREMIUM),
        },
        estimatedMonthlyRevenueCents: Object.values(PLAN_DEFINITIONS).reduce(
          (sum, plan) => sum + countByTier(plan.tier) * plan.priceMonthlyCents,
          0,
        ),
        currency: PLAN_CURRENCY,
        quotaRequestsUsed: quota._sum.requestsUsed ?? 0,
      },
      usageLast30Days,
      requestsLast24h,
      content: { chats, chatMessages, searches },
      providers: {
        total: providers.length,
        enabled: enabled.length,
        healthy: enabled.filter(
          (p) => p.lastHealthCheckStatus === HealthStatus.HEALTHY,
        ).length,
        defaultProvider: providers.find((p) => p.isDefault)?.name ?? null,
      },
      generatedAt: now,
    };
  }

  async getUsageAnalytics(
    query: DateRangeQueryDto,
  ): Promise<UsageAnalyticsResponseDto> {
    const range = this.resolveRange(query);
    const where = this.rangeSql(range);

    const [totals, byCategory, byProvider, daily, topUsers] = await Promise.all(
      [
        this.metricsFor(range),
        this.prisma.$queryRaw<(MetricsRow & { category: UsageCategory })[]>`
        SELECT l.category::text AS category, ${METRICS_COLUMNS}
        FROM api_usage_logs l WHERE ${where}
        GROUP BY l.category ORDER BY requests DESC`,
        this.prisma.$queryRaw<
          (MetricsRow & {
            providerId: string | null;
            providerName: string | null;
            providerType: ProviderType | null;
          })[]
        >`
        SELECT l.provider_id AS "providerId", p.name AS "providerName",
               p.type::text AS "providerType", ${METRICS_COLUMNS}
        FROM api_usage_logs l LEFT JOIN ai_providers p ON p.id = l.provider_id
        WHERE ${where}
        GROUP BY l.provider_id, p.name, p.type ORDER BY requests DESC`,
        this.prisma.$queryRaw<(MetricsRow & { date: string })[]>`
        SELECT to_char(date_trunc('day', l.created_at), 'YYYY-MM-DD') AS date,
               ${METRICS_COLUMNS}
        FROM api_usage_logs l WHERE ${where}
        GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<
          { userId: string; email: string; requests: number; tokens: number }[]
        >`
        SELECT l.user_id AS "userId", u.email, COUNT(*)::int AS requests,
               COALESCE(SUM(l.tokens_used), 0)::float8 AS tokens
        FROM api_usage_logs l JOIN users u ON u.id = l.user_id
        WHERE ${where}
        GROUP BY l.user_id, u.email ORDER BY requests DESC
        LIMIT ${ANALYTICS_TOP_USERS_LIMIT}`,
      ],
    );

    return {
      ...range,
      totals,
      byCategory: byCategory.map((row) => ({
        category: row.category,
        ...this.toMetrics(row),
      })),
      byProvider: byProvider.map((row) => ({
        providerId: row.providerId,
        providerName: row.providerName,
        providerType: row.providerType,
        ...this.toMetrics(row),
      })),
      daily: this.fillDays(range, daily),
      topUsers,
    };
  }

  async listLogs(query: ListLogsQueryDto): Promise<UsageLogListResponseDto> {
    const { page, limit, userId, providerId, category, outcome, statusCode } =
      query;
    const { from, to } = this.resolveRange(query);
    const where: Prisma.ApiUsageLogWhereInput = {
      createdAt: { gte: from, lt: to },
      ...(userId && { userId }),
      ...(providerId && { providerId }),
      ...(category && { category }),
      // Both status filters can apply at once (e.g. outcome=error + 502).
      AND: [
        ...(statusCode ? [{ statusCode }] : []),
        ...(outcome ? [{ statusCode: this.outcomeFilter(outcome) }] : []),
      ],
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.apiUsageLog.findMany({
        where,
        include: {
          user: { select: { email: true } },
          provider: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.apiUsageLog.count({ where }),
    ]);

    return {
      items: logs.map((log) => ({
        id: log.id,
        category: log.category,
        endpoint: log.endpoint,
        statusCode: log.statusCode,
        durationMs: log.durationMs,
        tokensUsed: log.tokensUsed,
        userId: log.userId,
        userEmail: log.user?.email ?? null,
        providerId: log.providerId,
        providerName: log.provider?.name ?? null,
        createdAt: log.createdAt,
      })),
      meta: PaginationMetaDto.of(page, limit, total),
    };
  }

  private outcomeFilter(outcome: LogOutcome): Prisma.IntFilter {
    return outcome === 'success'
      ? { lt: ERROR_STATUS_THRESHOLD }
      : { gte: ERROR_STATUS_THRESHOLD };
  }

  private async metricsFor(range: DateRange): Promise<UsageMetricsDto> {
    const [row] = await this.prisma.$queryRaw<MetricsRow[]>`
      SELECT ${METRICS_COLUMNS} FROM api_usage_logs l WHERE ${this.rangeSql(range)}`;
    return this.toMetrics(row);
  }

  private rangeSql({ from, to }: DateRange): Prisma.Sql {
    return Prisma.sql`l.created_at >= ${from} AND l.created_at < ${to}`;
  }

  /** Defaults to the last 30 days; `from` must precede `to`, span ≤ 366 days. */
  private resolveRange({ from, to }: DateRangeQueryDto): DateRange {
    const end = to ?? new Date();
    const start =
      from ??
      new Date(end.getTime() - ANALYTICS_DEFAULT_RANGE_DAYS * MS_PER_DAY);

    if (start >= end) {
      throw new BadRequestException('`from` must be earlier than `to`');
    }
    if (
      end.getTime() - start.getTime() >
      ANALYTICS_MAX_RANGE_DAYS * MS_PER_DAY
    ) {
      throw new BadRequestException(
        `Date range cannot exceed ${ANALYTICS_MAX_RANGE_DAYS} days`,
      );
    }
    return { from: start, to: end };
  }

  private toMetrics(row: MetricsRow): UsageMetricsDto {
    return {
      requests: row.requests,
      errors: row.errors,
      errorRate: row.requests
        ? Number((row.errors / row.requests).toFixed(ERROR_RATE_DECIMALS))
        : 0,
      tokens: row.tokens,
      avgDurationMs: row.avgDurationMs,
    };
  }

  /** One point per UTC day in the range, so charts get no gaps. */
  private fillDays(
    { from, to }: DateRange,
    rows: (MetricsRow & { date: string })[],
  ) {
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const empty: MetricsRow = {
      requests: 0,
      errors: 0,
      tokens: 0,
      avgDurationMs: 0,
    };
    const days = [];

    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    while (cursor < to) {
      const date = cursor.toISOString().slice(0, 10);
      days.push({ date, ...this.toMetrics(byDate.get(date) ?? empty) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }
}

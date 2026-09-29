import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PlanTier,
  Prisma,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import {
  MS_PER_DAY,
  PLAN_CURRENCY,
  PLAN_DEFINITIONS,
} from '../../common/constants/plan.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanResponseDto } from './dto/plan-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { UsageResponseDto } from './dto/usage-response.dto';

type Executor = Prisma.TransactionClient | PrismaService;

export interface AdminSubscriptionOverride {
  tier?: PlanTier;
  status?: SubscriptionStatus;
  resetUsage?: boolean;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  createDefaultSubscription(userId: string, tx: Executor = this.prisma) {
    const { requestLimit, periodDays } = PLAN_DEFINITIONS[PlanTier.FREE];

    return tx.subscription.create({
      data: {
        userId,
        tier: PlanTier.FREE,
        requestLimit,
        periodEnd: this.periodEndFrom(new Date(), periodDays),
      },
    });
  }

  listPlans(): PlanResponseDto[] {
    return Object.values(PLAN_DEFINITIONS).map((plan) => ({
      ...plan,
      currency: PLAN_CURRENCY,
    }));
  }

  /** Returns the user's subscription, rolled over to the current period. */
  async getCurrent(userId: string): Promise<Subscription> {
    await this.rolloverIfExpired(userId);
    return this.findByUserIdOrThrow(userId);
  }

  upgrade(userId: string): Promise<Subscription> {
    return this.changeTier(userId, PlanTier.PREMIUM);
  }

  downgrade(userId: string): Promise<Subscription> {
    return this.changeTier(userId, PlanTier.FREE);
  }

  /**
   * Admin override: set tier (and its limit), status, and/or zero the
   * current period's usage in one write. Unlike upgrade/downgrade, setting
   * the tier a user already has is allowed — the admin may just be fixing
   * a drifted limit.
   */
  async applyAdminOverride(
    userId: string,
    override: AdminSubscriptionOverride,
    actorId: string,
  ): Promise<Subscription> {
    const { tier, status, resetUsage } = override;
    if (tier === undefined && status === undefined && !resetUsage) {
      throw new BadRequestException(
        'Provide at least one of tier, status, or resetUsage',
      );
    }

    const current = await this.getCurrent(userId);
    const data: Prisma.SubscriptionUpdateInput = {};
    if (tier !== undefined) {
      data.tier = tier;
      data.requestLimit = PLAN_DEFINITIONS[tier].requestLimit;
    }
    if (status !== undefined) {
      data.status = status;
    }
    if (resetUsage) {
      data.requestsUsed = 0;
    }

    const updated = await this.prisma.subscription.update({
      where: { id: current.id },
      data,
    });

    this.logger.log(
      `Subscription overridden: user=${userId} tier=${current.tier}->${updated.tier} status=${current.status}->${updated.status} resetUsage=${!!resetUsage} by=${actorId}`,
    );
    return updated;
  }

  /**
   * Atomically reserves one request from the user's quota. The limit check
   * and the increment happen in a single conditional UPDATE, so concurrent
   * requests can never push `requestsUsed` past `requestLimit`.
   */
  async consumeRequest(userId: string): Promise<void> {
    await this.rolloverIfExpired(userId);

    const { count } = await this.prisma.subscription.updateMany({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        requestsUsed: { lt: this.prisma.subscription.fields.requestLimit },
      },
      data: { requestsUsed: { increment: 1 } },
    });

    if (count > 0) {
      return;
    }

    const subscription = await this.findByUserIdOrThrow(userId);
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new ForbiddenException('Subscription is not active');
    }
    throw new HttpException(
      'Request limit reached for the current billing period',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Gives back a request reserved by `consumeRequest` whose work failed. */
  async releaseRequest(userId: string): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { userId, requestsUsed: { gt: 0 } },
      data: { requestsUsed: { decrement: 1 } },
    });
  }

  toUsage(subscription: Subscription): UsageResponseDto {
    return {
      requestLimit: subscription.requestLimit,
      requestsUsed: subscription.requestsUsed,
      remainingRequests: Math.max(
        0,
        subscription.requestLimit - subscription.requestsUsed,
      ),
      periodEnd: subscription.periodEnd,
    };
  }

  toResponse(subscription: Subscription): SubscriptionResponseDto {
    return {
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      periodStart: subscription.periodStart,
      ...this.toUsage(subscription),
    };
  }

  /**
   * Plan changes keep the current billing period and usage count — only the
   * tier and limit move. Resetting usage here would let a user cycle
   * downgrade/upgrade to wipe their counter.
   */
  private async changeTier(
    userId: string,
    tier: PlanTier,
  ): Promise<Subscription> {
    const current = await this.getCurrent(userId);
    if (current.tier === tier) {
      throw new ConflictException(`Already on the ${tier} plan`);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: current.id },
      data: {
        tier,
        status: SubscriptionStatus.ACTIVE,
        requestLimit: PLAN_DEFINITIONS[tier].requestLimit,
      },
    });

    this.logger.log(
      `Subscription changed: user=${userId} ${current.tier} -> ${tier}`,
    );
    return updated;
  }

  /**
   * Lazily starts a fresh billing period once the old one has ended. The
   * `periodEnd <= now` condition makes concurrent rollovers idempotent: only
   * the first one matches, the rest update zero rows.
   */
  private async rolloverIfExpired(userId: string): Promise<void> {
    const subscription = await this.findByUserIdOrThrow(userId);
    const now = new Date();
    if (subscription.periodEnd > now) {
      return;
    }

    const { periodDays } = PLAN_DEFINITIONS[subscription.tier];
    await this.prisma.subscription.updateMany({
      where: { id: subscription.id, periodEnd: { lte: now } },
      data: {
        requestsUsed: 0,
        periodStart: now,
        periodEnd: this.periodEndFrom(now, periodDays),
      },
    });
  }

  private async findByUserIdOrThrow(userId: string): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  private periodEndFrom(start: Date, periodDays: number): Date {
    return new Date(start.getTime() + periodDays * MS_PER_DAY);
  }
}

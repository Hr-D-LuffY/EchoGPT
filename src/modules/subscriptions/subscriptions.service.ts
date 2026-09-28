import { Injectable } from '@nestjs/common';
import { PlanTier, Prisma } from '@prisma/client';
import { PLAN_LIMITS } from '../../common/constants/plan.constants';
import { PrismaService } from '../../prisma/prisma.service';

type Executor = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  createDefaultSubscription(userId: string, tx: Executor = this.prisma) {
    const { requestLimit, periodDays } = PLAN_LIMITS[PlanTier.FREE];
    const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

    return tx.subscription.create({
      data: {
        userId,
        tier: PlanTier.FREE,
        requestLimit,
        periodEnd,
      },
    });
  }
}

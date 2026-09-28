import { PlanTier } from '@prisma/client';

export const PLAN_LIMITS: Record<
  PlanTier,
  { requestLimit: number; periodDays: number }
> = {
  [PlanTier.FREE]: { requestLimit: 50, periodDays: 30 },
  [PlanTier.PREMIUM]: { requestLimit: 2000, periodDays: 30 },
};

import { PlanTier } from '@prisma/client';

export const PLAN_CURRENCY = 'USD';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceMonthlyCents: number;
  requestLimit: number;
  periodDays: number;
  features: string[];
}

/**
 * Single source of truth for what each plan offers. Billing is simulated —
 * there is no payment provider integration, so upgrading takes effect
 * immediately.
 */
export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  [PlanTier.FREE]: {
    tier: PlanTier.FREE,
    name: 'Free',
    priceMonthlyCents: 0,
    requestLimit: 50,
    periodDays: 30,
    features: ['50 AI requests per month', 'Chat and web search'],
  },
  [PlanTier.PREMIUM]: {
    tier: PlanTier.PREMIUM,
    name: 'Premium',
    priceMonthlyCents: 999,
    requestLimit: 2000,
    periodDays: 30,
    features: ['2,000 AI requests per month', 'Chat and web search'],
  },
};

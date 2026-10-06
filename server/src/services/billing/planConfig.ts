import { config } from '../../config/index.js';
import { PlanDefinition, PlanId } from '../../types/index.js';

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    display_name: 'Free',
    monthly_price: 0,
    yearly_price: 0,
    inr_monthly_price: 0,
    currency: 'USD',
    monthly_minutes: 15,
    max_projects: 5,
    max_clip_renders: 10,
    max_social_connections: 2,
    max_scheduled_posts: 5,
    features: [
      '15 source minutes / month',
      '5 projects',
      '10 clip renders',
      '2 social connections',
      '5 scheduled posts',
    ],
  },
  creator: {
    id: 'creator',
    display_name: 'Creator',
    monthly_price: 12,
    yearly_price: 120,
    inr_monthly_price: 999,
    currency: 'USD',
    monthly_minutes: 120,
    max_projects: 25,
    max_clip_renders: 50,
    max_social_connections: 3,
    max_scheduled_posts: 20,
    paddle_price_id_monthly: config.paddlePriceCreatorMonthly || undefined,
    paddle_price_id_yearly: config.paddlePriceCreatorYearly || undefined,
    razorpay_plan_id_monthly: config.razorpayPlanCreatorMonthly || undefined,
    razorpay_plan_id_yearly: config.razorpayPlanCreatorYearly || undefined,
    features: [
      '120 source minutes / month',
      '25 projects',
      '50 clip renders',
      '3 social connections',
      '20 scheduled posts',
    ],
  },
  pro: {
    id: 'pro',
    display_name: 'Pro',
    monthly_price: 24,
    yearly_price: 240,
    inr_monthly_price: 1999,
    currency: 'USD',
    monthly_minutes: 360,
    max_projects: 100,
    max_clip_renders: 200,
    max_social_connections: 10,
    max_scheduled_posts: 100,
    is_recommended: true,
    paddle_price_id_monthly: config.paddlePriceProMonthly || undefined,
    paddle_price_id_yearly: config.paddlePriceProYearly || undefined,
    razorpay_plan_id_monthly: config.razorpayPlanProMonthly || undefined,
    razorpay_plan_id_yearly: config.razorpayPlanProYearly || undefined,
    stripe_price_id: config.stripeProPriceId || undefined,
    features: [
      '360 source minutes / month',
      '100 projects',
      '200 clip renders',
      '10 social connections',
      '100 scheduled posts',
      'Smart 9:16 Face-Tracking Reframe',
      'Creator Brand Voice',
    ],
  },
  studio: {
    id: 'studio',
    display_name: 'Studio',
    monthly_price: 49,
    yearly_price: 490,
    inr_monthly_price: 3999,
    currency: 'USD',
    monthly_minutes: 900,
    max_projects: 250,
    max_clip_renders: 500,
    max_social_connections: 25,
    max_scheduled_posts: 500,
    paddle_price_id_monthly: config.paddlePriceStudioMonthly || undefined,
    paddle_price_id_yearly: config.paddlePriceStudioYearly || undefined,
    razorpay_plan_id_monthly: config.razorpayPlanStudioMonthly || undefined,
    razorpay_plan_id_yearly: config.razorpayPlanStudioYearly || undefined,
    stripe_price_id: config.stripeBusinessPriceId || undefined,
    features: [
      '900 source minutes / month',
      '250 projects',
      '500 clip renders',
      '25 social connections',
      '500 scheduled posts',
      'Priority background job queues',
      'Multi-Persona Brand Kits',
    ],
  },
};

export function getPlanDefinition(planId: string): PlanDefinition | null {
  const normalized = planId.toLowerCase().trim() as PlanId;
  return PLANS[normalized] || null;
}

export function getAllPlans(): PlanDefinition[] {
  return [PLANS.free, PLANS.creator, PLANS.pro, PLANS.studio];
}

export function resolvePlanFromProviderId(
  provider: 'paddle' | 'razorpay' | 'stripe',
  providerId: string
): { planId: PlanId; interval: 'month' | 'year' } | null {
  if (!providerId) return null;

  if (provider === 'paddle') {
    if (config.paddlePriceCreatorMonthly && providerId === config.paddlePriceCreatorMonthly) {
      return { planId: 'creator', interval: 'month' };
    }
    if (config.paddlePriceCreatorYearly && providerId === config.paddlePriceCreatorYearly) {
      return { planId: 'creator', interval: 'year' };
    }
    if (config.paddlePriceProMonthly && providerId === config.paddlePriceProMonthly) {
      return { planId: 'pro', interval: 'month' };
    }
    if (config.paddlePriceProYearly && providerId === config.paddlePriceProYearly) {
      return { planId: 'pro', interval: 'year' };
    }
    if (config.paddlePriceStudioMonthly && providerId === config.paddlePriceStudioMonthly) {
      return { planId: 'studio', interval: 'month' };
    }
    if (config.paddlePriceStudioYearly && providerId === config.paddlePriceStudioYearly) {
      return { planId: 'studio', interval: 'year' };
    }
  }

  if (provider === 'razorpay') {
    if (config.razorpayPlanCreatorMonthly && providerId === config.razorpayPlanCreatorMonthly) {
      return { planId: 'creator', interval: 'month' };
    }
    if (config.razorpayPlanCreatorYearly && providerId === config.razorpayPlanCreatorYearly) {
      return { planId: 'creator', interval: 'year' };
    }
    if (config.razorpayPlanProMonthly && providerId === config.razorpayPlanProMonthly) {
      return { planId: 'pro', interval: 'month' };
    }
    if (config.razorpayPlanProYearly && providerId === config.razorpayPlanProYearly) {
      return { planId: 'pro', interval: 'year' };
    }
    if (config.razorpayPlanStudioMonthly && providerId === config.razorpayPlanStudioMonthly) {
      return { planId: 'studio', interval: 'month' };
    }
    if (config.razorpayPlanStudioYearly && providerId === config.razorpayPlanStudioYearly) {
      return { planId: 'studio', interval: 'year' };
    }
  }

  if (provider === 'stripe') {
    if (config.stripeProPriceId && providerId === config.stripeProPriceId) {
      return { planId: 'pro', interval: 'month' };
    }
    if (config.stripeBusinessPriceId && providerId === config.stripeBusinessPriceId) {
      return { planId: 'studio', interval: 'month' };
    }
  }

  return null;
}

export function resolvePlanFromPriceId(priceId: string): PlanId | null {
  const res = resolvePlanFromProviderId('stripe', priceId);
  return res ? res.planId : null;
}

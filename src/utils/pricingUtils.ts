import { PlanDefinition, BillingInterval, BillingProviderName } from '../services/billingService';

export interface PlanPriceDisplay {
  symbol: string;
  amount: string;
  interval: string;
  effectiveMonthly: string | null;
  savingsBadge: string | null;
  secondaryText: string;
  ctaText: string;
  isAvailable: boolean;
  unavailableReason?: string;
}

/**
 * Checks whether the given billing interval is supported for the selected provider.
 * For Razorpay, annual INR pricing is not configured in PLANS, so only 'month' is supported.
 */
export function isProviderIntervalSupported(
  provider: BillingProviderName,
  interval: BillingInterval,
  plans?: PlanDefinition[]
): boolean {
  if (provider === 'razorpay' && interval === 'year') {
    if (plans && plans.some((p) => p.id !== 'free' && (p as any).inr_yearly_price !== undefined)) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Calculates and formats price displays across billing intervals and providers.
 * Accurately reflects configured monthly and yearly rates without hardcoding or inventing prices.
 * Strictly prevents misleading pricing or accidental checkout when annual rates are unconfigured.
 */
export function getPlanPriceDisplay(
  plan: PlanDefinition,
  billingInterval: BillingInterval,
  selectedProvider: BillingProviderName
): PlanPriceDisplay {
  const isFree = plan.id === 'free';
  const isYearly = billingInterval === 'year';
  const isIndianProvider = selectedProvider === 'razorpay';

  if (isFree) {
    const symbol = isIndianProvider ? '₹' : '$';
    return {
      symbol,
      amount: '0',
      interval: 'forever',
      effectiveMonthly: null,
      savingsBadge: null,
      secondaryText: 'Free tier for exploration',
      ctaText: 'Current Plan',
      isAvailable: true,
    };
  }

  if (isIndianProvider) {
    // Razorpay (India INR)
    const inrMonthly = plan.inr_monthly_price;
    const inrYearly = (plan as any).inr_yearly_price as number | undefined;

    if (isYearly) {
      if (inrYearly !== undefined) {
        const effective = (inrYearly / 12).toFixed(inrYearly % 12 === 0 ? 0 : 2);
        const savings = inrMonthly * 12 - inrYearly;
        return {
          symbol: '₹',
          amount: inrYearly.toLocaleString(),
          interval: 'year',
          effectiveMonthly: `₹${effective} / mo`,
          savingsBadge: savings > 0 ? `Save ₹${savings.toLocaleString()} / yr` : null,
          secondaryText: `Global (USD): $${plan.yearly_price} / yr`,
          ctaText: `Choose ${plan.display_name} (₹${inrYearly.toLocaleString()}/yr)`,
          isAvailable: true,
        };
      }

      // If INR yearly is unconfigured in PLANS:
      // Prevent displaying monthly rate as yearly, show explicit unavailable status, and disable CTA.
      return {
        symbol: '₹',
        amount: '—',
        interval: 'year',
        effectiveMonthly: null,
        savingsBadge: null,
        secondaryText: `Annual billing unavailable for INR • Available in USD ($${plan.yearly_price}/yr via Paddle)`,
        ctaText: 'Annual Billing Unavailable for INR',
        isAvailable: false,
        unavailableReason: 'Annual billing is unavailable for INR (Razorpay). Please switch to Monthly billing or choose Paddle (Global USD).',
      };
    }

    return {
      symbol: '₹',
      amount: inrMonthly.toLocaleString(),
      interval: 'month',
      effectiveMonthly: null,
      savingsBadge: null,
      secondaryText: `Global (USD): $${plan.monthly_price} / mo`,
      ctaText: `Choose ${plan.display_name} (₹${inrMonthly.toLocaleString()}/mo)`,
      isAvailable: true,
    };
  }

  // Paddle or Stripe (Global USD)
  const usdMonthly = plan.monthly_price;
  const usdYearly = plan.yearly_price;

  if (isYearly) {
    const effectiveNum = usdYearly / 12;
    const effectiveMonthly = effectiveNum % 1 === 0 ? `$${effectiveNum}` : `$${effectiveNum.toFixed(2)}`;
    const yearlySavings = usdMonthly * 12 - usdYearly;
    const savingsPct = usdMonthly > 0 ? Math.round((yearlySavings / (usdMonthly * 12)) * 100) : 0;
    const savingsBadge = yearlySavings > 0 ? `${effectiveMonthly}/mo • Save $${yearlySavings}/yr (${savingsPct}% off)` : null;

    return {
      symbol: '$',
      amount: usdYearly.toString(),
      interval: 'year',
      effectiveMonthly: `${effectiveMonthly} / mo`,
      savingsBadge,
      secondaryText: `India (INR): ₹${plan.inr_monthly_price.toLocaleString()} / mo`,
      ctaText: `Choose ${plan.display_name} ($${usdYearly}/yr)`,
      isAvailable: true,
    };
  }

  return {
    symbol: '$',
    amount: usdMonthly.toString(),
    interval: 'month',
    effectiveMonthly: null,
    savingsBadge: null,
    secondaryText: `India (INR): ₹${plan.inr_monthly_price.toLocaleString()} / mo`,
    ctaText: `Choose ${plan.display_name} ($${usdMonthly}/mo)`,
    isAvailable: true,
  };
}

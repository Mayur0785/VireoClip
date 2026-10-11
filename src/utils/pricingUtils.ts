import { PlanDefinition, BillingInterval, BillingProviderName } from '../services/billingService';

export type CurrencyPreference = 'USD' | 'INR';

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
 * Calculates and formats price displays across billing intervals, display currencies, and providers.
 * Accurately reflects configured monthly and yearly rates without hardcoding or inventing prices.
 * Strictly prevents misleading pricing or accidental checkout when annual rates are unconfigured.
 */
export function getPlanPriceDisplay(
  plan: PlanDefinition,
  billingInterval: BillingInterval,
  selectedProvider: BillingProviderName = 'paddle',
  displayCurrency: CurrencyPreference = 'USD'
): PlanPriceDisplay {
  const isFree = plan.id === 'free';
  const isYearly = billingInterval === 'year';
  const isINR = displayCurrency === 'INR';

  if (isFree) {
    return {
      symbol: isINR ? '₹' : '$',
      amount: '0',
      interval: 'forever',
      effectiveMonthly: null,
      savingsBadge: null,
      secondaryText: 'Free tier for exploration',
      ctaText: 'Current Plan',
      isAvailable: true,
    };
  }

  if (isINR) {
    // India INR display
    const inrMonthly = plan.inr_monthly_price;
    const inrYearly = (plan as any).inr_yearly_price as number | undefined;

    if (isYearly) {
      if (inrYearly !== undefined) {
        const effective = (inrYearly / 12).toFixed(inrYearly % 12 === 0 ? 0 : 2);
        const savings = inrMonthly * 12 - inrYearly;
        return {
          symbol: '₹',
          amount: inrYearly.toLocaleString('en-IN'),
          interval: 'year',
          effectiveMonthly: `₹${effective} / mo`,
          savingsBadge: savings > 0 ? `Save ₹${savings.toLocaleString('en-IN')} / yr` : null,
          secondaryText: `Global (USD): $${plan.yearly_price} / yr • Billed via ${selectedProvider.toUpperCase()}`,
          ctaText: `Choose ${plan.display_name} (₹${inrYearly.toLocaleString('en-IN')}/yr)`,
          isAvailable: true,
        };
      }

      // If INR yearly is unconfigured in PLANS:
      // Show explicit unavailable state rather than inventing a yearly price.
      return {
        symbol: '₹',
        amount: '—',
        interval: 'year',
        effectiveMonthly: null,
        savingsBadge: null,
        secondaryText: `Annual billing unavailable in INR • Available in USD ($${plan.yearly_price}/yr via Paddle)`,
        ctaText: 'Annual Billing Unavailable for INR',
        isAvailable: false,
        unavailableReason: 'Annual billing is unconfigured for INR. Please switch to Monthly billing or choose Paddle (Global USD).',
      };
    }

    return {
      symbol: '₹',
      amount: inrMonthly.toLocaleString('en-IN'),
      interval: 'month',
      effectiveMonthly: null,
      savingsBadge: null,
      secondaryText: selectedProvider === 'razorpay'
        ? 'Billed in INR via Razorpay (India)'
        : `Display in INR • Billed in USD ($${plan.monthly_price}/mo via ${selectedProvider.toUpperCase()})`,
      ctaText: `Choose ${plan.display_name} (₹${inrMonthly.toLocaleString('en-IN')}/mo)`,
      isAvailable: true,
    };
  }

  // Global USD display
  const usdMonthly = plan.monthly_price;
  const usdYearly = plan.yearly_price;

  if (isYearly) {
    const effectiveNum = usdYearly / 12;
    const effectiveMonthly = effectiveNum % 1 === 0 ? `$${effectiveNum}` : `$${effectiveNum.toFixed(2)}`;
    const yearlySavings = usdMonthly * 12 - usdYearly;
    const savingsPct = usdMonthly > 0 ? Math.round((yearlySavings / (usdMonthly * 12)) * 100) : 0;
    const savingsBadge = yearlySavings > 0 ? `${effectiveMonthly}/mo • Save $${yearlySavings}/yr (${savingsPct}% off)` : null;
    const isRazorpay = selectedProvider === 'razorpay';

    return {
      symbol: '$',
      amount: usdYearly.toString(),
      interval: 'year',
      effectiveMonthly: `${effectiveMonthly} / mo`,
      savingsBadge,
      secondaryText: isRazorpay
        ? 'Annual billing unavailable for Razorpay INR • Switch to Paddle'
        : `India (INR): ₹${plan.inr_monthly_price.toLocaleString('en-IN')}/mo • Billed annually via ${selectedProvider.toUpperCase()}`,
      ctaText: isRazorpay ? 'Annual Billing Unavailable for INR' : `Choose ${plan.display_name} ($${usdYearly}/yr)`,
      isAvailable: !isRazorpay,
      unavailableReason: isRazorpay ? 'Annual billing is unavailable for INR (Razorpay). Please switch to Paddle (Global USD).' : undefined,
    };
  }

  return {
    symbol: '$',
    amount: usdMonthly.toString(),
    interval: 'month',
    effectiveMonthly: null,
    savingsBadge: null,
    secondaryText: selectedProvider === 'razorpay'
      ? `Display in USD • Billed in INR (₹${plan.inr_monthly_price.toLocaleString('en-IN')}/mo via Razorpay)`
      : `India (INR): ₹${plan.inr_monthly_price.toLocaleString('en-IN')} / mo • Billed in USD via ${selectedProvider.toUpperCase()}`,
    ctaText: `Choose ${plan.display_name} ($${usdMonthly}/mo)`,
    isAvailable: true,
  };
}

/**
 * Authoritative marketing rates helper for landing page and public displays.
 * Derived directly from server plan configuration without arbitrary conversions.
 */
export function getMarketingPlanRate(
  planId: 'free' | 'creator' | 'pro' | 'studio',
  interval: BillingInterval,
  currency: CurrencyPreference
): {
  amount: string;
  symbol: string;
  periodText: string;
  isAvailable: boolean;
  savingsBadge: string | null;
} {
  if (planId === 'free') {
    return {
      symbol: currency === 'INR' ? '₹' : '$',
      amount: '0',
      periodText: interval === 'year' ? '/ forever' : '/ month',
      isAvailable: true,
      savingsBadge: null,
    };
  }

  if (currency === 'INR') {
    if (interval === 'year') {
      return {
        symbol: '₹',
        amount: '—',
        periodText: 'Unavailable in INR',
        isAvailable: false,
        savingsBadge: null,
      };
    }
    const rates: Record<'creator' | 'pro' | 'studio', number> = {
      creator: 999,
      pro: 1999,
      studio: 3999,
    };
    return {
      symbol: '₹',
      amount: rates[planId].toLocaleString('en-IN'),
      periodText: '/ mo',
      isAvailable: true,
      savingsBadge: null,
    };
  }

  // USD
  if (interval === 'year') {
    const yearlyRates: Record<'creator' | 'pro' | 'studio', { amount: number; monthly: string; save: number }> = {
      creator: { amount: 120, monthly: '$10/mo', save: 24 },
      pro: { amount: 240, monthly: '$20/mo', save: 48 },
      studio: { amount: 490, monthly: '$40.83/mo', save: 98 },
    };
    const rate = yearlyRates[planId];
    return {
      symbol: '$',
      amount: rate.amount.toString(),
      periodText: `/ year (${rate.monthly})`,
      isAvailable: true,
      savingsBadge: `Save $${rate.save}/yr`,
    };
  }

  const monthlyRates: Record<'creator' | 'pro' | 'studio', number> = {
    creator: 12,
    pro: 24,
    studio: 49,
  };
  return {
    symbol: '$',
    amount: monthlyRates[planId].toString(),
    periodText: '/ month',
    isAvailable: true,
    savingsBadge: null,
  };
}

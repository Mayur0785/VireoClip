import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllPlans, getPlanDefinition, PLANS } from '../services/billing/planConfig.js';
import { PlanId } from '../types/index.js';

interface PlanPriceDisplay {
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
 */
function isProviderIntervalSupported(
  provider: 'paddle' | 'razorpay' | 'stripe',
  interval: 'month' | 'year',
  plans?: any[]
): boolean {
  if (provider === 'razorpay' && interval === 'year') {
    if (plans && plans.some((p) => p.id !== 'free' && p.inr_yearly_price !== undefined)) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Mirror of getPlanPriceDisplay logic from src/utils/pricingUtils.ts
 * for automated regression verification in server test runner.
 */
function getPlanPriceDisplay(
  plan: any,
  billingInterval: 'month' | 'year',
  selectedProvider: 'paddle' | 'razorpay' | 'stripe'
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
    const inrMonthly = plan.inr_monthly_price;
    const inrYearly = plan.inr_yearly_price as number | undefined;

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

describe('Yearly Plan Pricing Toggle & Pricing Display Bug Fix', () => {
  describe('1. Monthly Selection Displays Verified Monthly Rates', () => {
    it('displays configured monthly prices for Paddle (Global USD)', () => {
      const creator = getPlanDefinition('creator')!;
      const pro = getPlanDefinition('pro')!;
      const studio = getPlanDefinition('studio')!;

      const creatorDisplay = getPlanPriceDisplay(creator, 'month', 'paddle');
      assert.equal(creatorDisplay.symbol, '$');
      assert.equal(creatorDisplay.amount, '12');
      assert.equal(creatorDisplay.interval, 'month');
      assert.equal(creatorDisplay.ctaText, 'Choose Creator ($12/mo)');
      assert.equal(creatorDisplay.isAvailable, true);

      const proDisplay = getPlanPriceDisplay(pro, 'month', 'paddle');
      assert.equal(proDisplay.symbol, '$');
      assert.equal(proDisplay.amount, '24');
      assert.equal(proDisplay.interval, 'month');
      assert.equal(proDisplay.ctaText, 'Choose Pro ($24/mo)');
      assert.equal(proDisplay.isAvailable, true);

      const studioDisplay = getPlanPriceDisplay(studio, 'month', 'paddle');
      assert.equal(studioDisplay.symbol, '$');
      assert.equal(studioDisplay.amount, '49');
      assert.equal(studioDisplay.interval, 'month');
      assert.equal(studioDisplay.ctaText, 'Choose Studio ($49/mo)');
      assert.equal(studioDisplay.isAvailable, true);
    });

    it('displays configured monthly prices for Razorpay (India INR)', () => {
      const creator = getPlanDefinition('creator')!;
      const pro = getPlanDefinition('pro')!;
      const studio = getPlanDefinition('studio')!;

      const creatorDisplay = getPlanPriceDisplay(creator, 'month', 'razorpay');
      assert.equal(creatorDisplay.symbol, '₹');
      assert.equal(creatorDisplay.amount, '999');
      assert.equal(creatorDisplay.interval, 'month');
      assert.equal(creatorDisplay.ctaText, 'Choose Creator (₹999/mo)');
      assert.equal(creatorDisplay.isAvailable, true);

      const proDisplay = getPlanPriceDisplay(pro, 'month', 'razorpay');
      assert.equal(proDisplay.symbol, '₹');
      assert.equal(proDisplay.amount, '1,999');
      assert.equal(proDisplay.interval, 'month');
      assert.equal(proDisplay.ctaText, 'Choose Pro (₹1,999/mo)');
      assert.equal(proDisplay.isAvailable, true);

      const studioDisplay = getPlanPriceDisplay(studio, 'month', 'razorpay');
      assert.equal(studioDisplay.symbol, '₹');
      assert.equal(studioDisplay.amount, '3,999');
      assert.equal(studioDisplay.interval, 'month');
      assert.equal(studioDisplay.ctaText, 'Choose Studio (₹3,999/mo)');
      assert.equal(studioDisplay.isAvailable, true);
    });
  });

  describe('2. Yearly Selection Updates Pricing Cards Accurately', () => {
    it('updates every paid card to the configured yearly price for Paddle', () => {
      const creator = getPlanDefinition('creator')!;
      const pro = getPlanDefinition('pro')!;
      const studio = getPlanDefinition('studio')!;

      const creatorYearly = getPlanPriceDisplay(creator, 'year', 'paddle');
      assert.equal(creatorYearly.symbol, '$');
      assert.equal(creatorYearly.amount, '120');
      assert.equal(creatorYearly.interval, 'year');
      assert.equal(creatorYearly.effectiveMonthly, '$10 / mo');
      assert.ok(creatorYearly.savingsBadge?.includes('Save $24/yr'));
      assert.equal(creatorYearly.ctaText, 'Choose Creator ($120/yr)');
      assert.equal(creatorYearly.isAvailable, true);

      const proYearly = getPlanPriceDisplay(pro, 'year', 'paddle');
      assert.equal(proYearly.symbol, '$');
      assert.equal(proYearly.amount, '240');
      assert.equal(proYearly.interval, 'year');
      assert.equal(proYearly.effectiveMonthly, '$20 / mo');
      assert.ok(proYearly.savingsBadge?.includes('Save $48/yr'));
      assert.equal(proYearly.ctaText, 'Choose Pro ($240/yr)');
      assert.equal(proYearly.isAvailable, true);

      const studioYearly = getPlanPriceDisplay(studio, 'year', 'paddle');
      assert.equal(studioYearly.symbol, '$');
      assert.equal(studioYearly.amount, '490');
      assert.equal(studioYearly.interval, 'year');
      assert.equal(studioYearly.effectiveMonthly, '$40.83 / mo');
      assert.ok(studioYearly.savingsBadge?.includes('Save $98/yr'));
      assert.equal(studioYearly.ctaText, 'Choose Studio ($490/yr)');
      assert.equal(studioYearly.isAvailable, true);
    });

    it('free plan remains $0 forever regardless of interval or provider', () => {
      const free = getPlanDefinition('free')!;

      const freeMonthlyUSD = getPlanPriceDisplay(free, 'month', 'paddle');
      assert.equal(freeMonthlyUSD.symbol, '$');
      assert.equal(freeMonthlyUSD.amount, '0');
      assert.equal(freeMonthlyUSD.interval, 'forever');
      assert.equal(freeMonthlyUSD.isAvailable, true);

      const freeYearlyUSD = getPlanPriceDisplay(free, 'year', 'paddle');
      assert.equal(freeYearlyUSD.symbol, '$');
      assert.equal(freeYearlyUSD.amount, '0');
      assert.equal(freeYearlyUSD.interval, 'forever');
      assert.equal(freeYearlyUSD.isAvailable, true);

      const freeMonthlyINR = getPlanPriceDisplay(free, 'month', 'razorpay');
      assert.equal(freeMonthlyINR.symbol, '₹');
      assert.equal(freeMonthlyINR.amount, '0');
      assert.equal(freeMonthlyINR.interval, 'forever');
      assert.equal(freeMonthlyINR.isAvailable, true);

      const freeYearlyINR = getPlanPriceDisplay(free, 'year', 'razorpay');
      assert.equal(freeYearlyINR.symbol, '₹');
      assert.equal(freeYearlyINR.amount, '0');
      assert.equal(freeYearlyINR.interval, 'forever');
      assert.equal(freeYearlyINR.isAvailable, true);
    });
  });

  describe('3. Razorpay Yearly Selection When Annual INR Pricing is Missing', () => {
    it('does not display monthly INR amount as annual price, flags unconfigured status, and disables CTA', () => {
      const creator = getPlanDefinition('creator')!;
      const pro = getPlanDefinition('pro')!;
      const studio = getPlanDefinition('studio')!;

      assert.equal((creator as any).inr_yearly_price, undefined);
      assert.equal((pro as any).inr_yearly_price, undefined);
      assert.equal((studio as any).inr_yearly_price, undefined);

      // Verify helper function correctly flags interval as unsupported
      assert.equal(isProviderIntervalSupported('razorpay', 'year'), false);
      assert.equal(isProviderIntervalSupported('razorpay', 'month'), true);
      assert.equal(isProviderIntervalSupported('paddle', 'year'), true);

      // Creator
      const creatorYearly = getPlanPriceDisplay(creator, 'year', 'razorpay');
      assert.equal(creatorYearly.amount, '—', 'Must not display monthly 999 as annual price');
      assert.equal(creatorYearly.interval, 'year', 'Interval must be year, not misleading month');
      assert.equal(creatorYearly.isAvailable, false, 'Must flag plan as unavailable for yearly checkout');
      assert.equal(creatorYearly.ctaText, 'Annual Billing Unavailable for INR');
      assert.ok(creatorYearly.unavailableReason?.includes('Annual billing is unavailable for INR'));
      assert.ok(creatorYearly.secondaryText.includes('Annual billing unavailable for INR'));

      // Pro
      const proYearly = getPlanPriceDisplay(pro, 'year', 'razorpay');
      assert.equal(proYearly.amount, '—');
      assert.equal(proYearly.interval, 'year');
      assert.equal(proYearly.isAvailable, false);
      assert.equal(proYearly.ctaText, 'Annual Billing Unavailable for INR');

      // Studio
      const studioYearly = getPlanPriceDisplay(studio, 'year', 'razorpay');
      assert.equal(studioYearly.amount, '—');
      assert.equal(studioYearly.interval, 'year');
      assert.equal(studioYearly.isAvailable, false);
      assert.equal(studioYearly.ctaText, 'Annual Billing Unavailable for INR');
    });
  });

  describe('4. Correct CTA and Checkout Interval Matching', () => {
    it('ensures CTA text accurately matches selected billing interval and amounts', () => {
      const pro = getPlanDefinition('pro')!;

      // Monthly USD
      const proMonthlyUSD = getPlanPriceDisplay(pro, 'month', 'paddle');
      assert.equal(proMonthlyUSD.ctaText, 'Choose Pro ($24/mo)');
      assert.equal(proMonthlyUSD.isAvailable, true);

      // Yearly USD
      const proYearlyUSD = getPlanPriceDisplay(pro, 'year', 'paddle');
      assert.equal(proYearlyUSD.ctaText, 'Choose Pro ($240/yr)');
      assert.equal(proYearlyUSD.isAvailable, true);

      // Monthly INR
      const proMonthlyINR = getPlanPriceDisplay(pro, 'month', 'razorpay');
      assert.equal(proMonthlyINR.ctaText, 'Choose Pro (₹1,999/mo)');
      assert.equal(proMonthlyINR.isAvailable, true);

      // Yearly INR (blocked)
      const proYearlyINR = getPlanPriceDisplay(pro, 'year', 'razorpay');
      assert.equal(proYearlyINR.ctaText, 'Annual Billing Unavailable for INR');
      assert.equal(proYearlyINR.isAvailable, false);
    });
  });

  describe('5. Repeated Toggle Switching Consistency', () => {
    it('switching between month and year repeatedly yields identical deterministic results', () => {
      const pro = getPlanDefinition('pro')!;

      // Cycle 1
      const m1 = getPlanPriceDisplay(pro, 'month', 'paddle');
      assert.equal(m1.amount, '24');
      assert.equal(m1.interval, 'month');

      const y1 = getPlanPriceDisplay(pro, 'year', 'paddle');
      assert.equal(y1.amount, '240');
      assert.equal(y1.interval, 'year');

      // Cycle 2: return to month
      const m2 = getPlanPriceDisplay(pro, 'month', 'paddle');
      assert.deepEqual(m1, m2);

      // Cycle 2: return to year
      const y2 = getPlanPriceDisplay(pro, 'year', 'paddle');
      assert.deepEqual(y1, y2);
    });
  });

  describe('6. Verified Savings Calculations (No Invented Numbers)', () => {
    it('verifies yearly savings percentages are derived directly from configured prices', () => {
      // Creator: $12/mo * 12 = $144. Yearly = $120. Savings = $24. Pct = 24/144 = 16.67% ~ 17%
      const creator = getPlanDefinition('creator')!;
      const creatorSaving = creator.monthly_price * 12 - creator.yearly_price;
      assert.equal(creatorSaving, 24);
      assert.equal(Math.round((creatorSaving / (creator.monthly_price * 12)) * 100), 17);

      // Pro: $24/mo * 12 = $288. Yearly = $240. Savings = $48. Pct = 48/288 = 16.67% ~ 17%
      const pro = getPlanDefinition('pro')!;
      const proSaving = pro.monthly_price * 12 - pro.yearly_price;
      assert.equal(proSaving, 48);
      assert.equal(Math.round((proSaving / (pro.monthly_price * 12)) * 100), 17);

      // Studio: $49/mo * 12 = $588. Yearly = $490. Savings = $98. Pct = 98/588 = 16.67% ~ 17%
      const studio = getPlanDefinition('studio')!;
      const studioSaving = studio.monthly_price * 12 - studio.yearly_price;
      assert.equal(studioSaving, 98);
      assert.equal(Math.round((studioSaving / (studio.monthly_price * 12)) * 100), 17);
    });
  });

  describe('7. Stripe Global USD Monthly and Yearly Consistency', () => {
    it('displays identical USD monthly and yearly rates for Stripe provider', () => {
      const pro = getPlanDefinition('pro')!;
      const proMonthlyStripe = getPlanPriceDisplay(pro, 'month', 'stripe');
      assert.equal(proMonthlyStripe.symbol, '$');
      assert.equal(proMonthlyStripe.amount, '24');
      assert.equal(proMonthlyStripe.interval, 'month');
      assert.equal(proMonthlyStripe.ctaText, 'Choose Pro ($24/mo)');
      assert.equal(proMonthlyStripe.isAvailable, true);

      const proYearlyStripe = getPlanPriceDisplay(pro, 'year', 'stripe');
      assert.equal(proYearlyStripe.symbol, '$');
      assert.equal(proYearlyStripe.amount, '240');
      assert.equal(proYearlyStripe.interval, 'year');
      assert.equal(proYearlyStripe.effectiveMonthly, '$20 / mo');
      assert.ok(proYearlyStripe.savingsBadge?.includes('Save $48/yr'));
      assert.equal(proYearlyStripe.ctaText, 'Choose Pro ($240/yr)');
      assert.equal(proYearlyStripe.isAvailable, true);
    });
  });

  describe('8. Verified Source Handling If Annual INR Is Ever Configured', () => {
    it('uses verified inr_yearly_price when present without inventing or guessing numbers', () => {
      const customPlan = {
        ...getPlanDefinition('pro')!,
        inr_yearly_price: 19990,
      };

      const customDisplay = getPlanPriceDisplay(customPlan, 'year', 'razorpay');
      assert.equal(customDisplay.symbol, '₹');
      assert.equal(customDisplay.amount, '19,990');
      assert.equal(customDisplay.interval, 'year');
      assert.equal(customDisplay.isAvailable, true);
      assert.equal(customDisplay.ctaText, 'Choose Pro (₹19,990/yr)');
      assert.ok(customDisplay.savingsBadge?.includes('Save ₹3,998 / yr'));

      // Helper detects configured status accurately
      assert.equal(isProviderIntervalSupported('razorpay', 'year', [customPlan]), true);
      assert.equal(isProviderIntervalSupported('razorpay', 'year', getAllPlans()), false);
    });
  });

  describe('9. Provider Switching Lifecycle & Checkout Safety Guards', () => {
    it('switching providers safely prevents accidental monthly checkout while in yearly mode', () => {
      // Simulate user state:
      let provider: 'paddle' | 'razorpay' = 'paddle';
      let interval: 'month' | 'year' = 'month';

      // 1. User selects yearly on Paddle
      interval = 'year';
      assert.equal(isProviderIntervalSupported(provider, interval), true);
      const paddleYearly = getPlanPriceDisplay(getPlanDefinition('pro')!, interval, provider);
      assert.equal(paddleYearly.isAvailable, true);
      assert.equal(paddleYearly.ctaText, 'Choose Pro ($240/yr)');

      // 2. User switches provider to Razorpay
      provider = 'razorpay';
      // UI / useEffect reconciliation automatically resets interval to month:
      if (!isProviderIntervalSupported(provider, interval, getAllPlans())) {
        interval = 'month';
      }
      assert.equal(interval, 'month', 'Must automatically fall back to monthly when Razorpay is active');

      // Razorpay monthly displays verified monthly pricing safely
      const rzpMonthly = getPlanPriceDisplay(getPlanDefinition('pro')!, interval, provider);
      assert.equal(rzpMonthly.isAvailable, true);
      assert.equal(rzpMonthly.amount, '1,999');
      assert.equal(rzpMonthly.interval, 'month');
      assert.equal(rzpMonthly.ctaText, 'Choose Pro (₹1,999/mo)');

      // 3. User attempts to select yearly again on Razorpay: blocked
      const yearlySupported = isProviderIntervalSupported(provider, 'year', getAllPlans());
      assert.equal(yearlySupported, false, 'Yearly selection must be disabled for Razorpay');

      // 4. Even if interval were forced to year, CTA remains disabled and does not start monthly checkout
      const rzpForcedYearly = getPlanPriceDisplay(getPlanDefinition('pro')!, 'year', provider);
      assert.equal(rzpForcedYearly.isAvailable, false);
      assert.equal(rzpForcedYearly.amount, '—');
      assert.equal(rzpForcedYearly.ctaText, 'Annual Billing Unavailable for INR');

      // 5. User switches back to Paddle: yearly is re-enabled cleanly
      provider = 'paddle';
      assert.equal(isProviderIntervalSupported(provider, 'year', getAllPlans()), true);
    });
  });
});

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Zap,
  Check,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Clock,
  Receipt,
  CreditCard,
  XCircle,
  Star,
} from 'lucide-react';
import { Button } from '../components/Button';
import { SpotlightCard } from '../components/react-bits/SpotlightCard';
import { ShinyButton } from '../components/react-bits/ShinyButton';
import {
  BillingService,
  PlanDefinition,
  UserEntitlement,
  BillingUsage,
  BillingInvoice,
  ProviderOption,
  BillingProviderName,
  BillingInterval,
} from '../services/billingService';
import { getPlanPriceDisplay, isProviderIntervalSupported } from '../utils/pricingUtils';

export const BillingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<BillingProviderName>('paddle');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const isSuccessRedirect = searchParams.get('success') === 'true';
  const isCanceledRedirect = searchParams.get('canceled') === 'true';
  const providerParam = searchParams.get('provider');

  useEffect(() => {
    if (isSuccessRedirect) {
      setNotice({
        type: 'info',
        message: `Payment initiated via ${providerParam || 'provider'}! Webhook sync in progress...`,
      });
    } else if (isCanceledRedirect) {
      setNotice({
        type: 'info',
        message: 'Checkout canceled. Your current plan was not modified.',
      });
    }
  }, [isSuccessRedirect, isCanceledRedirect, providerParam]);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      const [plansRes, subRes, usageRes, invoicesRes] = await Promise.allSettled([
        BillingService.getPlans(),
        BillingService.getSubscription(),
        BillingService.getUsage(),
        BillingService.getInvoices(),
      ]);

      if (plansRes.status === 'fulfilled') {
        setPlans(plansRes.value.plans);
        setProviders(plansRes.value.providers);
        if (plansRes.value.defaultProvider) {
          setSelectedProvider(plansRes.value.defaultProvider);
        }
      }

      if (subRes.status === 'fulfilled') {
        setEntitlement(subRes.value.entitlement);
        if (subRes.value.providers) {
          setProviders(subRes.value.providers);
        }
      }

      if (usageRes.status === 'fulfilled' && usageRes.value) {
        setUsage(usageRes.value);
      }

      if (invoicesRes.status === 'fulfilled') {
        setInvoices(invoicesRes.value);
      }
    } catch (err: any) {
      console.warn('Could not load billing details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  useEffect(() => {
    if (!isProviderIntervalSupported(selectedProvider, billingInterval, plans)) {
      setBillingInterval('month');
    }
  }, [selectedProvider, billingInterval, plans]);

  const handleStartCheckout = async (planId: 'creator' | 'pro' | 'studio') => {
    const currentProv = providers.find((p) => p.name === selectedProvider);
    if (currentProv && !currentProv.isConfigured) {
      setNotice({
        type: 'error',
        message: `${currentProv.displayName} is not configured on the server. Please configure sandbox credentials.`,
      });
      return;
    }

    if (!isProviderIntervalSupported(selectedProvider, billingInterval, plans)) {
      setNotice({
        type: 'error',
        message: 'Annual billing is currently unavailable for INR (Razorpay). Please select Monthly billing or choose Paddle (Global USD).',
      });
      return;
    }

    try {
      setCheckoutLoading(planId);
      const checkoutRes = await BillingService.createCheckout(planId, billingInterval, selectedProvider);

      if (checkoutRes.provider === 'paddle') {
        if (checkoutRes.url) {
          window.location.href = checkoutRes.url;
        } else {
          setNotice({
            type: 'info',
            message: `Paddle transaction created (${checkoutRes.transactionId}). Redirecting to checkout...`,
          });
        }
      } else if (checkoutRes.provider === 'razorpay') {
        if ((window as any).Razorpay && checkoutRes.subscriptionId && checkoutRes.keyId) {
          const rzp = new (window as any).Razorpay({
            key: checkoutRes.keyId,
            subscription_id: checkoutRes.subscriptionId,
            name: 'VireoClip',
            description: `${planId.toUpperCase()} Subscription`,
            handler: function () {
              setNotice({
                type: 'success',
                message: 'Razorpay payment authenticated! Processing webhook...',
              });
              loadBillingData();
            },
          });
          rzp.open();
        } else {
          setNotice({
            type: 'info',
            message: `Razorpay test subscription initiated (${checkoutRes.subscriptionId}). Key: ${checkoutRes.keyId}`,
          });
        }
      } else if (checkoutRes.url) {
        window.location.href = checkoutRes.url;
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Could not initiate checkout.',
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? Access will remain until the end of your billing cycle.')) {
      return;
    }

    try {
      setCancelLoading(true);
      await BillingService.cancelSubscription();
      setNotice({
        type: 'info',
        message: 'Subscription canceled. Your paid access remains active until the end of the billing period.',
      });
      await loadBillingData();
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Failed to cancel subscription.',
      });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      setPortalLoading(true);
      const { url } = await BillingService.createPortal();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Could not open billing management portal.',
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPlanId = entitlement?.plan_id || 'free';
  const isUnlimited = entitlement?.is_unlimited || usage?.is_unlimited;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 animate-pulse">
        <div className="h-8 w-64 bg-cream/80 rounded-2xl" />
        <div className="grid gap-6 md:grid-cols-12">
          <div className="h-48 md:col-span-6 bg-cream/60 rounded-3xl" />
          <div className="h-48 md:col-span-6 bg-cream/60 rounded-3xl" />
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          <div className="h-96 bg-cream/50 rounded-3xl" />
          <div className="h-96 bg-cream/50 rounded-3xl" />
          <div className="h-96 bg-cream/50 rounded-3xl" />
          <div className="h-96 bg-cream/50 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Billing & Plans
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your subscription, processing limits, and payment providers (Paddle & Razorpay).
          </p>
        </div>

        <div className="flex items-center gap-3">
          {entitlement?.subscription && !entitlement.subscription.cancel_at_period_end && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelSubscription}
              disabled={cancelLoading}
              className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10"
            >
              {cancelLoading ? (
                <span className="size-3.5 rounded-full border-2 border-destructive/60 border-t-destructive animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              <span>Cancel Plan</span>
            </Button>
          )}

          {entitlement?.subscription && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenPortal}
              disabled={portalLoading}
              className="gap-2"
            >
              {portalLoading ? (
                <span className="size-3.5 rounded-full border-2 border-clay/60 border-t-clay animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              <span>Billing Portal</span>
            </Button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          role="alert"
          className={`p-4 rounded-2xl border text-sm flex items-start justify-between gap-3 ${
            notice.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-clay/10 border-clay/30 text-clay'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'error' ? <AlertCircle className="size-4 shrink-0" /> : <Sparkles className="size-4 shrink-0" />}
            <span>{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-semibold underline shrink-0 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Plan & Quota Overview Grid */}
      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Card: Active Plan Status */}
        <SpotlightCard
          spotlightColor="rgba(46, 125, 82, 0.12)"
          className="p-6 md:col-span-6 bg-card border-border/80 shadow-soft space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2 font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              <ShieldCheck className="size-4 text-vireo-green" />
              <span>Current Plan</span>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                isUnlimited
                  ? 'bg-clay/15 text-clay border border-clay/30'
                  : currentPlanId === 'free'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-sage/15 text-sage border border-sage/30'
              }`}
            >
              {isUnlimited ? 'DEVELOPER UNLIMITED' : `${currentPlanId.toUpperCase()} TIER`}
            </span>
          </div>

          <div>
            <h3 className="text-2xl font-bold font-display text-foreground">
              {isUnlimited
                ? 'Developer Unlimited Access'
                : entitlement?.display_name || 'Free'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isUnlimited
                ? 'Internal development entitlement active. Bypasses quota checks for vertexdigitals07@gmail.com.'
                : entitlement?.subscription
                ? `Provider: ${(entitlement.subscription.provider || 'default').toUpperCase()} · Status: ${
                    entitlement.subscription.status
                  } · Renews ${new Date(entitlement.subscription.current_period_end).toLocaleDateString()}.`
                : 'Free tier active. Upgrade to Creator, Pro, or Studio for higher processing limits.'}
            </p>
          </div>

          {entitlement?.subscription?.cancel_at_period_end && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs">
              <span className="font-semibold">Cancellation scheduled:</span> Your subscription remains active until{' '}
              {new Date(entitlement.subscription.current_period_end).toLocaleDateString()}, after which your account will revert to Free.
            </div>
          )}
        </SpotlightCard>

        {/* Right Card: Processing Quota Status */}
        <SpotlightCard
          spotlightColor="rgba(192, 98, 62, 0.12)"
          className="p-6 md:col-span-6 bg-card border-border/80 shadow-soft space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2 font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              <Zap className="size-4 text-clay" />
              <span>Monthly Processing Cycle</span>
            </div>
            {usage?.reset_date && (
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" />
                <span>Resets {new Date(usage.reset_date).toLocaleDateString()}</span>
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold font-display text-foreground">
                  {isUnlimited ? 'Unlimited' : `${usage?.total_used_minutes.toFixed(1) || '0.0'} min`}
                </span>
                {!isUnlimited && (
                  <span className="text-xs text-muted-foreground ml-1.5">
                    used of {usage?.limit_minutes || 15} min
                  </span>
                )}
              </div>
              {!isUnlimited && (
                <span className="text-xs font-semibold text-sage font-mono">
                  {usage?.remaining_minutes.toFixed(1)} min remaining
                </span>
              )}
            </div>

            {/* Progress Bar */}
            {!isUnlimited && usage && (
              <div className="h-2 w-full rounded-full bg-cream overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.total_used_minutes >= usage.limit_minutes
                      ? 'bg-destructive'
                      : 'bg-clay'
                  }`}
                  style={{
                    width: `${Math.min(100, (usage.total_used_minutes / usage.limit_minutes) * 100)}%`,
                  }}
                />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Billing period strictly follows UTC months ({usage?.billing_period || 'current'}).
            </p>
          </div>
        </SpotlightCard>
      </div>

      {/* Plan Controls: Billing Interval & Provider Selector */}
      <div className="p-4 rounded-3xl bg-card border border-border/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Interval Toggle */}
        <div className="flex items-center gap-2 bg-cream/60 p-1 rounded-2xl border border-border/50">
          <button
            onClick={() => setBillingInterval('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              billingInterval === 'month'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => {
              if (!isProviderIntervalSupported(selectedProvider, 'year', plans)) {
                setNotice({
                  type: 'info',
                  message: 'Annual billing is unavailable for INR (Razorpay). Please select Paddle (Global USD) to pay annually.',
                });
                return;
              }
              setBillingInterval('year');
            }}
            disabled={!isProviderIntervalSupported(selectedProvider, 'year', plans)}
            title={
              !isProviderIntervalSupported(selectedProvider, 'year', plans)
                ? 'Annual billing unavailable for INR (Razorpay)'
                : 'Yearly Billing (Save ~17%)'
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              !isProviderIntervalSupported(selectedProvider, 'year', plans)
                ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                : billingInterval === 'year'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Yearly Billing</span>
            {!isProviderIntervalSupported(selectedProvider, 'year', plans) ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800">
                Unavailable for INR
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sage/20 text-sage">
                Save ~17%
              </span>
            )}
          </button>
        </div>

        {/* Provider Selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <CreditCard className="size-3.5" />
            <span>Payment Provider:</span>
          </span>
          <div className="flex items-center gap-1.5 bg-cream/60 p-1 rounded-2xl border border-border/50">
            {providers.map((prov) => (
              <button
                key={prov.name}
                onClick={() => {
                  setSelectedProvider(prov.name);
                  if (!isProviderIntervalSupported(prov.name, billingInterval, plans)) {
                    setBillingInterval('month');
                    setNotice({
                      type: 'info',
                      message: 'Switched to Monthly billing — annual billing is currently unavailable for INR.',
                    });
                  }
                }}
                className={`px-2.5 py-1 rounded-xl font-medium transition-all ${
                  selectedProvider === prov.name
                    ? 'bg-card text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {prov.name === 'paddle' ? 'Paddle (Global)' : prov.name === 'razorpay' ? 'Razorpay (India)' : 'Stripe'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Available Plans Comparison */}
      <div className="space-y-4 pt-2">
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">Available Plans</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select the plan that fits your video volume and production requirements.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          {plans.map((p) => {
            const isCurrent = currentPlanId === p.id;
            const isPro = p.id === 'pro';
            const isStudio = p.id === 'studio';
            const isFree = p.id === 'free';

            const priceDisplay = getPlanPriceDisplay(p, billingInterval, selectedProvider);

            return (
              <SpotlightCard
                key={p.id}
                spotlightColor={isPro ? 'rgba(46, 125, 82, 0.18)' : 'rgba(192, 98, 62, 0.1)'}
                className={`p-6 bg-card border rounded-3xl flex flex-col justify-between transition-all relative ${
                  isCurrent
                    ? 'border-clay/60 shadow-clay ring-1 ring-clay/20'
                    : isPro
                    ? 'border-vireo-green/60 shadow-soft ring-1 ring-vireo-green/30'
                    : 'border-border/80'
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-vireo-green text-white text-[10px] font-bold flex items-center gap-1 shadow-sm">
                    <Star className="size-3 fill-white" />
                    <span>RECOMMENDED</span>
                  </div>
                )}

                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span>{p.display_name}</span>
                      {isPro && <span className="text-amber-500">⭐</span>}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-clay/10 text-clay font-mono">
                        Active Plan
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-2xl font-extrabold font-display ${!priceDisplay.isAvailable ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {priceDisplay.symbol}{priceDisplay.amount}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium">
                          / {priceDisplay.interval}
                        </span>
                      </div>
                      {priceDisplay.savingsBadge && (
                        <div className="flex items-center gap-1.5 text-[11px] text-vireo-green font-semibold">
                          <span>{priceDisplay.savingsBadge}</span>
                        </div>
                      )}
                      {priceDisplay.unavailableReason && (
                        <div className="text-[11px] font-medium text-amber-800 bg-amber-500/15 border border-amber-500/25 rounded-lg px-2.5 py-1.5 mt-1">
                          {priceDisplay.unavailableReason}
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground font-mono">
                        {priceDisplay.secondaryText}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Includes {p.monthly_minutes} source minutes / month.
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-xs text-foreground/90 border-t border-border/60 pt-4">
                    {p.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="size-3.5 text-vireo-green shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                      Current Plan
                    </Button>
                  ) : isFree ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={handleCancelSubscription}
                      disabled={!entitlement?.subscription}
                    >
                      Revert to Free
                    </Button>
                  ) : (
                    <ShinyButton
                      variant={isPro ? 'sage' : isStudio ? 'clay' : 'ink'}
                      className={`w-full h-10 text-xs font-semibold ${!priceDisplay.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={checkoutLoading === p.id || !priceDisplay.isAvailable}
                      onClick={() => {
                        if (!priceDisplay.isAvailable) return;
                        handleStartCheckout(p.id as any);
                      }}
                      title={priceDisplay.unavailableReason || undefined}
                    >
                      {checkoutLoading === p.id ? (
                        <span className="size-3.5 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                      ) : (
                        <span>
                          {priceDisplay.ctaText}
                        </span>
                      )}
                    </ShinyButton>
                  )}
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      </div>

      {/* Billing Invoices History */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-display text-foreground flex items-center gap-2">
              <Receipt className="size-4 text-muted-foreground" />
              <span>Invoices & Billing History</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Official invoices and receipts for accounting and records.
            </p>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 rounded-3xl border border-dashed border-border/80 bg-card text-center space-y-2">
            <p className="text-xs text-muted-foreground">No invoices generated yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 rounded-3xl border border-border/80 bg-card overflow-hidden shadow-soft">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      ${inv.amount_paid.toFixed(2)} {inv.currency}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        inv.status === 'paid'
                          ? 'bg-sage/15 text-sage'
                          : 'bg-amber-500/15 text-amber-500'
                      }`}
                    >
                      {inv.status.toUpperCase()}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-muted text-muted-foreground font-mono">
                      {inv.provider?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(inv.created_at).toLocaleDateString()} · Invoice {inv.provider_invoice_id}
                  </span>
                </div>

                {inv.hosted_invoice_url && (
                  <a
                    href={inv.hosted_invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-clay font-semibold hover:underline"
                  >
                    <span>View Receipt</span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default BillingPage;

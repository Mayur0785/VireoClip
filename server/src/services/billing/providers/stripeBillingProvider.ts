import Stripe from 'stripe';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { PlanId, BillingInterval, SubscriptionStatus } from '../../../types/index.js';
import { getPlanDefinition, resolvePlanFromPriceId } from '../planConfig.js';
import { getStripeClient, isStripeConfigured } from '../stripeClient.js';
import {
  BillingProvider,
  CreateCheckoutInput,
  CheckoutResult,
  SubscriptionResult,
  PortalResult,
  NormalizedBillingEvent,
  NormalizedBillingEventType,
} from '../types.js';

export class StripeBillingProvider implements BillingProvider {
  public readonly provider = 'stripe' as const;

  public isConfigured(): boolean {
    return isStripeConfigured();
  }

  public async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const plan = getPlanDefinition(input.planId);
    if (!plan || !plan.stripe_price_id) {
      throw new Error(`Stripe Price ID is not configured for plan "${input.planId}".`);
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.userEmail,
      client_reference_id: input.userId,
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      metadata: {
        userId: input.userId,
        planId: input.planId,
        interval: input.interval,
      },
      subscription_data: {
        metadata: {
          userId: input.userId,
          planId: input.planId,
          interval: input.interval,
        },
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    return {
      provider: 'stripe',
      url: session.url || undefined,
      sessionId: session.id,
    };
  }

  public async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const stripe = getStripeClient();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = sub.items?.data?.[0]?.price?.id;
    const planId = (sub.metadata?.planId as PlanId) || (priceId ? resolvePlanFromPriceId(priceId) : 'pro') || 'pro';
    const interval = (sub.items?.data?.[0]?.plan?.interval || 'month') as BillingInterval;

    const subObj = sub as any;
    return {
      provider: 'stripe',
      subscriptionId: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      planId,
      status: sub.status as SubscriptionStatus,
      interval,
      currentPeriodStart: new Date((subObj.current_period_start || subObj.created || Date.now() / 1000) * 1000),
      currentPeriodEnd: new Date((subObj.current_period_end || (subObj.created + 30 * 86400) || (Date.now() / 1000 + 30 * 86400)) * 1000),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      latestInvoiceId: typeof sub.latest_invoice === 'string' ? sub.latest_invoice : (sub.latest_invoice as any)?.id || null,
    };
  }

  public async cancelSubscription(subscriptionId: string, immediately = false): Promise<SubscriptionResult> {
    const stripe = getStripeClient();
    let sub: Stripe.Subscription;
    if (immediately) {
      sub = await stripe.subscriptions.cancel(subscriptionId);
    } else {
      sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    }
    const priceId = sub.items?.data?.[0]?.price?.id;
    const planId = (sub.metadata?.planId as PlanId) || (priceId ? resolvePlanFromPriceId(priceId) : 'pro') || 'pro';
    const interval = (sub.items?.data?.[0]?.plan?.interval || 'month') as BillingInterval;
    const subObj = sub as any;

    return {
      provider: 'stripe',
      subscriptionId: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      planId,
      status: sub.status as SubscriptionStatus,
      interval,
      currentPeriodStart: new Date((subObj.current_period_start || subObj.created || Date.now() / 1000) * 1000),
      currentPeriodEnd: new Date((subObj.current_period_end || (subObj.created + 30 * 86400) || (Date.now() / 1000 + 30 * 86400)) * 1000),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    };
  }

  public async createCustomerPortal(customerId: string, returnUrl: string): Promise<PortalResult> {
    const stripe = getStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      configuration: config.stripePortalConfigurationId || undefined,
    });
    return { url: portalSession.url };
  }

  public async verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<boolean> {
    if (!config.stripeWebhookSecret) {
      return false;
    }
    const sig = headers['stripe-signature'];
    const sigStr = Array.isArray(sig) ? sig[0] : sig;
    if (!sigStr) return false;

    try {
      const stripe = getStripeClient();
      stripe.webhooks.constructEvent(rawBody, sigStr, config.stripeWebhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  public async normalizeWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<NormalizedBillingEvent | null> {
    const sig = headers['stripe-signature'];
    const sigStr = Array.isArray(sig) ? sig[0] : sig;
    if (!sigStr || !config.stripeWebhookSecret) return null;

    let event: Stripe.Event;
    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(rawBody, sigStr, config.stripeWebhookSecret);
    } catch {
      return null;
    }

    const eventId = event.id;
    const eventType = event.type;
    const occurredAt = new Date(event.created * 1000);
    const obj = event.data.object as any;

    let normalizedType: NormalizedBillingEventType | null = null;
    let userId: string | null = null;
    let customerId: string | null = null;
    let subscriptionId: string | null = null;
    let planId: PlanId | null = null;
    let interval: BillingInterval | null = null;
    let status: SubscriptionStatus | null = null;
    let currentPeriodStart: Date | null = null;
    let currentPeriodEnd: Date | null = null;
    let cancelAtPeriodEnd: boolean | null = null;
    let canceledAt: Date | null = null;
    let amount: number | null = null;
    let currency: string | null = null;

    if (eventType === 'checkout.session.completed') {
      normalizedType = 'checkout.completed';
      userId = obj.client_reference_id || obj.metadata?.userId || null;
      customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;
      subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id || null;
      planId = (obj.metadata?.planId as PlanId) || 'pro';
      interval = (obj.metadata?.interval as BillingInterval) || 'month';
    } else if (eventType.startsWith('customer.subscription.')) {
      subscriptionId = obj.id;
      customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;
      userId = obj.metadata?.userId || null;
      const priceId = obj.items?.data?.[0]?.price?.id;
      planId = (obj.metadata?.planId as PlanId) || (priceId ? resolvePlanFromPriceId(priceId) : 'pro') || 'pro';
      interval = (obj.items?.data?.[0]?.plan?.interval || 'month') as BillingInterval;
      status = obj.status as SubscriptionStatus;
      currentPeriodStart = new Date(obj.current_period_start * 1000);
      currentPeriodEnd = new Date(obj.current_period_end * 1000);
      cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);
      if (obj.canceled_at) canceledAt = new Date(obj.canceled_at * 1000);

      switch (eventType) {
        case 'customer.subscription.created':
          normalizedType = 'subscription.created';
          break;
        case 'customer.subscription.updated':
          normalizedType = 'subscription.updated';
          break;
        case 'customer.subscription.deleted':
          normalizedType = 'subscription.canceled';
          status = 'canceled';
          break;
      }
    } else if (eventType.startsWith('invoice.')) {
      customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;
      subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id || null;
      amount = obj.amount_paid ? obj.amount_paid / 100 : (obj.amount_due ? obj.amount_due / 100 : 0);
      currency = (obj.currency || 'usd').toUpperCase();

      if (eventType === 'invoice.paid') {
        normalizedType = 'payment.completed';
      } else if (eventType === 'invoice.payment_failed') {
        normalizedType = 'payment.failed';
      }
    }

    if (!normalizedType) return null;

    return {
      provider: 'stripe',
      eventId,
      eventType: normalizedType,
      rawEventType: eventType,
      occurredAt,
      userId,
      customerId,
      subscriptionId,
      planId,
      interval,
      status,
      amount,
      currency,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      canceledAt,
      rawPayload: obj,
    };
  }
}

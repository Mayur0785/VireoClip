import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { PlanId, BillingInterval, SubscriptionStatus } from '../../../types/index.js';
import { getPlanDefinition, resolvePlanFromProviderId } from '../planConfig.js';
import {
  BillingProvider,
  CreateCheckoutInput,
  CheckoutResult,
  SubscriptionResult,
  PortalResult,
  NormalizedBillingEvent,
  NormalizedBillingEventType,
} from '../types.js';

let razorpayInstance: any = null;

export class RazorpayBillingProvider implements BillingProvider {
  public readonly provider = 'razorpay' as const;

  public isConfigured(): boolean {
    return Boolean(config.razorpayKeyId && config.razorpayKeySecret);
  }

  private getClient(): any {
    if (!this.isConfigured()) {
      throw new Error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured on the server. Please add test keys in .env.');
    }
    if (!razorpayInstance) {
      razorpayInstance = new Razorpay({
        key_id: config.razorpayKeyId,
        key_secret: config.razorpayKeySecret,
      });
    }
    return razorpayInstance;
  }

  private resolvePlanId(planId: PlanId, interval: BillingInterval): string | null {
    const plan = getPlanDefinition(planId);
    if (!plan) return null;
    return interval === 'year'
      ? plan.razorpay_plan_id_yearly || null
      : plan.razorpay_plan_id_monthly || null;
  }

  public async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const client = this.getClient();
    const providerPlanId = this.resolvePlanId(input.planId, input.interval);

    if (!providerPlanId) {
      throw new Error(
        `Razorpay Plan ID is not configured for plan "${input.planId}" (${input.interval}). ` +
          `Set RAZORPAY_PLAN_${input.planId.toUpperCase()}_${input.interval.toUpperCase()} in your environment.`
      );
    }

    try {
      // Create subscription in Razorpay (e.g. 120 billing cycles total)
      const totalCount = input.interval === 'year' ? 10 : 120;
      const subscription = await client.subscriptions.create({
        plan_id: providerPlanId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: 1,
        notes: {
          userId: input.userId,
          planId: input.planId,
          interval: input.interval,
        },
      });

      return {
        provider: 'razorpay',
        subscriptionId: subscription.id,
        keyId: config.razorpayKeyId,
        customData: {
          subscriptionId: subscription.id,
          providerPlanId,
          planId: input.planId,
          interval: input.interval,
        },
      };
    } catch (err: any) {
      logger.error('[RazorpayBillingProvider] Error creating subscription:', err);
      throw new Error(`Failed to create Razorpay subscription: ${err.message || 'Unknown error'}`);
    }
  }

  public async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const client = this.getClient();
    try {
      const sub = await client.subscriptions.fetch(subscriptionId);
      return this.mapRazorpaySubscription(sub);
    } catch (err: any) {
      logger.error(`[RazorpayBillingProvider] Error fetching subscription ${subscriptionId}:`, err);
      throw new Error(`Failed to fetch Razorpay subscription: ${err.message || 'Unknown error'}`);
    }
  }

  public async cancelSubscription(subscriptionId: string, immediately = false): Promise<SubscriptionResult> {
    const client = this.getClient();
    try {
      // Razorpay cancel method accepts cancel_at_cycle_end (0 for immediate, 1 for end of cycle)
      const sub = await client.subscriptions.cancel(subscriptionId, immediately ? 0 : 1);
      return this.mapRazorpaySubscription(sub);
    } catch (err: any) {
      logger.error(`[RazorpayBillingProvider] Error cancelling subscription ${subscriptionId}:`, err);
      throw new Error(`Failed to cancel Razorpay subscription: ${err.message || 'Unknown error'}`);
    }
  }

  public async createCustomerPortal(): Promise<PortalResult> {
    // Razorpay does not offer an external hosted billing portal session URL like Stripe.
    // Return direct account settings / billing management link.
    return {
      url: `${config.appUrl}/billing`,
    };
  }

  public async verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<boolean> {
    if (!config.razorpayWebhookSecret) {
      logger.warn('[RazorpayBillingProvider] RAZORPAY_WEBHOOK_SECRET is not configured on the server.');
      return false;
    }

    const signature = headers['x-razorpay-signature'];
    const signatureStr = Array.isArray(signature) ? signature[0] : signature;
    if (!signatureStr) {
      logger.warn('[RazorpayBillingProvider] Missing x-razorpay-signature header.');
      return false;
    }

    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    try {
      const expectedSignature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(bodyStr)
        .digest('hex');

      // Constant time comparison to prevent timing attacks
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signatureStr, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err: any) {
      logger.error('[RazorpayBillingProvider] Webhook signature verification error:', err);
      return false;
    }
  }

  public async normalizeWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<NormalizedBillingEvent | null> {
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    let parsed: any;
    try {
      parsed = typeof rawBody === 'object' && !Buffer.isBuffer(rawBody) ? rawBody : JSON.parse(bodyStr);
    } catch {
      return null;
    }

    const eventType: string = parsed.event || '';
    const occurredAt = parsed.created_at ? new Date(parsed.created_at * 1000) : new Date();
    // Razorpay webhooks often do not contain a top-level event_id; use event + entity id or fallback to sha256
    const payloadPayload = parsed.payload || {};
    const subEntity = payloadPayload.subscription?.entity;
    const paymentEntity = payloadPayload.payment?.entity;
    const entityId = subEntity?.id || paymentEntity?.id || '';
    const eventId = parsed.event_id || (entityId ? `${eventType}_${entityId}_${parsed.created_at || Date.now()}` : crypto.createHash('sha256').update(bodyStr).digest('hex'));

    let normalizedType: NormalizedBillingEventType | null = null;
    let userId: string | null = subEntity?.notes?.userId || paymentEntity?.notes?.userId || null;
    let planId: PlanId | null = (subEntity?.notes?.planId || paymentEntity?.notes?.planId || null) as PlanId | null;
    let interval: BillingInterval | null = (subEntity?.notes?.interval || paymentEntity?.notes?.interval || null) as BillingInterval | null;
    let status: SubscriptionStatus | null = null;
    let subscriptionId: string | null = subEntity?.id || paymentEntity?.subscription_id || null;
    let customerId: string | null = subEntity?.customer_id || paymentEntity?.customer_id || null;
    let currentPeriodStart: Date | null = null;
    let currentPeriodEnd: Date | null = null;
    let cancelAtPeriodEnd: boolean | null = null;
    let canceledAt: Date | null = null;
    let amount: number | null = null;
    let currency: string | null = null;

    if (subEntity) {
      status = this.mapRazorpayStatus(subEntity.status);
      if (subEntity.current_start) {
        currentPeriodStart = new Date(subEntity.current_start * 1000);
      }
      if (subEntity.current_end) {
        currentPeriodEnd = new Date(subEntity.current_end * 1000);
      }
      if (subEntity.ended_at) {
        canceledAt = new Date(subEntity.ended_at * 1000);
      }

      if (subEntity.plan_id && (!planId || !interval)) {
        const resolved = resolvePlanFromProviderId('razorpay', subEntity.plan_id);
        if (resolved) {
          planId = resolved.planId;
          interval = resolved.interval;
        }
      }

      switch (eventType) {
        case 'subscription.created':
        case 'subscription.authenticated':
          normalizedType = 'subscription.created';
          break;
        case 'subscription.activated':
        case 'subscription.charged':
          normalizedType = 'subscription.active';
          status = 'active';
          break;
        case 'subscription.pending':
          normalizedType = 'subscription.past_due';
          status = 'past_due';
          break;
        case 'subscription.halted':
          normalizedType = 'subscription.past_due';
          status = 'past_due';
          break;
        case 'subscription.cancelled':
          normalizedType = 'subscription.canceled';
          status = 'canceled';
          break;
        case 'subscription.paused':
          normalizedType = 'subscription.paused';
          status = 'paused';
          break;
        default:
          if (eventType.startsWith('subscription.')) {
            normalizedType = 'subscription.updated';
          }
          break;
      }
    }

    if (paymentEntity) {
      if (paymentEntity.amount) {
        amount = paymentEntity.amount / 100;
      }
      currency = paymentEntity.currency ? paymentEntity.currency.toUpperCase() : 'INR';

      switch (eventType) {
        case 'payment.authorized':
        case 'payment.captured':
          if (!normalizedType) normalizedType = 'payment.completed';
          break;
        case 'payment.failed':
          if (!normalizedType) normalizedType = 'payment.failed';
          break;
      }
    }

    if (!normalizedType) {
      return null;
    }

    return {
      provider: 'razorpay',
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
      rawPayload: parsed,
    };
  }

  private mapRazorpayStatus(status: string): SubscriptionStatus {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'active';
      case 'authenticated':
      case 'created':
        return 'trialing';
      case 'pending':
      case 'halted':
        return 'past_due';
      case 'paused':
        return 'paused';
      case 'cancelled':
      case 'completed':
      case 'expired':
        return 'canceled';
      default:
        return 'active';
    }
  }

  private mapRazorpaySubscription(sub: any): SubscriptionResult {
    const status = this.mapRazorpayStatus(sub.status);
    const resolved = resolvePlanFromProviderId('razorpay', sub.plan_id);
    const planId: PlanId = resolved?.planId || (sub.notes?.planId as PlanId) || 'pro';
    const interval: BillingInterval = resolved?.interval || (sub.notes?.interval as BillingInterval) || 'month';

    const currentPeriodStart = sub.current_start ? new Date(sub.current_start * 1000) : new Date();
    const currentPeriodEnd = sub.current_end
      ? new Date(sub.current_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return {
      provider: 'razorpay',
      subscriptionId: sub.id,
      customerId: sub.customer_id || '',
      planId,
      status,
      interval,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(sub.ended_at),
      canceledAt: sub.ended_at ? new Date(sub.ended_at * 1000) : null,
    };
  }
}

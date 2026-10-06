import { Paddle, Environment } from '@paddle/paddle-node-sdk';
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

let paddleInstance: Paddle | null = null;

export class PaddleBillingProvider implements BillingProvider {
  public readonly provider = 'paddle' as const;

  public isConfigured(): boolean {
    return Boolean(config.paddleApiKey && config.paddleApiKey.trim().length > 0);
  }

  private getClient(): Paddle {
    if (!this.isConfigured()) {
      throw new Error('PADDLE_API_KEY is not configured on the server. Please configure sandbox credentials in .env.');
    }
    if (!paddleInstance) {
      const environment = config.paddleEnv === 'production' ? Environment.production : Environment.sandbox;
      paddleInstance = new Paddle(config.paddleApiKey, { environment });
    }
    return paddleInstance;
  }

  private resolvePriceId(planId: PlanId, interval: BillingInterval): string | null {
    const plan = getPlanDefinition(planId);
    if (!plan) return null;
    return interval === 'year'
      ? plan.paddle_price_id_yearly || null
      : plan.paddle_price_id_monthly || null;
  }

  public async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const client = this.getClient();
    const priceId = this.resolvePriceId(input.planId, input.interval);

    if (!priceId) {
      throw new Error(
        `Paddle Price ID is not configured for plan "${input.planId}" (${input.interval}). ` +
          `Set PADDLE_PRICE_${input.planId.toUpperCase()}_${input.interval.toUpperCase()} in your environment.`
      );
    }

    try {
      // Create transaction for recurring subscription checkout
      const transaction = await client.transactions.create({
        items: [
          {
            priceId,
            quantity: 1,
          },
        ],
        customData: {
          userId: input.userId,
          planId: input.planId,
          interval: input.interval,
        },
      });

      const checkoutUrl = transaction.checkout?.url || undefined;

      return {
        provider: 'paddle',
        transactionId: transaction.id,
        url: checkoutUrl,
        clientToken: config.paddleClientToken || undefined,
        customData: {
          transactionId: transaction.id,
          priceId,
        },
      };
    } catch (err: any) {
      logger.error('[PaddleBillingProvider] Error creating transaction:', err);
      throw new Error(`Failed to create Paddle checkout: ${err.message || 'Unknown error'}`);
    }
  }

  public async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const client = this.getClient();
    try {
      const sub = await client.subscriptions.get(subscriptionId);
      return this.mapPaddleSubscription(sub);
    } catch (err: any) {
      logger.error(`[PaddleBillingProvider] Error fetching subscription ${subscriptionId}:`, err);
      throw new Error(`Failed to fetch Paddle subscription: ${err.message || 'Unknown error'}`);
    }
  }

  public async cancelSubscription(subscriptionId: string, immediately = false): Promise<SubscriptionResult> {
    const client = this.getClient();
    try {
      const sub = await client.subscriptions.cancel(subscriptionId, {
        effectiveFrom: immediately ? 'immediately' : 'next_billing_period',
      });
      return this.mapPaddleSubscription(sub);
    } catch (err: any) {
      logger.error(`[PaddleBillingProvider] Error cancelling subscription ${subscriptionId}:`, err);
      throw new Error(`Failed to cancel Paddle subscription: ${err.message || 'Unknown error'}`);
    }
  }

  public async createCustomerPortal(customerId: string): Promise<PortalResult> {
    // Paddle Billing uses Customer Portal Sessions or returns documentation link/auth token
    if (!this.isConfigured()) {
      throw new Error('Paddle is not configured.');
    }
    const client = this.getClient();
    try {
      if ((client.customers as any).createPortalSession) {
        const portal = await (client.customers as any).createPortalSession(customerId);
        if (portal && portal.urls?.general?.overview) {
          return { url: portal.urls.general.overview };
        }
      }
    } catch (err: any) {
      logger.warn('[PaddleBillingProvider] Portal session generation warning:', err?.message);
    }

    // Default portal redirect if session API not provisioned
    return {
      url: `https://${config.paddleEnv === 'production' ? 'checkout' : 'sandbox-checkout'}.paddle.com/customer-portal`,
    };
  }

  public async verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<boolean> {
    if (!config.paddleWebhookSecret) {
      logger.warn('[PaddleBillingProvider] PADDLE_WEBHOOK_SECRET is not configured on the server.');
      return false;
    }

    const signature = headers['paddle-signature'];
    const signatureStr = Array.isArray(signature) ? signature[0] : signature;
    if (!signatureStr) {
      logger.warn('[PaddleBillingProvider] Missing paddle-signature header.');
      return false;
    }

    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    try {
      const client = this.getClient();
      // Paddle Node SDK verifies and unmarshals webhook payload using secret
      const eventData = await client.webhooks.unmarshal(bodyStr, config.paddleWebhookSecret, signatureStr);
      return Boolean(eventData && eventData.eventType);
    } catch (err: any) {
      logger.warn(`[PaddleBillingProvider] Webhook signature verification failed: ${err.message}`);
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

    const eventId = parsed.event_id || parsed.eventId || '';
    const eventType = parsed.event_type || parsed.eventType || '';
    const occurredAt = parsed.occurred_at ? new Date(parsed.occurred_at) : new Date();
    const data = parsed.data || {};

    let normalizedType: NormalizedBillingEventType | null = null;
    let userId: string | null = data.custom_data?.userId || data.customData?.userId || null;
    let planId: PlanId | null = (data.custom_data?.planId || data.customData?.planId || null) as PlanId | null;
    let interval: BillingInterval | null = (data.custom_data?.interval || data.customData?.interval || null) as BillingInterval | null;
    let status: SubscriptionStatus | null = null;
    let subscriptionId: string | null = null;
    let customerId: string | null = data.customer_id || data.customerId || null;
    let currentPeriodStart: Date | null = null;
    let currentPeriodEnd: Date | null = null;
    let cancelAtPeriodEnd: boolean | null = null;
    let canceledAt: Date | null = null;
    let amount: number | null = null;
    let currency: string | null = null;

    if (eventType.startsWith('subscription.')) {
      subscriptionId = data.id || null;
      customerId = data.customer_id || customerId;
      status = this.mapPaddleStatus(data.status);
      if (data.current_billing_period) {
        currentPeriodStart = new Date(data.current_billing_period.starts_at);
        currentPeriodEnd = new Date(data.current_billing_period.ends_at);
      }
      cancelAtPeriodEnd = Boolean(data.scheduled_change?.action === 'cancel');
      if (data.canceled_at) canceledAt = new Date(data.canceled_at);

      // Resolve plan & interval from items if not in custom data
      const firstItem = data.items?.[0];
      const priceId = firstItem?.price?.id || firstItem?.price_id;
      if (priceId && (!planId || !interval)) {
        const resolved = resolvePlanFromProviderId('paddle', priceId);
        if (resolved) {
          planId = resolved.planId;
          interval = resolved.interval;
        }
      }

      switch (eventType) {
        case 'subscription.created':
          normalizedType = 'subscription.created';
          break;
        case 'subscription.activated':
          normalizedType = 'subscription.active';
          status = 'active';
          break;
        case 'subscription.updated':
          normalizedType = 'subscription.updated';
          break;
        case 'subscription.past_due':
          normalizedType = 'subscription.past_due';
          status = 'past_due';
          break;
        case 'subscription.paused':
          normalizedType = 'subscription.paused';
          status = 'paused';
          break;
        case 'subscription.canceled':
          normalizedType = 'subscription.canceled';
          status = 'canceled';
          break;
        case 'subscription.trialing':
          status = 'trialing';
          normalizedType = 'subscription.updated';
          break;
        default:
          normalizedType = 'subscription.updated';
          break;
      }
    } else if (eventType.startsWith('transaction.')) {
      subscriptionId = data.subscription_id || null;
      customerId = data.customer_id || customerId;
      if (data.details?.totals?.total) {
        amount = parseFloat(data.details.totals.total) / 100;
      }
      currency = data.currency_code ? data.currency_code.toUpperCase() : 'USD';

      switch (eventType) {
        case 'transaction.completed':
        case 'transaction.paid':
          normalizedType = 'payment.completed';
          break;
        case 'transaction.payment_failed':
          normalizedType = 'payment.failed';
          break;
        default:
          normalizedType = 'payment.completed';
          break;
      }
    }

    if (!normalizedType) {
      return null;
    }

    return {
      provider: 'paddle',
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

  private mapPaddleStatus(status: string): SubscriptionStatus {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
        return 'past_due';
      case 'paused':
        return 'paused';
      case 'canceled':
        return 'canceled';
      default:
        return 'active';
    }
  }

  private mapPaddleSubscription(sub: any): SubscriptionResult {
    const status = this.mapPaddleStatus(sub.status);
    const firstItem = sub.items?.[0];
    const priceId = firstItem?.price?.id || firstItem?.price_id || '';
    const resolved = resolvePlanFromProviderId('paddle', priceId);
    const planId: PlanId = resolved?.planId || (sub.custom_data?.planId as PlanId) || 'pro';
    const interval: BillingInterval = resolved?.interval || (sub.custom_data?.interval as BillingInterval) || 'month';

    const currentPeriodStart = sub.current_billing_period?.starts_at
      ? new Date(sub.current_billing_period.starts_at)
      : new Date();
    const currentPeriodEnd = sub.current_billing_period?.ends_at
      ? new Date(sub.current_billing_period.ends_at)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return {
      provider: 'paddle',
      subscriptionId: sub.id,
      customerId: sub.customer_id,
      planId,
      status,
      interval,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(sub.scheduled_change?.action === 'cancel'),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
      scheduledChange: sub.scheduled_change || null,
    };
  }
}

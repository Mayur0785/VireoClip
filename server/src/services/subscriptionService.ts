import crypto from 'node:crypto';
import { getMongoDb } from '../db/mongoClient.js';
import {
  BillingCustomerRecord,
  SubscriptionRecord,
  BillingEventRecord,
  BillingInvoiceRecord,
  UserEntitlement,
  PlanId,
  BillingProviderName,
  SubscriptionStatus,
} from '../types/index.js';
import { isUserUnlimited } from './usageService.js';
import { PLANS, getPlanDefinition } from './billing/planConfig.js';
import { NormalizedBillingEvent } from './billing/types.js';
import { logger } from '../utils/logger.js';

export class SubscriptionService {
  /**
   * Resolves the authoritative entitlement for a user across any provider.
   * Priority:
   * 1. Developer Unlimited entitlement (vertexdigitals07@gmail.com) -> 'developer'
   * 2. Active or trialing paid subscription -> 'pro' | 'business'
   * 3. Canceled subscription where current_period_end > now -> paid plan until period ends
   * 4. Past due subscription with grace period (< 3 days) -> paid plan with warning
   * 5. Expired / unpaid / no subscription -> 'free'
   */
  static async resolveUserEntitlement(userId: string, userEmail?: string): Promise<UserEntitlement> {
    if (isUserUnlimited(userEmail)) {
      return {
        plan_id: 'developer',
        display_name: 'Developer Unlimited Entitlement',
        is_unlimited: true,
        monthly_minutes: 999999,
        max_projects: 999999,
        max_clip_renders: 999999,
        max_social_connections: 999999,
        max_scheduled_posts: 999999,
        subscription: null,
      };
    }

    const db = await getMongoDb();
    const subCol = db.collection<SubscriptionRecord>('subscriptions');
    // Find active subscription across all providers
    const activeSub = await subCol.findOne({
      user_id: userId,
      status: { $in: ['active', 'trialing', 'past_due', 'canceled'] },
    }, { sort: { updated_at: -1 } });

    if (!activeSub) {
      const freePlan = PLANS.free;
      return {
        plan_id: 'free',
        display_name: freePlan.display_name,
        is_unlimited: false,
        monthly_minutes: freePlan.monthly_minutes,
        max_projects: freePlan.max_projects,
        max_clip_renders: freePlan.max_clip_renders,
        max_social_connections: freePlan.max_social_connections,
        max_scheduled_posts: freePlan.max_scheduled_posts,
        subscription: null,
      };
    }

    const now = new Date();
    const periodEnd = new Date(activeSub.current_period_end);
    const plan = getPlanDefinition(activeSub.plan_id) || PLANS.free;

    // Check if active or trialing
    if (activeSub.status === 'active' || activeSub.status === 'trialing') {
      return {
        plan_id: activeSub.plan_id,
        display_name: plan.display_name,
        is_unlimited: false,
        monthly_minutes: plan.monthly_minutes,
        max_projects: plan.max_projects,
        max_clip_renders: plan.max_clip_renders,
        max_social_connections: plan.max_social_connections,
        max_scheduled_posts: plan.max_scheduled_posts,
        subscription: {
          id: activeSub.id,
          provider: activeSub.provider,
          status: activeSub.status,
          cancel_at_period_end: activeSub.cancel_at_period_end,
          current_period_end: periodEnd.toISOString(),
          billing_interval: activeSub.billing_interval,
        },
      };
    }

    // Check canceled but current period is still active
    if (activeSub.status === 'canceled' && periodEnd > now) {
      return {
        plan_id: activeSub.plan_id,
        display_name: plan.display_name,
        is_unlimited: false,
        monthly_minutes: plan.monthly_minutes,
        max_projects: plan.max_projects,
        max_clip_renders: plan.max_clip_renders,
        max_social_connections: plan.max_social_connections,
        max_scheduled_posts: plan.max_scheduled_posts,
        subscription: {
          id: activeSub.id,
          provider: activeSub.provider,
          status: 'canceled',
          cancel_at_period_end: true,
          current_period_end: periodEnd.toISOString(),
          billing_interval: activeSub.billing_interval,
        },
      };
    }

    // Check past_due with 3-day grace period
    const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
    if (activeSub.status === 'past_due' && now.getTime() - periodEnd.getTime() < gracePeriodMs) {
      return {
        plan_id: activeSub.plan_id,
        display_name: plan.display_name,
        is_unlimited: false,
        monthly_minutes: plan.monthly_minutes,
        max_projects: plan.max_projects,
        max_clip_renders: plan.max_clip_renders,
        max_social_connections: plan.max_social_connections,
        max_scheduled_posts: plan.max_scheduled_posts,
        subscription: {
          id: activeSub.id,
          provider: activeSub.provider,
          status: 'past_due',
          cancel_at_period_end: activeSub.cancel_at_period_end,
          current_period_end: periodEnd.toISOString(),
          billing_interval: activeSub.billing_interval,
        },
      };
    }

    // Otherwise fallback to Free starter
    const freePlan = PLANS.free;
    return {
      plan_id: 'free',
      display_name: freePlan.display_name,
      is_unlimited: false,
      monthly_minutes: freePlan.monthly_minutes,
      max_projects: freePlan.max_projects,
      max_clip_renders: freePlan.max_clip_renders,
      max_social_connections: freePlan.max_social_connections,
      max_scheduled_posts: freePlan.max_scheduled_posts,
      subscription: {
        id: activeSub.id,
        provider: activeSub.provider,
        status: activeSub.status,
        cancel_at_period_end: activeSub.cancel_at_period_end,
        current_period_end: periodEnd.toISOString(),
        billing_interval: activeSub.billing_interval,
      },
    };
  }

  /**
   * Retrieves or creates a customer record for a given provider.
   */
  static async getOrCreateCustomer(
    userId: string,
    email: string,
    provider: BillingProviderName,
    providerCustomerId?: string
  ): Promise<BillingCustomerRecord> {
    const db = await getMongoDb();
    const customerCol = db.collection<BillingCustomerRecord>('billing_customers');
    const existing = await customerCol.findOne({ user_id: userId, provider });

    if (existing) {
      if (providerCustomerId && existing.provider_customer_id !== providerCustomerId) {
        await customerCol.updateOne(
          { id: existing.id },
          { $set: { provider_customer_id: providerCustomerId, updated_at: new Date() } }
        );
        existing.provider_customer_id = providerCustomerId;
      }
      return existing;
    }

    const now = new Date();
    const record: BillingCustomerRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      provider,
      provider_customer_id: providerCustomerId || `${provider}_cust_${crypto.randomUUID()}`,
      email,
      created_at: now,
      updated_at: now,
    };

    await customerCol.insertOne(record);
    return record;
  }

  /**
   * Authoritative handler consuming a NormalizedBillingEvent.
   * Updates database subscription, quota limits, and invoices atomically.
   */
  static async processNormalizedEvent(event: NormalizedBillingEvent): Promise<void> {
    const db = await getMongoDb();
    const subCol = db.collection<SubscriptionRecord>('subscriptions');
    const limitsCol = db.collection('subscription_limits');
    const invCol = db.collection<BillingInvoiceRecord>('billing_invoices');
    const customerCol = db.collection<BillingCustomerRecord>('billing_customers');

    const now = new Date();

    // 1. Resolve userId if not directly on the event
    let targetUserId = event.userId;
    if (!targetUserId && event.customerId) {
      const customer = await customerCol.findOne({
        provider: event.provider,
        provider_customer_id: event.customerId,
      });
      if (customer) {
        targetUserId = customer.user_id;
      }
    }

    if (!targetUserId && event.subscriptionId) {
      const existingSub = await subCol.findOne({
        provider: event.provider,
        provider_subscription_id: event.subscriptionId,
      });
      if (existingSub) {
        targetUserId = existingSub.user_id;
      }
    }

    if (!targetUserId) {
      logger.warn(`[SubscriptionService] Unable to map event ${event.eventId} (${event.eventType}) to a user.`);
      return;
    }

    // 2. Process Subscription Events
    if (event.subscriptionId && (event.eventType.startsWith('subscription.') || event.eventType === 'checkout.completed')) {
      const existing = await subCol.findOne({
        provider: event.provider,
        provider_subscription_id: event.subscriptionId,
      });

      // Avoid applying out-of-order stale events
      if (existing && existing.last_provider_event_at && existing.last_provider_event_at > event.occurredAt) {
        logger.info(`[SubscriptionService] Ignored out-of-order event ${event.eventId} for sub ${event.subscriptionId}`);
        return;
      }

      const planId = event.planId || existing?.plan_id || 'pro';
      const interval = event.interval || existing?.billing_interval || 'month';
      const status: SubscriptionStatus = event.status || (event.eventType === 'subscription.canceled' ? 'canceled' : 'active');
      const plan = getPlanDefinition(planId) || PLANS.free;

      const subRecord: Partial<SubscriptionRecord> = {
        user_id: targetUserId,
        provider: event.provider,
        provider_customer_id: event.customerId || existing?.provider_customer_id || '',
        provider_subscription_id: event.subscriptionId,
        plan_id: planId,
        status,
        billing_interval: interval,
        cancel_at_period_end: event.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? false,
        last_provider_event_id: event.eventId,
        last_provider_event_at: event.occurredAt,
        updated_at: now,
      };

      if (event.currentPeriodStart) subRecord.current_period_start = event.currentPeriodStart;
      else if (!existing) subRecord.current_period_start = now;

      if (event.currentPeriodEnd) subRecord.current_period_end = event.currentPeriodEnd;
      else if (!existing) subRecord.current_period_end = new Date(now.getTime() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000);

      if (event.canceledAt) subRecord.canceled_at = event.canceledAt;
      if (event.amount) subRecord.amount = event.amount;
      if (event.currency) subRecord.currency = event.currency;

      await subCol.updateOne(
        { provider: event.provider, provider_subscription_id: event.subscriptionId },
        {
          $set: subRecord,
          $setOnInsert: {
            id: crypto.randomUUID(),
            created_at: now,
          },
        },
        { upsert: true }
      );

      // Update current UTC billing period limits
      const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      if (status === 'active' || status === 'trialing') {
        await limitsCol.updateOne(
          { user_id: targetUserId, billing_period: currentPeriod },
          {
            $set: {
              plan_tier: planId,
              monthly_minutes_limit: plan.monthly_minutes,
            },
          },
          { upsert: true }
        );
      } else if (status === 'canceled') {
        // If canceled and past period, restore free plan limit
        const activeEntitlement = await this.resolveUserEntitlement(targetUserId);
        if (activeEntitlement.plan_id === 'free') {
          await limitsCol.updateOne(
            { user_id: targetUserId, billing_period: currentPeriod },
            {
              $set: {
                plan_tier: 'free',
                monthly_minutes_limit: PLANS.free.monthly_minutes,
              },
            }
          );
        }
      }
    }

    // 3. Process Payment Completed / Failed Events
    if (event.eventType === 'payment.completed' || event.eventType === 'payment.failed') {
      const invoiceId = event.invoiceId || `${event.provider}_inv_${event.eventId}`;
      const invRecord: BillingInvoiceRecord = {
        id: crypto.randomUUID(),
        user_id: targetUserId,
        provider: event.provider,
        provider_invoice_id: invoiceId,
        provider_customer_id: event.customerId || '',
        subscription_id: event.subscriptionId || null,
        amount_due: event.amount || 0,
        amount_paid: event.eventType === 'payment.completed' ? (event.amount || 0) : 0,
        currency: event.currency || 'USD',
        status: event.eventType === 'payment.completed' ? 'paid' : 'open',
        hosted_invoice_url: event.invoiceUrl || null,
        period_start: event.currentPeriodStart || now,
        period_end: event.currentPeriodEnd || now,
        created_at: now,
        updated_at: now,
      };

      await invCol.updateOne(
        { provider: event.provider, provider_invoice_id: invoiceId },
        { $set: invRecord },
        { upsert: true }
      );
    }
  }

  /**
   * Lists billing invoices for a user across providers.
   */
  static async getUserInvoices(userId: string): Promise<BillingInvoiceRecord[]> {
    const db = await getMongoDb();
    const invCol = db.collection<BillingInvoiceRecord>('billing_invoices');
    return invCol.find({ user_id: userId }).sort({ created_at: -1 }).toArray();
  }

  /**
   * Records and verifies webhook event idempotency across providers.
   */
  static async isEventAlreadyProcessed(provider: BillingProviderName, eventId: string): Promise<boolean> {
    const db = await getMongoDb();
    const eventCol = db.collection<BillingEventRecord>('billing_events');
    const existing = await eventCol.findOne({
      provider,
      provider_event_id: eventId,
    });

    return Boolean(existing && existing.status === 'processed');
  }

  static async recordEvent(
    provider: BillingProviderName,
    eventId: string,
    eventType: string,
    status: 'processed' | 'failed' | 'ignored',
    payloadHash?: string,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    const db = await getMongoDb();
    const eventCol = db.collection<BillingEventRecord>('billing_events');

    const now = new Date();
    await eventCol.updateOne(
      { provider, provider_event_id: eventId },
      {
        $set: {
          event_type: eventType,
          status,
          processed_at: now,
          payload_hash: payloadHash,
          error_code: errorCode || null,
          error_message: errorMessage || null,
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          provider,
          provider_event_id: eventId,
          created_at: now,
        },
      },
      { upsert: true }
    );
  }
}

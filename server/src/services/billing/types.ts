import { BillingProviderName, PlanId, BillingInterval, SubscriptionStatus } from '../../types/index.js';

export type NormalizedBillingEventType =
  | 'checkout.completed'
  | 'subscription.created'
  | 'subscription.active'
  | 'subscription.updated'
  | 'subscription.past_due'
  | 'subscription.paused'
  | 'subscription.canceled'
  | 'payment.completed'
  | 'payment.failed'
  | 'refund.created';

export interface CreateCheckoutInput {
  userId: string;
  userEmail: string;
  planId: PlanId;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  provider: BillingProviderName;
  url?: string;
  sessionId?: string;
  transactionId?: string;
  subscriptionId?: string;
  keyId?: string; // Public key if required for client-side sdk overlay (e.g. Razorpay key_id, Paddle client-token)
  clientToken?: string;
  customData?: Record<string, any>;
}

export interface SubscriptionResult {
  provider: BillingProviderName;
  subscriptionId: string;
  customerId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  interval: BillingInterval;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  currency?: string;
  amount?: number;
  latestInvoiceId?: string | null;
  scheduledChange?: Record<string, unknown> | null;
}

export interface PortalResult {
  url: string;
}

export interface NormalizedBillingEvent {
  provider: BillingProviderName;
  eventId: string;
  eventType: NormalizedBillingEventType;
  rawEventType: string;
  occurredAt: Date;
  userId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  planId?: PlanId | null;
  interval?: BillingInterval | null;
  status?: SubscriptionStatus | null;
  amount?: number | null;
  currency?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: Date | null;
  invoiceId?: string | null;
  invoiceUrl?: string | null;
  rawPayload: Record<string, any>;
}

export interface BillingProvider {
  readonly provider: BillingProviderName;

  isConfigured(): boolean;

  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;

  getSubscription(subscriptionId: string): Promise<SubscriptionResult>;

  cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult>;

  updateSubscription?(subscriptionId: string, input: { planId: PlanId; interval: BillingInterval }): Promise<SubscriptionResult>;

  createCustomerPortal?(customerId: string, returnUrl: string): Promise<PortalResult>;

  verifyWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>): Promise<boolean>;

  normalizeWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>): Promise<NormalizedBillingEvent | null>;
}

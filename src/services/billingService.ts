import { isSupabaseConfigured } from '../lib/supabase';
import { backendRequest } from './backendClient';

export type PlanId = 'free' | 'creator' | 'pro' | 'studio';
export type BillingProviderName = 'paddle' | 'razorpay' | 'stripe';
export type BillingInterval = 'month' | 'year';

export interface PlanDefinition {
  id: PlanId;
  display_name: string;
  monthly_price: number;
  yearly_price: number;
  inr_monthly_price: number;
  currency: string;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  features: string[];
  is_recommended?: boolean;
}

export interface UserEntitlement {
  plan_id: PlanId | 'developer';
  display_name: string;
  is_unlimited: boolean;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  subscription?: {
    id: string;
    provider?: BillingProviderName;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string;
    billing_interval: BillingInterval;
  } | null;
}

export interface BillingUsage {
  billing_period: string;
  reset_date: string;
  plan_tier: string;
  limit_minutes: number;
  settled_minutes: number;
  reserved_minutes: number;
  total_used_minutes: number;
  remaining_minutes: number;
  is_quota_exceeded: boolean;
  is_unlimited?: boolean;
}

export interface BillingInvoice {
  id: string;
  provider: BillingProviderName;
  provider_invoice_id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  hosted_invoice_url?: string | null;
  invoice_pdf_url?: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface ProviderOption {
  name: BillingProviderName;
  displayName: string;
  isConfigured: boolean;
}

export interface CheckoutResponse {
  provider: BillingProviderName;
  url?: string;
  sessionId?: string;
  transactionId?: string;
  subscriptionId?: string;
  keyId?: string;
  clientToken?: string;
  customData?: Record<string, any>;
}

export class BillingService {
  /**
   * Fetches monthly billing and usage metrics for the authenticated user.
   * Calls GET /api/billing/usage.
   */
  static async getUsage(): Promise<BillingUsage | null> {
    if (!isSupabaseConfigured) {
      if (import.meta.env.DEV) {
        const now = new Date();
        const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return {
          billing_period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
          reset_date: nextMonth.toISOString(),
          plan_tier: 'free',
          limit_minutes: 15,
          settled_minutes: 0,
          reserved_minutes: 0,
          total_used_minutes: 0,
          remaining_minutes: 15,
          is_quota_exceeded: false,
          is_unlimited: false,
        };
      }
      return null;
    }

    const json = await backendRequest<{ status: string; data: BillingUsage }>('/billing/usage');
    return json.data;
  }

  /**
   * Fetches all available plans from server.
   * Calls GET /api/billing/plans.
   */
  static async getPlans(): Promise<{
    plans: PlanDefinition[];
    providers: ProviderOption[];
    defaultProvider: BillingProviderName;
  }> {
    const json = await backendRequest<{
      status: string;
      data: {
        plans: PlanDefinition[];
        providers: ProviderOption[];
        defaultProvider: BillingProviderName;
      };
    }>('/billing/plans');
    return json.data;
  }

  /**
   * Fetches user subscription details and active entitlement.
   * Calls GET /api/billing/subscription.
   */
  static async getSubscription(): Promise<{
    entitlement: UserEntitlement;
    plan: PlanDefinition;
    isUnlimited: boolean;
    providers: ProviderOption[];
  }> {
    const json = await backendRequest<{
      status: string;
      data: {
        entitlement: UserEntitlement;
        plan: PlanDefinition;
        isUnlimited: boolean;
        providers: ProviderOption[];
      };
    }>('/billing/subscription');
    return json.data;
  }

  /**
   * Creates a Checkout Session with the requested provider (Paddle or Razorpay).
   * Calls POST /api/billing/checkout.
   */
  static async createCheckout(
    planId: 'creator' | 'pro' | 'studio',
    interval: BillingInterval = 'month',
    provider?: BillingProviderName
  ): Promise<CheckoutResponse> {
    const json = await backendRequest<{ status: string; data: CheckoutResponse }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId, interval, provider }),
    });
    return json.data;
  }

  /**
   * Cancels active paid subscription.
   * Calls POST /api/billing/cancel.
   */
  static async cancelSubscription(): Promise<{ status: string; data: any }> {
    return backendRequest<{ status: string; data: any }>('/billing/cancel', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * Generates a Customer Portal URL or management link.
   * Calls POST /api/billing/portal.
   */
  static async createPortal(): Promise<{ url: string }> {
    const json = await backendRequest<{ status: string; data: { url: string } }>('/billing/portal', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return json.data;
  }

  /**
   * Retrieves past invoices.
   * Calls GET /api/billing/invoices.
   */
  static async getInvoices(): Promise<BillingInvoice[]> {
    const json = await backendRequest<{ status: string; data: { invoices: BillingInvoice[] } }>('/billing/invoices');
    return json.data.invoices;
  }
}

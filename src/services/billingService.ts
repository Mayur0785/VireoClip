import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
}

export class BillingService {
  /**
   * Fetches monthly billing and usage metrics for the authenticated user.
   * Calls GET /api/billing/usage.
   */
  static async getUsage(): Promise<BillingUsage | null> {
    if (!isSupabaseConfigured) {
      // Development-only fallback when Supabase is completely unconfigured
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
        };
      }
      return null;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${apiUrl}/billing/usage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message || `Failed to fetch usage: ${res.statusText}`);
      }

      const json = await res.json();
      return json.data as BillingUsage;
    } catch (err: unknown) {
      console.warn('BillingService.getUsage failed:', err);
      // Re-throw so caller knows usage is unavailable; DO NOT display fake production usage
      throw err;
    }
  }
}

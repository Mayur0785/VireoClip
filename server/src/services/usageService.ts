import { config } from '../config/index.js';
import { cleanupUsage, releaseUsage, reserveUsage, settleUsage, usageBalance } from '../db/repositories/usageRepository.js';

export interface UsageQuotaReservationResult {
  allowed: boolean;
  idempotent?: boolean;
  usageEventId?: string;
  processingAttemptId: string;
  billingPeriod: string;
  limitMinutes: number;
  allocatedMinutes: number;
  remainingMinutes: number;
  requestedMinutes?: number;
  errorCode?: string;
  errorMessage?: string;
  resetDate: string;
}

export interface UsageBalanceSummary {
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

export function getCurrentUtcBillingPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getUtcBillingResetDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export class UsageService {
  static async reserveQuota(userId: string, projectId: string, attemptId: string,
    estimatedMinutes = 3): Promise<UsageQuotaReservationResult> {
    const result = await reserveUsage(userId, projectId, attemptId, getCurrentUtcBillingPeriod(), estimatedMinutes);
    const remaining = result.remaining_minutes;
    return {
      allowed: result.allowed,
      idempotent: result.idempotent,
      usageEventId: result.usage_event_id,
      processingAttemptId: attemptId,
      billingPeriod: result.billing_period,
      limitMinutes: result.limit_minutes,
      allocatedMinutes: result.allocated_minutes,
      remainingMinutes: remaining,
      requestedMinutes: estimatedMinutes,
      errorCode: result.allowed ? undefined : 'QUOTA_EXCEEDED',
      errorMessage: result.allowed ? undefined :
        `Monthly video processing quota exceeded. You have ${remaining.toFixed(1)} minutes remaining, but this video requires an estimated ${estimatedMinutes.toFixed(1)} minutes.`,
      resetDate: getUtcBillingResetDate(),
    };
  }

  static async settleReservation(attemptId: string, durationSeconds: number,
    metadata: Record<string, unknown> = {}): Promise<void> {
    const actual = Math.max(0.1, Math.round(durationSeconds / 60 * 100) / 100);
    await settleUsage(attemptId, actual, durationSeconds, metadata);
  }

  static async releaseReservation(attemptId: string, reason: string): Promise<void> {
    await releaseUsage(attemptId, reason);
  }

  static async cleanupOrphanedReservations(olderThanMinutes = 30): Promise<number> {
    return cleanupUsage(olderThanMinutes);
  }

  static async getCurrentUsage(userId: string): Promise<UsageBalanceSummary> {
    const period = getCurrentUtcBillingPeriod();
    const balance = await usageBalance(userId, period);
    const limit = balance?.monthly_minutes_limit ?? config.defaultMonthlyQuotaMinutes;
    const settled = balance?.settled_minutes ?? 0;
    const reserved = balance?.reserved_minutes ?? 0;
    const total = Math.round((settled + reserved) * 100) / 100;
    return {
      billing_period: period,
      reset_date: getUtcBillingResetDate(),
      plan_tier: balance?.plan_tier ?? 'free',
      limit_minutes: limit,
      settled_minutes: settled,
      reserved_minutes: reserved,
      total_used_minutes: total,
      remaining_minutes: Math.max(0, Math.round((limit - total) * 100) / 100),
      is_quota_exceeded: total >= limit,
    };
  }
}

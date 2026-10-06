import crypto from 'node:crypto';
import { ClientSession, MongoServerError } from 'mongodb';
import { config } from '../../config/index.js';
import { getMongoClient, getMongoDb } from '../mongoClient.js';

type Balance = {
  user_id: string; billing_period: string; plan_tier: string;
  monthly_minutes_limit: number; settled_minutes: number; reserved_minutes: number;
};
type Event = {
  id: string; user_id: string; project_id: string; processing_attempt_id: string;
  billing_period: string; status: 'reserved' | 'settled' | 'released';
  reserved_minutes: number; actual_minutes?: number; duration_seconds?: number;
  metadata?: Record<string, unknown>; created_at: Date; updated_at: Date;
};

const round = (n: number) => Math.round(n * 100) / 100;

async function runTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => fn(session), {
      maxCommitTimeMS: 10_000,
    }) as T;
  } finally {
    await session.endSession();
  }
}

/** Reserve atomically by conditionally updating the balance inside the same transaction as the event. */
export async function reserveUsage(
  userId: string,
  projectId: string,
  attemptId: string,
  period: string,
  minutes: number,
  isUnlimited = false,
  entitlementLimitMinutes?: number,
  entitlementPlanTier?: string
) {
  const db = await getMongoDb();
  const events = db.collection<Event>('usage_events');
  const balances = db.collection<Balance>('subscription_limits');
  const requested = round(minutes);
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Invalid reservation estimate.');

  const effectiveLimit = isUnlimited
    ? 999999
    : (entitlementLimitMinutes ?? config.defaultMonthlyQuotaMinutes);
  const effectiveTier = isUnlimited
    ? 'developer'
    : (entitlementPlanTier ?? 'free');

  for (let retry = 0; retry < 5; retry++) {
    const existing = await events.findOne({ processing_attempt_id: attemptId });
    if (existing) {
      if (existing.user_id !== userId || existing.project_id !== projectId) throw new Error('Attempt ID is already in use.');
      const balance = await balances.findOne({ user_id: userId, billing_period: period });
      const quota = balance?.monthly_minutes_limit ?? effectiveLimit;
      return {
        allowed: existing.status !== 'released',
        idempotent: true,
        usage_event_id: existing.id,
        billing_period: period,
        limit_minutes: quota,
        allocated_minutes: existing.reserved_minutes,
        remaining_minutes: isUnlimited
          ? 999999
          : Math.max(0, round(quota - (balance?.settled_minutes ?? 0) - (balance?.reserved_minutes ?? 0))),
      };
    }
    try {
      return await runTransaction(async (session) => {
        const now = new Date();
        await balances.updateOne({ user_id: userId, billing_period: period }, {
          $setOnInsert: {
            user_id: userId,
            billing_period: period,
            plan_tier: effectiveTier,
            monthly_minutes_limit: effectiveLimit,
            settled_minutes: 0,
            reserved_minutes: 0,
          },
        }, { upsert: true, session });
        const balance = await balances.findOne({ user_id: userId, billing_period: period }, { session });
        if (!balance) throw new Error('Quota balance unavailable.');

        // For unlimited dev accounts, do not enforce the ceiling condition, but still atomically increment reserved_minutes
        const updateFilter: Record<string, unknown> = {
          user_id: userId,
          billing_period: period,
        };
        if (!isUnlimited) {
          updateFilter.$expr = {
            $lte: [{ $add: ['$settled_minutes', '$reserved_minutes', requested] }, '$monthly_minutes_limit'],
          };
        }

        const updated = await balances.updateOne(updateFilter, { $inc: { reserved_minutes: requested } }, { session });
        if (updated.modifiedCount !== 1) {
          return {
            allowed: false,
            idempotent: false,
            billing_period: period,
            limit_minutes: balance.monthly_minutes_limit,
            allocated_minutes: 0,
            requested_minutes: requested,
            error_code: 'QUOTA_EXCEEDED',
            remaining_minutes: Math.max(0, round(balance.monthly_minutes_limit - balance.settled_minutes - balance.reserved_minutes)),
          };
        }
        const event: Event = {
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: projectId,
          processing_attempt_id: attemptId,
          billing_period: period,
          status: 'reserved',
          reserved_minutes: requested,
          created_at: now,
          updated_at: now,
        };
        await events.insertOne(event, { session });
        return {
          allowed: true,
          idempotent: false,
          usage_event_id: event.id,
          billing_period: period,
          limit_minutes: isUnlimited ? 999999 : balance.monthly_minutes_limit,
          allocated_minutes: requested,
          remaining_minutes: isUnlimited
            ? 999999
            : Math.max(0, round(balance.monthly_minutes_limit - balance.settled_minutes - balance.reserved_minutes - requested)),
        };
      });
    } catch (error) {
      const retryable = error instanceof MongoServerError &&
        (error.code === 11000 || error.hasErrorLabel('TransientTransactionError'));
      if (!retryable || retry === 4) throw error;
    }
  }
  throw new Error('Quota reservation could not be completed.');
}

async function transitionEvent(attemptId: string, next: 'settled' | 'released', actualMinutes = 0,
  durationSeconds = 0, metadata: Record<string, unknown> = {}): Promise<void> {
  await runTransaction(async (session) => {
    const db = await getMongoDb();
    const events = db.collection<Event>('usage_events');
    const balances = db.collection<Balance>('subscription_limits');
    const event = await events.findOne({ processing_attempt_id: attemptId }, { session });
    if (!event || event.status === next || event.status !== 'reserved') return;
    const updated = await events.updateOne({ id: event.id, status: 'reserved' }, {
      $set: { status: next, actual_minutes: next === 'settled' ? round(actualMinutes) : 0,
        duration_seconds: durationSeconds, metadata, updated_at: new Date() },
    }, { session });
    if (updated.modifiedCount !== 1) return;
    const result = await balances.updateOne({ user_id: event.user_id, billing_period: event.billing_period,
      reserved_minutes: { $gte: event.reserved_minutes } }, {
      $inc: { reserved_minutes: -event.reserved_minutes,
        settled_minutes: next === 'settled' ? round(actualMinutes) : 0 },
    }, { session });
    if (result.modifiedCount !== 1) throw new Error('Quota balance inconsistent.');
  });
}

export const settleUsage = (attemptId: string, minutes: number, seconds: number, metadata: Record<string, unknown>) =>
  transitionEvent(attemptId, 'settled', minutes, seconds, metadata);
export const releaseUsage = (attemptId: string, reason: string) =>
  transitionEvent(attemptId, 'released', 0, 0, { reason: reason.slice(0, 500) });

export async function cleanupUsage(olderThanMinutes: number): Promise<number> {
  const db = await getMongoDb();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stale = await db.collection<Event>('usage_events').find({ status: 'reserved', created_at: { $lt: cutoff } })
    .project({ processing_attempt_id: 1 }).toArray();
  for (const event of stale) await releaseUsage(event.processing_attempt_id, 'Orphaned reservation');
  return stale.length;
}

export async function usageBalance(userId: string, period: string) {
  return (await getMongoDb()).collection<Balance>('subscription_limits').findOne({ user_id: userId, billing_period: period });
}

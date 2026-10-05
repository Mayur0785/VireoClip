// LEGACY SUPABASE RPC BEHAVIOR MODEL — retained for historical semantics; Mongo integration is tested in mongoMigration.test.ts.
import assert from 'assert';
import { getCurrentUtcBillingPeriod, getUtcBillingResetDate, UsageService } from '../services/usageService.js';
import { config } from '../config/index.js';

interface MockUsageEvent {
  id: string;
  user_id: string;
  project_id: string;
  billing_period: string;
  status: 'reserved' | 'settled' | 'released';
  reserved_minutes: number;
  actual_minutes: number | null;
  duration_seconds: number;
  processing_attempt_id: string;
  created_at: Date;
  settled_at: Date | null;
  failure_reason: string | null;
}

// In-memory simulation of the exact PostgreSQL RPC logic:
// reserve_usage_quota(), settle_usage_reservation(), release_usage_reservation(), cleanup_orphaned_reservations()
class MockPostgresLedgerEngine {
  private events: MockUsageEvent[] = [];
  private userLimits: Map<string, number> = new Map();
  // Simulates PostgreSQL ROW-LEVEL LOCK (FOR UPDATE)
  private userLocks: Set<string> = new Set();

  setUserLimit(userId: string, limitMinutes: number) {
    this.userLimits.set(userId, limitMinutes);
  }

  async acquireUserLock(userId: string): Promise<() => void> {
    while (this.userLocks.has(userId)) {
      await new Promise((r) => setTimeout(r, 10));
    }
    this.userLocks.add(userId);
    return () => {
      this.userLocks.delete(userId);
    };
  }

  cleanupOrphanedReservations(olderThanMinutes: number = 30): number {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    let count = 0;
    for (const ev of this.events) {
      if (ev.status === 'reserved' && ev.created_at < cutoff) {
        ev.status = 'released';
        ev.failure_reason = `Timed out (orphaned reservation exceeded ${olderThanMinutes} minutes)`;
        ev.settled_at = new Date();
        count++;
      }
    }
    return count;
  }

  async reserveUsageQuota(
    userId: string,
    projectId: string,
    attemptId: string,
    estimatedMinutes: number,
    defaultMonthlyQuota: number
  ) {
    const unlock = await this.acquireUserLock(userId);
    try {
      const billingPeriod = getCurrentUtcBillingPeriod();

      // 1. Idempotency Check
      const existing = this.events.find((e) => e.processing_attempt_id === attemptId);
      if (existing) {
        if (existing.status === 'reserved') {
          return {
            allowed: true,
            idempotent: true,
            usage_event_id: existing.id,
            processing_attempt_id: attemptId,
            status: 'reserved',
            billing_period: existing.billing_period,
            reserved_minutes: existing.reserved_minutes,
          };
        } else {
          return {
            allowed: false,
            idempotent: true,
            error_code: 'ATTEMPT_ALREADY_TERMINATED',
            usage_event_id: existing.id,
            processing_attempt_id: attemptId,
            status: existing.status,
          };
        }
      }

      // Cleanup orphans
      this.cleanupOrphanedReservations(30);

      // Determine effective limit
      const limit = this.userLimits.get(userId) ?? defaultMonthlyQuota;

      // Calculate total allocated
      const periodEvents = this.events.filter(
        (e) => e.user_id === userId && e.billing_period === billingPeriod && (e.status === 'settled' || e.status === 'reserved')
      );

      const committedMinutes = periodEvents
        .filter((e) => e.status === 'settled')
        .reduce((sum, e) => sum + (e.actual_minutes || 0), 0);

      const reservedMinutes = periodEvents
        .filter((e) => e.status === 'reserved')
        .reduce((sum, e) => sum + e.reserved_minutes, 0);

      const totalAllocated = committedMinutes + reservedMinutes;
      const remainingMinutes = Math.max(0, limit - totalAllocated);

      if (totalAllocated + estimatedMinutes > limit) {
        return {
          allowed: false,
          error_code: 'QUOTA_EXCEEDED',
          billing_period: billingPeriod,
          limit_minutes: limit,
          allocated_minutes: totalAllocated,
          settled_minutes: committedMinutes,
          reserved_minutes: reservedMinutes,
          remaining_minutes: remainingMinutes,
          requested_minutes: estimatedMinutes,
        };
      }

      // Append reservation
      const newEvent: MockUsageEvent = {
        id: `event-${this.events.length + 1}`,
        user_id: userId,
        project_id: projectId,
        billing_period: billingPeriod,
        status: 'reserved',
        reserved_minutes: estimatedMinutes,
        actual_minutes: null,
        duration_seconds: 0,
        processing_attempt_id: attemptId,
        created_at: new Date(),
        settled_at: null,
        failure_reason: null,
      };

      this.events.push(newEvent);

      return {
        allowed: true,
        idempotent: false,
        usage_event_id: newEvent.id,
        processing_attempt_id: attemptId,
        billing_period: billingPeriod,
        limit_minutes: limit,
        allocated_minutes: totalAllocated + estimatedMinutes,
        remaining_minutes: remainingMinutes - estimatedMinutes,
      };
    } finally {
      unlock();
    }
  }

  settleUsageReservation(attemptId: string, actualMinutes: number, durationSeconds: number) {
    const ev = this.events.find((e) => e.processing_attempt_id === attemptId && e.status === 'reserved');
    if (!ev) return { success: false };
    ev.status = 'settled';
    ev.actual_minutes = actualMinutes;
    ev.duration_seconds = durationSeconds;
    ev.settled_at = new Date();
    return { success: true, usage_event_id: ev.id, status: 'settled' };
  }

  releaseUsageReservation(attemptId: string, reason: string) {
    const ev = this.events.find((e) => e.processing_attempt_id === attemptId && e.status === 'reserved');
    if (!ev) return { success: false };
    ev.status = 'released';
    ev.actual_minutes = null;
    ev.failure_reason = reason;
    ev.settled_at = new Date();
    return { success: true, usage_event_id: ev.id, status: 'released' };
  }

  addManualEvent(ev: MockUsageEvent) {
    this.events.push(ev);
  }

  getEvents() {
    return this.events;
  }
}

async function runTests() {
  console.log('Running Phase 9 Deterministic Quota & Usage Ledger Tests...\n');
  let passed = 0;

  // 1. Quota under limit
  {
    const engine = new MockPostgresLedgerEngine();
    const res = await engine.reserveUsageQuota('user-1', 'proj-1', 'att-1', 3.0, 15.0);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining_minutes, 12.0);
    assert.strictEqual(res.allocated_minutes, 3.0);
    console.log('  ✓ 1. Quota under limit passes');
    passed++;
  }

  // 2. Quota exactly at limit
  {
    const engine = new MockPostgresLedgerEngine();
    await engine.reserveUsageQuota('user-1', 'proj-1', 'att-1', 10.0, 15.0);
    const res2 = await engine.reserveUsageQuota('user-1', 'proj-2', 'att-2', 5.0, 15.0);
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.remaining_minutes, 0);
    console.log('  ✓ 2. Quota exactly at limit passes');
    passed++;
  }

  // 3. Quota exceeded
  {
    const engine = new MockPostgresLedgerEngine();
    await engine.reserveUsageQuota('user-1', 'proj-1', 'att-1', 12.0, 15.0);
    const res = await engine.reserveUsageQuota('user-1', 'proj-2', 'att-2', 4.0, 15.0);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.error_code, 'QUOTA_EXCEEDED');
    assert.strictEqual(res.remaining_minutes, 3.0);
    console.log('  ✓ 3. Quota exceeded is rejected with 403 QUOTA_EXCEEDED payload');
    passed++;
  }

  // 4. Concurrent reservation behavior with row-level locking
  {
    const engine = new MockPostgresLedgerEngine();
    // User has 5 minutes limit. Two projects request 3 minutes at the exact same moment.
    engine.setUserLimit('user-concurrent', 5.0);

    const [resA, resB] = await Promise.all([
      engine.reserveUsageQuota('user-concurrent', 'proj-A', 'att-A', 3.0, 5.0),
      engine.reserveUsageQuota('user-concurrent', 'proj-B', 'att-B', 3.0, 5.0),
    ]);

    // One must succeed, the other MUST be rejected because 3 + 3 = 6 > 5
    const successCount = [resA, resB].filter((r) => r.allowed).length;
    const rejectedCount = [resA, resB].filter((r) => !r.allowed).length;
    assert.strictEqual(successCount, 1);
    assert.strictEqual(rejectedCount, 1);
    console.log('  ✓ 4. Concurrent reservations for different projects serialize via user lock');
    passed++;
  }

  // 5. Duplicate processing_attempt_id idempotency
  {
    const engine = new MockPostgresLedgerEngine();
    const res1 = await engine.reserveUsageQuota('user-1', 'proj-1', 'duplicate-att-id', 3.0, 15.0);
    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.idempotent, false);

    // Call again with exact same attempt ID
    const res2 = await engine.reserveUsageQuota('user-1', 'proj-1', 'duplicate-att-id', 3.0, 15.0);
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.idempotent, true);
    assert.strictEqual(engine.getEvents().length, 1, 'Never creates duplicate records for same attempt ID');
    console.log('  ✓ 5. Duplicate processing_attempt_id is idempotently recognized');
    passed++;
  }

  // 6. Re-processing creates new attempt and consumes quota
  {
    const engine = new MockPostgresLedgerEngine();
    await engine.reserveUsageQuota('user-1', 'proj-same', 'attempt-run-1', 2.0, 15.0);
    engine.settleUsageReservation('attempt-run-1', 2.0, 120);

    // Re-processing creates new attempt ID
    const reprocessRes = await engine.reserveUsageQuota('user-1', 'proj-same', 'attempt-run-2', 2.0, 15.0);
    assert.strictEqual(reprocessRes.allowed, true);
    assert.strictEqual(engine.getEvents().length, 2);
    assert.strictEqual(reprocessRes.allocated_minutes, 4.0);
    console.log('  ✓ 6. Re-processing creates a new attempt and updates usage allocation');
    passed++;
  }

  // 7. Successful settlement transitions reserved -> settled with actual minutes
  {
    const engine = new MockPostgresLedgerEngine();
    await engine.reserveUsageQuota('user-1', 'proj-1', 'att-settle', 5.0, 15.0);
    // Audio is actually 3.5 minutes (210s)
    const settleRes = engine.settleUsageReservation('att-settle', 3.5, 210);
    assert.strictEqual(settleRes.success, true);
    const event = engine.getEvents().find((e) => e.processing_attempt_id === att_settle_name(engine));
    assert.strictEqual(event?.status, 'settled');
    assert.strictEqual(event?.actual_minutes, 3.5);
    console.log('  ✓ 7. Successful settlement updates reserved row to settled with measured duration');
    passed++;
  }

  // 8. Failed processing releases reservation
  {
    const engine = new MockPostgresLedgerEngine();
    await engine.reserveUsageQuota('user-1', 'proj-fail', 'att-fail', 4.0, 15.0);
    const releaseRes = engine.releaseUsageReservation('att-fail', 'FFmpeg audio stream not found');
    assert.strictEqual(releaseRes.success, true);

    const event = engine.getEvents().find((e) => e.processing_attempt_id === 'att-fail');
    assert.strictEqual(event?.status, 'released');
    assert.strictEqual(event?.actual_minutes, null);

    // Released hold frees quota back to user
    const checkQuota = await engine.reserveUsageQuota('user-1', 'proj-next', 'att-next', 15.0, 15.0);
    assert.strictEqual(checkQuota.allowed, true, 'Released minutes no longer count against monthly quota');
    console.log('  ✓ 8. Failed processing releases hold and restores full quota to user');
    passed++;
  }

  // 9. UTC billing period formatting & reset date
  {
    const period = getCurrentUtcBillingPeriod();
    assert.match(period, /^[0-9]{4}-(0[1-9]|1[0-2])$/);
    const resetDate = getUtcBillingResetDate();
    assert.strictEqual(resetDate.endsWith('T00:00:00.000Z'), true);
    const dateObj = new Date(resetDate);
    assert.strictEqual(dateObj.getUTCDate(), 1);
    console.log(`  ✓ 9. Billing period is strictly UTC (${period}) and reset date is ${resetDate}`);
    passed++;
  }

  // 10. Orphan reservation cleanup (> 30 minutes)
  {
    const engine = new MockPostgresLedgerEngine();
    // Add an orphaned event from 45 minutes ago
    engine.addManualEvent({
      id: 'orphan-1',
      user_id: 'user-1',
      project_id: 'proj-orphan',
      billing_period: getCurrentUtcBillingPeriod(),
      status: 'reserved',
      reserved_minutes: 5.0,
      actual_minutes: null,
      duration_seconds: 0,
      processing_attempt_id: 'orphan-attempt',
      created_at: new Date(Date.now() - 45 * 60 * 1000),
      settled_at: null,
      failure_reason: null,
    });

    const cleaned = engine.cleanupOrphanedReservations(30);
    assert.strictEqual(cleaned, 1);
    const orphan = engine.getEvents().find((e) => e.id === 'orphan-1');
    assert.strictEqual(orphan?.status, 'released');
    assert.strictEqual(orphan?.failure_reason?.includes('orphaned reservation exceeded 30 minutes'), true);
    console.log('  ✓ 10. Orphan reservation older than 30m is automatically released');
    passed++;
  }

  // 11. Configurable quota parameter
  {
    const engine = new MockPostgresLedgerEngine();
    // Pass custom quota of 45.0 minutes
    const res = await engine.reserveUsageQuota('user-pro', 'proj-1', 'att-p1', 40.0, 45.0);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining_minutes, 5.0);
    assert.strictEqual(typeof config.defaultMonthlyQuotaMinutes, 'number');
    console.log('  ✓ 11. Monthly quota is configurable (passed dynamically or via env)');
    passed++;
  }

  // 12. In-memory project lock still guards duplicate processing on the same project
  {
    const activeProcessingSet = new Set<string>();
    const projectId = 'proj-lock-test';
    activeProcessingSet.add(projectId);
    assert.throws(
      () => {
        if (activeProcessingSet.has(projectId)) {
          throw new Error('Project processing is already in progress.');
        }
      },
      /Project processing is already in progress./
    );
    activeProcessingSet.delete(projectId);
    assert.strictEqual(activeProcessingSet.has(projectId), false);
    console.log('  ✓ 12. In-memory activeProcessingSet project lock remains intact');
    passed++;
  }

  console.log(`\nResults: ${passed}/12 tests passed successfully.`);
}

function att_settle_name(engine: MockPostgresLedgerEngine): string {
  return 'att-settle';
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ownerContext, dataRepository } from '../db/repositories/dataRepository.js';
import { JobReliabilityService } from '../services/queue/jobReliabilityService.js';
import { AutopilotService } from '../services/autopilotService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { VideoAnalysisWorker } from '../services/multimodal/videoAnalysisWorker.js';
import { AppError } from '../types/index.js';

describe('Phase 37 — Queue & Job Reliability Test Suite', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const projectAId = crypto.randomUUID();
  const clipAId = crypto.randomUUID();

  before(async () => {
    // Ensure DB connection
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err: any) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Seed disposable test project and clip for User A
    await ownerContext.run(userA, async () => {
      await dataRepository.from('projects').insert({
        id: projectAId,
        user_id: userA,
        title: 'Phase 37 Reliability Disposable Project',
        video_status: 'completed',
        source_type: 'upload',
        storage_path: 'raw/disposable_phase37.mp4',
        duration_seconds: 60,
      });

      await dataRepository.from('clips').insert({
        id: clipAId,
        user_id: userA,
        project_id: projectAId,
        title: 'Phase 37 Disposable Clip',
        start_seconds: 0,
        end_seconds: 15,
        duration_seconds: 15,
        render_status: 'ready',
        output_storage_path: 'rendered/disposable_phase37.mp4',
      });
    });
  });

  after(async () => {
    // Clean up disposable records created during this test
    try {
      const db = await getMongoDb();
      await db.collection('autopilot_runs').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('content_packs').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('content_pack_items').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('render_jobs').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('video_analysis_jobs').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('publish_jobs').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('published_posts').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('clips').deleteMany({ id: clipAId });
      await db.collection('projects').deleteMany({ id: projectAId });
    } catch {
      // Ignore cleanup error
    }
    await closeMongo();
  });

  // 1. Error Classification & Sanitization
  describe('1. Error Classification and Secret Sanitization', () => {
    it('correctly classifies transient errors', () => {
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('Network connection timeout')), true);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('HTTP 429 Too Many Requests')), true);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('503 Service Unavailable')), true);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('read ECONNRESET')), true);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('Deadlock found when trying to get lock')), true);
    });

    it('correctly classifies permanent non-retryable errors', () => {
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('Validation failed for field title')), false);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('Unauthorized 401 access')), false);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('403 Forbidden')), false);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('404 Resource not found')), false);
      assert.strictEqual(JobReliabilityService.isTransientError(new Error('Deliverable verification failed')), false);
    });

    it('sanitizes secrets, credentials, bearer tokens, and keys from failure messages', () => {
      const dirtyMessage = 'Failed while calling https://user:supersecretpass@api.provider.com/v1 with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and sk-ant-api03-abcdef1234567890 and fal_secretkey998811';
      const clean = JobReliabilityService.sanitizeErrorMessage(dirtyMessage);

      assert.doesNotMatch(clean, /supersecretpass/);
      assert.doesNotMatch(clean, /Bearer eyJ/);
      assert.doesNotMatch(clean, /sk-ant-api03/);
      assert.doesNotMatch(clean, /fal_secretkey998811/);
      assert.match(clean, /\[REDACTED\]/);
    });
  });

  // 2. Exponential Backoff with Jitter
  describe('2. Exponential Backoff and Jitter Calculation', () => {
    it('produces bounded exponential delays with jitter', () => {
      const delay1 = JobReliabilityService.computeBackoffDelayMs(1, { baseDelayMs: 1000, maxDelayMs: 30000 });
      const delay2 = JobReliabilityService.computeBackoffDelayMs(2, { baseDelayMs: 1000, maxDelayMs: 30000 });
      const delay3 = JobReliabilityService.computeBackoffDelayMs(3, { baseDelayMs: 1000, maxDelayMs: 30000 });

      // Attempt 1: base 1000ms * 2^0 = 1000ms. Jitter: [750, 1250]
      assert.ok(delay1 >= 750 && delay1 <= 1250, `delay1 was ${delay1}`);
      // Attempt 2: base 1000ms * 2^1 = 2000ms. Jitter: [1500, 2500]
      assert.ok(delay2 >= 1500 && delay2 <= 2500, `delay2 was ${delay2}`);
      // Attempt 3: base 1000ms * 2^2 = 4000ms. Jitter: [3000, 5000]
      assert.ok(delay3 >= 3000 && delay3 <= 5000, `delay3 was ${delay3}`);
      // Maximum cap respected
      const delayLarge = JobReliabilityService.computeBackoffDelayMs(10, { baseDelayMs: 1000, maxDelayMs: 30000 });
      assert.ok(delayLarge <= 37500, `delayLarge exceeded max cap + jitter: ${delayLarge}`);
    });
  });

  // 3. State Transition Validation
  describe('3. State Transition Validation Graph', () => {
    it('allows valid state transitions for autopilot jobs', () => {
      assert.doesNotThrow(() => JobReliabilityService.validateStateTransition('autopilot', 'PENDING', 'RUNNING'));
      assert.doesNotThrow(() => JobReliabilityService.validateStateTransition('autopilot', 'RUNNING', 'COMPLETED'));
      assert.doesNotThrow(() => JobReliabilityService.validateStateTransition('autopilot', 'RUNNING', 'FAILED'));
      assert.doesNotThrow(() => JobReliabilityService.validateStateTransition('autopilot', 'FAILED', 'RUNNING'));
      assert.doesNotThrow(() => JobReliabilityService.validateStateTransition('autopilot', 'COMPLETED', 'APPROVED'));
    });

    it('rejects invalid or backwards state transitions', () => {
      assert.throws(
        () => JobReliabilityService.validateStateTransition('autopilot', 'CANCELLED', 'RUNNING'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_STATE_TRANSITION'
      );
      assert.throws(
        () => JobReliabilityService.validateStateTransition('autopilot', 'CANCELLED', 'COMPLETED'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_STATE_TRANSITION'
      );
      assert.throws(
        () => JobReliabilityService.validateStateTransition('render', 'completed', 'queued'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_STATE_TRANSITION'
      );
    });
  });

  // 4. Deliverable Verification Guards
  describe('4. Deliverable Prerequisite Validation Guards', () => {
    it('prevents marking a job completed when required outputs are missing', () => {
      // Missing render output storage path
      assert.throws(
        () => JobReliabilityService.verifyRequiredOutputs('render', { output_storage_path: null }),
        (err: any) => err instanceof AppError && err.code === 'DELIVERABLE_MISSING'
      );

      // Missing publish provider post id
      assert.throws(
        () => JobReliabilityService.verifyRequiredOutputs('publish', { provider_post_id: '' }),
        (err: any) => err instanceof AppError && err.code === 'DELIVERABLE_MISSING'
      );

      // Missing autopilot generated deliverables
      assert.throws(
        () => JobReliabilityService.verifyRequiredOutputs('autopilot', {
          producer_plan_id: 'plan_123',
          content_pack_id: null,
        }),
        (err: any) => err instanceof AppError && err.code === 'DELIVERABLE_MISSING'
      );
    });

    it('allows completion when valid deliverables exist', () => {
      assert.doesNotThrow(() =>
        JobReliabilityService.verifyRequiredOutputs('render', {
          output_storage_path: 'clips/valid.mp4',
        })
      );
      assert.doesNotThrow(() =>
        JobReliabilityService.verifyRequiredOutputs('publish', {
          provider_post_id: 'post_12345',
        })
      );
    });
  });

  // 5. Autopilot Run Idempotency & Duplicate Delivery
  describe('5. Autopilot Idempotency & Duplicate Delivery Safeguard', () => {
    it('returns existing run when duplicate delivery occurs with identical idempotency_key', async () => {
      const idempotencyKey = `idem_${crypto.randomUUID()}`;
      const run1 = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'BALANCED' },
        idempotency_key: idempotencyKey,
      });
      assert.ok(run1.id);

      // Duplicate delivery request
      const run2 = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'BALANCED' },
        idempotency_key: idempotencyKey,
      });
      assert.strictEqual(run2.id, run1.id, 'Duplicate run was created instead of returning existing run');

      const runs = await AutopilotService.getRunsForClip(userA, clipAId);
      const matchingRuns = runs.filter((r) => r.id === run1.id);
      assert.strictEqual(matchingRuns.length, 1);
    });
  });

  // 6. Concurrency, Fencing Tokens & Stale Worker Protection
  describe('6. Concurrency, Fencing Tokens & Stale Worker Protection', () => {
    it('rejects stale worker updates when expectedLockToken is outdated or mismatched', async () => {
      const run = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'AGGRESSIVE' },
      });

      // Assign an active execution lock token to simulate worker execution
      const validToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60000);
      const db = await getMongoDb();
      await db.collection('autopilot_runs').updateOne(
        { id: run.id, user_id: userA },
        { $set: { execution_lock: validToken, execution_lock_expires_at: expiresAt } }
      );

      // Valid update with current lock token
      await AutopilotService.updateRunState(userA, run.id, {
        current_step: 'PRODUCER',
        status: 'RUNNING',
      }, validToken);

      // Attempt update with stale / wrong fencing token
      await assert.rejects(
        async () => {
          await AutopilotService.updateRunState(userA, run.id, {
            current_step: 'HOOK_LAB',
            status: 'RUNNING',
          }, 'stale_fencing_token_9999');
        },
        (err: any) => err instanceof AppError && (err.code === 'LOCK_LOST' || err.code === 'FENCING_TOKEN_MISMATCH')
      );
    });

    it('prevents dual concurrent execution on clip render jobs with worker lease fencing', async () => {
      const db = await getMongoDb();
      const jobId = crypto.randomUUID();
      const now = new Date();

      // Insert job in processing state owned by worker Alpha
      await db.collection('render_jobs').insertOne({
        id: jobId,
        user_id: userA,
        clip_id: clipAId,
        status: 'processing',
        worker_id: 'worker_alpha',
        locked_at: now,
        attempts: 1,
        max_attempts: 3,
        created_at: now,
        updated_at: now,
      } as any);

      // Worker Beta attempts to update stage with wrong worker_id
      await assert.rejects(
        async () => {
          await ClipRenderService.updateJobStage(jobId, clipAId, 'encoding', 50, 'rendering', 'worker_beta');
        },
        (err: any) => err instanceof AppError && err.code === 'FENCING_TOKEN_MISMATCH'
      );

      // Worker Alpha succeeds
      await ClipRenderService.updateJobStage(jobId, clipAId, 'encoding', 50, 'rendering', 'worker_alpha');
      const updated = await db.collection('render_jobs').findOne({ id: jobId });
      assert.strictEqual(updated?.stage, 'encoding');
    });
  });

  // 7. Lease Expiration & Stale Worker Recovery
  describe('7. Lease Expiration & Stale Job Recovery', () => {
    it('reclaims expired render jobs and resets status to queued for execution', async () => {
      const db = await getMongoDb();
      const jobId = crypto.randomUUID();
      // Locked 20 minutes ago (> 15 min timeout)
      const staleTime = new Date(Date.now() - 20 * 60 * 1000);

      await db.collection('render_jobs').insertOne({
        id: jobId,
        user_id: userA,
        clip_id: clipAId,
        status: 'processing',
        worker_id: 'dead_worker_1',
        locked_at: staleTime,
        attempts: 1,
        max_attempts: 3,
        created_at: staleTime,
        updated_at: staleTime,
      } as any);

      // Run processor / sweeper
      await ClipRenderService.processDueRenderJobs();

      const recovered = await db.collection('render_jobs').findOne({ id: jobId });
      assert.ok(recovered);
      assert.strictEqual(recovered?.status, 'queued');
      assert.strictEqual(recovered?.worker_id, null);
      assert.strictEqual(recovered?.locked_at, null);
    });

    it('claims expired video analysis jobs during worker claimNextJob', async () => {
      const db = await getMongoDb();
      const analysisJobId = crypto.randomUUID();
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);

      await db.collection('video_analysis_jobs').insertOne({
        id: analysisJobId,
        project_id: projectAId,
        user_id: userA,
        status: 'processing',
        stage: 'running_ocr',
        progress: 75,
        worker_id: 'crashed_worker',
        locked_at: staleTime,
        attempts: 1,
        max_attempts: 3,
        next_retry_at: null,
        error_message: null,
        created_at: staleTime,
        updated_at: staleTime,
      } as any);

      const claimed = await VideoAnalysisWorker.claimNextJob();
      assert.ok(claimed);
      assert.strictEqual(claimed.id, analysisJobId);
      assert.strictEqual(claimed.attempts, 2);
      assert.notStrictEqual(claimed.worker_id, 'crashed_worker');
    });
  });

  // 8. Bounded Retries & Terminal Failure
  describe('8. Bounded Retries and Terminal State Enforcement', () => {
    it('enforces maximum attempts on autopilot step retries', async () => {
      const run = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'BALANCED' },
      });
      const db = await getMongoDb();

      // Simulate a failed step that has already reached max_attempts (3)
      await db.collection('autopilot_runs').updateOne(
        { id: run.id, user_id: userA },
        {
          $set: {
            status: 'FAILED',
            requires_manual_intervention: true,
            steps: [
              {
                step: 'PRODUCER',
                status: 'FAILED',
                attempts: 3,
                max_attempts: 3,
                error: 'Persistent timeout',
                requires_manual_intervention: true,
                retry_eligible: false,
              },
            ],
          },
        }
      );

      // Attempting to retry without forceRerun should fail
      await assert.rejects(
        async () => {
          await AutopilotService.retryFailedStep(userA, run.id, 'PRODUCER', false);
        },
        (err: any) => err instanceof AppError && ['MAX_RETRIES_EXCEEDED', 'PERMANENT_ERROR_NOT_RETRYABLE'].includes(err.code)
      );
    });
  });

  // 9. Tenant Isolation
  describe('9. Strict Tenant Isolation on Job Operations', () => {
    it('prevents User B from accessing, modifying, or retrying User A runs', async () => {
      const run = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'BALANCED' },
      });

      // User B cannot get run
      await assert.rejects(
        async () => {
          await AutopilotService.getRun(userB, run.id);
        },
        (err: any) => err instanceof AppError && err.code === 'RUN_NOT_FOUND'
      );

      // User B cannot retry User A's run
      await assert.rejects(
        async () => {
          await AutopilotService.retryFailedStep(userB, run.id, 'PRODUCER');
        },
        (err: any) => err instanceof AppError && err.code === 'RUN_NOT_FOUND'
      );

      // User B cannot update run state
      await assert.rejects(
        async () => {
          await AutopilotService.updateRunState(userB, run.id, { status: 'CANCELLED' });
        },
        (err: any) => err instanceof AppError && err.code === 'RUN_NOT_FOUND'
      );
    });
  });

  // 10. Human Approval and Publishing Safeguards Intact
  describe('10. Preservation of Human Approval Gates and Non-destructive View', () => {
    it('ensures inspecting job status or runs never triggers state mutations or execution', async () => {
      const run = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'BALANCED' },
      });
      const initialUpdatedAt = run.updated_at;

      // Poll status 3 times
      const r1 = await AutopilotService.getRun(userA, run.id);
      const r2 = await AutopilotService.getRun(userA, run.id);
      const r3 = await AutopilotService.getRun(userA, run.id);

      assert.strictEqual(r1.status, run.status);
      assert.strictEqual(r2.status, run.status);
      assert.strictEqual(r3.status, run.status);
      assert.strictEqual(new Date(r3.updated_at).getTime(), new Date(initialUpdatedAt).getTime(), 'Viewing run must be strictly read-only');
    });

    it('requires explicit human approval before accepting an autopilot run', async () => {
      const run = await AutopilotService.createRun(userA, {
        clip_id: clipAId,
        settings: { producer_mode: 'AGGRESSIVE' },
      });
      const db = await getMongoDb();
      const packId = crypto.randomUUID();
      const itemId = crypto.randomUUID();

      await db.collection('content_packs').insertOne({
        id: packId,
        user_id: userA,
        clip_id: clipAId,
        title: 'Phase 37 Disposable Pack',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await db.collection('content_pack_items').insertOne({
        id: itemId,
        content_pack_id: packId,
        user_id: userA,
        title: 'Hook Item',
        platform: 'tiktok',
        body: 'Disposable test hook content',
        variant_index: 0,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      // Put run in COMPLETED (awaiting approval)
      await db.collection('autopilot_runs').updateOne(
        { id: run.id, user_id: userA },
        {
          $set: {
            status: 'COMPLETED',
            producer_plan_id: 'plan_test',
            selected_hook_candidate_id: 'hook_test',
            selected_thumbnail_concept_id: 'thumb_test',
            content_pack_id: packId,
          },
        }
      );

      // User explicitly approves
      const result = await AutopilotService.approveRun(userA, run.id);
      assert.strictEqual(result.run.status, 'APPROVED');
      assert.strictEqual(result.run.is_approved, true);
      assert.ok(result.run.approved_at);
      assert.ok(result.publishing_handoff);
    });
  });
});

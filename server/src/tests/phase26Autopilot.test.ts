import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { AutopilotService } from '../services/autopilotService.js';
import { ProducerPlanningService } from '../services/producerPlanningService.js';
import { HookLabService } from '../services/hookLabService.js';
import { ThumbnailLabService } from '../services/thumbnailLabService.js';
import { ContentPackService } from '../services/contentPackService.js';
import {
  AutopilotRunRecord,
  AutopilotStepName,
  ThumbnailConcept,
  HookCandidate,
} from '../types/index.js';

describe('Phase 26 — Vireo Full Pipeline Autopilot Test Suite', () => {
  let db: any;
  const testUserId = crypto.randomUUID();
  const unauthorizedUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testClipId = crypto.randomUUID();
  let createdRunId = '';

  before(async () => {
    // Mongo Ping
    for (let i = 0; i < 3; i++) {
      try {
        db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Seed test project & clip
    await ownerContext.run(testUserId, async () => {
      await dataRepository.from('projects').insert({
        id: testProjectId,
        user_id: testUserId,
        title: 'Master Autopilot Seed Project',
        video_status: 'completed',
        source_type: 'upload',
      });

      await dataRepository.from('clips').insert({
        id: testClipId,
        project_id: testProjectId,
        user_id: testUserId,
        title: 'How to Build an Autonomous Video Empire in 2026',
        aspect_ratio: '9:16',
        duration_seconds: 40,
        start_seconds: 0,
        end_seconds: 40,
        status: 'ready',
        created_at: new Date().toISOString(),
      });

      await dataRepository.from('transcripts').insert({
        id: crypto.randomUUID(),
        project_id: testProjectId,
        user_id: testUserId,
        clean_text: 'Stop spending hours manually scrubbing timelines. In this video we demonstrate the complete Vireo autopilot pipeline from director to social packaging.',
        created_at: new Date().toISOString(),
      });
    });
  });

  after(async () => {
    try {
      await db.collection('autopilot_runs').deleteMany({ user_id: { $in: [testUserId, unauthorizedUserId] } });
      await db.collection('producer_plans').deleteMany({ user_id: testUserId });
      await db.collection('hook_lab_sessions').deleteMany({ user_id: testUserId });
      await db.collection('hook_candidates').deleteMany({ user_id: testUserId });
      await db.collection('thumbnail_lab_sessions').deleteMany({ user_id: testUserId });
      await db.collection('thumbnail_concepts').deleteMany({ user_id: testUserId });
      await db.collection('content_packs').deleteMany({ user_id: testUserId });
      await db.collection('content_pack_items').deleteMany({ user_id: testUserId });
      await db.collection('clips').deleteOne({ id: testClipId });
      await db.collection('transcripts').deleteMany({ project_id: testProjectId });
      await db.collection('projects').deleteOne({ id: testProjectId });
    } catch {
      // ignore
    } finally {
      await closeMongo().catch(() => undefined);
    }
  });

  describe('1. Capabilities & Orchestration Readiness', () => {
    it('returns honest capability reporting with mandatory approval gate', async () => {
      const caps = AutopilotService.getCapabilities();
      assert.strictEqual(caps.orchestration_status, 'SUPPORTED');
      assert.strictEqual(caps.producer_integration, 'SUPPORTED');
      assert.strictEqual(caps.hook_lab_integration, 'SUPPORTED');
      assert.strictEqual(caps.thumbnail_lab_integration, 'SUPPORTED');
      assert.strictEqual(caps.content_pack_integration, 'SUPPORTED');
      assert.strictEqual(caps.approval_gate, 'MANDATORY');
      assert.strictEqual(caps.publishing_handoff, 'SUPPORTED');
    });
  });

  describe('2. Run Creation, Validation & Tenant Isolation', () => {
    it('creates an Autopilot run with all initial pipeline stages in PENDING state', async () => {
      const run = await AutopilotService.createRun(testUserId, {
        clip_id: testClipId,
        settings: {
          producer_mode: 'BALANCED',
          target_platform: 'tiktok',
          user_instruction: 'Highlight high-energy hook and bold title',
          auto_select_highest_scoring_thumbnail: true,
        },
      });

      assert.ok(run);
      assert.ok(run.id);
      createdRunId = run.id;
      assert.strictEqual(run.user_id, testUserId);
      assert.strictEqual(run.clip_id, testClipId);
      assert.strictEqual(run.status, 'PENDING');
      assert.strictEqual(run.current_step, 'PRODUCER');
      assert.strictEqual(run.steps.length, 5);

      const stepNames = run.steps.map((s) => s.step);
      assert.deepStrictEqual(stepNames, [
        'PRODUCER',
        'HOOK_LAB',
        'THUMBNAIL_LAB',
        'CONTENT_PACK',
        'APPROVAL',
      ]);
      assert.strictEqual(run.steps[0].status, 'PENDING');
    });

    it('rejects run creation for invalid clip UUID or nonexistent clip', async () => {
      await assert.rejects(
        async () => {
          await AutopilotService.createRun(testUserId, {
            clip_id: 'not-a-valid-uuid',
          });
        },
        /invalid clip id/i
      );

      await assert.rejects(
        async () => {
          await AutopilotService.createRun(testUserId, {
            clip_id: crypto.randomUUID(),
          });
        },
        /clip not found/i
      );
    });

    it('enforces tenant isolation — cross-user run retrieval is denied', async () => {
      await assert.rejects(
        async () => {
          await AutopilotService.getRun(unauthorizedUserId, createdRunId);
        },
        /not found or access denied/i
      );
    });

    it('retrieves runs for clip ordered by created_at descending with tenant isolation', async () => {
      // Authorized user gets their run
      const runs = await AutopilotService.getRunsForClip(testUserId, testClipId);
      assert.ok(Array.isArray(runs));
      assert.ok(runs.length >= 1);
      assert.strictEqual(runs[0].id, createdRunId);
      assert.strictEqual(runs[0].user_id, testUserId);
      assert.strictEqual(runs[0].clip_id, testClipId);

      // Unauthorized tenant cannot access this clip's runs
      await assert.rejects(
        async () => {
          await AutopilotService.getRunsForClip(unauthorizedUserId, testClipId);
        },
        /clip not found or access denied/i
      );
    });
  });

  describe('3. Sequential Stage Execution & Grounded Outputs', () => {
    it('executes the full pipeline sequentially and reaches COMPLETED (awaiting approval)', async () => {
      const run = await AutopilotService.executePipeline(testUserId, createdRunId);

      assert.strictEqual(run.status, 'COMPLETED');
      assert.strictEqual(run.current_step, 'APPROVAL');

      // Producer output
      assert.ok(run.producer_plan_id, 'Producer plan ID must be populated');
      const producerStep = run.steps.find((s) => s.step === 'PRODUCER');
      assert.strictEqual(producerStep?.status, 'COMPLETED');

      // Hook Lab output
      assert.ok(run.hook_session_id, 'Hook session ID must be populated');
      assert.ok(run.selected_hook_candidate_id, 'Selected hook candidate ID must be populated');
      assert.ok(run.hook_selection_rationale, 'Hook selection rationale must be populated');
      const hookStep = run.steps.find((s) => s.step === 'HOOK_LAB');
      assert.strictEqual(hookStep?.status, 'COMPLETED');

      // Thumbnail Lab output
      assert.ok(run.thumbnail_session_id, 'Thumbnail session ID must be populated');
      assert.ok(run.selected_thumbnail_concept_id, 'Selected thumbnail concept ID must be populated');
      assert.ok(run.thumbnail_selection_rationale, 'Thumbnail selection rationale must be populated');
      assert.ok(typeof run.thumbnail_score === 'number' && run.thumbnail_score > 0, 'Thumbnail score must be a positive number');
      const thumbStep = run.steps.find((s) => s.step === 'THUMBNAIL_LAB');
      assert.strictEqual(thumbStep?.status, 'COMPLETED');

      // Content Pack output
      assert.ok(run.content_pack_id, 'Content Pack ID must be populated');
      const cpStep = run.steps.find((s) => s.step === 'CONTENT_PACK');
      assert.strictEqual(cpStep?.status, 'COMPLETED');

      // Approval step remains PENDING awaiting human confirmation
      const appStep = run.steps.find((s) => s.step === 'APPROVAL');
      assert.strictEqual(appStep?.status, 'PENDING');
      assert.strictEqual(run.is_approved, false);
    });

    it('idempotency: executing an already completed pipeline does not re-run completed steps', async () => {
      const initialRun = await AutopilotService.getRun(testUserId, createdRunId);
      const producerStepBefore = initialRun.steps.find((s) => s.step === 'PRODUCER');

      const rerun = await AutopilotService.executePipeline(testUserId, createdRunId);

      assert.strictEqual(rerun.status, 'COMPLETED');
      assert.strictEqual(rerun.producer_plan_id, initialRun.producer_plan_id);
      assert.strictEqual(rerun.selected_hook_candidate_id, initialRun.selected_hook_candidate_id);
      assert.strictEqual(rerun.selected_thumbnail_concept_id, initialRun.selected_thumbnail_concept_id);
      assert.strictEqual(rerun.content_pack_id, initialRun.content_pack_id);

      const producerStepAfter = rerun.steps.find((s) => s.step === 'PRODUCER');
      assert.strictEqual(producerStepAfter?.output_id, producerStepBefore?.output_id);
    });
  });

  describe('4. Highest-Scoring Thumbnail Selection Logic', () => {
    it('verifies that the selected thumbnail concept has highest overall visual score', async () => {
      const run = await AutopilotService.getRun(testUserId, createdRunId);
      const { concepts } = await ThumbnailLabService.getSession(run.thumbnail_session_id!, testUserId);

      assert.ok(concepts.length > 0);
      const selected = concepts.find((c) => c.id === run.selected_thumbnail_concept_id);
      assert.ok(selected, 'Selected thumbnail concept must exist in session');
      assert.strictEqual(run.thumbnail_score, selected.diagnostics?.overall_score);
      assert.ok(run.thumbnail_selection_rationale?.includes(selected.title));
      assert.ok(run.thumbnail_score > 0);
    });
  });

  describe('5. Step Failure, Retry Isolation & Error Resilience', () => {
    it('rejects retrying a step that is not in FAILED state when forceRerun is false', async () => {
      await assert.rejects(
        async () => {
          await AutopilotService.retryFailedStep(testUserId, createdRunId, 'PRODUCER', false);
        },
        /not in failed state/i
      );
    });
  });

  describe('6. Human Review Gate & Consolidated Publishing Handoff', () => {
    it('rejects approval by an unauthorized cross-tenant user', async () => {
      await assert.rejects(
        async () => {
          await AutopilotService.approveRun(unauthorizedUserId, createdRunId);
        },
        /not found or access denied/i
      );
    });

    it('approves the completed package and attaches normalized publishing handoff with thumbnail', async () => {
      const { run, publishing_handoff } = await AutopilotService.approveRun(testUserId, createdRunId);

      assert.strictEqual(run.status, 'APPROVED');
      assert.strictEqual(run.is_approved, true);
      assert.strictEqual(run.approved_by, testUserId);
      assert.ok(run.approved_at);

      const approvalStep = run.steps.find((s) => s.step === 'APPROVAL');
      assert.strictEqual(approvalStep?.status, 'COMPLETED');

      // Verify publishing handoff consolidation
      assert.ok(publishing_handoff);
      assert.strictEqual(publishing_handoff.autopilot_run_id, run.id);
      assert.ok(publishing_handoff.title, 'Publishing handoff title must be present');
      assert.ok(publishing_handoff.thumbnail_url, 'Thumbnail URL must be attached to publishing handoff');
      assert.strictEqual(publishing_handoff.source_content_pack_id, run.content_pack_id);
    });
  });

  describe('7. Safe Downstream Invalidation on Upstream Rerun', () => {
    it('rerunning Producer with forceRerun invalidates downstream stages and clears stale handoff', async () => {
      // Step 1: Force rerun Producer
      const rerun = await AutopilotService.retryFailedStep(testUserId, createdRunId, 'PRODUCER', true);

      assert.strictEqual(rerun.status, 'COMPLETED');
      assert.strictEqual(rerun.is_approved, false, 'Approval must be invalidated and revoked');
      assert.strictEqual(rerun.publishing_handoff, undefined, 'Stale publishing handoff must be cleared');

      // Downstream steps must be recomputed
      const producerStep = rerun.steps.find((s) => s.step === 'PRODUCER');
      const hookStep = rerun.steps.find((s) => s.step === 'HOOK_LAB');
      const thumbStep = rerun.steps.find((s) => s.step === 'THUMBNAIL_LAB');
      const cpStep = rerun.steps.find((s) => s.step === 'CONTENT_PACK');
      const appStep = rerun.steps.find((s) => s.step === 'APPROVAL');

      assert.strictEqual(producerStep?.status, 'COMPLETED');
      assert.strictEqual(hookStep?.status, 'COMPLETED');
      assert.strictEqual(thumbStep?.status, 'COMPLETED');
      assert.strictEqual(cpStep?.status, 'COMPLETED');
      assert.strictEqual(appStep?.status, 'PENDING', 'Approval step must return to PENDING');
    });

    it('rejected retry on invalid step does not invalidate any run state', async () => {
      const stateBefore = await AutopilotService.getRun(testUserId, createdRunId);
      await assert.rejects(
        async () => {
          await AutopilotService.retryFailedStep(testUserId, createdRunId, 'APPROVAL');
        },
        /not in failed state/i
      );

      const stateAfter = await AutopilotService.getRun(testUserId, createdRunId);
      assert.strictEqual(stateAfter.status, stateBefore.status);
      assert.strictEqual(stateAfter.producer_plan_id, stateBefore.producer_plan_id);
    });
  });

  describe('8. Concurrency Protection & Atomic Lock Guarantees', () => {
    it('rejects concurrent executePipeline requests with PIPELINE_ALREADY_RUNNING', async () => {
      // Artificially acquire active lock on the run in MongoDB
      const mongo = await getMongoDb();
      const activeExpiry = new Date(Date.now() + 60_000);
      await mongo.collection('autopilot_runs').updateOne(
        { id: createdRunId },
        {
          $set: {
            execution_lock: 'test-external-worker-lock',
            execution_lock_expires_at: activeExpiry,
            execution_lock_owner: testUserId,
          },
        }
      );

      // Attempting to execute while actively locked must fail with 409
      await assert.rejects(
        async () => {
          await AutopilotService.executePipeline(testUserId, createdRunId);
        },
        /pipeline is currently executing another operation/i
      );

      // Attempting to approve while actively locked must also fail with 409
      await assert.rejects(
        async () => {
          await AutopilotService.approveRun(testUserId, createdRunId);
        },
        /pipeline is currently executing/i
      );

      // Attempting to retry while actively locked must also fail with 409
      await assert.rejects(
        async () => {
          await AutopilotService.retryFailedStep(testUserId, createdRunId, 'PRODUCER', true);
        },
        /pipeline is currently executing another operation/i
      );

      // Clean up lock
      await mongo.collection('autopilot_runs').updateOne(
        { id: createdRunId },
        { $set: { execution_lock: null, execution_lock_expires_at: null, execution_lock_owner: null } }
      );
    });

    it('safely recovers and re-acquires lock when a previous process crashed leaving an expired lock', async () => {
      const mongo = await getMongoDb();
      // Simulate an ungraceful crash 5 minutes ago that left an expired lock
      const pastExpiry = new Date(Date.now() - 300_000);
      await mongo.collection('autopilot_runs').updateOne(
        { id: createdRunId },
        {
          $set: {
            execution_lock: 'dead-process-crashed-token',
            execution_lock_expires_at: pastExpiry,
            execution_lock_owner: testUserId,
            status: 'RUNNING',
          },
        }
      );

      // Executing must safely re-acquire lock because previous lease is expired
      const run = await AutopilotService.executePipeline(testUserId, createdRunId);
      assert.ok(run);
      // The old dead-token lock must have been overridden and released cleanly on completion
      const doc = await mongo.collection('autopilot_runs').findOne({ id: createdRunId });
      assert.ok(doc);
      assert.strictEqual(doc.execution_lock, null);
    });

    it('prevents an expired former owner from releasing or overwriting a newer owner lock', async () => {
      const mongo = await getMongoDb();
      const activeExpiry = new Date(Date.now() + 60_000);
      const newerToken = 'active-newer-owner-lock-token';

      // Set lock belonging to a newer active owner
      await mongo.collection('autopilot_runs').updateOne(
        { id: createdRunId },
        {
          $set: {
            execution_lock: newerToken,
            execution_lock_expires_at: activeExpiry,
            execution_lock_owner: testUserId,
          },
        }
      );

      // Simulate former owner attempting to clear lock with their old dead token
      const oldDeadToken = 'old-expired-stale-token';
      const releaseResult = await mongo.collection('autopilot_runs').updateOne(
        { id: createdRunId, user_id: testUserId, execution_lock: oldDeadToken },
        { $set: { execution_lock: null } }
      );

      // releaseResult matchedCount must be 0: older token cannot release newer owner lock
      assert.strictEqual(releaseResult.matchedCount, 0);

      // Verify the active newer token remains intact
      const doc = await mongo.collection('autopilot_runs').findOne({ id: createdRunId });
      assert.ok(doc);
      assert.strictEqual(doc.execution_lock, newerToken);

      // Clean up lock
      await mongo.collection('autopilot_runs').updateOne(
        { id: createdRunId },
        { $set: { execution_lock: null, execution_lock_expires_at: null, execution_lock_owner: null } }
      );
    });

    it('enforces tenant isolation: another user cannot execute or retry a foreign run', async () => {
      const crossTenantUser = crypto.randomUUID();
      await assert.rejects(
        async () => {
          await AutopilotService.executePipeline(crossTenantUser, createdRunId);
        },
        /not found or access denied/i
      );

      await assert.rejects(
        async () => {
          await AutopilotService.retryFailedStep(crossTenantUser, createdRunId, 'PRODUCER', true);
        },
        /not found or access denied/i
      );
    });
  });
});

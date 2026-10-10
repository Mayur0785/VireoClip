import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentWorkflowService } from '../services/workflow/contentWorkflowService.js';
import { AppError } from '../types/index.js';

describe('Phase 36 — Vireo Content Workflow Automation Tests', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const clip1Id = crypto.randomUUID();
  const clip2Id = crypto.randomUUID();

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

    // Seed test project and clips
    await ownerContext.run(userA, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userA,
        title: 'Workflow Automation Test Project',
        video_status: 'completed',
        source_type: 'upload',
      });

      await dataRepository.from('clips').insert({
        id: clip1Id,
        user_id: userA,
        project_id: projectId,
        title: 'Workflow Test Clip Alpha',
        start_seconds: 0,
        end_seconds: 15,
        duration_seconds: 15,
        status: 'ready',
      });

      await dataRepository.from('clips').insert({
        id: clip2Id,
        user_id: userA,
        project_id: projectId,
        title: 'Workflow Test Clip Beta',
        start_seconds: 15,
        end_seconds: 30,
        duration_seconds: 15,
        status: 'draft',
      });
    });
  });

  after(async () => {
    // Cleanup test artifacts
    const db = await getMongoDb();
    await db.collection('content_workflows').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('clips').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('projects').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('published_posts').deleteMany({ user_id: { $in: [userA, userB] } });
  });

  it('1. Clip Discovery & Auto-Initialization: syncs existing clips into workflow tracking', async () => {
    const listRes = await ContentWorkflowService.listWorkflows(userA);

    assert.ok(listRes.workflows.length >= 2, 'Must discover and track user clips');
    const item1 = listRes.workflows.find((w) => w.clip_id === clip1Id);
    assert.ok(item1, 'Must track clip1');
    assert.equal(item1?.current_state, 'IN_PREPARATION');
    assert.equal(item1?.artifacts.clip?.status, 'ready');
    assert.ok(item1?.checklist.length > 0, 'Must include readiness checklist');
  });

  it('2. Manual Workflow Creation: creates planned idea workflow with initial audit entry', async () => {
    const created = await ContentWorkflowService.createWorkflow(userA, {
      title: 'Viral Strategy Breakdown Hook Idea',
      project_id: projectId,
      notes: 'Initial concept drafted from brainstorm',
      tags: ['concept', 'short_form'],
    });

    assert.ok(created.id);
    assert.equal(created.title, 'Viral Strategy Breakdown Hook Idea');
    assert.equal(created.current_state, 'PLANNED');
    assert.equal(created.version, 1);
    assert.equal(created.audit_trail.length, 1);
    assert.equal(created.audit_trail[0].action, 'INITIALIZE');
    assert.equal(created.audit_trail[0].from_state, 'PLANNED');
  });

  it('3. Valid State Transition: moves planned workflow to in-preparation', async () => {
    const created = await ContentWorkflowService.createWorkflow(userA, {
      title: 'Valid Transition Workflow',
      project_id: projectId,
    });

    const transitioned = await ContentWorkflowService.transitionWorkflow(userA, created.id, 'IN_PREPARATION', {
      expectedVersion: created.version,
      notes: 'Starting asset preparation',
    });

    assert.equal(transitioned.current_state, 'IN_PREPARATION');
    assert.equal(transitioned.version, 2);
    assert.equal(transitioned.audit_trail.length, 2);
    assert.equal(transitioned.audit_trail[1].to_state, 'IN_PREPARATION');
  });

  it('4. Invalid State Transitions Rejected: prevents jumping steps in workflow graph', async () => {
    const created = await ContentWorkflowService.createWorkflow(userA, {
      title: 'Invalid Jump Workflow',
      project_id: projectId,
    });

    // Cannot jump from PLANNED directly to APPROVED
    await assert.rejects(
      async () => {
        await ContentWorkflowService.transitionWorkflow(userA, created.id, 'APPROVED');
      },
      (err: any) => {
        assert.equal(err.name, 'AppError');
        assert.equal(err.code, 'INVALID_WORKFLOW_TRANSITION');
        return true;
      }
    );

    // Cannot jump from PLANNED directly to PUBLISHED
    await assert.rejects(
      async () => {
        await ContentWorkflowService.transitionWorkflow(userA, created.id, 'PUBLISHED');
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_WORKFLOW_TRANSITION');
        return true;
      }
    );
  });

  it('5. Readiness Prerequisites Validation: rejects READY_FOR_REVIEW when no artifacts exist', async () => {
    // Create an empty workflow with no clip and no creative assets
    const created = await ContentWorkflowService.createWorkflow(userA, {
      title: 'Empty Workflow Without Assets',
      project_id: projectId,
      initial_state: 'IN_PREPARATION',
    });

    await assert.rejects(
      async () => {
        await ContentWorkflowService.transitionWorkflow(userA, created.id, 'READY_FOR_REVIEW');
      },
      (err: any) => {
        assert.equal(err.code, 'INSUFFICIENT_ARTIFACTS_FOR_REVIEW');
        return true;
      }
    );
  });

  it('6. Human Approval Gate: records explicit sign-off and transitions to APPROVED', async () => {
    // Work with the clip1 workflow which has ready clip video
    const listRes = await ContentWorkflowService.listWorkflows(userA);
    const clip1Workflow = listRes.workflows.find((w) => w.clip_id === clip1Id)!;

    // Transition IN_PREPARATION -> READY_FOR_REVIEW
    const readyWorkflow = await ContentWorkflowService.transitionWorkflow(userA, clip1Workflow.id, 'READY_FOR_REVIEW');
    assert.equal(readyWorkflow.current_state, 'READY_FOR_REVIEW');

    // Approve workflow via human approval gate
    const approved = await ContentWorkflowService.approveWorkflow(userA, clip1Workflow.id, 'Editor verified headlines and cut');

    assert.equal(approved.current_state, 'APPROVED');
    assert.equal(approved.approved_by, userA);
    assert.ok(approved.approved_at);
    assert.equal(approved.approval_notes, 'Editor verified headlines and cut');
    assert.ok(approved.audit_trail.some((a) => a.action === 'APPROVAL'));
  });

  it('7. Publishing Safeguard: rejects PUBLISHED when no verified publishing record exists', async () => {
    const listRes = await ContentWorkflowService.listWorkflows(userA);
    const approvedWorkflow = listRes.workflows.find((w) => w.current_state === 'APPROVED')!;

    // Cannot claim PUBLISHED when no actual record exists in published_posts
    await assert.rejects(
      async () => {
        await ContentWorkflowService.transitionWorkflow(userA, approvedWorkflow.id, 'PUBLISHED');
      },
      (err: any) => {
        assert.equal(err.code, 'PUBLISHING_RECORD_REQUIRED');
        return true;
      }
    );
  });

  it('8. Publishing Verification: transitions to PUBLISHED when valid published_posts record exists', async () => {
    const db = await getMongoDb();
    const listRes = await ContentWorkflowService.listWorkflows(userA);
    const approvedWorkflow = listRes.workflows.find((w) => w.current_state === 'APPROVED')!;

    // Seed verified published post in published_posts
    const postId = crypto.randomUUID();
    await ownerContext.run(userA, async () => {
      await dataRepository.from('published_posts').insert({
        id: postId,
        user_id: userA,
        clip_id: approvedWorkflow.clip_id,
        project_id: projectId,
        provider: 'youtube',
        status: 'published',
        publish_type: 'now',
        request_fingerprint: crypto.randomUUID(),
      });
    });

    const published = await ContentWorkflowService.transitionWorkflow(userA, approvedWorkflow.id, 'PUBLISHED');

    assert.equal(published.current_state, 'PUBLISHED');
    assert.equal(published.artifacts.publishing?.status, 'published');
    assert.ok(published.audit_trail.some((a) => a.action === 'PUBLISH_VERIFIED'));
  });

  it('9. Concurrency & Idempotency: rejects stale version (409) and handles duplicate transition idempotently', async () => {
    const created = await ContentWorkflowService.createWorkflow(userA, {
      title: 'Concurrency Test Workflow',
      project_id: projectId,
    });

    // Idempotency: transitioning to existing current state returns without error
    const same = await ContentWorkflowService.transitionWorkflow(userA, created.id, 'PLANNED');
    assert.equal(same.current_state, 'PLANNED');
    assert.equal(same.version, created.version);

    // Concurrency conflict: passing stale expectedVersion throws 409
    await assert.rejects(
      async () => {
        await ContentWorkflowService.transitionWorkflow(userA, created.id, 'IN_PREPARATION', {
          expectedVersion: 999, // stale version
        });
      },
      (err: any) => {
        assert.equal(err.code, 'CONCURRENT_MODIFICATION_CONFLICT');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  it('10. Revision Request Workflow: returns workflow to preparation with required reason', async () => {
    const reviewWorkflow = await ContentWorkflowService.createWorkflow(userA, {
      title: 'Workflow for Review and Revision',
      project_id: projectId,
      initial_state: 'READY_FOR_REVIEW',
    });

    // Rejecting revisions without a reason throws 400
    await assert.rejects(
      async () => {
        await ContentWorkflowService.requestRevisions(userA, reviewWorkflow.id, '');
      },
      (err: any) => {
        assert.equal(err.code, 'REASON_REQUIRED');
        return true;
      }
    );

    // Request revisions with valid reason
    const revised = await ContentWorkflowService.requestRevisions(userA, reviewWorkflow.id, 'Hook needs stronger curiosity gap');
    assert.equal(revised.current_state, 'IN_PREPARATION');
    assert.ok(revised.audit_trail.some((a) => a.action === 'REVISION_REQUEST' && a.notes?.includes('Hook needs stronger curiosity gap')));
  });

  it('11. Tenant Isolation: prevents User B from viewing or transitioning User A workflows', async () => {
    const listRes = await ContentWorkflowService.listWorkflows(userA);
    const userAWorkflow = listRes.workflows[0];

    // User B cannot get User A's workflow
    await assert.rejects(
      async () => {
        await ContentWorkflowService.getWorkflow(userB, userAWorkflow.id);
      },
      (err: any) => {
        assert.equal(err.code, 'WORKFLOW_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // User B cannot transition User A's workflow
    await assert.rejects(
      async () => {
        await ContentWorkflowService.transitionWorkflow(userB, userAWorkflow.id, 'IN_PREPARATION');
      },
      (err: any) => {
        assert.equal(err.code, 'WORKFLOW_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // User B listing only sees User B's workflows
    const userBList = await ContentWorkflowService.listWorkflows(userB);
    assert.ok(!userBList.workflows.some((w) => w.id === userAWorkflow.id));
  });

  it('12. Invariant Preservation: protected QA experiment and Autopilot run remain untouched', async () => {
    const db = await getMongoDb();

    // QA experiment dc8afd49-d719-4f8f-b2cd-bcd50db646a2 must remain in DRAFT
    const qaExp = await db.collection('ab_experiments').findOne({ id: 'dc8afd49-d719-4f8f-b2cd-bcd50db646a2' });
    if (qaExp) {
      assert.equal(qaExp.status, 'DRAFT', 'QA experiment must remain in DRAFT status');
    }

    // Autopilot run 3df13277-1999-441d-8b1b-b2ac370c1ec1 must remain in COMPLETED
    const autoRun = await db.collection('autopilot_runs').findOne({ id: '3df13277-1999-441d-8b1b-b2ac370c1ec1' });
    if (autoRun) {
      assert.equal(autoRun.status, 'COMPLETED', 'Autopilot run must remain in COMPLETED status');
    }
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});


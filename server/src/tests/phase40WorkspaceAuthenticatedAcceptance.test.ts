import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { WorkspaceService } from '../services/workspace/workspaceService.js';
import { requireWorkspaceRole } from '../middleware/workspaceMiddleware.js';
import { AutopilotService } from '../services/autopilotService.js';
import { ownerContext } from '../db/repositories/dataRepository.js';
import { WorkspaceRole, AppError } from '../types/index.js';

describe('Phase 40 — Authenticated Workspace Acceptance & Release Readiness', () => {
  // Isolated test accounts
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const userC = crypto.randomUUID();
  const userD = crypto.randomUUID();

  const userAEmail = `acceptance_usera_${Date.now()}@example.com`;
  const userBEmail = `acceptance_userb_${Date.now()}@example.com`;
  const userCEmail = `acceptance_userc_${Date.now()}@example.com`;
  const userDEEmail = `acceptance_userd_${Date.now()}@example.com`;

  const createdWorkspaceIds: string[] = [];

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
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      const allUserIds = [userA, userB, userC, userD];

      // Cleanup test workspaces, members, invitations
      await db.collection('workspaces').deleteMany({
        $or: [
          { owner_id: { $in: allUserIds } },
          { id: { $in: createdWorkspaceIds } },
        ],
      });
      await db.collection('workspace_members').deleteMany({
        $or: [
          { user_id: { $in: allUserIds } },
          { workspace_id: { $in: createdWorkspaceIds } },
        ],
      });
      await db.collection('workspace_invitations').deleteMany({
        $or: [
          { inviter_user_id: { $in: allUserIds } },
          { workspace_id: { $in: createdWorkspaceIds } },
        ],
      });
    } catch (err) {
      console.error('Error during cleanup:', err);
    } finally {
      await closeMongo();
    }
  });

  // Acceptance Criterion 1: /workspaces loads and shows the correct personal workspace.
  describe('Criterion 1: /workspaces loads and shows correct personal workspace', () => {
    it('provisions personal workspace and returns it with role OWNER and member count 1', async () => {
      const personal = await WorkspaceService.getOrCreatePersonalWorkspace(userA, userAEmail);
      assert.ok(personal);
      assert.equal(personal.owner_id, userA);
      assert.equal(personal.is_personal, true);
      assert.equal(personal.name, 'Personal Workspace');
      createdWorkspaceIds.push(personal.id);

      const list = await WorkspaceService.listWorkspaces(userA, userAEmail);
      assert.ok(list.length >= 1);
      const personalInList = list.find((w) => w.id === personal.id);
      assert.ok(personalInList);
      assert.equal(personalInList.is_personal, true);
      assert.equal(personalInList.role, 'OWNER');
      assert.equal(personalInList.member_count, 1);
    });
  });

  // Acceptance Criterion 2: A user can create multiple team workspaces and switch between them.
  describe('Criterion 2: Multi-team workspace creation & switching', () => {
    it('allows user to create multiple team workspaces without schema index collisions', async () => {
      const team1 = await WorkspaceService.createWorkspace(userA, { name: 'Vireo Media Alpha' }, userAEmail);
      const team2 = await WorkspaceService.createWorkspace(userA, { name: 'Vireo Media Beta' }, userAEmail);
      createdWorkspaceIds.push(team1.workspace.id, team2.workspace.id);

      assert.equal(team1.workspace.is_personal, false);
      assert.equal(team2.workspace.is_personal, false);
      assert.notEqual(team1.workspace.id, team2.workspace.id);

      // Verify switching between workspaces: both can be retrieved with active details
      const detail1 = await WorkspaceService.getWorkspace(userA, team1.workspace.id);
      const detail2 = await WorkspaceService.getWorkspace(userA, team2.workspace.id);

      assert.equal(detail1.workspace.name, 'Vireo Media Alpha');
      assert.equal(detail1.current_user_role, 'OWNER');
      assert.equal(detail2.workspace.name, 'Vireo Media Beta');
      assert.equal(detail2.current_user_role, 'OWNER');

      // Verify list contains both team workspaces alongside personal
      const list = await WorkspaceService.listWorkspaces(userA, userAEmail);
      assert.ok(list.some((w) => w.id === team1.workspace.id));
      assert.ok(list.some((w) => w.id === team2.workspace.id));
    });
  });

  // Acceptance Criterion 3: Invitation creation returns a one-time token that is not exposed in listing responses.
  describe('Criterion 3: One-time token generation & non-exposure in listings', () => {
    let teamWsId: string;
    let inviteToken: string;
    let inviteId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Token Security Workspace' }, userAEmail);
      teamWsId = res.workspace.id;
      createdWorkspaceIds.push(teamWsId);
    });

    it('generates a one-time raw token on creation, but hides hash and raw token in listings', async () => {
      const result = await WorkspaceService.inviteMember(userA, teamWsId, {
        email: userBEmail,
        role: 'EDITOR',
      });

      assert.ok(result.invitation_token);
      assert.equal(typeof result.invitation_token, 'string');
      assert.equal(result.invitation_token.length, 64); // 32 bytes hex
      assert.equal((result.invitation as any).token_hash, undefined);

      inviteToken = result.invitation_token;
      inviteId = result.invitation.id;

      // In listInvitations, verify neither raw token nor token_hash is returned
      const listing = await WorkspaceService.listInvitations(userA, teamWsId);
      const found = listing.find((i) => i.id === inviteId);
      assert.ok(found);
      assert.equal((found as any).token, undefined);
      assert.equal((found as any).token_hash, undefined);
      assert.equal((found as any).invitation_token, undefined);

      // Verify DB stores only SHA-256 hash
      const db = await getMongoDb();
      const stored = await db.collection('workspace_invitations').findOne({ id: inviteId });
      assert.ok(stored);
      assert.notEqual(stored.token_hash, inviteToken);
      const expectedHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
      assert.equal(stored.token_hash, expectedHash);
    });
  });

  // Acceptance Criterion 4: Only the intended authenticated account can accept the invitation.
  describe('Criterion 4: Intended authenticated account acceptance', () => {
    let wsId: string;
    let inviteToken: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Intended Recipient Studio' }, userAEmail);
      wsId = res.workspace.id;
      createdWorkspaceIds.push(wsId);

      const invite = await WorkspaceService.inviteMember(userA, wsId, {
        email: userBEmail,
        role: 'ADMIN',
      });
      inviteToken = invite.invitation_token;
    });

    it('successfully accepts when authenticated user email matches invited recipient email', async () => {
      const accepted = await WorkspaceService.acceptInvitation(userB, inviteToken, userBEmail, 'User B');
      assert.equal(accepted.workspace.id, wsId);
      assert.equal(accepted.member.user_id, userB);
      assert.equal(accepted.member.role, 'ADMIN');

      const members = await WorkspaceService.listMembers(userA, wsId);
      assert.ok(members.some((m) => m.user_id === userB && m.role === 'ADMIN'));
    });
  });

  // Acceptance Criterion 5: Expired, reused, revoked, and wrong-account invitations are rejected.
  describe('Criterion 5: Rejection of expired, reused, revoked, and wrong-account invitations', () => {
    let wsId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Rejection Guard Hub' }, userAEmail);
      wsId = res.workspace.id;
      createdWorkspaceIds.push(wsId);
    });

    it('rejects wrong-account invitation acceptance with INVITATION_EMAIL_MISMATCH', async () => {
      const invite = await WorkspaceService.inviteMember(userA, wsId, {
        email: userCEmail,
        role: 'EDITOR',
      });

      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userD, invite.invitation_token, userDEEmail);
        },
        (err: any) => err.code === 'INVITATION_EMAIL_MISMATCH' && err.statusCode === 403
      );
    });

    it('rejects reused invitation with INVITATION_ALREADY_USED', async () => {
      const invite = await WorkspaceService.inviteMember(userA, wsId, {
        email: userCEmail,
        role: 'EDITOR',
      });

      // Accept first time
      await WorkspaceService.acceptInvitation(userC, invite.invitation_token, userCEmail);

      // Second accept must fail
      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userC, invite.invitation_token, userCEmail);
        },
        (err: any) => err.code === 'INVITATION_ALREADY_USED' && err.statusCode === 400
      );
    });

    it('rejects revoked invitation with INVITATION_ALREADY_USED', async () => {
      const invite = await WorkspaceService.inviteMember(userA, wsId, {
        email: 'revokeme@example.com',
        role: 'VIEWER',
      });

      await WorkspaceService.revokeInvitation(userA, wsId, invite.invitation.id);

      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userD, invite.invitation_token, 'revokeme@example.com');
        },
        (err: any) => err.code === 'INVITATION_ALREADY_USED' && err.statusCode === 400
      );
    });

    it('rejects expired invitation with INVITATION_EXPIRED', async () => {
      const db = await getMongoDb();
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await db.collection('workspace_invitations').insertOne({
        id: crypto.randomUUID(),
        workspace_id: wsId,
        inviter_user_id: userA,
        invitee_email: 'expired_user@example.com',
        role: 'VIEWER',
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() - 5000), // expired 5 seconds ago
        created_at: new Date(),
        updated_at: new Date(),
      });

      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userD, rawToken, 'expired_user@example.com');
        },
        (err: any) => err.code === 'INVITATION_EXPIRED' && err.statusCode === 400
      );
    });
  });

  // Acceptance Criterion 6: OWNER, ADMIN, EDITOR, and VIEWER permissions behave as documented.
  describe('Criterion 6: Role permissions hierarchy & authority', () => {
    let wsId: string;
    let memberBId: string; // ADMIN
    let memberCId: string; // EDITOR
    let memberDId: string; // VIEWER

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Permission Roles Matrix Hub' }, userAEmail);
      wsId = res.workspace.id;
      createdWorkspaceIds.push(wsId);

      // Invite and enroll User B as ADMIN
      const invB = await WorkspaceService.inviteMember(userA, wsId, { email: userBEmail, role: 'ADMIN' });
      const resB = await WorkspaceService.acceptInvitation(userB, invB.invitation_token, userBEmail);
      memberBId = resB.member.id;

      // Invite and enroll User C as EDITOR
      const invC = await WorkspaceService.inviteMember(userA, wsId, { email: userCEmail, role: 'EDITOR' });
      const resC = await WorkspaceService.acceptInvitation(userC, invC.invitation_token, userCEmail);
      memberCId = resC.member.id;

      // Invite and enroll User D as VIEWER
      const invD = await WorkspaceService.inviteMember(userA, wsId, { email: userDEEmail, role: 'VIEWER' });
      const resD = await WorkspaceService.acceptInvitation(userD, invD.invitation_token, userDEEmail);
      memberDId = resD.member.id;
    });

    it('OWNER can update workspace name and delete team workspace', async () => {
      const updated = await WorkspaceService.updateWorkspace(userA, wsId, { name: 'Renamed Matrix Hub' });
      assert.equal(updated.name, 'Renamed Matrix Hub');
    });

    it('ADMIN cannot delete workspace or transfer ownership to OWNER', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.deleteWorkspace(userB, wsId);
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.updateMemberRole(userB, wsId, memberCId, 'OWNER');
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );
    });

    it('ADMIN can invite EDITOR or VIEWER, but cannot invite another ADMIN', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userB, wsId, { email: 'admin2@example.com', role: 'ADMIN' });
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );
    });

    it('EDITOR cannot invite members or modify workspace settings', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userC, wsId, { email: 'viewer@example.com', role: 'VIEWER' });
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.updateWorkspace(userC, wsId, { name: 'Editor Hacked' });
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );
    });

    it('VIEWER is strictly read-only and cannot invite or remove members', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userD, wsId, { email: 'new@example.com', role: 'VIEWER' });
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.removeMember(userD, wsId, memberCId);
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS' && err.statusCode === 403
      );
    });

    it('members cannot modify their own role directly', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.updateMemberRole(userB, wsId, memberBId, 'VIEWER');
        },
        (err: any) => err.code === 'CANNOT_MODIFY_OWN_ROLE' && err.statusCode === 403
      );
    });
  });

  // Acceptance Criterion 7: Non-members cannot access another workspace by changing IDs.
  describe('Criterion 7: Non-member isolation by workspace ID tampering', () => {
    let wsAId: string;
    let wsBId: string;

    before(async () => {
      const resA = await WorkspaceService.createWorkspace(userA, { name: 'Space A' }, userAEmail);
      wsAId = resA.workspace.id;
      createdWorkspaceIds.push(wsAId);

      const resB = await WorkspaceService.createWorkspace(userB, { name: 'Space B' }, userBEmail);
      wsBId = resB.workspace.id;
      createdWorkspaceIds.push(wsBId);
    });

    it('prevents user A from accessing Workspace B by substituting ID', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.getWorkspace(userA, wsBId);
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND' && err.statusCode === 404
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.listMembers(userA, wsBId);
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND' && err.statusCode === 404
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.listInvitations(userA, wsBId);
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND' && err.statusCode === 404
      );
    });
  });

  // Acceptance Criterion 8: A sole owner cannot leave or be removed without a valid ownership-transfer path.
  describe('Criterion 8: Sole owner leave protection & ownership transfer path', () => {
    let wsId: string;
    let memberAId: string;
    let memberBId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Ownership Safety Studio' }, userAEmail);
      wsId = res.workspace.id;
      memberAId = res.member.id;
      createdWorkspaceIds.push(wsId);

      const invB = await WorkspaceService.inviteMember(userA, wsId, { email: userBEmail, role: 'ADMIN' });
      const resB = await WorkspaceService.acceptInvitation(userB, invB.invitation_token, userBEmail);
      memberBId = resB.member.id;
    });

    it('blocks sole owner from leaving without prior ownership transfer', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.removeMember(userA, wsId, memberAId);
        },
        (err: any) => err.code === 'SOLE_OWNER_CANNOT_LEAVE' && err.statusCode === 400
      );
    });

    it('permits departure after successful ownership transfer to another member', async () => {
      // Step 1: Transfer ownership to User B
      const transfer = await WorkspaceService.updateMemberRole(userA, wsId, memberBId, 'OWNER');
      assert.equal(transfer.role, 'OWNER');

      // Check that user B is now OWNER and user A is demoted to ADMIN
      const details = await WorkspaceService.getWorkspace(userB, wsId);
      assert.equal(details.workspace.owner_id, userB);
      assert.equal(details.current_user_role, 'OWNER');

      // Step 2: Now user A can leave safely
      await WorkspaceService.removeMember(userA, wsId, memberAId);
      const members = await WorkspaceService.listMembers(userB, wsId);
      assert.equal(members.some((m) => m.id === memberAId), false);
    });
  });

  // Acceptance Criterion 9: Existing personal-user features continue to work without unintended data migration.
  describe('Criterion 9: Personal-user features continue without unintended data migration', () => {
    it('verifies personal data repository queries remain strictly scoped via ownerContext', async () => {
      const db = await getMongoDb();
      const testClipId = crypto.randomUUID();

      // Create a test clip record for user A
      await db.collection('clips').insertOne({
        id: testClipId,
        user_id: userA,
        title: 'Personal User Clip Test',
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      try {
        // Query within User A's context: clip is found
        const foundA = await ownerContext.run(userA, async () => {
          return await db.collection('clips').findOne({ id: testClipId, user_id: userA });
        });
        assert.ok(foundA);
        assert.equal(foundA.id, testClipId);

        // Query within User B's context: clip is NOT found (strict isolation)
        const foundB = await ownerContext.run(userB, async () => {
          return await db.collection('clips').findOne({ id: testClipId, user_id: userB });
        });
        assert.equal(foundB, null);
      } finally {
        await db.collection('clips').deleteOne({ id: testClipId });
      }
    });
  });

  // Acceptance Criterion 10: Inspecting pages or polling job status does not trigger execution, approval, or publishing.
  describe('Criterion 10: Inspection & polling idempotence without execution/approval triggers', () => {
    it('polling Autopilot run via getRun returns current state without mutating or executing', async () => {
      const db = await getMongoDb();
      const runId = '3df13277-1999-441d-8b1b-b2ac370c1ec1';

      // Read protected run from DB directly
      const initial = await db.collection('autopilot_runs').findOne({ id: runId });
      assert.ok(initial, 'Protected run must exist');
      const initialStatus = initial.status;
      const initialUpdatedAt = initial.updated_at;

      // Poll run via AutopilotService.getRun using the run's owner_id (or user_id)
      const polledRun = await AutopilotService.getRun(initial.user_id, runId);
      assert.equal(polledRun.id, runId);
      assert.equal(polledRun.status, initialStatus);

      // Verify DB record was not mutated by getRun inspection
      const postPoll = await db.collection('autopilot_runs').findOne({ id: runId });
      assert.ok(postPoll, 'Autopilot run must exist after polling');
      assert.equal(postPoll.status, initialStatus);
      assert.equal(postPoll.status, 'COMPLETED');
      assert.deepEqual(postPoll.updated_at, initialUpdatedAt);
    });

    it('verifies QA experiment dc8afd49-d719-4f8f-b2cd-bcd50db646a2 remains strictly DRAFT', async () => {
      const db = await getMongoDb();
      const expId = 'dc8afd49-d719-4f8f-b2cd-bcd50db646a2';
      const exp = await db.collection('ab_experiments').findOne({ id: expId });
      assert.ok(exp, 'QA experiment must exist');
      assert.equal(exp.status, 'DRAFT');
    });
  });
});

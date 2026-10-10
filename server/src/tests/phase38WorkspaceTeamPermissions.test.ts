import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { WorkspaceService } from '../services/workspace/workspaceService.js';
import { requireWorkspaceRole } from '../middleware/workspaceMiddleware.js';
import { WorkspaceRole, AppError } from '../types/index.js';

describe('Phase 38 — Workspace & Team Permissions Test Suite', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const userC = crypto.randomUUID();
  const userD = crypto.randomUUID();
  const userE = crypto.randomUUID();

  const userAEmail = 'usera@example.com';
  const userBEmail = 'userb@example.com';
  const userCEmail = 'userc@example.com';
  const userDEmail = 'userd@example.com';

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
      const allUserIds = [userA, userB, userC, userD, userE];
      
      // Clean up workspaces, members, invitations created for test users
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

  describe('1. Personal Workspace Auto-Provisioning & Compatibility', () => {
    it('provisions a personal workspace on first request for single-user backward compatibility', async () => {
      const personal = await WorkspaceService.getOrCreatePersonalWorkspace(userA, userAEmail);
      assert.ok(personal);
      assert.equal(personal.owner_id, userA);
      assert.equal(personal.is_personal, true);
      assert.equal(personal.name, 'Personal Workspace');
      createdWorkspaceIds.push(personal.id);

      const db = await getMongoDb();
      const member = await db.collection('workspace_members').findOne({
        workspace_id: personal.id,
        user_id: userA,
      });
      assert.ok(member);
      assert.equal(member.role, 'OWNER');
    });

    it('returns the same personal workspace on subsequent calls without duplicating', async () => {
      const personal1 = await WorkspaceService.getOrCreatePersonalWorkspace(userA, userAEmail);
      const personal2 = await WorkspaceService.getOrCreatePersonalWorkspace(userA, userAEmail);
      assert.equal(personal1.id, personal2.id);

      const db = await getMongoDb();
      const count = await db.collection('workspaces').countDocuments({
        owner_id: userA,
        is_personal: true,
      });
      assert.equal(count, 1);
    });

    it('lists personal workspace when user requests workspace list', async () => {
      const list = await WorkspaceService.listWorkspaces(userA, userAEmail);
      assert.ok(list.length >= 1);
      const personal = list.find((ws) => ws.is_personal);
      assert.ok(personal);
      assert.equal(personal.role, 'OWNER');
      assert.equal(personal.member_count, 1);
    });
  });

  describe('2. Collaborative Team Workspace Lifecycle', () => {
    let teamWorkspaceId: string;

    it('creates a new team workspace with creator assigned as OWNER', async () => {
      const result = await WorkspaceService.createWorkspace(userA, {
        name: 'Alpha Video Production Studio',
      }, userAEmail);

      assert.ok(result.workspace);
      assert.ok(result.member);
      assert.equal(result.workspace.name, 'Alpha Video Production Studio');
      assert.equal(result.workspace.is_personal, false);
      assert.equal(result.workspace.owner_id, userA);
      assert.equal(result.member.role, 'OWNER');
      assert.equal(result.member.user_id, userA);

      teamWorkspaceId = result.workspace.id;
      createdWorkspaceIds.push(teamWorkspaceId);
    });

    it('rejects invalid workspace names', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.createWorkspace(userA, { name: ' ' });
        },
        (err: any) => err.code === 'INVALID_WORKSPACE_NAME'
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.createWorkspace(userA, { name: 'A'.repeat(101) });
        },
        (err: any) => err.code === 'INVALID_WORKSPACE_NAME'
      );
    });

    it('retrieves workspace details and role for a member', async () => {
      const details = await WorkspaceService.getWorkspace(userA, teamWorkspaceId);
      assert.equal(details.workspace.id, teamWorkspaceId);
      assert.equal(details.current_user_role, 'OWNER');
      assert.equal(details.member_count, 1);
    });

    it('denies workspace details retrieval to a non-member', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.getWorkspace(userB, teamWorkspaceId);
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND' && err.statusCode === 404
      );
    });

    it('allows OWNER to update workspace name', async () => {
      const updated = await WorkspaceService.updateWorkspace(userA, teamWorkspaceId, {
        name: 'Alpha Studios Global',
      });
      assert.equal(updated.name, 'Alpha Studios Global');
    });

    it('prevents deleting personal workspace', async () => {
      const personal = await WorkspaceService.getOrCreatePersonalWorkspace(userA, userAEmail);
      await assert.rejects(
        async () => {
          await WorkspaceService.deleteWorkspace(userA, personal.id);
        },
        (err: any) => err.code === 'CANNOT_DELETE_PERSONAL_WORKSPACE'
      );
    });

    it('allows an owner to create multiple team workspaces without index conflicts', async () => {
      const secondTeam = await WorkspaceService.createWorkspace(userA, {
        name: 'Second Team Workspace',
      }, userAEmail);
      createdWorkspaceIds.push(secondTeam.workspace.id);

      const thirdTeam = await WorkspaceService.createWorkspace(userA, {
        name: 'Third Team Workspace',
      }, userAEmail);
      createdWorkspaceIds.push(thirdTeam.workspace.id);

      const list = await WorkspaceService.listWorkspaces(userA, userAEmail);
      const ownedTeams = list.filter((w) => w.owner_id === userA && !w.is_personal);
      assert.ok(ownedTeams.length >= 3);
    });

    it('database index prevents duplicate personal workspaces for the same owner', async () => {
      const db = await getMongoDb();
      await assert.rejects(
        async () => {
          await db.collection('workspaces').insertOne({
            id: crypto.randomUUID(),
            name: 'Duplicate Personal Workspace',
            owner_id: userA,
            is_personal: true,
            created_at: new Date(),
            updated_at: new Date(),
          } as any);
        },
        (err: any) => err.code === 11000
      );
    });

    it('database index prevents duplicate workspace membership for same (workspace_id, user_id)', async () => {
      const db = await getMongoDb();
      await assert.rejects(
        async () => {
          await db.collection('workspace_members').insertOne({
            id: crypto.randomUUID(),
            workspace_id: teamWorkspaceId,
            user_id: userA,
            role: 'EDITOR',
            joined_at: new Date(),
            updated_at: new Date(),
          } as any);
        },
        (err: any) => err.code === 11000
      );
    });

    it('database index prevents duplicate invitation token hashes', async () => {
      const db = await getMongoDb();
      const duplicateHash = crypto.createHash('sha256').update('shared-secret-test').digest('hex');

      await db.collection('workspace_invitations').insertOne({
        id: crypto.randomUUID(),
        workspace_id: teamWorkspaceId,
        inviter_user_id: userA,
        invitee_email: 'first@example.com',
        role: 'VIEWER',
        token_hash: duplicateHash,
        status: 'pending',
        expires_at: new Date(Date.now() + 100000),
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      await assert.rejects(
        async () => {
          await db.collection('workspace_invitations').insertOne({
            id: crypto.randomUUID(),
            workspace_id: teamWorkspaceId,
            inviter_user_id: userA,
            invitee_email: 'second@example.com',
            role: 'VIEWER',
            token_hash: duplicateHash,
            status: 'pending',
            expires_at: new Date(Date.now() + 100000),
            created_at: new Date(),
            updated_at: new Date(),
          } as any);
        },
        (err: any) => err.code === 11000
      );
    });
  });

  describe('3. Invitation Lifecycle & Cryptographic Token Security', () => {
    let wsId: string;
    let rawInviteToken: string;
    let inviteRecordId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Invite Lifecycle Hub' }, userAEmail);
      wsId = res.workspace.id;
      createdWorkspaceIds.push(wsId);
    });

    it('allows OWNER to invite an ADMIN with a secure cryptographic token', async () => {
      const inviteResult = await WorkspaceService.inviteMember(userA, wsId, {
        email: userBEmail,
        role: 'ADMIN',
      });

      assert.ok(inviteResult.invitation);
      assert.ok(inviteResult.invitation_token);
      assert.equal(inviteResult.invitation.invitee_email, userBEmail);
      assert.equal(inviteResult.invitation.role, 'ADMIN');
      assert.equal(inviteResult.invitation.status, 'pending');

      // Crucial: token_hash must NOT be present in safe invitation returned
      assert.equal((inviteResult.invitation as any).token_hash, undefined);

      rawInviteToken = inviteResult.invitation_token;
      inviteRecordId = inviteResult.invitation.id;

      // Verify DB stores only SHA-256 hash, not the raw token
      const db = await getMongoDb();
      const stored = await db.collection('workspace_invitations').findOne({ id: inviteRecordId });
      assert.ok(stored);
      assert.notEqual(stored.token_hash, rawInviteToken);

      const expectedHash = crypto.createHash('sha256').update(rawInviteToken).digest('hex');
      assert.equal(stored.token_hash, expectedHash);
    });

    it('never exposes token_hash in listInvitations', async () => {
      const invites = await WorkspaceService.listInvitations(userA, wsId);
      assert.ok(invites.length >= 1);
      const found = invites.find((i) => i.id === inviteRecordId);
      assert.ok(found);
      assert.equal((found as any).token_hash, undefined);
    });

    it('rejects inviting role OWNER', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userA, wsId, {
            email: 'fakeowner@example.com',
            role: 'OWNER',
          });
        },
        (err: any) => err.code === 'INVALID_ROLE'
      );
    });

    it('accepts valid invitation token and enrolls member with invited role', async () => {
      const acceptResult = await WorkspaceService.acceptInvitation(
        userB,
        rawInviteToken,
        userBEmail,
        'User B'
      );

      assert.equal(acceptResult.workspace.id, wsId);
      assert.equal(acceptResult.member.user_id, userB);
      assert.equal(acceptResult.member.role, 'ADMIN');

      // Verify member exists in DB
      const members = await WorkspaceService.listMembers(userA, wsId);
      const memberB = members.find((m) => m.user_id === userB);
      assert.ok(memberB);
      assert.equal(memberB.role, 'ADMIN');
    });

    it('enforces single-use token: repeated accept fails', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userB, rawInviteToken, userBEmail);
        },
        (err: any) => err.code === 'INVITATION_ALREADY_USED'
      );
    });

    it('prevents inviting an already enrolled member', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userA, wsId, {
            email: userBEmail,
            role: 'EDITOR',
          });
        },
        (err: any) => err.code === 'MEMBER_ALREADY_EXISTS'
      );
    });

    it('enforces role restrictions: ADMIN cannot invite another ADMIN', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userB, wsId, {
            email: userCEmail,
            role: 'ADMIN',
          });
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS'
      );
    });

    it('allows ADMIN to invite an EDITOR and VIEWER', async () => {
      const inviteC = await WorkspaceService.inviteMember(userB, wsId, {
        email: userCEmail,
        role: 'EDITOR',
      });
      assert.equal(inviteC.invitation.role, 'EDITOR');

      // Accept User C
      await WorkspaceService.acceptInvitation(userC, inviteC.invitation_token, userCEmail, 'User C');

      const members = await WorkspaceService.listMembers(userA, wsId);
      const memberC = members.find((m) => m.user_id === userC);
      assert.ok(memberC);
      assert.equal(memberC.role, 'EDITOR');
    });

    it('EDITOR cannot invite other members', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userC, wsId, {
            email: userDEmail,
            role: 'VIEWER',
          });
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS'
      );
    });

    it('handles declining an invitation', async () => {
      const inviteD = await WorkspaceService.inviteMember(userA, wsId, {
        email: userDEmail,
        role: 'VIEWER',
      });

      await WorkspaceService.declineInvitation(inviteD.invitation_token);

      // Attempting to accept a declined invitation must fail
      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userD, inviteD.invitation_token, userDEmail);
        },
        (err: any) => err.code === 'INVITATION_ALREADY_USED'
      );
    });

    it('rejects expired invitations', async () => {
      const db = await getMongoDb();
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiredId = crypto.randomUUID();

      await db.collection('workspace_invitations').insertOne({
        id: expiredId,
        workspace_id: wsId,
        inviter_user_id: userA,
        invitee_email: 'expired@example.com',
        role: 'VIEWER',
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() - 1000 * 60), // 1 min ago
        created_at: new Date(),
        updated_at: new Date(),
      });

      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userD, rawToken, 'expired@example.com');
        },
        (err: any) => err.code === 'INVITATION_EXPIRED'
      );
    });

    it('rejects invitation acceptance when email does not match recipient email', async () => {
      const inviteMismatch = await WorkspaceService.inviteMember(userA, wsId, {
        email: 'specific_person@example.com',
        role: 'VIEWER',
      });

      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(
            userD,
            inviteMismatch.invitation_token,
            'wrong_impostor@example.com'
          );
        },
        (err: any) => err.code === 'INVITATION_EMAIL_MISMATCH'
      );
    });

    it('allows revoking a pending invitation by ADMIN or OWNER', async () => {
      const inviteRevoke = await WorkspaceService.inviteMember(userA, wsId, {
        email: 'torevoke@example.com',
        role: 'VIEWER',
      });

      await WorkspaceService.revokeInvitation(userB, wsId, inviteRevoke.invitation.id);

      await assert.rejects(
        async () => {
          await WorkspaceService.acceptInvitation(userD, inviteRevoke.invitation_token, 'torevoke@example.com');
        },
        (err: any) => err.code === 'INVITATION_ALREADY_USED'
      );
    });

    it('concurrency test: simultaneous acceptance of the same token permits exactly one winner', async () => {
      const inviteConcurrent = await WorkspaceService.inviteMember(userA, wsId, {
        email: 'concurrent@example.com',
        role: 'VIEWER',
      });

      // 5 concurrent accept attempts with the same token
      const results = await Promise.allSettled(
        Array.from({ length: 5 }).map((_, i) =>
          WorkspaceService.acceptInvitation(crypto.randomUUID(), inviteConcurrent.invitation_token, 'concurrent@example.com', `User ${i}`)
        )
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent request must succeed');
      assert.equal(rejected.length, 4, 'Remaining concurrent requests must be rejected');

      for (const rej of rejected) {
        assert.equal((rej as PromiseRejectedResult).reason.code, 'INVITATION_ALREADY_USED');
      }
    });

    it('resolves invitee email from profile when userEmail is omitted in argument', async () => {
      const db = await getMongoDb();
      const testUserId = crypto.randomUUID();
      const testEmail = 'profile_backed@example.com';

      // Insert profile with email
      await db.collection('profiles').insertOne({
        id: crypto.randomUUID(),
        user_id: testUserId,
        email: testEmail,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const invite = await WorkspaceService.inviteMember(userA, wsId, {
        email: testEmail,
        role: 'VIEWER',
      });

      // Call acceptInvitation with userEmail omitted
      const accepted = await WorkspaceService.acceptInvitation(testUserId, invite.invitation_token);
      assert.equal(accepted.member.user_id, testUserId);

      // Clean up test profile
      await db.collection('profiles').deleteOne({ user_id: testUserId });
    });
  });

  describe('4. Role Hierarchy Management & Ownership Transfer', () => {
    let wsId: string;
    let memberBId: string;
    let memberCId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Role Hierarchy Suite' }, userAEmail);
      wsId = res.workspace.id;
      createdWorkspaceIds.push(wsId);

      // Invite user B as ADMIN
      const inviteB = await WorkspaceService.inviteMember(userA, wsId, { email: userBEmail, role: 'ADMIN' });
      const bRes = await WorkspaceService.acceptInvitation(userB, inviteB.invitation_token, userBEmail);
      memberBId = bRes.member.id;

      // Invite user C as VIEWER
      const inviteC = await WorkspaceService.inviteMember(userA, wsId, { email: userCEmail, role: 'VIEWER' });
      const cRes = await WorkspaceService.acceptInvitation(userC, inviteC.invitation_token, userCEmail);
      memberCId = cRes.member.id;
    });

    it('allows ADMIN to promote VIEWER to EDITOR', async () => {
      const updated = await WorkspaceService.updateMemberRole(userB, wsId, memberCId, 'EDITOR');
      assert.equal(updated.role, 'EDITOR');
    });

    it('prevents ADMIN from promoting member to ADMIN or OWNER', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.updateMemberRole(userB, wsId, memberCId, 'ADMIN');
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS'
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.updateMemberRole(userB, wsId, memberCId, 'OWNER');
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS'
      );
    });

    it('prevents ADMIN from modifying another ADMIN or OWNER', async () => {
      const members = await WorkspaceService.listMembers(userA, wsId);
      const ownerMember = members.find((m) => m.user_id === userA)!;

      await assert.rejects(
        async () => {
          await WorkspaceService.updateMemberRole(userB, wsId, ownerMember.id, 'VIEWER');
        },
        (err: any) => err.code === 'INSUFFICIENT_PERMISSIONS'
      );
    });

    it('prevents member from modifying their own role directly', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.updateMemberRole(userB, wsId, memberBId, 'VIEWER');
        },
        (err: any) => err.code === 'CANNOT_MODIFY_OWN_ROLE'
      );
    });

    it('allows OWNER to transfer workspace ownership to another member', async () => {
      const transferRes = await WorkspaceService.updateMemberRole(userA, wsId, memberBId, 'OWNER');
      assert.equal(transferRes.role, 'OWNER');

      // Check that user A has been demoted to ADMIN and user B is OWNER
      const details = await WorkspaceService.getWorkspace(userA, wsId);
      assert.equal(details.workspace.owner_id, userB);
      assert.equal(details.current_user_role, 'ADMIN');

      const detailsB = await WorkspaceService.getWorkspace(userB, wsId);
      assert.equal(detailsB.current_user_role, 'OWNER');
    });
  });

  describe('5. Member Removal & Sole Owner Departure Guards', () => {
    let wsId: string;
    let memberAId: string;
    let memberBId: string;
    let memberCId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Member Removal Test Hub' }, userAEmail);
      wsId = res.workspace.id;
      memberAId = res.member.id;
      createdWorkspaceIds.push(wsId);

      // Invite user B as ADMIN
      const inviteB = await WorkspaceService.inviteMember(userA, wsId, { email: userBEmail, role: 'ADMIN' });
      const bRes = await WorkspaceService.acceptInvitation(userB, inviteB.invitation_token, userBEmail);
      memberBId = bRes.member.id;

      // Invite user C as VIEWER
      const inviteC = await WorkspaceService.inviteMember(userA, wsId, { email: userCEmail, role: 'VIEWER' });
      const cRes = await WorkspaceService.acceptInvitation(userC, inviteC.invitation_token, userCEmail);
      memberCId = cRes.member.id;
    });

    it('prevents sole owner from leaving without transferring ownership', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.removeMember(userA, wsId, memberAId);
        },
        (err: any) => err.code === 'SOLE_OWNER_CANNOT_LEAVE'
      );
    });

    it('prevents ADMIN from removing OWNER', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.removeMember(userB, wsId, memberAId);
        },
        (err: any) => err.code === 'CANNOT_REMOVE_OWNER'
      );
    });

    it('allows ADMIN to remove VIEWER', async () => {
      await WorkspaceService.removeMember(userB, wsId, memberCId);

      const members = await WorkspaceService.listMembers(userA, wsId);
      assert.equal(members.some((m) => m.id === memberCId), false);
    });

    it('allows member to leave workspace voluntarily (self-removal)', async () => {
      await WorkspaceService.removeMember(userB, wsId, memberBId);

      const members = await WorkspaceService.listMembers(userA, wsId);
      assert.equal(members.some((m) => m.id === memberBId), false);
    });

    it('allows OWNER to delete the workspace and clean up all resources', async () => {
      await WorkspaceService.deleteWorkspace(userA, wsId);

      const db = await getMongoDb();
      const ws = await db.collection('workspaces').findOne({ id: wsId });
      assert.equal(ws, null);

      const members = await db.collection('workspace_members').find({ workspace_id: wsId }).toArray();
      assert.equal(members.length, 0);

      const invites = await db.collection('workspace_invitations').find({ workspace_id: wsId }).toArray();
      assert.equal(invites.length, 0);
    });
  });

  describe('6. Cross-Workspace Data Isolation & Multi-tenant Boundaries', () => {
    let wsAId: string;
    let wsBId: string;

    before(async () => {
      const resA = await WorkspaceService.createWorkspace(userA, { name: 'Tenant A Secure Space' }, userAEmail);
      wsAId = resA.workspace.id;
      createdWorkspaceIds.push(wsAId);

      const resB = await WorkspaceService.createWorkspace(userB, { name: 'Tenant B Secure Space' }, userBEmail);
      wsBId = resB.workspace.id;
      createdWorkspaceIds.push(wsBId);
    });

    it('prevents User A from viewing or modifying Workspace B', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.getWorkspace(userA, wsBId);
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND' && err.statusCode === 404
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.updateWorkspace(userA, wsBId, { name: 'Hacked Workspace B' });
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND' && err.statusCode === 404
      );
    });

    it('prevents User A from listing members or inviting users to Workspace B', async () => {
      await assert.rejects(
        async () => {
          await WorkspaceService.listMembers(userA, wsBId);
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND'
      );

      await assert.rejects(
        async () => {
          await WorkspaceService.inviteMember(userA, wsBId, {
            email: 'unauthorized@example.com',
            role: 'VIEWER',
          });
        },
        (err: any) => err.code === 'WORKSPACE_NOT_FOUND'
      );
    });
  });

  describe('7. Authorization Middleware requireWorkspaceRole', () => {
    let wsId: string;
    let memberCId: string;

    before(async () => {
      const res = await WorkspaceService.createWorkspace(userA, { name: 'Middleware Guarded Studio' }, userAEmail);
      wsId = res.workspace.id;
      createdWorkspaceIds.push(wsId);

      // User C as VIEWER
      const inviteC = await WorkspaceService.inviteMember(userA, wsId, { email: userCEmail, role: 'VIEWER' });
      const cRes = await WorkspaceService.acceptInvitation(userC, inviteC.invitation_token, userCEmail);
      memberCId = cRes.member.id;
    });

    it('permits request when user satisfies required role level', async () => {
      const middleware = requireWorkspaceRole('OWNER');
      const req: any = {
        user: { id: userA, email: userAEmail },
        params: { workspaceId: wsId },
        headers: {},
        query: {},
      };
      const res: any = {
        status: (code: number) => ({ json: (data: any) => { (res as any).statusCode = code; (res as any).body = data; } }),
      };

      let calledNext = false;
      await middleware(req, res, () => {
        calledNext = true;
      });

      assert.equal(calledNext, true);
      assert.equal(req.workspace.id, wsId);
      assert.equal(req.workspaceMember.role, 'OWNER');
    });

    it('denies request with 403 when user has insufficient role', async () => {
      const middleware = requireWorkspaceRole('EDITOR');
      let capturedStatus = 0;
      let capturedBody: any = null;

      const req: any = {
        user: { id: userC, email: userCEmail },
        params: { workspaceId: wsId },
        headers: {},
        query: {},
      };
      const res: any = {
        status: (code: number) => {
          capturedStatus = code;
          return {
            json: (data: any) => {
              capturedBody = data;
            },
          };
        },
      };

      let calledNext = false;
      await middleware(req, res, () => {
        calledNext = true;
      });

      assert.equal(calledNext, false);
      assert.equal(capturedStatus, 403);
      assert.equal(capturedBody?.code, 'INSUFFICIENT_PERMISSIONS');
    });

    it('denies request with 403 when user is not a member of the workspace', async () => {
      const middleware = requireWorkspaceRole('VIEWER');
      let capturedStatus = 0;
      let capturedBody: any = null;

      const req: any = {
        user: { id: userD, email: userDEmail },
        params: { workspaceId: wsId },
        headers: {},
        query: {},
      };
      const res: any = {
        status: (code: number) => {
          capturedStatus = code;
          return {
            json: (data: any) => {
              capturedBody = data;
            },
          };
        },
      };

      let calledNext = false;
      await middleware(req, res, () => {
        calledNext = true;
      });

      assert.equal(calledNext, false);
      assert.equal(capturedStatus, 403);
      assert.equal(capturedBody?.code, 'FORBIDDEN');
    });

    it('defaults to personal workspace when no workspaceId is supplied', async () => {
      const middleware = requireWorkspaceRole('OWNER');
      const req: any = {
        user: { id: userA, email: userAEmail },
        params: {},
        headers: {},
        query: {},
      };
      const res: any = {
        status: (code: number) => ({ json: (data: any) => {} }),
      };

      let calledNext = false;
      await middleware(req, res, () => {
        calledNext = true;
      });

      assert.equal(calledNext, true);
      assert.ok(req.workspace);
      assert.equal(req.workspace.is_personal, true);
      assert.equal(req.workspaceMember.role, 'OWNER');
    });

    it('rejects unauthenticated requests with 401 AUTH_REQUIRED', async () => {
      const middleware = requireWorkspaceRole('VIEWER');
      let capturedStatus = 0;
      let capturedBody: any = null;

      const req: any = {
        params: {},
        headers: {},
        query: {},
      };
      const res: any = {
        status: (code: number) => {
          capturedStatus = code;
          return { json: (data: any) => { capturedBody = data; } };
        },
      };

      let calledNext = false;
      await middleware(req, res, () => { calledNext = true; });

      assert.equal(calledNext, false);
      assert.equal(capturedStatus, 401);
      assert.equal(capturedBody?.code, 'AUTH_REQUIRED');
    });

    it('rejects malformed explicit workspace parameter with 400 and does NOT fall back to personal workspace', async () => {
      const middleware = requireWorkspaceRole('VIEWER');
      let capturedStatus = 0;
      let capturedBody: any = null;

      const req: any = {
        user: { id: userA, email: userAEmail },
        params: { workspaceId: 'not-a-valid-uuid' },
        headers: {},
        query: {},
      };
      const res: any = {
        status: (code: number) => {
          capturedStatus = code;
          return { json: (data: any) => { capturedBody = data; } };
        },
      };

      let calledNext = false;
      await middleware(req, res, () => { calledNext = true; });

      assert.equal(calledNext, false);
      assert.equal(capturedStatus, 400);
      assert.equal(capturedBody?.code, 'INVALID_WORKSPACE_ID');
      assert.equal(req.workspace, undefined);
    });

    it('rejects explicit empty string workspace header with 400 and does NOT fall back to personal workspace', async () => {
      const middleware = requireWorkspaceRole('VIEWER');
      let capturedStatus = 0;
      let capturedBody: any = null;

      const req: any = {
        user: { id: userA, email: userAEmail },
        params: {},
        headers: { 'x-workspace-id': '   ' },
        query: {},
      };
      const res: any = {
        status: (code: number) => {
          capturedStatus = code;
          return { json: (data: any) => { capturedBody = data; } };
        },
      };

      let calledNext = false;
      await middleware(req, res, () => { calledNext = true; });

      assert.equal(calledNext, false);
      assert.equal(capturedStatus, 400);
      assert.equal(capturedBody?.code, 'INVALID_WORKSPACE_ID');
      assert.equal(req.workspace, undefined);
    });
  });
});

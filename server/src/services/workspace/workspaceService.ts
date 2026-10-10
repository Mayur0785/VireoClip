import crypto from 'node:crypto';
import { getMongoDb } from '../../db/mongoClient.js';
import {
  AppError,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  WorkspaceInvitationRecord,
  WorkspaceRole,
  CreateWorkspaceDTO,
  UpdateWorkspaceDTO,
  InviteMemberDTO,
  isValidUUID,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const ROLE_WEIGHT: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class WorkspaceService {
  /**
   * Retrieves or automatically provisions a backward-compatible personal workspace
   * for existing single-user flows.
   */
  public static async getOrCreatePersonalWorkspace(
    userId: string,
    userEmail?: string
  ): Promise<WorkspaceRecord> {
    if (!isValidUUID(userId)) {
      throw new AppError('Invalid user ID.', 400, 'INVALID_UUID');
    }

    const db = await getMongoDb();
    const workspacesCol = db.collection<WorkspaceRecord>('workspaces');
    const membersCol = db.collection<WorkspaceMemberRecord>('workspace_members');

    const existingPersonal = await workspacesCol.findOne({
      owner_id: userId,
      is_personal: true,
    });

    const now = new Date();

    if (!existingPersonal) {
      const workspaceId = crypto.randomUUID();
      const personal: WorkspaceRecord = {
        id: workspaceId,
        name: 'Personal Workspace',
        owner_id: userId,
        is_personal: true,
        created_at: now,
        updated_at: now,
      };

      await workspacesCol.insertOne(personal as any);

      const member: WorkspaceMemberRecord = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        user_id: userId,
        role: 'OWNER',
        user_email: userEmail,
        joined_at: now,
        updated_at: now,
      };

      await membersCol.insertOne(member as any);
      logger.info(`[WorkspaceService] Provisioned personal workspace ${workspaceId} for user ${userId}`);
      return personal;
    } else {
      // Ensure member record exists for personal workspace
      const member = await membersCol.findOne({
        workspace_id: existingPersonal.id,
        user_id: userId,
      });

      if (!member) {
        await membersCol.insertOne({
          id: crypto.randomUUID(),
          workspace_id: existingPersonal.id,
          user_id: userId,
          role: 'OWNER',
          user_email: userEmail,
          joined_at: now,
          updated_at: now,
        } as any);
      }
      return existingPersonal;
    }
  }

  /**
   * Creates a new collaborative team workspace. Creator becomes OWNER.
   */
  public static async createWorkspace(
    userId: string,
    dto: CreateWorkspaceDTO,
    userEmail?: string
  ): Promise<{ workspace: WorkspaceRecord; member: WorkspaceMemberRecord }> {
    if (!isValidUUID(userId)) {
      throw new AppError('Invalid user ID.', 400, 'INVALID_UUID');
    }

    const trimmedName = String(dto.name || '').trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
      throw new AppError('Workspace name must be between 2 and 100 characters.', 400, 'INVALID_WORKSPACE_NAME');
    }

    const db = await getMongoDb();
    const now = new Date();
    const workspaceId = crypto.randomUUID();

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      name: trimmedName,
      owner_id: userId,
      is_personal: false,
      created_at: now,
      updated_at: now,
    };

    const member: WorkspaceMemberRecord = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: userId,
      role: 'OWNER',
      user_email: userEmail,
      joined_at: now,
      updated_at: now,
    };

    await db.collection<WorkspaceRecord>('workspaces').insertOne(workspace as any);
    await db.collection<WorkspaceMemberRecord>('workspace_members').insertOne(member as any);

    logger.info(`[WorkspaceService] Created workspace ${workspaceId} "${trimmedName}" owned by user ${userId}`);
    return { workspace, member };
  }

  /**
   * Lists all workspaces the authenticated user belongs to.
   */
  public static async listWorkspaces(
    userId: string,
    userEmail?: string
  ): Promise<Array<WorkspaceRecord & { role: WorkspaceRole; member_count: number }>> {
    // Ensure personal workspace exists
    await this.getOrCreatePersonalWorkspace(userId, userEmail);

    const db = await getMongoDb();
    const membersCol = db.collection<WorkspaceMemberRecord>('workspace_members');
    const workspacesCol = db.collection<WorkspaceRecord>('workspaces');

    const memberships = await membersCol.find({ user_id: userId }).toArray();
    const workspaceIds = memberships.map((m) => m.workspace_id);

    const workspaces = await workspacesCol.find({ id: { $in: workspaceIds } }).sort({ created_at: -1 }).toArray();

    // Attach role and member count
    const results = await Promise.all(
      workspaces.map(async (ws) => {
        const mem = memberships.find((m) => m.workspace_id === ws.id);
        const count = await membersCol.countDocuments({ workspace_id: ws.id });
        return {
          ...ws,
          role: mem?.role || 'VIEWER',
          member_count: count,
        };
      })
    );

    return results;
  }

  /**
   * Retrieves single workspace details and verifies membership.
   */
  public static async getWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<{ workspace: WorkspaceRecord; current_user_role: WorkspaceRole; member_count: number }> {
    if (!isValidUUID(workspaceId)) {
      throw new AppError('Invalid workspace ID.', 400, 'INVALID_UUID');
    }

    const db = await getMongoDb();
    const member = await db.collection<WorkspaceMemberRecord>('workspace_members').findOne({
      workspace_id: workspaceId,
      user_id: userId,
    });

    if (!member) {
      throw new AppError('Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
    }

    const workspace = await db.collection<WorkspaceRecord>('workspaces').findOne({ id: workspaceId });
    if (!workspace) {
      throw new AppError('Workspace not found.', 404, 'WORKSPACE_NOT_FOUND');
    }

    const count = await db.collection<WorkspaceMemberRecord>('workspace_members').countDocuments({ workspace_id: workspaceId });

    return {
      workspace,
      current_user_role: member.role,
      member_count: count,
    };
  }

  /**
   * Updates workspace settings. Requires OWNER or ADMIN role.
   */
  public static async updateWorkspace(
    userId: string,
    workspaceId: string,
    dto: UpdateWorkspaceDTO
  ): Promise<WorkspaceRecord> {
    if (!isValidUUID(workspaceId)) {
      throw new AppError('Invalid workspace ID.', 400, 'INVALID_UUID');
    }

    const { current_user_role } = await this.getWorkspace(userId, workspaceId);
    if (!['OWNER', 'ADMIN'].includes(current_user_role)) {
      throw new AppError('Only workspace owners or admins can update workspace details.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const trimmedName = dto.name !== undefined ? String(dto.name).trim() : undefined;
    if (trimmedName !== undefined && (trimmedName.length < 2 || trimmedName.length > 100)) {
      throw new AppError('Workspace name must be between 2 and 100 characters.', 400, 'INVALID_WORKSPACE_NAME');
    }

    const db = await getMongoDb();
    const now = new Date();

    const updated = await db.collection<WorkspaceRecord>('workspaces').findOneAndUpdate(
      { id: workspaceId },
      {
        $set: {
          ...(trimmedName ? { name: trimmedName } : {}),
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      throw new AppError('Workspace not found.', 404, 'WORKSPACE_NOT_FOUND');
    }

    return updated as WorkspaceRecord;
  }

  /**
   * Deletes a workspace. Requires OWNER role. Personal workspace cannot be deleted.
   */
  public static async deleteWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<void> {
    if (!isValidUUID(workspaceId)) {
      throw new AppError('Invalid workspace ID.', 400, 'INVALID_UUID');
    }

    const { workspace, current_user_role } = await this.getWorkspace(userId, workspaceId);

    if (current_user_role !== 'OWNER') {
      throw new AppError('Only workspace owners can delete the workspace.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    if (workspace.is_personal) {
      throw new AppError('Personal workspace cannot be deleted.', 400, 'CANNOT_DELETE_PERSONAL_WORKSPACE');
    }

    const db = await getMongoDb();
    await db.collection('workspaces').deleteOne({ id: workspaceId });
    await db.collection('workspace_members').deleteMany({ workspace_id: workspaceId });
    await db.collection('workspace_invitations').deleteMany({ workspace_id: workspaceId });

    logger.info(`[WorkspaceService] Workspace ${workspaceId} deleted by owner ${userId}`);
  }

  /**
   * Lists all members of a workspace. Requires active membership.
   */
  public static async listMembers(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceMemberRecord[]> {
    await this.getWorkspace(userId, workspaceId); // Verifies caller is member

    const db = await getMongoDb();
    return await db
      .collection<WorkspaceMemberRecord>('workspace_members')
      .find({ workspace_id: workspaceId })
      .sort({ joined_at: 1 })
      .toArray();
  }

  /**
   * Generates a cryptographically secure, single-use invitation.
   * Only SHA-256 hash is persisted. Raw token is returned once for delivery.
   */
  public static async inviteMember(
    userId: string,
    workspaceId: string,
    dto: InviteMemberDTO
  ): Promise<{ invitation: Omit<WorkspaceInvitationRecord, 'token_hash'>; invitation_token: string }> {
    if (!isValidUUID(workspaceId)) {
      throw new AppError('Invalid workspace ID.', 400, 'INVALID_UUID');
    }

    const { current_user_role } = await this.getWorkspace(userId, workspaceId);

    if (!['OWNER', 'ADMIN'].includes(current_user_role)) {
      throw new AppError('Only workspace owners and admins can invite members.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const normalizedEmail = String(dto.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new AppError('Invalid email format.', 400, 'INVALID_EMAIL');
    }

    const targetRole: WorkspaceRole = dto.role;
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(targetRole)) {
      throw new AppError('Cannot invite members with role OWNER. Ownership must be transferred.', 400, 'INVALID_ROLE');
    }

    // Role authority check: ADMIN cannot invite other ADMINs
    if (current_user_role === 'ADMIN' && targetRole === 'ADMIN') {
      throw new AppError('Admins cannot invite other Admins. Only the Owner can invite Admins.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const db = await getMongoDb();
    const membersCol = db.collection<WorkspaceMemberRecord>('workspace_members');
    const invitationsCol = db.collection<WorkspaceInvitationRecord>('workspace_invitations');

    // Check if user is already a member by email
    const existingMember = await membersCol.findOne({
      workspace_id: workspaceId,
      user_email: normalizedEmail,
    });
    if (existingMember) {
      throw new AppError('User is already a member of this workspace.', 400, 'MEMBER_ALREADY_EXISTS');
    }

    // Revoke any previous pending invitations for this email in this workspace
    await invitationsCol.updateMany(
      {
        workspace_id: workspaceId,
        invitee_email: normalizedEmail,
        status: 'pending',
      },
      {
        $set: {
          status: 'revoked',
          updated_at: new Date(),
        },
      }
    );

    // Cryptographic token generation: 32 bytes entropy
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_MS);
    const invitationId = crypto.randomUUID();

    const invitationRecord: WorkspaceInvitationRecord = {
      id: invitationId,
      workspace_id: workspaceId,
      inviter_user_id: userId,
      invitee_email: normalizedEmail,
      role: targetRole,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    };

    await invitationsCol.insertOne(invitationRecord as any);

    logger.info(`[WorkspaceService] Created invitation ${invitationId} for ${normalizedEmail} with role ${targetRole} in workspace ${workspaceId}`);

    const { token_hash: _, ...safeInvitation } = invitationRecord;
    return {
      invitation: safeInvitation,
      invitation_token: rawToken,
    };
  }

  /**
   * Lists pending invitations for a workspace. Token hashes are never returned.
   */
  public static async listInvitations(
    userId: string,
    workspaceId: string
  ): Promise<Array<Omit<WorkspaceInvitationRecord, 'token_hash'>>> {
    const { current_user_role } = await this.getWorkspace(userId, workspaceId);

    if (!['OWNER', 'ADMIN'].includes(current_user_role)) {
      throw new AppError('Only workspace owners and admins can view invitations.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const db = await getMongoDb();
    const list = await db
      .collection<WorkspaceInvitationRecord>('workspace_invitations')
      .find({ workspace_id: workspaceId, status: 'pending' }, { projection: { token_hash: 0 } })
      .sort({ created_at: -1 })
      .toArray();

    return list;
  }

  /**
   * Revokes a pending invitation.
   */
  public static async revokeInvitation(
    userId: string,
    workspaceId: string,
    invitationId: string
  ): Promise<void> {
    if (!isValidUUID(invitationId)) {
      throw new AppError('Invalid invitation ID.', 400, 'INVALID_UUID');
    }

    const { current_user_role } = await this.getWorkspace(userId, workspaceId);
    if (!['OWNER', 'ADMIN'].includes(current_user_role)) {
      throw new AppError('Only workspace owners and admins can revoke invitations.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const db = await getMongoDb();
    const updated = await db.collection<WorkspaceInvitationRecord>('workspace_invitations').updateOne(
      { id: invitationId, workspace_id: workspaceId, status: 'pending' },
      { $set: { status: 'revoked', updated_at: new Date() } }
    );

    if (updated.matchedCount === 0) {
      throw new AppError('Pending invitation not found.', 404, 'INVITATION_NOT_FOUND');
    }

    logger.info(`[WorkspaceService] Revoked invitation ${invitationId} in workspace ${workspaceId}`);
  }

  /**
   * Accepts a single-use invitation token and grants workspace membership.
   */
  public static async acceptInvitation(
    userId: string,
    rawToken: string,
    userEmail?: string,
    userName?: string
  ): Promise<{ workspace: WorkspaceRecord; member: WorkspaceMemberRecord }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('Invitation token is required.', 400, 'INVALID_TOKEN');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    const db = await getMongoDb();
    const invitationsCol = db.collection<WorkspaceInvitationRecord>('workspace_invitations');

    const invitation = await invitationsCol.findOne({ token_hash: tokenHash });
    if (!invitation) {
      throw new AppError('Invalid or expired invitation token.', 400, 'INVALID_INVITATION');
    }

    if (invitation.status !== 'pending') {
      throw new AppError(`Invitation has already been ${invitation.status}.`, 400, 'INVITATION_ALREADY_USED');
    }

    const now = new Date();
    if (new Date(invitation.expires_at).getTime() < now.getTime()) {
      await invitationsCol.updateOne({ id: invitation.id }, { $set: { status: 'expired', updated_at: now } });
      throw new AppError('Invitation has expired.', 400, 'INVITATION_EXPIRED');
    }

    // Strict email check: Resolve user's email if not provided directly
    let emailToVerify = userEmail;
    if (!emailToVerify) {
      const profile = await db.collection('profiles').findOne({ user_id: userId });
      if (profile && (profile as any).email) {
        emailToVerify = (profile as any).email;
      }
    }

    if (emailToVerify && invitation.invitee_email && emailToVerify.trim().toLowerCase() !== invitation.invitee_email.trim().toLowerCase()) {
      throw new AppError('This invitation was issued to another email address.', 403, 'INVITATION_EMAIL_MISMATCH');
    }

    // Check workspace existence
    const workspace = await db.collection<WorkspaceRecord>('workspaces').findOne({ id: invitation.workspace_id });
    if (!workspace) {
      throw new AppError('Workspace no longer exists.', 404, 'WORKSPACE_NOT_FOUND');
    }

    // Mark invitation as accepted atomically - concurrency guard
    const updateResult = await invitationsCol.updateOne(
      { id: invitation.id, status: 'pending' },
      { $set: { status: 'accepted', updated_at: now } }
    );

    if (updateResult.modifiedCount === 0) {
      throw new AppError('Invitation has already been accepted or is no longer pending.', 409, 'INVITATION_ALREADY_USED');
    }

    const membersCol = db.collection<WorkspaceMemberRecord>('workspace_members');
    const existingMember = await membersCol.findOne({
      workspace_id: invitation.workspace_id,
      user_id: userId,
    });

    let member: WorkspaceMemberRecord;
    if (existingMember) {
      // If user is already a member, upgrade role if invitation provides higher role
      const currentWeight = ROLE_WEIGHT[existingMember.role];
      const newWeight = ROLE_WEIGHT[invitation.role];
      const finalRole = newWeight > currentWeight ? invitation.role : existingMember.role;

      await membersCol.updateOne(
        { id: existingMember.id },
        {
          $set: {
            role: finalRole,
            user_email: userEmail || existingMember.user_email,
            user_name: userName || existingMember.user_name,
            updated_at: now,
          },
        }
      );
      member = { ...existingMember, role: finalRole };
    } else {
      member = {
        id: crypto.randomUUID(),
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
        user_email: userEmail || invitation.invitee_email,
        user_name: userName,
        joined_at: now,
        updated_at: now,
      };
      await membersCol.insertOne(member as any);
    }

    logger.info(`[WorkspaceService] User ${userId} accepted invitation ${invitation.id} into workspace ${invitation.workspace_id} as ${invitation.role}`);
    return { workspace, member };
  }

  /**
   * Declines a single-use invitation.
   */
  public static async declineInvitation(
    rawToken: string
  ): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('Invitation token is required.', 400, 'INVALID_TOKEN');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    const db = await getMongoDb();
    const invitationsCol = db.collection<WorkspaceInvitationRecord>('workspace_invitations');

    const invitation = await invitationsCol.findOne({ token_hash: tokenHash });
    if (!invitation) {
      throw new AppError('Invalid or expired invitation token.', 400, 'INVALID_INVITATION');
    }

    if (invitation.status !== 'pending') {
      throw new AppError(`Invitation has already been ${invitation.status}.`, 400, 'INVITATION_ALREADY_USED');
    }

    const updateResult = await invitationsCol.updateOne(
      { id: invitation.id, status: 'pending' },
      { $set: { status: 'declined', updated_at: new Date() } }
    );

    if (updateResult.modifiedCount === 0) {
      throw new AppError('Invitation is no longer pending.', 409, 'INVITATION_ALREADY_USED');
    }
  }

  /**
   * Updates a member's role with strict hierarchy enforcement.
   */
  public static async updateMemberRole(
    userId: string,
    workspaceId: string,
    targetMemberId: string,
    newRole: WorkspaceRole
  ): Promise<WorkspaceMemberRecord> {
    if (!isValidUUID(workspaceId) || !isValidUUID(targetMemberId)) {
      throw new AppError('Invalid UUID.', 400, 'INVALID_UUID');
    }

    const { current_user_role } = await this.getWorkspace(userId, workspaceId);
    if (!['OWNER', 'ADMIN'].includes(current_user_role)) {
      throw new AppError('Only workspace owners and admins can change member roles.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const db = await getMongoDb();
    const membersCol = db.collection<WorkspaceMemberRecord>('workspace_members');
    const workspacesCol = db.collection<WorkspaceRecord>('workspaces');

    const targetMember = await membersCol.findOne({ id: targetMemberId, workspace_id: workspaceId });
    if (!targetMember) {
      throw new AppError('Member not found in workspace.', 404, 'MEMBER_NOT_FOUND');
    }

    // Protection rule: Member cannot modify their own role directly
    if (targetMember.user_id === userId) {
      throw new AppError('Cannot modify your own role.', 403, 'CANNOT_MODIFY_OWN_ROLE');
    }

    // Protection rule: Cannot modify owner unless you are the owner
    if (targetMember.role === 'OWNER' && current_user_role !== 'OWNER') {
      throw new AppError('Only the workspace owner can modify owner permissions.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    // Protection rule: Admin cannot modify another Admin
    if (current_user_role === 'ADMIN' && targetMember.role === 'ADMIN') {
      throw new AppError('Admins cannot change the role of another Admin.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    // Protection rule: Admin cannot promote anyone to Admin or Owner
    if (current_user_role === 'ADMIN' && (newRole === 'ADMIN' || newRole === 'OWNER')) {
      throw new AppError('Admins cannot promote members to Admin or Owner.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    const now = new Date();

    // Ownership transfer logic:
    if (newRole === 'OWNER') {
      if (current_user_role !== 'OWNER') {
        throw new AppError('Only current Owner can transfer workspace ownership.', 403, 'INSUFFICIENT_PERMISSIONS');
      }

      // Demote current owner to ADMIN
      await membersCol.updateOne(
        { workspace_id: workspaceId, user_id: userId },
        { $set: { role: 'ADMIN', updated_at: now } }
      );

      // Promote target member to OWNER
      await membersCol.updateOne(
        { id: targetMemberId },
        { $set: { role: 'OWNER', updated_at: now } }
      );

      // Update workspaces.owner_id
      await workspacesCol.updateOne(
        { id: workspaceId },
        { $set: { owner_id: targetMember.user_id, updated_at: now } }
      );

      logger.info(`[WorkspaceService] Transferred ownership of workspace ${workspaceId} from user ${userId} to user ${targetMember.user_id}`);
      return { ...targetMember, role: 'OWNER', updated_at: now };
    }

    // Standard role update
    await membersCol.updateOne(
      { id: targetMemberId },
      { $set: { role: newRole, updated_at: now } }
    );

    logger.info(`[WorkspaceService] Changed role of member ${targetMemberId} to ${newRole} in workspace ${workspaceId}`);
    return { ...targetMember, role: newRole, updated_at: now };
  }

  /**
   * Removes a member from the workspace (or leaves if member is caller).
   */
  public static async removeMember(
    userId: string,
    workspaceId: string,
    targetMemberId: string
  ): Promise<void> {
    if (!isValidUUID(workspaceId) || !isValidUUID(targetMemberId)) {
      throw new AppError('Invalid UUID.', 400, 'INVALID_UUID');
    }

    const { current_user_role } = await this.getWorkspace(userId, workspaceId);
    const db = await getMongoDb();
    const membersCol = db.collection<WorkspaceMemberRecord>('workspace_members');

    const targetMember = await membersCol.findOne({ id: targetMemberId, workspace_id: workspaceId });
    if (!targetMember) {
      throw new AppError('Member not found in workspace.', 404, 'MEMBER_NOT_FOUND');
    }

    const isSelf = targetMember.user_id === userId;

    if (isSelf) {
      // Sole owner cannot leave without transferring ownership or deleting workspace
      if (targetMember.role === 'OWNER') {
        const otherOwners = await membersCol.countDocuments({
          workspace_id: workspaceId,
          role: 'OWNER',
          user_id: { $ne: userId },
        });

        if (otherOwners === 0) {
          throw new AppError(
            'The sole workspace owner cannot leave without transferring ownership or deleting the workspace.',
            400,
            'SOLE_OWNER_CANNOT_LEAVE'
          );
        }
      }
    } else {
      // Removing another member requires authorization
      if (!['OWNER', 'ADMIN'].includes(current_user_role)) {
        throw new AppError('Only workspace owners and admins can remove members.', 403, 'INSUFFICIENT_PERMISSIONS');
      }

      if (targetMember.role === 'OWNER') {
        throw new AppError('Cannot remove the workspace owner.', 403, 'CANNOT_REMOVE_OWNER');
      }

      if (current_user_role === 'ADMIN' && targetMember.role === 'ADMIN') {
        throw new AppError('Admins cannot remove other Admins. Only the Owner can remove an Admin.', 403, 'INSUFFICIENT_PERMISSIONS');
      }
    }

    await membersCol.deleteOne({ id: targetMemberId });
    logger.info(`[WorkspaceService] Member ${targetMemberId} removed from workspace ${workspaceId} (isSelf=${isSelf})`);
  }

  /**
   * Evaluates if a user has sufficient permission level in a workspace.
   */
  public static async hasRole(
    userId: string,
    workspaceId: string,
    minRole: WorkspaceRole
  ): Promise<boolean> {
    const db = await getMongoDb();
    const member = await db.collection<WorkspaceMemberRecord>('workspace_members').findOne({
      workspace_id: workspaceId,
      user_id: userId,
    });

    if (!member) return false;
    return ROLE_WEIGHT[member.role] >= ROLE_WEIGHT[minRole];
  }
}

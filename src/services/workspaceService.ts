import { backendRequest } from './backendClient';
import {
  WorkspaceRecord,
  WorkspaceMemberRecord,
  WorkspaceInvitationRecord,
  WorkspaceRole,
  CreateWorkspaceDTO,
  InviteMemberDTO,
} from '../types';

export interface WorkspaceDetailResponse {
  workspace: WorkspaceRecord;
  current_user_role: WorkspaceRole;
  member_count: number;
}

export interface InviteMemberResponse {
  invitation: WorkspaceInvitationRecord;
  invitation_token: string;
}

export const workspaceService = {
  /**
   * Retrieves or auto-provisions the user's personal workspace.
   */
  async getPersonalWorkspace(): Promise<WorkspaceRecord> {
    const res = await backendRequest<{ success: boolean; data: WorkspaceRecord }>('/workspaces/personal');
    return res.data;
  },

  /**
   * Lists all workspaces the user has access to.
   */
  async listWorkspaces(): Promise<Array<WorkspaceRecord & { role: WorkspaceRole; member_count: number }>> {
    const res = await backendRequest<{ success: boolean; data: Array<WorkspaceRecord & { role: WorkspaceRole; member_count: number }> }>('/workspaces');
    return res.data;
  },

  /**
   * Creates a new team workspace.
   */
  async createWorkspace(payload: CreateWorkspaceDTO): Promise<{ workspace: WorkspaceRecord; member: WorkspaceMemberRecord }> {
    const res = await backendRequest<{ success: boolean; data: { workspace: WorkspaceRecord; member: WorkspaceMemberRecord } }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Gets details and current role for a workspace.
   */
  async getWorkspace(workspaceId: string): Promise<WorkspaceDetailResponse> {
    const res = await backendRequest<{ success: boolean; data: WorkspaceDetailResponse }>(`/workspaces/${workspaceId}`);
    return res.data;
  },

  /**
   * Updates workspace name.
   */
  async updateWorkspace(workspaceId: string, payload: { name: string }): Promise<WorkspaceRecord> {
    const res = await backendRequest<{ success: boolean; data: WorkspaceRecord }>(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Deletes a team workspace (OWNER only).
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await backendRequest<{ success: boolean }>(`/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Lists members of a workspace.
   */
  async listMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const res = await backendRequest<{ success: boolean; data: WorkspaceMemberRecord[] }>(`/workspaces/${workspaceId}/members`);
    return res.data;
  },

  /**
   * Updates a member's role (OWNER or ADMIN).
   */
  async updateMemberRole(workspaceId: string, memberId: string, role: WorkspaceRole): Promise<WorkspaceMemberRecord> {
    const res = await backendRequest<{ success: boolean; data: WorkspaceMemberRecord }>(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    return res.data;
  },

  /**
   * Removes a member or allows member to leave.
   */
  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    await backendRequest<{ success: boolean }>(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Lists pending invitations for a workspace.
   */
  async listInvitations(workspaceId: string): Promise<WorkspaceInvitationRecord[]> {
    const res = await backendRequest<{ success: boolean; data: WorkspaceInvitationRecord[] }>(`/workspaces/${workspaceId}/invitations`);
    return res.data;
  },

  /**
   * Invites a member to the workspace with single-use token.
   */
  async inviteMember(workspaceId: string, payload: InviteMemberDTO): Promise<InviteMemberResponse> {
    const res = await backendRequest<{ success: boolean; data: InviteMemberResponse }>(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Revokes a pending invitation.
   */
  async revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
    await backendRequest<{ success: boolean }>(`/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Accepts an invitation by raw token.
   */
  async acceptInvitation(token: string): Promise<{ workspace: WorkspaceRecord; member: WorkspaceMemberRecord }> {
    const res = await backendRequest<{ success: boolean; data: { workspace: WorkspaceRecord; member: WorkspaceMemberRecord } }>('/workspaces/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.data;
  },

  /**
   * Declines an invitation by raw token.
   */
  async declineInvitation(token: string): Promise<void> {
    await backendRequest<{ success: boolean }>('/workspaces/invitations/decline', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
};

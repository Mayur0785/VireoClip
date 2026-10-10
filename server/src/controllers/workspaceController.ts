import { Response } from 'express';
import { AuthenticatedRequest, ApiSuccessResponse } from '../types/index.js';
import { WorkspaceService } from '../services/workspace/workspaceService.js';

export const listWorkspacesHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const userEmail = req.user!.email;
  const workspaces = await WorkspaceService.listWorkspaces(userId, userEmail);

  const response: ApiSuccessResponse<typeof workspaces> = {
    status: 'ok',
    data: workspaces,
  };
  res.status(200).json(response);
};

export const createWorkspaceHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const userEmail = req.user!.email;
  const result = await WorkspaceService.createWorkspace(userId, req.body, userEmail);

  const response: ApiSuccessResponse<typeof result> = {
    status: 'ok',
    data: result,
  };
  res.status(201).json(response);
};

export const getWorkspaceHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const result = await WorkspaceService.getWorkspace(userId, workspaceId);

  const response: ApiSuccessResponse<typeof result> = {
    status: 'ok',
    data: result,
  };
  res.status(200).json(response);
};

export const updateWorkspaceHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const workspace = await WorkspaceService.updateWorkspace(userId, workspaceId, req.body);

  const response: ApiSuccessResponse<typeof workspace> = {
    status: 'ok',
    data: workspace,
  };
  res.status(200).json(response);
};

export const deleteWorkspaceHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  await WorkspaceService.deleteWorkspace(userId, workspaceId);

  const response: ApiSuccessResponse<{ deleted: boolean }> = {
    status: 'ok',
    data: { deleted: true },
    message: 'Workspace deleted successfully.',
  };
  res.status(200).json(response);
};

export const listMembersHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const members = await WorkspaceService.listMembers(userId, workspaceId);

  const response: ApiSuccessResponse<typeof members> = {
    status: 'ok',
    data: members,
  };
  res.status(200).json(response);
};

export const inviteMemberHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const result = await WorkspaceService.inviteMember(userId, workspaceId, req.body);

  const response: ApiSuccessResponse<typeof result> = {
    status: 'ok',
    data: result,
    message: 'Invitation generated successfully.',
  };
  res.status(201).json(response);
};

export const listInvitationsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const invitations = await WorkspaceService.listInvitations(userId, workspaceId);

  const response: ApiSuccessResponse<typeof invitations> = {
    status: 'ok',
    data: invitations,
  };
  res.status(200).json(response);
};

export const revokeInvitationHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const invitationId = req.params.invitationId;
  await WorkspaceService.revokeInvitation(userId, workspaceId, invitationId);

  const response: ApiSuccessResponse<{ revoked: boolean }> = {
    status: 'ok',
    data: { revoked: true },
    message: 'Invitation revoked successfully.',
  };
  res.status(200).json(response);
};

export const acceptInvitationHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const userEmail = req.user!.email;
  const userName = req.user!.user_metadata?.full_name;
  const result = await WorkspaceService.acceptInvitation(userId, req.body.token, userEmail, userName);

  const response: ApiSuccessResponse<typeof result> = {
    status: 'ok',
    data: result,
    message: 'Invitation accepted successfully.',
  };
  res.status(200).json(response);
};

export const declineInvitationHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await WorkspaceService.declineInvitation(req.body.token);

  const response: ApiSuccessResponse<{ declined: boolean }> = {
    status: 'ok',
    data: { declined: true },
    message: 'Invitation declined.',
  };
  res.status(200).json(response);
};

export const updateMemberRoleHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const memberId = req.params.memberId;
  const member = await WorkspaceService.updateMemberRole(userId, workspaceId, memberId, req.body.role);

  const response: ApiSuccessResponse<typeof member> = {
    status: 'ok',
    data: member,
    message: 'Member role updated successfully.',
  };
  res.status(200).json(response);
};

export const removeMemberHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workspaceId = req.params.workspaceId;
  const memberId = req.params.memberId;
  await WorkspaceService.removeMember(userId, workspaceId, memberId);

  const response: ApiSuccessResponse<{ removed: boolean }> = {
    status: 'ok',
    data: { removed: true },
    message: 'Member removed successfully.',
  };
  res.status(200).json(response);
};

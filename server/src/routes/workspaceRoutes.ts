import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listWorkspacesHandler,
  createWorkspaceHandler,
  getWorkspaceHandler,
  updateWorkspaceHandler,
  deleteWorkspaceHandler,
  listMembersHandler,
  inviteMemberHandler,
  listInvitationsHandler,
  revokeInvitationHandler,
  acceptInvitationHandler,
  declineInvitationHandler,
  updateMemberRoleHandler,
  removeMemberHandler,
} from '../controllers/workspaceController.js';

const router = Router();

// Workspace collection routes
router.get('/', requireAuth, asyncHandler(listWorkspacesHandler));
router.post('/', requireAuth, asyncHandler(createWorkspaceHandler));

// Global invitation response routes
router.post('/invitations/accept', requireAuth, asyncHandler(acceptInvitationHandler));
router.post('/invitations/decline', requireAuth, asyncHandler(declineInvitationHandler));

// Workspace item routes
router.get('/:workspaceId', requireAuth, asyncHandler(getWorkspaceHandler));
router.patch('/:workspaceId', requireAuth, asyncHandler(updateWorkspaceHandler));
router.delete('/:workspaceId', requireAuth, asyncHandler(deleteWorkspaceHandler));

// Workspace members routes
router.get('/:workspaceId/members', requireAuth, asyncHandler(listMembersHandler));
router.patch('/:workspaceId/members/:memberId', requireAuth, asyncHandler(updateMemberRoleHandler));
router.delete('/:workspaceId/members/:memberId', requireAuth, asyncHandler(removeMemberHandler));

// Workspace invitation management routes
router.get('/:workspaceId/invitations', requireAuth, asyncHandler(listInvitationsHandler));
router.post('/:workspaceId/invitations', requireAuth, asyncHandler(inviteMemberHandler));
router.delete('/:workspaceId/invitations/:invitationId', requireAuth, asyncHandler(revokeInvitationHandler));

export default router;

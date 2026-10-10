import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, WorkspaceRole, isValidUUID } from '../types/index.js';
import { WorkspaceService } from '../services/workspace/workspaceService.js';
import { getMongoDb } from '../db/mongoClient.js';

const ROLE_WEIGHT: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

/**
 * Middleware that verifies workspace membership and enforces minimum required role.
 */
export const requireWorkspaceRole = (minRole: WorkspaceRole = 'VIEWER') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user?.id) {
        res.status(401).json({
          status: 'error',
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        });
        return;
      }

      const hasParam = req.params && 'workspaceId' in req.params;
      const hasHeader = req.headers && 'x-workspace-id' in req.headers;
      const hasQuery = req.query && 'workspaceId' in req.query;
      const hasBody = req.body && typeof req.body === 'object' && 'workspace_id' in req.body;
      const hasExplicitWorkspaceTarget = hasParam || hasHeader || hasQuery || hasBody;

      const rawWorkspaceId =
        req.params.workspaceId ||
        req.headers['x-workspace-id'] ||
        req.query.workspaceId ||
        req.body?.workspace_id;

      const workspaceId = typeof rawWorkspaceId === 'string' ? rawWorkspaceId.trim() : undefined;

      let workspace: any;
      let member: any;

      if (!hasExplicitWorkspaceTarget && !workspaceId) {
        // Default to user's personal workspace for backward compatibility on legacy routes
        workspace = await WorkspaceService.getOrCreatePersonalWorkspace(user.id, user.email);
        const db = await getMongoDb();
        member = await db.collection('workspace_members').findOne({
          workspace_id: workspace.id,
          user_id: user.id,
        });
      } else {
        if (!workspaceId || !isValidUUID(workspaceId)) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_WORKSPACE_ID',
            message: 'Invalid workspace ID format.',
          });
          return;
        }

        const db = await getMongoDb();
        workspace = await db.collection('workspaces').findOne({ id: workspaceId });
        if (!workspace) {
          res.status(404).json({
            status: 'error',
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Workspace not found.',
          });
          return;
        }

        member = await db.collection('workspace_members').findOne({
          workspace_id: workspaceId,
          user_id: user.id,
        });

        if (!member) {
          res.status(403).json({
            status: 'error',
            code: 'FORBIDDEN',
            message: 'Access denied. You are not a member of this workspace.',
          });
          return;
        }
      }

      // Role authorization check
      const userWeight = ROLE_WEIGHT[member.role as WorkspaceRole] || 0;
      const requiredWeight = ROLE_WEIGHT[minRole] || 1;

      if (userWeight < requiredWeight) {
        res.status(403).json({
          status: 'error',
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Forbidden: This action requires at least ${minRole} role in the workspace. Current role: ${member.role}.`,
        });
        return;
      }

      req.workspace = workspace;
      req.workspaceMember = member;
      next();
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        status: 'error',
        code: err.code || 'WORKSPACE_ERROR',
        message: err.message || 'Error evaluating workspace permissions.',
      });
    }
  };
};

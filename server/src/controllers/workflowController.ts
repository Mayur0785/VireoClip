import { Request, Response } from 'express';
import { ContentWorkflowService } from '../services/workflow/contentWorkflowService.js';
import { AppError } from '../types/index.js';

function getAuthUser(req: Request): string {
  const user = (req as any).user;
  if (!user || !user.id) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }
  return user.id;
}

export class WorkflowController {
  /**
   * GET /api/workflows
   */
  public static async listWorkflows(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { state, clipId, projectId, search, startDate, endDate, page, limit } = req.query;

    const result = await ContentWorkflowService.listWorkflows(userId, {
      state: state ? (state as any) : undefined,
      clipId: typeof clipId === 'string' ? clipId : undefined,
      projectId: typeof projectId === 'string' ? projectId : undefined,
      search: typeof search === 'string' ? search : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ success: true, data: result });
  }

  /**
   * GET /api/workflows/:id
   */
  public static async getWorkflow(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const workflow = await ContentWorkflowService.getWorkflow(userId, req.params.id);
    res.json({ success: true, data: workflow });
  }

  /**
   * POST /api/workflows
   */
  public static async createWorkflow(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { title, project_id, clip_id, notes, tags, initial_state } = req.body;

    const workflow = await ContentWorkflowService.createWorkflow(userId, {
      title,
      project_id,
      clip_id,
      notes,
      tags,
      initial_state,
    });

    res.status(201).json({ success: true, data: workflow });
  }

  /**
   * POST /api/workflows/:id/transition
   */
  public static async transitionWorkflow(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { targetState, expectedVersion, notes, approvalNotes } = req.body;

    if (!targetState) {
      throw new AppError('targetState is required', 400);
    }

    const workflow = await ContentWorkflowService.transitionWorkflow(userId, req.params.id, targetState, {
      expectedVersion: expectedVersion !== undefined ? Number(expectedVersion) : undefined,
      notes,
      approvalNotes,
    });

    res.json({ success: true, data: workflow });
  }

  /**
   * POST /api/workflows/:id/approve
   */
  public static async approveWorkflow(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { notes } = req.body;

    const workflow = await ContentWorkflowService.approveWorkflow(userId, req.params.id, notes);
    res.json({ success: true, data: workflow });
  }

  /**
   * POST /api/workflows/:id/request-revisions
   */
  public static async requestRevisions(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { reason } = req.body;

    const workflow = await ContentWorkflowService.requestRevisions(userId, req.params.id, reason);
    res.json({ success: true, data: workflow });
  }
}

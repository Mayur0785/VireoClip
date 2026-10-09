import { Request, Response } from 'express';
import { AutopilotService } from '../services/autopilotService.js';
import { AppError } from '../types/index.js';

function getAuthUser(req: Request): string {
  const user = (req as any).user;
  if (!user || !user.id) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }
  return user.id;
}

export class AutopilotController {
  /**
   * GET /api/autopilot/capabilities
   */
  public static async getCapabilities(_req: Request, res: Response): Promise<void> {
    const caps = AutopilotService.getCapabilities();
    res.json({ success: true, data: caps });
  }

  /**
   * POST /api/autopilot/runs
   */
  public static async createRun(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { clip_id, settings, idempotency_key } = req.body;

    if (!clip_id) {
      throw new AppError('clip_id is required.', 400, 'INVALID_INPUT');
    }

    const run = await AutopilotService.createRun(userId, {
      clip_id,
      settings,
      idempotency_key,
    });

    res.status(201).json({ success: true, data: run });
  }

  /**
   * GET /api/autopilot/runs/:runId
   */
  public static async getRun(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { runId } = req.params;

    const run = await AutopilotService.getRun(userId, runId);
    res.json({ success: true, data: run });
  }

  /**
   * GET /api/autopilot/clips/:clipId
   */
  public static async getRunsForClip(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { clipId } = req.params;

    const runs = await AutopilotService.getRunsForClip(userId, clipId);
    res.json({ success: true, data: runs });
  }

  /**
   * POST /api/autopilot/runs/:runId/execute
   */
  public static async executeRun(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { runId } = req.params;

    const run = await AutopilotService.executePipeline(userId, runId);
    res.json({ success: true, data: run });
  }

  /**
   * POST /api/autopilot/runs/:runId/retry
   */
  public static async retryStep(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { runId } = req.params;
    const { step, forceRerun } = req.body;

    if (!step) {
      throw new AppError('Step name is required for retry.', 400, 'INVALID_INPUT');
    }

    const run = await AutopilotService.retryFailedStep(userId, runId, step, Boolean(forceRerun));
    res.json({ success: true, data: run });
  }

  /**
   * POST /api/autopilot/runs/:runId/approve
   */
  public static async approveRun(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { runId } = req.params;
    const { selected_hook_candidate_id, selected_thumbnail_concept_id, custom_instruction } = req.body;

    const result = await AutopilotService.approveRun(userId, runId, {
      selected_hook_candidate_id,
      selected_thumbnail_concept_id,
      custom_instruction,
    });

    res.json({
      success: true,
      data: {
        run: result.run,
        publishing_handoff: result.publishing_handoff,
      },
    });
  }
}

import { Request, Response } from 'express';
import { HookLabService } from '../services/hookLabService.js';
import { HookLineSearchService } from '../services/hookLab/hookLineSearchService.js';
import { HookEditorIntegration } from '../services/hookLab/hookEditorIntegration.js';
import { AppError } from '../types/index.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';

export class HookLabController {
  private static getUserId(req: Request): string {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    if (!userId) {
      throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
    }
    return userId;
  }

  /**
   * GET /api/hook-lab/capabilities
   */
  public static async getCapabilities(req: Request, res: Response): Promise<void> {
    const caps = HookLabService.getCapabilities();
    res.json({ success: true, capabilities: caps });
  }

  /**
   * POST /api/hook-lab/sessions
   */
  public static async createOrGetSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { clip_id, project_id, content_pack_id, opening_window_sec, user_instruction, platform } = req.body;

      if (!clip_id) {
        throw new AppError('clip_id is required.', 400, 'INVALID_INPUT');
      }

      const session = await HookLabService.getOrCreateSession(userId, clip_id, {
        clip_id,
        project_id,
        content_pack_id,
        opening_window_sec,
        user_instruction,
        platform,
      });

      res.status(201).json({ success: true, session });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/hook-lab/sessions/:id
   */
  public static async getSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id } = req.params;

      const data = await HookLabService.getSession(id, userId);
      res.json({ success: true, ...data });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/generate
   */
  public static async generateCandidates(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id } = req.params;
      const { user_instruction, candidate_count, preferred_types, platform } = req.body;

      const candidates = await HookLabService.generateCandidates(id, userId, {
        user_instruction,
        candidate_count,
        preferred_types,
        platform,
      });

      res.json({ success: true, candidates, count: candidates.length });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * PATCH /api/hook-lab/sessions/:id/candidates/:candidateId
   */
  public static async updateCandidate(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id, candidateId } = req.params;
      const { text, locked, status } = req.body;

      const candidate = await HookLabService.updateCandidate(id, candidateId, userId, {
        text,
        locked,
        status,
      });

      res.json({ success: true, candidate });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/candidates/:candidateId/regenerate
   */
  public static async regenerateCandidate(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id, candidateId } = req.params;
      const { user_instruction } = req.body;

      const candidate = await HookLabService.regenerateCandidate(id, candidateId, userId, user_instruction);
      res.json({ success: true, candidate });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/candidates/:candidateId/apply
   */
  public static async applyToEditor(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id, candidateId } = req.params;
      const { editor_project_id } = req.body;

      if (!editor_project_id) {
        throw new AppError('editor_project_id is required.', 400, 'INVALID_INPUT');
      }

      const result = await HookLabService.applyCandidateToEditor(id, candidateId, userId, editor_project_id);
      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/candidates/:candidateId/revert
   */
  public static async revertInEditor(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id, candidateId } = req.params;
      const { editor_project_id, snapshot } = req.body;

      if (!editor_project_id || !snapshot) {
        throw new AppError('editor_project_id and snapshot are required.', 400, 'INVALID_INPUT');
      }

      const restored = await HookLabService.revertCandidateInEditor(
        id,
        candidateId,
        userId,
        editor_project_id,
        snapshot
      );

      res.json({ success: true, project: restored });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/candidates/:candidateId/preview
   */
  public static async renderPreview(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id, candidateId } = req.params;

      const { candidates, session } = await HookLabService.getSession(id, userId);
      const cand = candidates.find((c) => c.id === candidateId);
      if (!cand) throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');

      const preview = await HookEditorIntegration.renderHookPreview(userId, session.clip_id, cand);
      res.json({ success: true, preview });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/candidates/:candidateId/approve
   */
  public static async approveCandidate(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id, candidateId } = req.params;

      const candidate = await HookLabService.approveCandidate(id, candidateId, userId);
      res.json({ success: true, candidate });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/import-content-pack
   */
  public static async importContentPack(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id } = req.params;
      const { content_pack_id } = req.body;

      if (!content_pack_id) {
        throw new AppError('content_pack_id is required.', 400, 'INVALID_INPUT');
      }

      const { session } = await HookLabService.getSession(id, userId);
      const imported = await HookLabService.importFromContentPack(session.clip_id, content_pack_id, userId);

      res.json({ success: true, candidates: imported, count: imported.length });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/hook-lab/sessions/:id/sync-content-pack
   */
  public static async syncContentPack(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id } = req.params;
      const { candidate_id, content_pack_id, force } = req.body;

      if (!candidate_id || !content_pack_id) {
        throw new AppError('candidate_id and content_pack_id are required.', 400, 'INVALID_INPUT');
      }

      const result = await HookLabService.syncToContentPack(
        id,
        candidate_id,
        content_pack_id,
        userId,
        force || false
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/hook-lab/analytics-advisory
   */
  public static async getAnalyticsAdvisory(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const advisory = await HookLabService.getAnalyticsAdvisory(userId);
      res.json({ success: true, ...advisory });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/hook-lab/sessions/:id/existing-lines
   */
  public static async getExistingLines(req: Request, res: Response): Promise<void> {
    try {
      const userId = HookLabController.getUserId(req);
      const { id } = req.params;

      const { session } = await HookLabService.getSession(id, userId);

      const { data: clip } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', session.clip_id)
        .eq('user_id', userId)
        .single();

      const { data: transcriptDoc } = await dataRepository
        .from('transcripts')
        .select('*')
        .eq('project_id', session.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      const lines = HookLineSearchService.findStrongestExistingLines(
        (transcriptDoc as any)?.segments || [],
        clip?.start_seconds || 0,
        clip?.end_seconds || 30
      );

      res.json({ success: true, lines });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }
}

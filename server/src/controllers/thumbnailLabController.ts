import { Request, Response } from 'express';
import { ThumbnailLabService } from '../services/thumbnailLabService.js';
import { AppError } from '../types/index.js';

export class ThumbnailLabController {
  private static getUserId(req: Request): string {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    if (!userId) {
      throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
    }
    return userId;
  }

  /**
   * GET /api/thumbnail-lab/capabilities
   */
  public static async getCapabilities(req: Request, res: Response): Promise<void> {
    const caps = ThumbnailLabService.getCapabilities();
    res.json({ success: true, capabilities: caps });
  }

  /**
   * POST /api/thumbnail-lab/sessions
   */
  public static async createOrGetSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { clip_id, project_id, content_pack_id, aspect_ratio, target_platform, target_audience, video_topic, objective } = req.body;

      if (!clip_id) {
        throw new AppError('clip_id is required.', 400, 'INVALID_INPUT');
      }

      const session = await ThumbnailLabService.getOrCreateSession(userId, clip_id, {
        clip_id,
        project_id,
        content_pack_id,
        aspect_ratio,
        target_platform,
        target_audience,
        video_topic,
        objective,
      });

      res.status(201).json({ success: true, session });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/thumbnail-lab/sessions/:id
   */
  public static async getSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id } = req.params;

      const result = await ThumbnailLabService.getSession(id, userId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/thumbnail-lab/sessions/:id/source-frames
   */
  public static async getSourceFrames(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id } = req.params;

      const frames = await ThumbnailLabService.getSourceFrames(id, userId);
      res.json({ success: true, frames });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/thumbnail-lab/sessions/:id/generate
   */
  public static async generateConcepts(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id } = req.params;
      const { style_direction, reference_frame_id, user_instruction, count } = req.body;

      const concepts = await ThumbnailLabService.generateConcepts(id, userId, {
        style_direction,
        reference_frame_id,
        user_instruction,
        count,
      });

      res.json({ success: true, concepts });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * PATCH /api/thumbnail-lab/sessions/:id/concepts/:conceptId
   */
  public static async updateConcept(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id, conceptId } = req.params;
      const updates = req.body;

      const updated = await ThumbnailLabService.updateConcept(id, conceptId, userId, updates);
      res.json({ success: true, concept: updated });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/thumbnail-lab/sessions/:id/concepts/:conceptId/approve
   */
  public static async approveConcept(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id, conceptId } = req.params;

      const result = await ThumbnailLabService.approveConcept(id, conceptId, userId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/thumbnail-lab/sessions/:id/import-content-pack
   */
  public static async importContentPack(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { clip_id, content_pack_id } = req.body;

      if (!clip_id || !content_pack_id) {
        throw new AppError('clip_id and content_pack_id are required.', 400, 'INVALID_INPUT');
      }

      const concepts = await ThumbnailLabService.importFromContentPack(clip_id, content_pack_id, userId);
      res.json({ success: true, concepts });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/thumbnail-lab/sessions/:id/concepts/:conceptId/publishing-handoff
   */
  public static async getPublishingHandoff(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id, conceptId } = req.params;

      const payload = await ThumbnailLabService.getPublishingHandoff(id, conceptId, userId);
      res.json({ success: true, handoff: payload });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/thumbnail-lab/sessions/:id/versions/:versionId/restore
   */
  public static async restoreVersion(req: Request, res: Response): Promise<void> {
    try {
      const userId = ThumbnailLabController.getUserId(req);
      const { id, versionId } = req.params;

      const restored = await ThumbnailLabService.restoreVersion(id, versionId, userId);
      res.json({ success: true, concept: restored });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }
}

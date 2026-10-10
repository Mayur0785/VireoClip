import { Request, Response } from 'express';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { BrandBrainService } from '../services/brand/brandBrainService.js';
import { BrandEvidenceService } from '../services/brand/brandEvidenceService.js';
import { BrandContextService, BrandTaskType } from '../services/brand/brandContextService.js';
import { BrandCheckService } from '../services/brand/brandCheckService.js';
import { BrandRecommendationService } from '../services/brand/brandRecommendationService.js';
import { BrandEditorIntegration } from '../services/brand/brandEditorIntegration.js';
import { BrandLearningPipeline } from '../services/brand/brandLearningPipeline.js';
import { BrandDocumentParser } from '../services/brand/brandDocumentParser.js';

export class BrandBrainController {
  /**
   * Helper to extract authenticated user ID.
   */
  private static getUserId(req: Request): string {
    const userId = (req as any).user?.id;
    if (!userId) {
      throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');
    }
    return userId;
  }

  /**
   * GET /api/brand-brain
   */
  public static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { brand_id } = req.query;
      const profile = await BrandBrainService.getProfile(userId, brand_id as string | undefined);
      res.json({ success: true, profile });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * PATCH /api/brand-brain
   */
  public static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { brand_id } = req.query;
      const updates = req.body;
      const profile = await BrandBrainService.updateProfile(
        userId,
        updates,
        'USER_EDIT',
        brand_id as string | undefined
      );
      res.json({ success: true, profile });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/lock
   */
  public static async setLock(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { rule_key, locked, brand_id } = req.body;
      if (!rule_key || typeof locked !== 'boolean') {
        throw new AppError('rule_key and locked boolean are required.', 400, 'INVALID_INPUT');
      }

      const profile = await BrandBrainService.setLock(userId, rule_key, locked, brand_id);
      res.json({ success: true, profile });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/reset-learned
   */
  public static async resetLearned(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { brand_id } = req.body;
      const profile = await BrandBrainService.resetLearnedLayer(userId, brand_id);
      res.json({ success: true, profile, message: 'Learned intelligence layer reset successfully.' });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/brand-brain/context
   */
  public static async getBrandContext(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { task_type, platform, project_id, brand_id } = req.query;

      if (!task_type) {
        throw new AppError('task_type is required for brand context minimization.', 400, 'INVALID_INPUT');
      }

      const context = await BrandContextService.getBrandContext({
        userId,
        projectId: project_id as string | undefined,
        taskType: task_type as BrandTaskType,
        platform: platform as string | undefined,
        brandBrainId: brand_id as string | undefined,
      });

      res.json({ success: true, context });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/brand-brain/evidence
   */
  public static async getEvidence(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { brand_id, dimension } = req.query;

      const profile = await BrandBrainService.getProfile(userId, brand_id as string | undefined);
      const evidence = await BrandEvidenceService.getEvidence(
        userId,
        profile.id,
        dimension as any
      );

      res.json({ success: true, evidence });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/check
   */
  public static async checkCompliance(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { content, brand_id } = req.body;

      if (!content) {
        throw new AppError('content object is required for compliance check.', 400, 'INVALID_INPUT');
      }

      const result = await BrandCheckService.checkContentCompliance(userId, content, brand_id);
      res.json({ success: true, result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/brand-brain/recommendations
   */
  public static async getRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { brand_id } = req.query;

      const result = await BrandRecommendationService.getRecommendations(
        userId,
        brand_id as string | undefined
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/recommendations/apply
   */
  public static async applyRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { dimension, field, suggested_value, brand_id } = req.body;

      if (!dimension || !field || suggested_value === undefined) {
        throw new AppError('dimension, field, and suggested_value are required.', 400, 'INVALID_INPUT');
      }

      const profile = await BrandRecommendationService.applyRecommendation(
        userId,
        dimension,
        field,
        suggested_value,
        brand_id
      );

      res.json({ success: true, profile });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/recommendations/:id/approve
   */
  public static async approveRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { id } = req.params;
      const { confirm_overwrite, edited_value, brand_id } = req.body;

      const result = await BrandRecommendationService.approveRecommendation(
        userId,
        id,
        { confirm_overwrite, edited_value, brand_brain_id: brand_id }
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/recommendations/:id/dismiss
   */
  public static async dismissRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { id } = req.params;

      const result = await BrandRecommendationService.dismissRecommendation(userId, id);
      res.json(result);
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/apply-to-editor
   */
  public static async applyToEditor(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { editor_project_id, brand_id, options } = req.body;

      if (!editor_project_id) {
        throw new AppError('editor_project_id is required.', 400, 'INVALID_INPUT');
      }

      const result = await BrandEditorIntegration.applyBrandToProject(
        userId,
        editor_project_id,
        { ...options, brandBrainId: brand_id }
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/revert-editor
   */
  public static async revertEditor(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { editor_project_id, snapshot } = req.body;

      if (!editor_project_id || !snapshot) {
        throw new AppError('editor_project_id and snapshot are required.', 400, 'INVALID_INPUT');
      }

      const updated = await BrandEditorIntegration.revertApplyBrand(
        userId,
        editor_project_id,
        snapshot
      );

      res.json({ success: true, project: updated });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/brand-brain/versions
   */
  public static async getVersions(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { brand_id } = req.query;

      const versions = await BrandBrainService.getVersionHistory(
        userId,
        brand_id as string | undefined
      );

      res.json({ success: true, versions });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/restore/:version
   */
  public static async restoreVersion(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const versionNum = parseInt(req.params.version, 10);
      const { brand_id } = req.body;

      if (Number.isNaN(versionNum)) {
        throw new AppError('Invalid version number.', 400, 'INVALID_INPUT');
      }

      const restored = await BrandBrainService.restoreVersion(userId, versionNum, brand_id);
      res.json({ success: true, profile: restored });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/parse-guidelines
   */
  public static async parseGuidelines(req: Request, res: Response): Promise<void> {
    try {
      BrandBrainController.getUserId(req);
      const { text } = req.body;

      const draft = BrandDocumentParser.parseGuidelineText(text);
      res.json({ success: true, draft });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/brand-brain/learn
   */
  public static async learn(req: Request, res: Response): Promise<void> {
    try {
      const userId = BrandBrainController.getUserId(req);
      const { editor_project_id, producer_plan_id, brand_id } = req.body;

      let result;
      if (editor_project_id) {
        result = await BrandLearningPipeline.learnFromApprovedEditorProject(
          userId,
          editor_project_id,
          brand_id
        );
      } else if (producer_plan_id) {
        result = await BrandLearningPipeline.learnFromApprovedProducerPlan(
          userId,
          producer_plan_id,
          brand_id
        );
      } else {
        throw new AppError('editor_project_id or producer_plan_id required to learn.', 400, 'INVALID_INPUT');
      }

      res.json({ success: true, result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }
}

import { Request, Response } from 'express';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { LanguageModel } from '../services/translation/languageModel.js';
import { GlossaryService } from '../services/translation/glossaryService.js';
import {
  TranslationProviderRegistry,
  OpenRouterTranslationProvider,
} from '../services/translation/translationProvider.js';
import { TranslationProjectService } from '../services/translation/translationProjectService.js';
import { CaptionLocalizationService } from '../services/translation/captionLocalizationService.js';
import { DubbingService } from '../services/translation/dubbingService.js';
import { LipSyncProviderRegistry } from '../services/translation/lipSyncProvider.js';

/**
 * Phase 21: Translation, Localization & Multilingual Dubbing Controller
 */
export class TranslationController {
  /**
   * GET /api/translation/languages
   */
  public static async getLanguages(_req: Request, res: Response): Promise<void> {
    try {
      const languages = LanguageModel.getAllSupportedLanguages();
      res.json({ success: true, languages });
    } catch (err: any) {
      logger.error(`[TranslationController] getLanguages error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/translation/detect
   */
  public static async detectLanguage(req: Request, res: Response): Promise<void> {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        throw new AppError('Text is required for language detection.', 400, 'INVALID_INPUT');
      }

      const provider = TranslationProviderRegistry.getProvider('openrouter');
      const result = await provider.detectLanguage(text);
      res.json({ success: true, result });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/translation/projects
   */
  public static async createProject(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { project_id, clip_id, source_language, target_language, style, segments } = req.body;
      if (!project_id || !clip_id || !source_language || !target_language) {
        throw new AppError('Missing required project fields.', 400, 'INVALID_INPUT');
      }

      const project = await TranslationProjectService.createProject(
        {
          project_id,
          clip_id,
          source_language,
          target_language,
          style,
          segments: segments || [],
        },
        userId
      );

      res.status(201).json({ success: true, project });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/translation/projects/:id
   */
  public static async getProject(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { id } = req.params;
      const project = await TranslationProjectService.getProject(id, userId);
      if (!project) throw new AppError('Translation project not found.', 404, 'NOT_FOUND');

      res.json({ success: true, project });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/translation/clips/:clipId/projects
   */
  public static async listProjectsForClip(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { clipId } = req.params;
      const projects = await TranslationProjectService.listProjectsForClip(clipId, userId);
      res.json({ success: true, projects });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/translation/projects/:id/translate
   */
  public static async translateProject(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { id } = req.params;
      const { provider = 'openrouter' } = req.body;

      const project = await TranslationProjectService.translateProject(id, userId, provider);
      res.json({ success: true, project });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * PUT /api/translation/projects/:id/segments/:segmentId
   */
  public static async updateSegmentText(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { id, segmentId } = req.params;
      const { translated_text } = req.body;

      if (!translated_text || typeof translated_text !== 'string') {
        throw new AppError('translated_text is required.', 400, 'INVALID_INPUT');
      }

      const project = await TranslationProjectService.updateSegmentText(
        id,
        segmentId,
        translated_text,
        userId
      );

      res.json({ success: true, project });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/translation/projects/:id/approve-all
   */
  public static async approveAllSegments(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { id } = req.params;
      const project = await TranslationProjectService.approveAllSegments(id, userId);
      res.json({ success: true, project });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/translation/projects/:id/export-subtitles
   */
  public static async exportSubtitles(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const { id } = req.params;
      const { format = 'srt' } = req.body;

      const project = await TranslationProjectService.getProject(id, userId);
      if (!project) throw new AppError('Translation project not found.', 404, 'NOT_FOUND');

      const cues = CaptionLocalizationService.generateLocalizedCues(
        project.segments,
        project.target_language
      );

      let content = '';
      let filename = `captions-${project.target_language}.${format}`;

      if (format.toLowerCase() === 'vtt') {
        content = CaptionLocalizationService.generateVTT(cues);
      } else {
        content = CaptionLocalizationService.generateSRT(cues);
      }

      res.json({
        success: true,
        filename,
        format,
        content,
        cue_count: cues.length,
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * POST /api/translation/dub-projects
   */
  public static async createDubProject(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized.', 401, 'AUTH_REQUIRED');

      const {
        translation_project_id,
        clip_id,
        target_language,
        voice_strategy,
        target_voice_id,
        audio_mode,
        speaker_mappings,
      } = req.body;

      const dubProject = await DubbingService.createDubProject(
        {
          translation_project_id,
          clip_id,
          target_language,
          voice_strategy,
          target_voice_id,
          audio_mode,
          speaker_mappings,
        },
        userId
      );

      res.status(201).json({ success: true, dub_project: dubProject });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  /**
   * GET /api/translation/capabilities
   */
  public static async getCapabilities(_req: Request, res: Response): Promise<void> {
    try {
      const translation = TranslationProviderRegistry.getAllCapabilities();
      const lipSync = LipSyncProviderRegistry.getCapabilities();

      res.json({
        success: true,
        translation_providers: translation,
        lip_sync: lipSync,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

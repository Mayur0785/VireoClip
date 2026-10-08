import { Response } from 'express';
import { AuthenticatedRequest, AppError } from '../types/index.js';
import { ContentPackService } from '../services/contentPackService.js';
import { logger } from '../utils/logger.js';

export class ContentPackController {
  /**
   * Returns capabilities and provider state for Content Pack.
   */
  public static async getCapabilities(req: AuthenticatedRequest, res: Response): Promise<void> {
    const providerState = ContentPackService.getProviderState();
    res.json({
      status: 'ok',
      data: {
        provider_state: providerState,
        supported_platforms: ['youtube', 'shorts', 'instagram', 'tiktok', 'linkedin', 'x'],
        supported_modes: ['QUICK', 'BALANCED', 'FULL'],
        supported_templates: ['Creator', 'Podcast', 'Education', 'Business', 'Interview', 'Gaming', 'Vlog'],
        item_types: [
          'PRIMARY_TITLE',
          'ALT_TITLE',
          'HOOK',
          'SHORT_CAPTION',
          'LONG_CAPTION',
          'SHORT_DESCRIPTION',
          'LONG_DESCRIPTION',
          'CTA',
          'HASHTAGS',
          'KEYWORDS',
          'THUMBNAIL_TEXT',
          'THUMBNAIL_DIRECTION',
          'ALT_TEXT',
          'PINNED_COMMENT',
        ],
      },
    });
  }

  /**
   * Generates a new Content Pack for a clip.
   */
  public static async generateContentPack(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const projectId = req.params.projectId || req.body.projectId || req.body.project_id;
    const clipId = req.params.clipId || req.body.clipId || req.body.clip_id;
    const { mode, template, platform, user_instruction, userInstruction, brand_brain_id, brandBrainId } = req.body;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotency_key;

    if (!projectId || !clipId) {
      throw new AppError('Project ID and Clip ID are required.', 400, 'INVALID_INPUT');
    }

    const pack = await ContentPackService.generateContentPack({
      userId,
      projectId,
      clipId,
      mode,
      template,
      platform,
      userInstruction: user_instruction || userInstruction,
      brandBrainId: brand_brain_id || brandBrainId,
      idempotencyKey,
    });

    res.status(201).json({
      status: 'ok',
      data: pack,
    });
  }

  /**
   * Retrieves a Content Pack by ID.
   */
  public static async getContentPack(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const pack = await ContentPackService.getContentPack(userId, req.params.id);
    res.json({
      status: 'ok',
      data: pack,
    });
  }

  /**
   * Lists Content Packs for a clip.
   */
  public static async listPacksForClip(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const clipId = req.params.clipId;
    const packs = await ContentPackService.listPacksForClip(userId, clipId);
    res.json({
      status: 'ok',
      data: packs,
    });
  }

  /**
   * Updates a single item (manual edit, lock, approval).
   */
  public static async updateItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const { id: contentPackId, itemId } = req.params;
    const { text, locked, approved } = req.body;

    const updated = await ContentPackService.updateItem(userId, contentPackId, itemId, {
      text,
      locked,
      approved,
    });

    res.json({
      status: 'ok',
      data: updated,
    });
  }

  /**
   * Regenerates a single item.
   */
  public static async regenerateItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const { id: contentPackId, itemId } = req.params;
    const { user_instruction, userInstruction } = req.body;

    const updated = await ContentPackService.regenerateItem(
      userId,
      contentPackId,
      itemId,
      user_instruction || userInstruction
    );

    res.json({
      status: 'ok',
      data: updated,
    });
  }

  /**
   * Regenerates items for a specific platform.
   */
  public static async regeneratePlatform(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const { id: contentPackId, platform } = req.params;
    const { user_instruction, userInstruction } = req.body;

    const pack = await ContentPackService.regeneratePlatform(
      userId,
      contentPackId,
      platform as any,
      user_instruction || userInstruction
    );

    res.json({
      status: 'ok',
      data: pack,
    });
  }

  /**
   * Regenerates the entire Content Pack.
   */
  public static async regeneratePack(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const { id: contentPackId } = req.params;
    const { user_instruction, userInstruction } = req.body;

    const pack = await ContentPackService.regeneratePack(
      userId,
      contentPackId,
      user_instruction || userInstruction
    );

    res.json({
      status: 'ok',
      data: pack,
    });
  }

  /**
   * Approves the Content Pack and all its items.
   */
  public static async approvePack(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const pack = await ContentPackService.approvePack(userId, req.params.id);
    res.json({
      status: 'ok',
      data: pack,
    });
  }

  /**
   * Translates the Content Pack to a target language.
   */
  public static async translatePack(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const { target_language, targetLanguage } = req.body;
    const lang = target_language || targetLanguage;
    if (!lang) {
      throw new AppError('Target language is required.', 400, 'INVALID_INPUT');
    }

    const pack = await ContentPackService.translateContentPack(userId, req.params.id, lang);
    res.json({
      status: 'ok',
      data: pack,
    });
  }

  /**
   * Returns the publish handoff payload for the specified platform.
   */
  public static async getPublishHandoff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    const { id: contentPackId, platform } = req.params;
    const payload = await ContentPackService.getPublishHandoffPayload(
      userId,
      contentPackId,
      platform as any
    );

    res.json({
      status: 'ok',
      data: payload,
    });
  }
}

import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID, BrollStyle } from '../types/index.js';
import { MediaAssetService } from '../services/mediaAssetService.js';
import { StockMediaProviderRegistry } from '../services/stockMediaProvider.js';
import { BrollOpportunityService } from '../services/brollOpportunityService.js';
import { BrollPlanService } from '../services/brollPlanService.js';
import { MediaImportService } from '../services/mediaImportService.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/media/capabilities
 * Returns status of all stock and AI media providers.
 */
export const getMediaCapabilities = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const capabilities = StockMediaProviderRegistry.getAllCapabilities();
    res.status(200).json({ status: 'ok', data: capabilities });
  } catch (err: any) {
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/media/search
 * Natural-language and filtered search across project media, user library, brand, and stock providers.
 */
export const searchMedia = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  try {
    const filter = req.body || {};
    // Bound query string length to prevent oversized inputs
    if (filter.query && typeof filter.query === 'string' && filter.query.length > 200) {
      filter.query = filter.query.slice(0, 200);
    }

    const results = await MediaAssetService.searchMedia(userId, filter);
    res.status(200).json({ status: 'ok', data: results });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'SEARCH_FAILED',
      message: err.message || 'Media search failed.',
    });
  }
};

/**
 * GET /api/media/assets
 * Lists persisted user media library assets.
 */
export const listMediaAssets = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  try {
    const projectId = typeof req.query.project_id === 'string' && isValidUUID(req.query.project_id) ? req.query.project_id : undefined;
    const sourceType = typeof req.query.source_type === 'string' ? req.query.source_type as any : undefined;
    const mediaType = typeof req.query.media_type === 'string' ? req.query.media_type as any : undefined;

    const result = await MediaAssetService.searchMedia(userId, {
      project_id: projectId,
      source_type: sourceType,
      media_type: mediaType,
      per_page: 50,
    });

    res.status(200).json({ status: 'ok', data: result });
  } catch (err: any) {
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/media/assets/:id
 * Retrieves a single media asset by ID with strict ownership validation.
 */
export const getMediaAsset = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const assetId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!assetId || !isValidUUID(assetId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid asset UUID required.' });
    return;
  }

  try {
    const asset = await MediaAssetService.getAsset(assetId, userId);
    if (!asset) {
      res.status(404).json({ status: 'error', code: 'ASSET_NOT_FOUND', message: 'Asset not found or access denied.' });
      return;
    }

    res.status(200).json({ status: 'ok', data: asset });
  } catch (err: any) {
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/media/assets/:id/similar
 * Returns similar assets from user library based on tags and semantic overlap.
 */
export const getSimilarMediaAssets = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const assetId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!assetId || !isValidUUID(assetId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid asset UUID required.' });
    return;
  }

  try {
    const similar = await MediaAssetService.findSimilar(assetId, userId, 6);
    res.status(200).json({ status: 'ok', data: similar });
  } catch (err: any) {
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/media/import
 * Backend SSRF-protected download and ingestion of remote stock media.
 */
export const importRemoteMedia = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  const { url, provider, provider_asset_id, title, license_type, license_source, source_page_url, attribution, project_id } = req.body || {};

  if (!url || typeof url !== 'string') {
    res.status(400).json({ status: 'error', code: 'INVALID_URL', message: 'Valid media URL is required.' });
    return;
  }

  try {
    const imported = await MediaImportService.importRemoteMedia(userId, {
      url,
      provider,
      provider_asset_id,
      title,
      license_type,
      license_source,
      source_page_url,
      attribution,
      project_id,
    });

    res.status(201).json({ status: 'ok', data: imported });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'IMPORT_FAILED',
      message: err.message || 'Failed to import remote media.',
    });
  }
};

/**
 * POST /api/clips/:clipId/broll/opportunities
 * Analyzes clip context and identifies B-roll insertion opportunities.
 */
export const detectClipBrollOpportunities = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  const style: BrollStyle = req.body?.style || 'BALANCED';

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID required.' });
    return;
  }

  try {
    const opportunities = await BrollOpportunityService.detectOpportunities(clipId, userId, style);
    res.status(200).json({ status: 'ok', data: opportunities });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'DETECTION_FAILED',
      message: err.message || 'Failed to detect B-roll opportunities.',
    });
  }
};

/**
 * POST /api/clips/:clipId/broll/plan
 * Generates an automatic B-roll plan with discovered and ranked candidate assets.
 */
export const createClipBrollPlan = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  const style: BrollStyle = req.body?.style || 'BALANCED';

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID required.' });
    return;
  }

  try {
    const plan = await BrollPlanService.createPlan(clipId, userId, { style });
    res.status(201).json({ status: 'ok', data: plan });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'PLAN_CREATION_FAILED',
      message: err.message || 'Failed to create B-roll plan.',
    });
  }
};

/**
 * GET /api/clips/:clipId/broll/plan
 * Retrieves the latest B-roll plan for a clip.
 */
export const getClipBrollPlan = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID required.' });
    return;
  }

  try {
    const plan = await BrollPlanService.getLatestPlanForClip(clipId, userId);
    res.status(200).json({ status: 'ok', data: plan });
  } catch (err: any) {
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/broll-plans/:planId/apply
 * Applies approved B-roll suggestions into the EditorProject multi-track timeline.
 */
export const applyBrollPlan = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const planId = req.params.planId;
  const selectedSuggestionIds: string[] | undefined = req.body?.suggestion_ids;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!planId || !isValidUUID(planId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid plan UUID required.' });
    return;
  }

  try {
    const result = await BrollPlanService.applyPlan(planId, userId, selectedSuggestionIds);
    res.status(200).json({ status: 'ok', data: result });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'APPLY_FAILED',
      message: err.message || 'Failed to apply B-roll plan.',
    });
  }
};

/**
 * POST /api/editor-projects/:id/insert-broll
 * Directly inserts a single chosen media asset into an editor project at specified time.
 */
export const insertDirectBroll = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const { asset_id, timeline_start, duration } = req.body || {};

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid editor project UUID required.' });
    return;
  }

  if (!asset_id || !isValidUUID(asset_id)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid asset UUID required.' });
    return;
  }

  const start = typeof timeline_start === 'number' ? Math.max(0, timeline_start) : 0;
  const dur = typeof duration === 'number' && duration > 0 ? duration : 3.0;

  try {
    const updated = await BrollPlanService.insertDirectAsset(projectId, userId, asset_id, start, dur);
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INSERTION_FAILED',
      message: err.message || 'Failed to insert B-roll asset.',
    });
  }
};

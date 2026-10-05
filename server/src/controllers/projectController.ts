import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { Response } from 'express';
import crypto from 'crypto';
import {
  AuthenticatedRequest,
  isValidUUID,
  VALID_PLATFORMS,
  OutputPlatform,
  PROCESSABLE_STATUSES,
} from '../types/index.js';
import { deletePrefix, projectObjectPrefix, sourceObjectKey, signSourceUpload, headObject, signObjectGet } from '../services/objectStorageService.js';
import { deleteProjectRecords } from '../db/repositories/deletionRepository.js';
import { claimProjectProcessing } from '../db/repositories/projectRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/avi',
  'video/mkv',
];

/**
 * GET /api/projects
 * List all projects belonging to the authenticated user with pagination
 */
export const listProjects = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured. Please configure MongoDB credentials.',
    });
    return;
  }

  const limitParam = parseInt(String(req.query.limit || '50'), 10);
  const offsetParam = parseInt(String(req.query.offset || '0'), 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 100);
  const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);

  try {
    const { data, count, error } = await dataRepository
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to list projects from MongoDB', {
        requestId: req.requestId,
        userId,
        error: error.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to retrieve projects.' });
      return;
    }

    res.status(200).json({
      status: 'ok',
      projects: data || [],
      total: count ?? (data?.length || 0),
      limit,
      offset,
    });
  } catch (err) {
    logger.error('Unexpected error listing projects', {
      requestId: req.requestId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * GET /api/projects/:id
 * Retrieve a specific project owned by the authenticated user
 */
export const getProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    const { data, error } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch project from MongoDB', {
        requestId: req.requestId,
        projectId,
        userId,
        error: error.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to fetch project.' });
      return;
    }

    if (!data) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    res.status(200).json({ status: 'ok', project: data });
  } catch (err) {
    logger.error('Unexpected error fetching project', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/** PATCH /api/projects/:id: editable project metadata only. */
export const updateProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  if (!req.user?.id) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const updates: Record<string, string> = {};
  if (typeof req.body?.title === 'string') {
    const value = req.body.title.trim();
    if (!value || value.length > 255) { res.status(400).json({ status: 'error', code: 'INVALID_TITLE', message: 'Title must be 1 to 255 characters.' }); return; }
    updates.title = value;
  }
  if (typeof req.body?.notes === 'string') updates.notes = req.body.notes.trim().slice(0, 2000);
  if (!Object.keys(updates).length) { res.status(400).json({ status: 'error', code: 'INVALID_UPDATE', message: 'No editable fields supplied.' }); return; }
  const { data, error } = await dataRepository.from('projects').update(updates).eq('id', projectId).select().maybeSingle();
  if (error) { res.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Project update failed.' }); return; }
  if (!data) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  res.status(200).json({ status: 'ok', project: data });
};

/**
 * POST /api/projects
 * Create a new video project with strict validation
 */
export const createProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured. Project creation requires MongoDB connection.',
    });
    return;
  }

  const {
    id,
    title,
    source_type = 'upload',
    source_url,
    storage_path,
    file_size,
    mime_type,
    notes = '',
  } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ status: 'error', code: 'INVALID_TITLE', message: 'Project title is required.' });
    return;
  }

  if (source_type !== 'upload') {
    res.status(400).json({ status: 'error', code: 'UNSUPPORTED_SOURCE', message: 'Only direct video uploads are supported.' });
    return;
  }

  if (title.trim().length > 255) {
    res.status(400).json({ status: 'error', code: 'TITLE_TOO_LONG', message: 'Project title cannot exceed 255 characters.' });
    return;
  }

  if (id && !isValidUUID(id)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Supplied project ID must be a valid UUID.' });
    return;
  }

  // Validate file size limit (50 MB)
  if (file_size !== undefined && file_size !== null) {
    const bytes = Number(file_size);
    if (isNaN(bytes) || bytes < 0 || bytes > config.maxVideoBytes) {
      res.status(400).json({
        status: 'error',
        code: 'FILE_SIZE_EXCEEDED',
        message: `Video file exceeds the maximum allowed size of ${config.maxVideoBytes / (1024 * 1024)} MB.`,
      });
      return;
    }
  }

  // Validate MIME type if supplied
  if (mime_type && !ALLOWED_MIME_TYPES.includes(mime_type.toLowerCase())) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_MIME_TYPE',
      message: 'Invalid video file format. Supported formats are MP4, MOV, WEBM, AVI, and MKV.',
    });
    return;
  }

  if (storage_path || source_url) {
    res.status(400).json({ status: 'error', code: 'UPLOAD_REQUIRED', message: 'Use the signed upload endpoint for video files.' });
    return;
  }
  const projectRecord = {
    id: id || crypto.randomUUID(),
    user_id: userId,
    title: title.trim(),
    source_type,
    source_url: null,
    video_status: 'uploading',
    notes: String(notes || '').trim().slice(0, 2000),
  };

  try {
    const { data, error } = await dataRepository
      .from('projects')
      .insert(projectRecord)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create project in MongoDB', {
        requestId: req.requestId,
        userId,
        error: error.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to create project.' });
      return;
    }

    res.status(201).json({ status: 'ok', project: data });
  } catch (err) {
    logger.error('Unexpected error creating project', {
      requestId: req.requestId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/** Short lived, owner-scoped upload grant. The browser receives only a URL and headers. */
export const createProjectUploadUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  if (!userId) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { fileName, fileSize, contentType } = req.body || {};
  if (typeof fileName !== 'string' || typeof contentType !== 'string' || !ALLOWED_MIME_TYPES.includes(contentType.toLowerCase())) {
    res.status(400).json({ status: 'error', code: 'INVALID_FILE', message: 'A supported video filename and MIME type are required.' }); return;
  }
  const size = Number(fileSize);
  if (!Number.isSafeInteger(size) || size <= 0 || size > config.maxVideoBytes) {
    res.status(400).json({ status: 'error', code: 'FILE_SIZE_EXCEEDED', message: 'Video must be between 1 byte and 2 GiB.' }); return;
  }
  const { data: project, error } = await dataRepository.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error || !project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  if (!['uploading', 'failed'].includes(project.video_status)) {
    res.status(409).json({ status: 'error', code: 'UPLOAD_NOT_ALLOWED', message: 'Project cannot accept an upload now.' }); return;
  }
  const key = sourceObjectKey(userId, projectId, fileName);
  const uploadUrl = await signSourceUpload(key, contentType);
  const update = await dataRepository.from('projects').update({
    pending_upload_key: key, pending_upload_size: size, pending_upload_mime_type: contentType,
    pending_upload_expires_at: new Date(Date.now() + 15 * 60_000), video_status: 'uploading',
  }).eq('id', projectId);
  if (update.error) { res.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Could not create upload session.' }); return; }
  res.status(200).json({ status: 'ok', uploadUrl, headers: { 'Content-Type': contentType }, expiresInSeconds: 900 });
};

export const confirmProjectUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  if (!userId) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { data: project, error } = await dataRepository.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error || !project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  if (project.video_status === 'uploaded' && project.source_url && !project.pending_upload_key) {
    res.status(200).json({ status: 'ok', project }); return;
  }
  if (!project.pending_upload_key || !project.pending_upload_size || !project.pending_upload_mime_type ||
      !project.pending_upload_expires_at || new Date(project.pending_upload_expires_at).getTime() < Date.now()) {
    res.status(409).json({ status: 'error', code: 'UPLOAD_SESSION_EXPIRED', message: 'Request a new upload URL.' }); return;
  }
  const object = await headObject('source', project.pending_upload_key);
  if (object.size !== project.pending_upload_size || object.size > config.maxVideoBytes ||
      object.contentType.toLowerCase() !== project.pending_upload_mime_type.toLowerCase()) {
    res.status(400).json({ status: 'error', code: 'UPLOAD_MISMATCH', message: 'Uploaded file does not match the signed upload session.' }); return;
  }
  const result = await dataRepository.from('projects').update({
    source_url: project.pending_upload_key, source_object_key: project.pending_upload_key,
    pending_upload_key: null, pending_upload_size: null, pending_upload_mime_type: null,
    pending_upload_expires_at: null, video_status: 'uploaded',
  }).eq('id', projectId).select().single();
  if (result.error || !result.data) { res.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Could not confirm upload.' }); return; }
  res.status(200).json({ status: 'ok', project: result.data });
};

export const getProjectSourcePreviewUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user?.id) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  const projectId = req.params.id;
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { data: project } = await dataRepository.from('projects').select('source_url').eq('id', projectId).maybeSingle();
  if (!project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  if (!project.source_url) { res.status(409).json({ status: 'error', code: 'SOURCE_NOT_READY', message: 'Source video is not uploaded.' }); return; }
  const signedUrl = await signObjectGet('source', project.source_url);
  res.status(200).json({ status: 'ok', signedUrl, expiresInSeconds: 300 });
};

/**
 * DELETE /api/projects/:id
 * Delete a project belonging to the authenticated user and clean up storage assets
 */
export const deleteProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    // 1. Fetch project to check ownership and get storage path
    const { data: project, error: fetchError } = await dataRepository
      .from('projects')
      .select('id, user_id, source_url')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Failed to query project for deletion', {
        requestId: req.requestId,
        projectId,
        userId,
        error: fetchError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to access project for deletion.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    const prefix = projectObjectPrefix(userId, projectId);
    await deletePrefix('source', prefix);
    await deletePrefix('clips', prefix);

    await deleteProjectRecords(userId, projectId);

    res.status(200).json({ status: 'ok', message: 'Project and associated assets deleted successfully.' });
  } catch (err) {
    logger.error('Unexpected error deleting project', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * POST /api/projects/:id/process
 * Start video processing and transcription pipeline with state machine checks & recovery
 */
export const processProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  const selectedProvider = (config.transcriptionProvider || 'groq').toLowerCase().trim();
  const isProviderConfigured =
    selectedProvider === 'openrouter' ? Boolean(config.openrouterApiKey) : Boolean(config.groqApiKey);

  if (!isProviderConfigured) {
    const keyName = selectedProvider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'GROQ_API_KEY';
    res.status(503).json({
      status: 'error',
      code: 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED',
      message: `Transcription provider "${selectedProvider}" is not configured. Please set ${keyName} in server environment.`,
    });
    return;
  }

  try {
    // 1. Fetch project and verify ownership
    const { data: project, error: fetchError } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Failed to fetch project for processing', {
        requestId: req.requestId,
        projectId,
        userId,
        error: fetchError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to access project.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    // 2. State machine & concurrency checks (H6, H9)
    const currentStatus = project.video_status;
    const updatedAt = new Date(project.updated_at || project.created_at).getTime();
    const staleThresholdMs = config.processingStaleMinutes * 60 * 1000;
    const isStale = Date.now() - updatedAt > staleThresholdMs;

    if (currentStatus === 'processing' || currentStatus === 'transcribing') {
      if (!isStale) {
        res.status(409).json({
          status: 'error',
          code: 'PROCESSING_ACTIVE',
          message: 'Video is currently being processed. Please wait for the current run to finish.',
          projectId,
          video_status: currentStatus,
        });
        return;
      }
      logger.warn(`Project ${projectId} was stuck in '${currentStatus}' for > ${config.processingStaleMinutes}m. Allowing recovery run.`);
    } else if (!PROCESSABLE_STATUSES.includes(currentStatus as any) && currentStatus !== 'transcribed' && currentStatus !== 'completed') {
      res.status(400).json({
        status: 'error',
        code: 'INVALID_STATUS',
        message: `Project cannot be processed in status '${currentStatus}'. Upload a video first.`,
        projectId,
        video_status: currentStatus,
      });
      return;
    }

    // 3. Validate source type & presence of source_url
    if (project.source_type !== 'upload') {
      res.status(400).json({
        status: 'error',
        code: 'UNSUPPORTED_SOURCE',
        message: 'Processing currently supports direct video uploads.',
      });
      return;
    }

    if (!project.source_url) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_SOURCE_FILE',
        message: 'Project does not have an uploaded video file associated with it.',
      });
      return;
    }

    const { processProjectVideo, isProjectProcessingActive } = await import('../services/videoProcessingService.js');
    if (isProjectProcessingActive(projectId)) {
      res.status(409).json({ status: 'error', code: 'PROCESSING_ACTIVE', message: 'Video processing is already active.' });
      return;
    }

    // 4. Concurrency-safe atomic quota reservation
    const { UsageService } = await import('../services/usageService.js');
    const rawAttemptId = req.headers['x-processing-attempt-id'] as string;
    const attemptId = rawAttemptId && isValidUUID(rawAttemptId) ? rawAttemptId : crypto.randomUUID();

    // Clamp client-supplied estimated minutes between 0.5 and 60.0 (prevents abuse)
    const rawEstimate = Number(req.body?.estimated_minutes);
    const estimatedMinutes = !isNaN(rawEstimate) && rawEstimate > 0 ? Math.min(Math.max(rawEstimate, 0.5), 60.0) : 3.0;

    const reservation = await UsageService.reserveQuota(userId, projectId, attemptId, estimatedMinutes);

    if (!reservation.allowed) {
      logger.warn('User exceeded processing quota', {
        userId,
        projectId,
        limitMinutes: reservation.limitMinutes,
        remainingMinutes: reservation.remainingMinutes,
      });
      res.status(403).json({
        status: 'error',
        code: reservation.errorCode || 'QUOTA_EXCEEDED',
        message: reservation.errorMessage || 'Monthly video processing quota exceeded.',
        billing_period: reservation.billingPeriod,
        limit_minutes: reservation.limitMinutes,
        remaining_minutes: reservation.remainingMinutes,
        requested_minutes: reservation.requestedMinutes,
        reset_date: reservation.resetDate,
      });
      return;
    }

    if (reservation.idempotent) {
      res.status(202).json({ status: 'ok', message: 'Processing attempt already accepted.',
        projectId, processingAttemptId: attemptId, video_status: project.video_status });
      return;
    }

    let claimed: boolean;
    try {
      claimed = await claimProjectProcessing(userId, projectId, currentStatus,
        new Date(project.updated_at || project.created_at));
    } catch (error) {
      await UsageService.releaseReservation(attemptId, 'Project processing claim failed');
      throw error;
    }
    if (!claimed) {
      await UsageService.releaseReservation(attemptId, 'Another processing run started first');
      res.status(409).json({ status: 'error', code: 'PROCESSING_ACTIVE', message: 'Video processing has already started.' });
      return;
    }

    // 5. Initiate processing pipeline asynchronously
    // Run pipeline in background with unique processing_attempt_id
    processProjectVideo(projectId, userId, project.source_url, attemptId)
      .then((result) => {
        if (result.status === 'transcribed') {
          logger.info(`Background pipeline completed for project ${projectId} (attempt: ${attemptId})`, { projectId, userId });
        } else {
          logger.warn(`Background pipeline failed for project ${projectId} (attempt: ${attemptId})`, { projectId, error: result.error });
        }
      })
      .catch((err) => {
        UsageService.releaseReservation(attemptId, 'Processing could not start').catch(() => undefined);
        logger.error(`Background pipeline unexpected error for project ${projectId} (attempt: ${attemptId})`, {
          projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    res.status(202).json({
      status: 'ok',
      message: 'Video processing started.',
      projectId,
      processingAttemptId: attemptId,
      video_status: 'processing',
    });
  } catch (err) {
    logger.error('Unexpected error initiating project processing', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });

    res.status(503).json({
      status: 'error',
      code: 'DATABASE_UNAVAILABLE',
      message: 'Could not start video processing. Please try again.',
    });
  }
};

/**
 * GET /api/projects/:id/transcript
 * Retrieve stored transcript for a project owned by the user
 */
export const getProjectTranscript = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    // 1. Verify project ownership first
    const { data: project, error: projectError } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projectError) {
      logger.error('Failed to verify project ownership', {
        requestId: req.requestId,
        projectId,
        error: projectError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to verify project access.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    // 2. Fetch transcript
    const { data: transcript, error: transcriptError } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (transcriptError) {
      logger.error('Failed to fetch transcript', {
        requestId: req.requestId,
        projectId,
        error: transcriptError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to fetch transcript.' });
      return;
    }

    if (!transcript) {
      res.status(404).json({ status: 'error', code: 'TRANSCRIPT_NOT_FOUND', message: 'Transcript not found for this project.' });
      return;
    }

    res.status(200).json({
      status: 'ok',
      transcript,
    });
  } catch (err) {
    logger.error('Unexpected error fetching transcript', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * POST /api/projects/:id/generate-content
 * Generate platform-specific AI content
 */
export const generateProjectContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const platform = req.body?.platform || req.query?.platform;
  const customNotes = req.body?.customNotes;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  if (platform && !VALID_PLATFORMS.includes(platform as OutputPlatform)) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_PLATFORM',
      message: `Invalid platform. Supported platforms: ${VALID_PLATFORMS.join(', ')}.`,
    });
    return;
  }

  if (!config.openrouterApiKey) {
    res.status(503).json({
      status: 'error',
      code: 'PROVIDER_NOT_CONFIGURED',
      message: 'OpenRouter AI service is not configured. Please set OPENROUTER_API_KEY.',
    });
    return;
  }

  try {
    const overrideTone = typeof req.body?.overrideTone === 'string' ? req.body.overrideTone.slice(0, 200) : undefined;
    const overrideLanguage = typeof req.body?.overrideLanguage === 'string' ? req.body.overrideLanguage.slice(0, 100) : undefined;
    const overrideCTA = typeof req.body?.overrideCTA === 'string' ? req.body.overrideCTA.slice(0, 300) : undefined;
    const overrides = (overrideTone || overrideLanguage || overrideCTA) ? { overrideTone, overrideLanguage, overrideCTA } : undefined;

    const { contentGenerationService } = await import('../services/contentGenerationService.js');
    const result = await contentGenerationService.generateContentForProject({
      projectId,
      userId,
      platform: platform as OutputPlatform | undefined,
      customNotes: typeof customNotes === 'string' ? customNotes.trim().slice(0, 2000) : undefined,
      overrides,
    });

    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error generating content for project', {
      requestId: req.requestId,
      projectId,
      userId,
      error: message,
    });

    if (message.includes('Transcript is not available yet')) {
      res.status(400).json({
        status: 'error',
        code: 'TRANSCRIPT_REQUIRED',
        message: 'Transcript is not available yet. Please complete transcription first.',
      });
      return;
    }

    if (message.includes('Project not found')) {
      res.status(404).json({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Project not found or access denied.',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      code: 'GENERATION_FAILED',
      message: message || 'Failed to generate content.',
    });
  }
};

/**
 * GET /api/projects/:id/content
 * Retrieve all content outputs for a project owned by the authenticated user
 */
export const getProjectContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    // Verify ownership
    const { data: project, error: projErr } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr) {
      logger.error('Error verifying project ownership', {
        requestId: req.requestId,
        projectId,
        error: projErr.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to verify project access.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    const { ContentOutputService } = await import('../services/contentOutputService.js');
    const outputs = await ContentOutputService.getOutputsForProject(projectId);

    res.status(200).json({
      status: 'ok',
      projectId,
      outputs,
    });
  } catch (err) {
    logger.error('Unexpected error fetching content outputs', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * PATCH /api/projects/:id/content/:outputId
 * Edit / save content for a specific output item
 */
export const updateProjectContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const outputId = req.params.outputId;
  const content = req.body?.content;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!outputId || !isValidUUID(outputId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid output UUID is required.' });
    return;
  }

  if (typeof content !== 'string') {
    res.status(400).json({ status: 'error', code: 'INVALID_CONTENT', message: 'Content string is required.' });
    return;
  }

  if (content.length > 50000) {
    res.status(400).json({ status: 'error', code: 'CONTENT_TOO_LARGE', message: 'Content exceeds maximum length (50,000 characters).' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    // Verify project ownership
    const { data: project } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    const { ContentOutputService } = await import('../services/contentOutputService.js');
    const updated = await ContentOutputService.updateOutputContent(outputId, projectId, content);

    res.status(200).json({
      status: 'ok',
      output: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error updating content output', {
      requestId: req.requestId,
      projectId,
      outputId,
      error: message,
    });
    res.status(500).json({ status: 'error', code: 'UPDATE_FAILED', message: message || 'Failed to update output.' });
  }
};

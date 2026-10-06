import { Response } from 'express';
import { AuthenticatedRequest, AppError } from '../types/index.js';
import { publishingService } from '../services/publishingService.js';
import { socialService } from '../services/socialService.js';

export async function getPublishingAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const accounts = await socialService.getSafeUserConnections(req.user.id);
  res.json({
    status: 'ok',
    data: { accounts },
  });
}

export async function previewPublish(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const { socialConnectionId, clipId, payload } = req.body;
  if (!socialConnectionId) {
    throw new AppError('socialConnectionId is required.', 400, 'INVALID_REQUEST');
  }

  const result = await publishingService.previewPublish(
    req.user.id,
    socialConnectionId,
    clipId,
    payload || {}
  );

  res.json({
    status: 'ok',
    data: result,
  });
}

export async function publishNow(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const { projectId, clipId, contentOutputId, socialConnectionId, payload } = req.body;
  if (!projectId || !socialConnectionId) {
    throw new AppError('projectId and socialConnectionId are required.', 400, 'INVALID_REQUEST');
  }

  const result = await publishingService.createPublishPost({
    userId: req.user.id,
    projectId,
    clipId,
    contentOutputId,
    socialConnectionId,
    payload: payload || {},
    publishType: 'now',
  });

  res.status(202).json({
    status: 'ok',
    data: {
      post: result.post,
      job: result.job,
    },
    message: 'Publishing job queued.',
  });
}

export async function schedulePost(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const { projectId, clipId, contentOutputId, socialConnectionId, payload, scheduledFor, timezone } = req.body;
  if (!projectId || !socialConnectionId || !scheduledFor) {
    throw new AppError('projectId, socialConnectionId, and scheduledFor are required.', 400, 'INVALID_REQUEST');
  }

  const result = await publishingService.createPublishPost({
    userId: req.user.id,
    projectId,
    clipId,
    contentOutputId,
    socialConnectionId,
    payload: payload || {},
    publishType: 'scheduled',
    scheduledFor,
    timezone,
  });

  res.status(201).json({
    status: 'ok',
    data: {
      post: result.post,
      job: result.job,
    },
    message: 'Post scheduled successfully.',
  });
}

export async function getPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const status = req.query.status as string | undefined;
  const provider = req.query.provider as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

  const result = await publishingService.getUserPosts(req.user.id, { status, provider, limit, offset });

  res.json({
    status: 'ok',
    data: result,
  });
}

export async function getPostById(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const post = await publishingService.getPostById(req.user.id, req.params.id);

  res.json({
    status: 'ok',
    data: { post },
  });
}

export async function cancelPost(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  await publishingService.cancelScheduledPost(req.user.id, req.params.id);

  res.json({
    status: 'ok',
    message: 'Scheduled post cancelled.',
  });
}

export async function reschedulePost(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const { scheduledFor, timezone } = req.body;
  if (!scheduledFor) {
    throw new AppError('scheduledFor timestamp is required.', 400, 'INVALID_REQUEST');
  }

  await publishingService.reschedulePost(req.user.id, req.params.id, scheduledFor, timezone);

  res.json({
    status: 'ok',
    message: 'Post rescheduled successfully.',
  });
}

export async function retryPost(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  await publishingService.retryFailedPost(req.user.id, req.params.id);

  res.json({
    status: 'ok',
    message: 'Publishing retry initiated.',
  });
}

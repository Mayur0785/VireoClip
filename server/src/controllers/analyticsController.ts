import { Response } from 'express';
import { AuthenticatedRequest, AppError } from '../types/index.js';
import { AnalyticsQueryService } from '../services/analytics/analyticsQueryService.js';
import { AnalyticsSyncService } from '../services/analytics/analyticsSyncService.js';
import { GrowthCoachService, ContentMemoryService } from '../services/analytics/growthCoachService.js';
import { socialAnalyticsRegistry } from '../services/analytics/socialAnalyticsRegistry.js';

export async function getOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
  const overview = await AnalyticsQueryService.getOverview(userId, { days });

  res.status(200).json({ status: 'ok', data: overview });
}

export async function getTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
  const timeline = await AnalyticsQueryService.getTimeline(userId, days);

  res.status(200).json({ status: 'ok', data: timeline });
}

export async function getPlatformComparison(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const platforms = await AnalyticsQueryService.getPlatformComparison(userId);
  res.status(200).json({ status: 'ok', data: platforms });
}

export async function getPostsPerformance(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const posts = await AnalyticsQueryService.getPostsPerformance(userId);
  res.status(200).json({ status: 'ok', data: posts });
}

export async function getCapabilities(req: AuthenticatedRequest, res: Response): Promise<void> {
  const capabilities = socialAnalyticsRegistry.getAllCapabilities();
  res.status(200).json({ status: 'ok', data: capabilities });
}

export async function syncAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const postId = req.body?.publishedPostId;
  if (postId) {
    const record = await AnalyticsSyncService.syncPostAnalytics(userId, postId);
    res.status(200).json({ status: 'ok', data: record });
  } else {
    const result = await AnalyticsSyncService.syncUserAnalytics(userId);
    res.status(200).json({ status: 'ok', data: result });
  }
}

export async function getGrowthCoach(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const recommendations = await GrowthCoachService.getRecommendations(userId);
  res.status(200).json({ status: 'ok', data: recommendations });
}

export async function getContentMemories(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const memories = await ContentMemoryService.getMemories(userId);
  res.status(200).json({ status: 'ok', data: memories });
}

export async function getCreatorPerformanceContext(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

  const context = await ContentMemoryService.getCreatorPerformanceContext(userId);
  res.status(200).json({ status: 'ok', data: context });
}

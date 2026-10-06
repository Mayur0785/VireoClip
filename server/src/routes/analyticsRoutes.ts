import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generalLimiter, expensiveLimiter } from '../middleware/rateLimiter.js';
import {
  getOverview,
  getTimeline,
  getPlatformComparison,
  getPostsPerformance,
  getCapabilities,
  syncAnalytics,
  getGrowthCoach,
  getContentMemories,
  getCreatorPerformanceContext,
} from '../controllers/analyticsController.js';

const router = Router();

// All analytics routes require verified authentication & ownership
router.use(requireAuth);

router.get('/overview', generalLimiter, asyncHandler(getOverview));
router.get('/timeline', generalLimiter, asyncHandler(getTimeline));
router.get('/platforms', generalLimiter, asyncHandler(getPlatformComparison));
router.get('/posts', generalLimiter, asyncHandler(getPostsPerformance));
router.get('/capabilities', generalLimiter, asyncHandler(getCapabilities));
router.post('/sync', expensiveLimiter, asyncHandler(syncAnalytics));
router.get('/growth-coach', generalLimiter, asyncHandler(getGrowthCoach));
router.get('/memories', generalLimiter, asyncHandler(getContentMemories));
router.get('/creator-context', generalLimiter, asyncHandler(getCreatorPerformanceContext));

export default router;

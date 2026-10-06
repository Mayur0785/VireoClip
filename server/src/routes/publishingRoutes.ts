import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter, generalLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getPublishingAccounts,
  previewPublish,
  publishNow,
  schedulePost,
  getPosts,
  getPostById,
  cancelPost,
  reschedulePost,
  retryPost,
} from '../controllers/publishingController.js';

const router = Router();

// 1. Get connected accounts available for publishing
router.get('/accounts', requireAuth, generalLimiter, asyncHandler(getPublishingAccounts));

// 2. Validate & preview post
router.post('/preview', requireAuth, generalLimiter, asyncHandler(previewPublish));

// 3. Publish immediately (rate limited by expensiveLimiter)
router.post('/publish', requireAuth, expensiveLimiter, asyncHandler(publishNow));

// 4. Schedule post
router.post('/schedule', requireAuth, expensiveLimiter, asyncHandler(schedulePost));

// 5. Post listing (with filters for status and provider)
router.get('/posts', requireAuth, generalLimiter, asyncHandler(getPosts));

// 6. Get single post details
router.get('/posts/:id', requireAuth, generalLimiter, asyncHandler(getPostById));

// 7. Cancel scheduled post
router.post('/posts/:id/cancel', requireAuth, generalLimiter, asyncHandler(cancelPost));

// 8. Reschedule post
router.patch('/posts/:id/schedule', requireAuth, generalLimiter, asyncHandler(reschedulePost));

// 9. Retry failed post
router.post('/posts/:id/retry', requireAuth, expensiveLimiter, asyncHandler(retryPost));

export default router;

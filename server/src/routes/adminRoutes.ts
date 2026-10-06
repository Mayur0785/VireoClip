import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { adminLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getAdminOverview,
  getAdminUsers,
  getAdminUserDetail,
  getAdminProjects,
  getAdminRenderJobs,
  getAdminSubscriptions,
  getAdminPublishing,
  getAdminSocialAccounts,
  getAdminUsage,
  getAdminHealth,
} from '../controllers/adminController.js';

const router = Router();

// Protect ALL admin routes with requireAuth, requireAdmin, and adminLimiter
router.use(requireAuth);
router.use(requireAdmin);
router.use(adminLimiter);

router.get('/overview', asyncHandler(getAdminOverview));
router.get('/users', asyncHandler(getAdminUsers));
router.get('/users/:userId', asyncHandler(getAdminUserDetail));
router.get('/projects', asyncHandler(getAdminProjects));
router.get('/render-jobs', asyncHandler(getAdminRenderJobs));
router.get('/subscriptions', asyncHandler(getAdminSubscriptions));
router.get('/publishing', asyncHandler(getAdminPublishing));
router.get('/social-accounts', asyncHandler(getAdminSocialAccounts));
router.get('/usage', asyncHandler(getAdminUsage));
router.get('/health', asyncHandler(getAdminHealth));

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generalLimiter, expensiveLimiter } from '../middleware/rateLimiter.js';
import { BrandBrainController } from '../controllers/brandBrainController.js';

const router = Router();

// All brand brain routes require authenticated session & ownership verification
router.use(requireAuth);

router.get('/', generalLimiter, asyncHandler(BrandBrainController.getProfile));
router.patch('/', generalLimiter, asyncHandler(BrandBrainController.updateProfile));
router.post('/lock', generalLimiter, asyncHandler(BrandBrainController.setLock));
router.post('/reset-learned', generalLimiter, asyncHandler(BrandBrainController.resetLearned));

router.get('/context', generalLimiter, asyncHandler(BrandBrainController.getBrandContext));
router.get('/evidence', generalLimiter, asyncHandler(BrandBrainController.getEvidence));
router.post('/check', generalLimiter, asyncHandler(BrandBrainController.checkCompliance));

router.get('/recommendations', generalLimiter, asyncHandler(BrandBrainController.getRecommendations));
router.post('/recommendations/apply', generalLimiter, asyncHandler(BrandBrainController.applyRecommendation));
router.post('/recommendations/:id/approve', generalLimiter, asyncHandler(BrandBrainController.approveRecommendation));
router.post('/recommendations/:id/dismiss', generalLimiter, asyncHandler(BrandBrainController.dismissRecommendation));

router.post('/apply-to-editor', expensiveLimiter, asyncHandler(BrandBrainController.applyToEditor));
router.post('/revert-editor', expensiveLimiter, asyncHandler(BrandBrainController.revertEditor));

router.get('/versions', generalLimiter, asyncHandler(BrandBrainController.getVersions));
router.post('/restore/:version', expensiveLimiter, asyncHandler(BrandBrainController.restoreVersion));

router.post('/parse-guidelines', generalLimiter, asyncHandler(BrandBrainController.parseGuidelines));
router.post('/learn', expensiveLimiter, asyncHandler(BrandBrainController.learn));

export default router;

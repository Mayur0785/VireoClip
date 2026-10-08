import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ContentPackController } from '../controllers/contentPackController.js';

const router = Router();

// Capabilities
router.get('/capabilities', requireAuth, asyncHandler(ContentPackController.getCapabilities));

// Direct generate endpoint
router.post('/generate', requireAuth, expensiveLimiter, asyncHandler(ContentPackController.generateContentPack));

// Content Pack details
router.get('/:id', requireAuth, asyncHandler(ContentPackController.getContentPack));

// Individual Item Operations
router.patch('/:id/items/:itemId', requireAuth, asyncHandler(ContentPackController.updateItem));
router.post('/:id/items/:itemId/regenerate', requireAuth, expensiveLimiter, asyncHandler(ContentPackController.regenerateItem));

// Platform & Pack Regeneration
router.post('/:id/platforms/:platform/regenerate', requireAuth, expensiveLimiter, asyncHandler(ContentPackController.regeneratePlatform));
router.post('/:id/regenerate', requireAuth, expensiveLimiter, asyncHandler(ContentPackController.regeneratePack));

// Pack Approval & Translation
router.post('/:id/approve', requireAuth, asyncHandler(ContentPackController.approvePack));
router.post('/:id/translate', requireAuth, expensiveLimiter, asyncHandler(ContentPackController.translatePack));

// Publish Handoff
router.get('/:id/publish-handoff/:platform', requireAuth, asyncHandler(ContentPackController.getPublishHandoff));

export default router;

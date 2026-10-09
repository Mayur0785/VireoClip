import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ThumbnailLabController } from '../controllers/thumbnailLabController.js';

const router = Router();

// Capabilities
router.get('/capabilities', requireAuth, asyncHandler(ThumbnailLabController.getCapabilities));

// Session Lifecycle
router.post('/sessions', requireAuth, expensiveLimiter, asyncHandler(ThumbnailLabController.createOrGetSession));
router.get('/sessions/:id', requireAuth, asyncHandler(ThumbnailLabController.getSession));
router.get('/sessions/:id/source-frames', requireAuth, asyncHandler(ThumbnailLabController.getSourceFrames));

// Concept Generation & Updates
router.post('/sessions/:id/generate', requireAuth, expensiveLimiter, asyncHandler(ThumbnailLabController.generateConcepts));
router.patch('/sessions/:id/concepts/:conceptId', requireAuth, asyncHandler(ThumbnailLabController.updateConcept));

// Approval & Version History
router.post('/sessions/:id/concepts/:conceptId/approve', requireAuth, asyncHandler(ThumbnailLabController.approveConcept));
router.post('/sessions/:id/versions/:versionId/restore', requireAuth, asyncHandler(ThumbnailLabController.restoreVersion));

// Content Pack & Publishing Handoff
router.post('/sessions/:id/import-content-pack', requireAuth, asyncHandler(ThumbnailLabController.importContentPack));
router.get('/sessions/:id/concepts/:conceptId/publishing-handoff', requireAuth, asyncHandler(ThumbnailLabController.getPublishingHandoff));

export default router;

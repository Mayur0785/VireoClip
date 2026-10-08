import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HookLabController } from '../controllers/hookLabController.js';

const router = Router();

// Capabilities & Analytics Advisory
router.get('/capabilities', requireAuth, asyncHandler(HookLabController.getCapabilities));
router.get('/analytics-advisory', requireAuth, asyncHandler(HookLabController.getAnalyticsAdvisory));

// Session Lifecycle
router.post('/sessions', requireAuth, expensiveLimiter, asyncHandler(HookLabController.createOrGetSession));
router.get('/sessions/:id', requireAuth, asyncHandler(HookLabController.getSession));
router.get('/sessions/:id/existing-lines', requireAuth, asyncHandler(HookLabController.getExistingLines));

// Candidate Generation & Regeneration
router.post('/sessions/:id/generate', requireAuth, expensiveLimiter, asyncHandler(HookLabController.generateCandidates));
router.patch('/sessions/:id/candidates/:candidateId', requireAuth, asyncHandler(HookLabController.updateCandidate));
router.post('/sessions/:id/candidates/:candidateId/regenerate', requireAuth, expensiveLimiter, asyncHandler(HookLabController.regenerateCandidate));

// Reversible Editor Operations & Preview
router.post('/sessions/:id/candidates/:candidateId/apply', requireAuth, expensiveLimiter, asyncHandler(HookLabController.applyToEditor));
router.post('/sessions/:id/candidates/:candidateId/revert', requireAuth, expensiveLimiter, asyncHandler(HookLabController.revertInEditor));
router.post('/sessions/:id/candidates/:candidateId/preview', requireAuth, expensiveLimiter, asyncHandler(HookLabController.renderPreview));

// Approval & Evidence Learning
router.post('/sessions/:id/candidates/:candidateId/approve', requireAuth, asyncHandler(HookLabController.approveCandidate));

// Content Pack Integrations
router.post('/sessions/:id/import-content-pack', requireAuth, asyncHandler(HookLabController.importContentPack));
router.post('/sessions/:id/sync-content-pack', requireAuth, asyncHandler(HookLabController.syncContentPack));

export default router;

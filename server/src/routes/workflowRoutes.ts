import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { WorkflowController } from '../controllers/workflowController.js';

const router = Router();

// All workflow routes require authenticated session & tenant ownership verification
router.use(requireAuth);

router.get('/', generalLimiter, asyncHandler(WorkflowController.listWorkflows));
router.post('/', generalLimiter, asyncHandler(WorkflowController.createWorkflow));
router.get('/:id', generalLimiter, asyncHandler(WorkflowController.getWorkflow));
router.post('/:id/transition', generalLimiter, asyncHandler(WorkflowController.transitionWorkflow));
router.post('/:id/approve', generalLimiter, asyncHandler(WorkflowController.approveWorkflow));
router.post('/:id/request-revisions', generalLimiter, asyncHandler(WorkflowController.requestRevisions));

export default router;

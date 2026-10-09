import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AutopilotController } from '../controllers/autopilotController.js';

const router = Router();

router.use(requireAuth);

router.get('/capabilities', asyncHandler(AutopilotController.getCapabilities));
router.post('/runs', asyncHandler(AutopilotController.createRun));
router.get('/runs/:runId', asyncHandler(AutopilotController.getRun));
router.get('/clips/:clipId', asyncHandler(AutopilotController.getRunsForClip));
router.post('/runs/:runId/execute', asyncHandler(AutopilotController.executeRun));
router.post('/runs/:runId/retry', asyncHandler(AutopilotController.retryStep));
router.post('/runs/:runId/approve', asyncHandler(AutopilotController.approveRun));

export default router;

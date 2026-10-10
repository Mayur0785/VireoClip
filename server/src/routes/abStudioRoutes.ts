import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ABStudioController } from '../controllers/abStudioController.js';

const router = Router();

// Capabilities
router.get('/capabilities', requireAuth, asyncHandler(ABStudioController.getCapabilities));

// Experiments
router.get('/experiments', requireAuth, asyncHandler(ABStudioController.listUserExperiments));
router.post('/experiments', requireAuth, asyncHandler(ABStudioController.createExperiment));
router.get('/experiments/:id', requireAuth, asyncHandler(ABStudioController.getExperiment));
router.get('/experiments/:id/report', requireAuth, asyncHandler(ABStudioController.getExperimentReport));
router.get('/experiments/:id/export', requireAuth, asyncHandler(ABStudioController.exportExperimentCsv));
router.delete('/experiments/:id', requireAuth, asyncHandler(ABStudioController.deleteExperiment));

// Clip Experiments list
router.get('/clips/:clipId', requireAuth, asyncHandler(ABStudioController.getExperimentsForClip));

// Lifecycle Transitions
router.post('/experiments/:id/start', requireAuth, asyncHandler(ABStudioController.startExperiment));
router.post('/experiments/:id/pause', requireAuth, asyncHandler(ABStudioController.pauseExperiment));

// Observation Recording & CSV Analytics Import
router.post('/experiments/:id/observations', requireAuth, asyncHandler(ABStudioController.recordObservation));
router.post('/experiments/:id/import-csv/preview', requireAuth, asyncHandler(ABStudioController.previewCsvImport));
router.post('/experiments/:id/import-csv/execute', requireAuth, asyncHandler(ABStudioController.executeCsvImport));

// Winner Declaration & Safe Promotion
router.post('/experiments/:id/declare-winner', requireAuth, asyncHandler(ABStudioController.declareWinner));
router.post('/experiments/:id/promote-winner', requireAuth, asyncHandler(ABStudioController.promoteWinner));

export default router;

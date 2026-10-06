import { Router } from 'express';
import { checkHealth, checkReadiness } from '../controllers/healthController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/health (Process liveness)
router.get('/health', asyncHandler(checkHealth));

// GET /api/ready (Critical dependencies readiness)
router.get('/ready', asyncHandler(checkReadiness));

export default router;

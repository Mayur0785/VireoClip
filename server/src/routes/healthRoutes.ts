import { Router } from 'express';
import { checkHealth } from '../controllers/healthController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/health
router.get('/health', asyncHandler(checkHealth));

export default router;

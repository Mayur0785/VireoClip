import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBillingUsage } from '../controllers/billingController.js';

const router = Router();

// GET /api/billing/usage
router.get('/usage', requireAuth, getBillingUsage);

export default router;

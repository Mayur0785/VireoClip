import { Router, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// GET /api/auth/me - Protected route testing authentication middleware
router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    status: 'ok',
    user: {
      id: req.user?.id,
      email: req.user?.email,
    },
  });
});

export default router;

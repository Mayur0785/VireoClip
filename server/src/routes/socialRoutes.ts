import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getConnectedAccounts,
  initiateConnect,
  handleCallback,
  disconnectAccount,
  refreshConnection,
  getConnectionStatus,
} from '../controllers/socialController.js';

const router = Router();

// Apply general user rate limiter to all social endpoints
router.use(generalLimiter);

// 1. Get all connected accounts (safe metadata only)
router.get('/accounts', requireAuth, asyncHandler(getConnectedAccounts));

// 2. Initiate OAuth flow for a platform (returns authorization URL)
router.post('/:provider/connect', requireAuth, asyncHandler(initiateConnect));

// 3. OAuth callback endpoint (redirected from provider)
// Note: handleCallback uses the state token stored in DB to verify and bind to the authenticated user
router.get('/:provider/callback', asyncHandler(handleCallback));

// 4. Disconnect a connection
router.post('/:connectionId/disconnect', requireAuth, asyncHandler(disconnectAccount));

// 5. Refresh credentials for a connection
router.post('/:connectionId/refresh', requireAuth, asyncHandler(refreshConnection));

// 6. Check connection status
router.get('/:connectionId/status', requireAuth, asyncHandler(getConnectionStatus));

export default router;

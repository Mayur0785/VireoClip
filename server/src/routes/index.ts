import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import projectRoutes from './projectRoutes.js';
import billingRoutes from './billingRoutes.js';
import socialRoutes from './socialRoutes.js';
import publishingRoutes from './publishingRoutes.js';
import adminRoutes from './adminRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getProfiles, saveProfiles, getCreatorProfile, updateCreatorProfile } from '../controllers/profileController.js';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);
apiRouter.use('/', authRoutes);
apiRouter.get('/profiles/me', requireAuth, asyncHandler(getProfiles));
apiRouter.put('/profiles/me', requireAuth, asyncHandler(saveProfiles));
apiRouter.get('/creator-profile', requireAuth, asyncHandler(getCreatorProfile));
apiRouter.put('/creator-profile', requireAuth, asyncHandler(updateCreatorProfile));
apiRouter.patch('/creator-profile', requireAuth, asyncHandler(updateCreatorProfile));
apiRouter.use('/', projectRoutes);
apiRouter.use('/billing', billingRoutes);
apiRouter.use('/social', socialRoutes);
apiRouter.use('/publishing', publishingRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/admin', adminRoutes);

export default apiRouter;


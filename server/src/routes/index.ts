import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import projectRoutes from './projectRoutes.js';
import billingRoutes from './billingRoutes.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getProfiles, saveProfiles } from '../controllers/profileController.js';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);
apiRouter.use('/', authRoutes);
apiRouter.get('/profiles/me', requireAuth, asyncHandler(getProfiles));
apiRouter.put('/profiles/me', requireAuth, asyncHandler(saveProfiles));
apiRouter.use('/', projectRoutes);
apiRouter.use('/billing', billingRoutes);

export default apiRouter;

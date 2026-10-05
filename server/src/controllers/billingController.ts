import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { UsageService } from '../services/usageService.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/billing/usage
 * Retrieves user's monthly processing usage, limits, and UTC reset date
 */
export const getBillingUsage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  try {
    const usage = await UsageService.getCurrentUsage(userId);
    res.status(200).json({
      status: 'ok',
      data: usage,
    });
  } catch (err: any) {
    logger.error(`Failed to fetch billing usage for user ${userId}:`, err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve usage data.',
    });
  }
};

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AppError } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Admin authorization middleware:
 * Requires verified Supabase user identity attached by `requireAuth`.
 * Validates that user ID or user email is explicitly present in server-side admin configuration.
 *
 * Rejects with:
 * - 401 if unauthenticated (no user)
 * - 403 if authenticated but not authorized as admin
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;
  if (!user || !user.id) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const userEmail = (user.email || '').trim().toLowerCase();
  const userId = user.id.trim();

  const isEmailAdmin = userEmail.length > 0 && config.adminEmails.includes(userEmail);
  const isIdAdmin = userId.length > 0 && config.adminUserIds.includes(userId);

  if (!isEmailAdmin && !isIdAdmin) {
    logger.warn('[Admin Auth] Forbidden admin access attempt', {
      userId,
      userEmail,
      ip: req.ip,
      path: req.originalUrl,
    });
    throw new AppError('Forbidden: Admin access required.', 403, 'FORBIDDEN_ADMIN_ACCESS');
  }

  next();
};

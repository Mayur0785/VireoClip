import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import { ownerContext } from '../db/repositories/dataRepository.js';

/**
 * Authentication middleware: verifies Supabase JWT Bearer token.
 *
 * SECURITY:
 * - NO demo-token fallback. Production and development both require real Supabase auth.
 * - If Supabase is not configured, the endpoint returns 503 (service unavailable).
 * - User identity comes ONLY from verified token, never from request body.
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Fail closed: if Supabase is not configured, no authentication is possible
  if (!isServerSupabaseConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Authentication service is not configured. Please configure Supabase credentials.',
    });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      code: 'AUTH_MISSING',
      message: 'Authentication required. Missing Bearer token in Authorization header.',
    });
    return;
  }

  const token = authHeader.split(' ')[1]?.trim();

  if (!token) {
    res.status(401).json({
      status: 'error',
      code: 'AUTH_EMPTY',
      message: 'Authentication token is empty.',
    });
    return;
  }

  try {
    const { data: { user }, error } = await supabaseAuthClient.auth.getUser(token);

    if (error || !user) {
      logger.warn('Auth verification failed', {
        ip: req.ip,
        reason: error?.message || 'User not found',
      });
      res.status(401).json({
        status: 'error',
        code: 'AUTH_INVALID',
        message: 'Invalid or expired authentication token.',
      });
      return;
    }

    req.user = user;
    ownerContext.run(user.id, next);
  } catch (err) {
    logger.error('Unexpected error validating auth token', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(401).json({
      status: 'error',
      code: 'AUTH_ERROR',
      message: 'Failed to authenticate request.',
    });
  }
};

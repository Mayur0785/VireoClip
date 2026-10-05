import { Request, Response, NextFunction } from 'express';
import { AppError, AuthenticatedRequest } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Global error handler.
 * - Catches both synchronous and async errors (when wrapped with asyncHandler).
 * - Never exposes stack traces, SQL errors, or internal paths to the client.
 * - Logs full error details server-side for debugging.
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = (req as AuthenticatedRequest).requestId;

  // Determine status code and error code
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
    statusCode = (err as any).statusCode;
    message = statusCode === 500 ? 'Internal server error' : err.message;
  }

  // Log error internally with full context (never leaked to client)
  logger.error(`Error on ${req.method} ${req.originalUrl}: ${err.message}`, {
    requestId,
    statusCode,
    code,
    stack: config.isProduction ? undefined : err.stack,
  });

  res.status(statusCode).json({
    status: 'error',
    code,
    message,
    ...(requestId ? { requestId } : {}),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
};

/**
 * Wraps an async Express handler to ensure rejected promises are forwarded
 * to the Express error handler. Express 4 does not do this automatically.
 */
export const asyncHandler = (
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

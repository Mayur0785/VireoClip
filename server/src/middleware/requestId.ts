import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import crypto from 'crypto';

/**
 * Request ID middleware: assigns a unique correlation ID to each request.
 * Accepts a safe incoming X-Request-ID header or generates a new UUID.
 * The ID is attached to the request object and returned in the response header.
 */
export const requestIdMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  // Accept incoming ID if it looks safe (alphanumeric + hyphens, max 64 chars)
  const incomingId = req.headers['x-request-id'];
  const safePattern = /^[a-zA-Z0-9_-]{1,64}$/;
  const requestId =
    typeof incomingId === 'string' && safePattern.test(incomingId)
      ? incomingId
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

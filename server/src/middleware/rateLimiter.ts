import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter: reasonable limit for normal endpoints.
 * 100 requests per minute per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again shortly.',
  },
});

/**
 * Expensive operations rate limiter: processing, transcription, content generation.
 * 10 requests per minute per IP for paid AI operations.
 */
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many processing requests. Please wait before trying again.',
  },
});

/**
 * Auth-adjacent rate limiter: login/signup attempts.
 * 20 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many authentication attempts. Please try again later.',
  },
});

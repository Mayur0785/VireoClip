import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateEnvironment } from './config/index.js';
import { logger } from './utils/logger.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { bootstrapMongo } from './db/bootstrapMongo.js';
import { closeMongo, isMongoConfigured } from './db/mongoClient.js';
import { UsageService } from './services/usageService.js';
import { socialService } from './services/socialService.js';
import { startPublishingWorker, stopPublishingWorker } from './services/publishing/publishingWorker.js';
import { checkHealth, checkReadiness } from './controllers/healthController.js';
import { asyncHandler } from './middleware/errorHandler.js';

// Validate environment variables on startup (fails fast in production)
validateEnvironment();

const app = express();

// Trust reverse proxy (Vercel, Cloudflare, ALB, Nginx) for accurate client IP and protocol
app.set('trust proxy', 1);

// Root health & readiness probes (Step 14: /health and /ready)
app.get('/health', asyncHandler(checkHealth));
app.get('/ready', asyncHandler(checkReadiness));

// Security headers (H1)
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);

// Request correlation ID (M3)
app.use(requestIdMiddleware);

// CORS configuration (L3 & Step 6 CORS Hardening)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server, curl, mobile, and same-origin requests (no Origin header)
      if (!origin) return callback(null, true);
      if (config.corsAllowedOrigins.includes(origin) || (!config.isProduction && origin.includes('localhost'))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// Rate limiting (H2)
app.use('/api', generalLimiter);

// Webhooks require the raw request body Buffer for cryptographic signature verification
app.use('/api/billing/webhooks/paddle', express.raw({ type: 'application/json' }));
app.use('/api/billing/webhooks/razorpay', express.raw({ type: 'application/json' }));
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Request body size limits (H3)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
app.use('/api', apiRouter);

// 404 & Global Error Handlers (M2)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server if not running inside test runner
let server: ReturnType<typeof app.listen> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let oauthCleanupTimer: ReturnType<typeof setInterval> | null = null;

if (process.env.NODE_ENV !== 'test') {
  const start = async () => {
    if (isMongoConfigured) await bootstrapMongo();
    if (isMongoConfigured) {
      const cleanup = () => UsageService.cleanupOrphanedReservations(30)
        .then((count) => { if (count > 0) logger.info(`Released ${count} orphaned usage reservations.`); })
        .catch((error) => logger.warn('Usage reservation cleanup failed', { error: error instanceof Error ? error.message : String(error) }));
      cleanup();
      cleanupTimer = setInterval(cleanup, 10 * 60_000);
      cleanupTimer.unref();

      // Periodic OAuth state cleanup (Step 18)
      const oauthCleanup = () => socialService.cleanupExpiredOAuthStates()
        .then((count) => { if (count > 0) logger.info(`Cleaned up ${count} expired/consumed OAuth state(s).`); })
        .catch((error) => logger.warn('OAuth state cleanup failed', { error: error instanceof Error ? error.message : String(error) }));
      oauthCleanup();
      oauthCleanupTimer = setInterval(oauthCleanup, 15 * 60_000);
      oauthCleanupTimer.unref();

      // Start Phase 10 persistent publishing worker
      startPublishingWorker();
    }
    server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`Server running in ${config.nodeEnv} mode on http://0.0.0.0:${config.port}`);
      logger.info(`Health check available at http://localhost:${config.port}/api/health`);
    });
  };
  start().catch((error) => {
    logger.error('Database bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
    closeMongo().finally(() => process.exit(1));
  });

  // Graceful shutdown handling (H8 & Step 15)
  const handleShutdown = (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    stopPublishingWorker();
    if (cleanupTimer) clearInterval(cleanupTimer);
    if (oauthCleanupTimer) clearInterval(oauthCleanupTimer);
    if (server) {
      server.close(async (err) => {
        if (err) {
          logger.error('Error during server shutdown', err);
          process.exit(1);
        }
        logger.info('HTTP server closed successfully.');
        await closeMongo();
        process.exit(0);
      });

      // Force exit after 10 seconds if connections refuse to close
      setTimeout(() => {
        logger.error('Forced shutdown: timeout waiting for open connections to close.');
        process.exit(1);
      }, 10000).unref();
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;

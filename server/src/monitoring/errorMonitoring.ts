import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface ErrorMonitoringEvent {
  error: Error;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info';
}

export interface ErrorMonitoringClient {
  captureException(error: Error, context?: Record<string, unknown>): string | void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error', context?: Record<string, unknown>): void;
  setUser(user: { id: string; email?: string } | null): void;
}

/**
 * Standard provider-neutral Error Monitoring Abstraction.
 * In development / unconfigured environments, delegates to structured logger.
 * Allows seamless plugging of Sentry, Datadog, or OpenTelemetry in production.
 */
class ErrorMonitoringService implements ErrorMonitoringClient {
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = config.isProduction;
  }

  public captureException(error: Error, context: Record<string, unknown> = {}): string {
    const errorId = (context.requestId as string) || `err_${Date.now()}`;
    
    // Log through structured server logger
    logger.error(`[ErrorMonitoring] ${error.message}`, {
      errorId,
      stack: config.isProduction ? undefined : error.stack,
      ...context,
    });

    // In production with an active DSN (e.g., SENTRY_DSN), capture exception here:
    // if (process.env.SENTRY_DSN) { Sentry.captureException(error, { extra: context }); }

    return errorId;
  }

  public captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context: Record<string, unknown> = {}
  ): void {
    if (level === 'error') {
      logger.error(`[ErrorMonitoring] ${message}`, context);
    } else if (level === 'warning') {
      logger.warn(`[ErrorMonitoring] ${message}`, context);
    } else {
      logger.info(`[ErrorMonitoring] ${message}`, context);
    }
  }

  public setUser(user: { id: string; email?: string } | null): void {
    // Provider hook for Sentry.setUser / Datadog user tagging
    if (!user) return;
  }
}

export const errorMonitoring = new ErrorMonitoringService();

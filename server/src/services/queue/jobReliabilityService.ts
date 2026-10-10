import crypto from 'node:crypto';
import { AppError } from '../../types/index.js';

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

export interface JobDiagnosticInfo {
  jobId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  durationMs?: number;
  lastFailureReason?: string | null;
  nextRetryAt?: Date | string | null;
  requiresManualIntervention: boolean;
  isStale: boolean;
}

/**
 * Allowed State Machine Transition Maps
 */
export const ALLOWED_AUTOPILOT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'],
  COMPLETED: ['APPROVED', 'RUNNING'], // RUNNING only via explicit stage rerun
  FAILED: ['RUNNING', 'PENDING'],     // Via retryFailedStep
  BLOCKED: ['RUNNING', 'PENDING'],    // Via retryFailedStep
  CANCELLED: [],                      // Terminal
  APPROVED: ['RUNNING'],              // Allowed via explicit stage rerun with forceRerun
};

export const ALLOWED_RENDER_JOB_TRANSITIONS: Record<string, string[]> = {
  queued: ['processing', 'failed'],
  processing: ['uploading', 'completed', 'failed', 'queued'], // queued on transient retry
  uploading: ['completed', 'failed', 'queued'],               // queued on transient retry
  completed: [],                                              // Terminal
  failed: ['queued'],                                         // Manual or auto retry
};

export const ALLOWED_PUBLISH_JOB_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['publishing', 'cancelled', 'failed'],
  publishing: ['completed', 'failed', 'scheduled'], // scheduled on retry or lease recovery
  completed: [],                                    // Terminal
  failed: ['scheduled'],                            // Retry
  cancelled: [],                                    // Terminal
};

export const ALLOWED_VIDEO_ANALYSIS_TRANSITIONS: Record<string, string[]> = {
  queued: ['processing', 'failed'],
  processing: ['completed', 'failed', 'queued'], // queued on transient retry
  completed: [],                                 // Terminal
  failed: ['queued'],                            // Retry
};

const SENSITIVE_PATTERNS = [
  /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
  /https?:\/\/[^\/\s:]+:[^@\s]+@[^\s"']+/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /(?:api[_-]?key|secret|password|token)[=:\s]+[a-zA-Z0-9_\-\.]{4,}/gi,
  /fal_[a-zA-Z0-9_\-]+/gi,
  /sk-[a-zA-Z0-9_\-]+/gi,
  /paddle_[a-zA-Z0-9_\-]+/gi,
  /rzp_[a-zA-Z0-9_\-]+/gi,
];

export class JobReliabilityService {
  /**
   * Sanitizes error messages by redacting API keys, bearer tokens, DB credentials,
   * and truncating output to a reasonable size (500 chars).
   */
  public static sanitizeErrorMessage(message?: string | null): string {
    if (!message || typeof message !== 'string') {
      return 'Unknown error occurred during execution.';
    }

    let sanitized = message;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    sanitized = sanitized.trim();
    if (sanitized.length > 500) {
      sanitized = sanitized.slice(0, 497) + '...';
    }

    return sanitized;
  }

  /**
   * Classifies whether an error is transient (temporary network/timeout/5xx)
   * or permanent (validation/auth/4xx/missing prerequisites).
   */
  public static isTransientError(error: any): boolean {
    if (!error) return false;

    const code = String(error.code || error.statusCode || error.status || '').toUpperCase();
    const message = String(error.message || '').toLowerCase();
    const name = String(error.name || '');

    // Strict permanent errors
    const permanentCodes = [
      'VALIDATION_ERROR',
      'INVALID_UUID',
      'INVALID_INPUT',
      'INVALID_STEP_STATE',
      'DELIVERABLE_MISSING',
      'OUTPUT_MISSING',
      'CLIP_NOT_FOUND',
      'PROJECT_NOT_FOUND',
      'POST_NOT_FOUND',
      'RUN_NOT_FOUND',
      'EXPERIMENT_NOT_FOUND',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'CANNOT_CANCEL',
      'CANNOT_RESCHEDULE',
      'PIPELINE_NOT_READY',
      'RULE_LOCKED',
      'CONFIRMATION_REQUIRED',
    ];

    if (permanentCodes.includes(code)) {
      return false;
    }

    // HTTP 4xx (except 429 Too Many Requests) are permanent client errors
    const httpStatus = Number(error.statusCode || error.status);
    if (!Number.isNaN(httpStatus) && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
      return false;
    }

    // Permanent message clues
    if (
      message.includes('not found') ||
      message.includes('access denied') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return false;
    }

    // Transient codes & patterns
    const transientCodes = [
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'TIMEOUT',
      'RENDER_TIMEOUT',
      'STORAGE_UNAVAILABLE',
      'DATABASE_UNAVAILABLE',
      'SERVICE_UNAVAILABLE',
      'NETWORK_ERROR',
      'RATE_LIMITED',
      'FFMPEG_FAILED',
      'PROVIDER_UNAVAILABLE',
      '503',
      '502',
      '504',
      '429',
    ];

    if (transientCodes.includes(code)) {
      return true;
    }

    if (
      name === 'MongoServerSelectionError' ||
      name === 'MongoNetworkError' ||
      name === 'FetchError' ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('connection reset') ||
      message.includes('econnreset') ||
      message.includes('deadlock') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504') ||
      message.includes('temporarily unavailable') ||
      message.includes('service unavailable') ||
      message.includes('gateway')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Computes exponential backoff delay with randomized jitter.
   * delay = min(maxDelay, baseDelay * 2^(attempt - 1)) * jitterFactor
   */
  public static computeBackoffDelayMs(
    attempt: number,
    options: BackoffOptions = {}
  ): number {
    const baseDelay = Math.max(100, options.baseDelayMs ?? 2000);
    const maxDelay = Math.max(baseDelay, options.maxDelayMs ?? 60000);
    const effectiveAttempt = Math.max(1, attempt);

    const exponential = baseDelay * Math.pow(2, effectiveAttempt - 1);
    const bounded = Math.min(maxDelay, exponential);

    if (options.jitter !== false) {
      // Full jitter: between 0.75x and 1.25x of bounded delay
      const jitterFactor = 0.75 + Math.random() * 0.5;
      return Math.floor(bounded * jitterFactor);
    }

    return Math.floor(bounded);
  }

  /**
   * Validates state machine transitions and prevents jumping into illegal states.
   */
  public static validateStateTransition(
    jobType: 'autopilot' | 'render' | 'publish' | 'video_analysis',
    currentState: string,
    nextState: string
  ): void {
    if (currentState === nextState) {
      return; // Idempotent same-state transition
    }

    let allowedMap: Record<string, string[]>;
    switch (jobType) {
      case 'autopilot':
        allowedMap = ALLOWED_AUTOPILOT_TRANSITIONS;
        break;
      case 'render':
        allowedMap = ALLOWED_RENDER_JOB_TRANSITIONS;
        break;
      case 'publish':
        allowedMap = ALLOWED_PUBLISH_JOB_TRANSITIONS;
        break;
      case 'video_analysis':
        allowedMap = ALLOWED_VIDEO_ANALYSIS_TRANSITIONS;
        break;
      default:
        throw new AppError(`Unknown job type: ${jobType}`, 400, 'INVALID_JOB_TYPE');
    }

    const allowedNext = allowedMap[currentState] || [];
    if (!allowedNext.includes(nextState)) {
      throw new AppError(
        `Invalid state transition for ${jobType} from "${currentState}" to "${nextState}". Allowed: [${allowedNext.join(', ')}]`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }
  }

  /**
   * Validates that required outputs are present before marking a job successful.
   * Throws DELIVERABLE_MISSING if any required output is missing or empty.
   */
  public static verifyRequiredOutputs(
    jobType: string,
    outputs: Record<string, any>
  ): void {
    for (const [key, value] of Object.entries(outputs)) {
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new AppError(
          `Cannot mark ${jobType} successful: required output "${key}" is missing or empty.`,
          400,
          'DELIVERABLE_MISSING'
        );
      }
    }
  }

  /**
   * Generates a unique worker/lease token.
   */
  public static generateWorkerToken(prefix = 'worker'): string {
    return `${prefix}_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Builds diagnostic status info for observability.
   */
  public static buildDiagnostics(options: {
    jobId: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    lastError?: string | null;
    nextRetryAt?: Date | string | null;
    staleThresholdMs?: number;
    updatedAt?: Date | string | null;
  }): JobDiagnosticInfo {
    const now = Date.now();
    let durationMs: number | undefined;

    if (options.startedAt) {
      const start = new Date(options.startedAt).getTime();
      const end = options.completedAt ? new Date(options.completedAt).getTime() : now;
      durationMs = Math.max(0, end - start);
    }

    const isStale = Boolean(
      options.updatedAt &&
      ['running', 'processing', 'uploading', 'publishing'].includes(options.status.toLowerCase()) &&
      now - new Date(options.updatedAt).getTime() > (options.staleThresholdMs || 300000)
    );

    const requiresManualIntervention =
      options.attempts >= options.maxAttempts ||
      options.status.toLowerCase() === 'failed' ||
      options.status.toLowerCase() === 'blocked';

    return {
      jobId: options.jobId,
      status: options.status,
      attempts: options.attempts,
      maxAttempts: options.maxAttempts,
      durationMs,
      lastFailureReason: options.lastError ? this.sanitizeErrorMessage(options.lastError) : null,
      nextRetryAt: options.nextRetryAt || null,
      requiresManualIntervention,
      isStale,
    };
  }
}

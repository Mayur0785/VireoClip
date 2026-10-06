import { SocialPlatform, PublishPayload } from '../../types/index.js';

export interface PlatformPublishCapabilities {
  supportsVideo: boolean;
  supportsTextOnly: boolean;
  maxTitleLength?: number;
  maxDescriptionLength?: number;
  maxVideoDurationSeconds?: number;
  maxVideoSizeBytes?: number;
  supportedMediaFormats: string[];
  supportsScheduling: boolean;
  notes?: string;
}

export interface PublishExecutionRequest {
  accessToken: string;
  payload: PublishPayload;
  mediaFilePath?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaContentType?: string;
}

export interface PublishExecutionResult {
  providerPostId: string;
  providerPostUrl?: string | null;
  metadata?: Record<string, any>;
}

export interface SocialPublishingProvider {
  readonly platform: SocialPlatform;

  /** Return supported capabilities and constraints for this platform */
  getCapabilities(): PlatformPublishCapabilities;

  /** Validate publish payload before attempting upload */
  validatePublishRequest(payload: PublishPayload, hasMedia: boolean): { valid: boolean; errors: string[] };

  /** Execute upload/publishing to the official platform API */
  publish(request: PublishExecutionRequest): Promise<PublishExecutionResult>;

  /** Check if a published error is retryable (5xx, rate limits, network) */
  isRetryableError(error: unknown): boolean;

  /** Normalize publishing error for logging and client-facing feedback */
  normalizePublishError(error: unknown): { code: string; message: string; retryable: boolean };
}

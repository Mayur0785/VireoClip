import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider,
  PlatformPublishCapabilities,
  PublishExecutionRequest,
  PublishExecutionResult,
} from '../types.js';

/**
 * X / Twitter Publishing Provider
 * Uses official Twitter API v2 Manage Tweets endpoint:
 * https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
 * Scopes: tweet.read, tweet.write
 */
export class XPublishingProvider implements SocialPublishingProvider {
  readonly platform = 'x' as const;

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true,
      supportsTextOnly: true,
      maxDescriptionLength: 280,
      maxVideoDurationSeconds: 140, // 2 mins 20 secs for standard tiers
      maxVideoSizeBytes: 512 * 1024 * 1024,
      supportedMediaFormats: ['mp4', 'mov'],
      supportsScheduling: true,
      notes: 'Requires X Developer Portal App with OAuth 2.0 tweet.write scope.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const text = payload.caption || payload.description || payload.title || '';
    if (!text.trim() && !hasMedia) {
      errors.push('X (Twitter) post requires either text content or media.');
    }
    if (text.length > 280) {
      errors.push(`X post text cannot exceed 280 characters (currently ${text.length}).`);
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const { accessToken, payload } = request;
    const text = payload.caption || payload.description || payload.title || '';

    // POST /2/tweets
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
      }),
    });

    const data = await res.json() as any;
    if (!res.ok || data.errors) {
      const errMsg = data.errors?.[0]?.message || data.detail || res.statusText;
      throw new AppError(`X tweet posting failed: ${errMsg}`, res.status >= 500 ? 502 : 400, 'X_PUBLISH_FAILED');
    }

    const tweetId = data.data?.id;
    return {
      providerPostId: tweetId,
      providerPostUrl: `https://x.com/i/status/${tweetId}`,
      metadata: {
        tweetId,
        text: data.data?.text,
      },
    };
  }

  isRetryableError(error: any): boolean {
    if (error?.statusCode >= 500 || error?.status >= 500) return true;
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('rate limit');
  }

  normalizePublishError(error: any): { code: string; message: string; retryable: boolean } {
    return {
      code: error?.code || 'X_PUBLISH_FAILED',
      message: error instanceof Error ? error.message : 'Unknown X error',
      retryable: this.isRetryableError(error),
    };
  }
}

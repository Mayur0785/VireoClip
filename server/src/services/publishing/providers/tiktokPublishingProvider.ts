import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider,
  PlatformPublishCapabilities,
  PublishExecutionRequest,
  PublishExecutionResult,
} from '../types.js';

/**
 * TikTok Publishing Provider
 * Uses official TikTok Content Posting API v2:
 * https://developers.tiktok.com/doc/content-posting-api-get-started
 * Requires: video.upload scope and approved developer app.
 */
export class TikTokPublishingProvider implements SocialPublishingProvider {
  readonly platform = 'tiktok' as const;

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true,
      supportsTextOnly: false,
      maxDescriptionLength: 2200,
      maxVideoDurationSeconds: 600, // 10 minutes
      maxVideoSizeBytes: 500 * 1024 * 1024, // 500MB
      supportedMediaFormats: ['mp4', 'webm', 'mov'],
      supportsScheduling: true,
      notes: 'Requires TikTok Developer Login Kit and Content Posting API permissions.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!hasMedia) {
      errors.push('TikTok publishing requires a rendered video clip.');
    }
    const caption = payload.caption || payload.description || payload.title || '';
    if (caption.length > 2200) {
      errors.push(`TikTok caption cannot exceed 2200 characters (currently ${caption.length}).`);
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const { accessToken, payload, mediaUrl } = request;

    if (!mediaUrl) {
      throw new AppError('TikTok publishing requires a video media URL.', 400, 'MEDIA_URL_REQUIRED');
    }

    const caption = payload.caption || payload.description || payload.title || '';

    // Official TikTok Content Posting API v2 init
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: payload.privacy === 'private' ? 'SELF_ONLY' : 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: mediaUrl,
        },
      }),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error?.code !== 'ok') {
      const errMsg = data.error?.message || res.statusText;
      throw new AppError(`TikTok post init failed: ${errMsg}`, res.status >= 500 ? 502 : 400, 'TIKTOK_PUBLISH_FAILED');
    }

    const publishId = data.data?.publish_id;
    return {
      providerPostId: publishId || 'tiktok_pending_publish',
      providerPostUrl: null, // TikTok generates URL after async encoding review
      metadata: {
        publishId,
        privacy: payload.privacy,
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
      code: error?.code || 'TIKTOK_PUBLISH_FAILED',
      message: error instanceof Error ? error.message : 'Unknown TikTok error',
      retryable: this.isRetryableError(error),
    };
  }
}

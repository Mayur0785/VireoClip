import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider,
  PlatformPublishCapabilities,
  PublishExecutionRequest,
  PublishExecutionResult,
} from '../types.js';

/**
 * Instagram Publishing Provider
 * Meta Graph API Video/Reels Publishing Container Flow:
 * 1. POST graph.facebook.com/v19.0/{ig_user_id}/media (media_type=REELS, video_url=...)
 * 2. GET graph.facebook.com/v19.0/{creation_id}?fields=status_code (wait for FINISHED)
 * 3. POST graph.facebook.com/v19.0/{ig_user_id}/media_publish (creation_id=...)
 */
export class InstagramPublishingProvider implements SocialPublishingProvider {
  readonly platform = 'instagram' as const;

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true,
      supportsTextOnly: false,
      maxDescriptionLength: 2200,
      maxVideoDurationSeconds: 900, // 15 mins for Reels
      maxVideoSizeBytes: 1024 * 1024 * 1024, // 1GB
      supportedMediaFormats: ['mp4', 'mov'],
      supportsScheduling: true,
      notes: 'Requires Instagram Business/Creator Account connected to a Meta Page with instagram_content_publish permission.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!hasMedia) {
      errors.push('Instagram Reels publishing requires a rendered video clip.');
    }
    const caption = payload.caption || payload.description || '';
    if (caption.length > 2200) {
      errors.push(`Instagram caption cannot exceed 2200 characters (currently ${caption.length}).`);
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const { accessToken, payload, mediaUrl } = request;

    if (!mediaUrl) {
      throw new AppError(
        'Instagram Graph API publishing requires a publicly reachable signed video URL.',
        400,
        'SIGNED_URL_REQUIRED'
      );
    }

    // Step 1: Query linked Instagram Business Account ID
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account{id}&access_token=${accessToken}`
    );
    const meData = await meRes.json() as any;
    let igUserId: string | null = null;

    if (meData?.data) {
      for (const page of meData.data) {
        if (page.instagram_business_account?.id) {
          igUserId = page.instagram_business_account.id;
          break;
        }
      }
    }

    if (!igUserId) {
      throw new AppError(
        'No Instagram Business or Creator account found linked to your Meta account. Please link an Instagram professional account to publish.',
        400,
        'INSTAGRAM_BUSINESS_ACCOUNT_NOT_FOUND'
      );
    }

    const caption = payload.caption || payload.description || payload.title || '';

    // Step 2: Create media container
    const containerParams = new URLSearchParams({
      media_type: 'REELS',
      video_url: mediaUrl,
      caption,
      access_token: accessToken,
    });

    const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: containerParams.toString(),
    });

    const containerData = await containerRes.json() as any;
    if (!containerRes.ok || containerData.error) {
      throw new AppError(
        `Instagram media container creation failed: ${containerData.error?.message || containerRes.statusText}`,
        400,
        'INSTAGRAM_CONTAINER_FAILED'
      );
    }

    const creationId = containerData.id;

    // Step 3: Poll media container status (up to 10 attempts, 3s intervals)
    let isReady = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json() as any;
        if (statusData.status_code === 'FINISHED') {
          isReady = true;
          break;
        } else if (statusData.status_code === 'ERROR') {
          throw new AppError('Instagram media processing encountered an error.', 502, 'INSTAGRAM_TRANSCODE_FAILED');
        }
      }
    }

    if (!isReady) {
      throw new AppError(
        'Instagram media container took too long to process. The job will be retried.',
        504,
        'INSTAGRAM_TIMEOUT'
      );
    }

    // Step 4: Publish container
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const pubRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    });

    const pubData = await pubRes.json() as any;
    if (!pubRes.ok || pubData.error) {
      throw new AppError(
        `Instagram publish failed: ${pubData.error?.message || pubRes.statusText}`,
        502,
        'INSTAGRAM_PUBLISH_FAILED'
      );
    }

    return {
      providerPostId: pubData.id,
      providerPostUrl: `https://www.instagram.com/p/${pubData.id}/`,
      metadata: {
        instagramMediaId: pubData.id,
        creationId,
      },
    };
  }

  isRetryableError(error: any): boolean {
    if (error?.statusCode >= 500 || error?.status >= 500) return true;
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('rate limit') || msg.includes('transcode');
  }

  normalizePublishError(error: any): { code: string; message: string; retryable: boolean } {
    return {
      code: error?.code || 'INSTAGRAM_PUBLISH_FAILED',
      message: error instanceof Error ? error.message : 'Unknown Instagram error',
      retryable: this.isRetryableError(error),
    };
  }
}

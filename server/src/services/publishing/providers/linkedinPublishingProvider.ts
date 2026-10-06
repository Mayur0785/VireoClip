import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider,
  PlatformPublishCapabilities,
  PublishExecutionRequest,
  PublishExecutionResult,
} from '../types.js';

/**
 * LinkedIn Publishing Provider
 * Uses official LinkedIn UGC / Share API (or Posts API v2):
 * https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
 * Supports text posts and member social shares with w_member_social scope.
 */
export class LinkedInPublishingProvider implements SocialPublishingProvider {
  readonly platform = 'linkedin' as const;

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true,
      supportsTextOnly: true,
      maxDescriptionLength: 3000,
      maxVideoDurationSeconds: 600, // 10 minutes
      maxVideoSizeBytes: 200 * 1024 * 1024, // 200MB
      supportedMediaFormats: ['mp4'],
      supportsScheduling: true,
      notes: 'Requires w_member_social scope.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const text = payload.caption || payload.description || payload.title || '';
    if (!text.trim() && !hasMedia) {
      errors.push('LinkedIn post requires either text content or a video clip.');
    }
    if (text.length > 3000) {
      errors.push(`LinkedIn post text cannot exceed 3000 characters (currently ${text.length}).`);
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const { accessToken, payload } = request;

    // Step 1: Fetch user URN
    const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      throw new AppError('Failed to fetch LinkedIn user profile for publishing.', 401, 'LINKEDIN_AUTH_FAILED');
    }
    const meData = await meRes.json() as any;
    const authorUrn = `urn:li:person:${meData.sub}`;

    const text = payload.caption || payload.description || payload.title || '';

    // Step 2: Publish UGC Post (Member Share)
    const shareBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const pubRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(shareBody),
    });

    const pubData = await pubRes.json() as any;
    if (!pubRes.ok || pubData.error) {
      const errMsg = pubData.message || pubRes.statusText;
      throw new AppError(`LinkedIn share failed: ${errMsg}`, pubRes.status >= 500 ? 502 : 400, 'LINKEDIN_PUBLISH_FAILED');
    }

    const shareUrn = pubData.id;
    return {
      providerPostId: shareUrn,
      providerPostUrl: `https://www.linkedin.com/feed/update/${shareUrn}/`,
      metadata: {
        authorUrn,
        shareUrn,
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
      code: error?.code || 'LINKEDIN_PUBLISH_FAILED',
      message: error instanceof Error ? error.message : 'Unknown LinkedIn error',
      retryable: this.isRetryableError(error),
    };
  }
}

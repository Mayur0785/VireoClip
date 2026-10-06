import { SocialAnalyticsProvider, PlatformAnalyticsCapabilities, PostAnalyticsResult } from '../types.js';
import { AppError } from '../../../types/index.js';

export class TikTokAnalyticsProvider implements SocialAnalyticsProvider {
  readonly platform = 'tiktok' as const;

  getCapabilities(): PlatformAnalyticsCapabilities {
    return {
      platform: 'tiktok',
      views: 'SUPPORTED',
      likes: 'SUPPORTED',
      comments: 'SUPPORTED',
      shares: 'SUPPORTED',
      saves: 'NOT_SUPPORTED',
      watchTime: 'NOT_SUPPORTED',
      averageWatchTime: 'NOT_SUPPORTED',
      impressions: 'NOT_SUPPORTED',
      reach: 'NOT_SUPPORTED',
      clicks: 'NOT_SUPPORTED',
      followersGained: 'NOT_SUPPORTED',
    };
  }

  async fetchPostAnalytics(providerPostId: string, accessToken: string): Promise<PostAnalyticsResult> {
    if (!accessToken) {
      throw new AppError('TikTok access token required.', 401, 'AUTH_MISSING');
    }

    // Call TikTok Display API /v2/video/query/ with fields: like_count, comment_count, share_count, view_count
    const url = 'https://open.tiktokapis.com/v2/video/query/';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: {
          video_ids: [providerPostId],
        },
      }),
    });

    if (!response.ok) {
      throw new AppError(`TikTok API error (${response.status})`, response.status, 'PROVIDER_API_ERROR');
    }

    const data = await response.json() as any;
    const video = data.data?.videos?.[0];
    if (!video) {
      throw new AppError(`TikTok video ${providerPostId} not found.`, 404, 'VIDEO_NOT_FOUND');
    }

    const views = video.view_count || 0;
    const likes = video.like_count || 0;
    const comments = video.comment_count || 0;
    const shares = video.share_count || 0;
    const engagement = likes + comments + shares;

    return {
      metrics: {
        views,
        likes,
        comments,
        shares,
        saves: 0,
        engagement_rate: views > 0 ? engagement / views : 0,
      },
      rawResponse: video,
    };
  }
}

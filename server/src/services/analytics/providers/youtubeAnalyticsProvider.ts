import { SocialAnalyticsProvider, PlatformAnalyticsCapabilities, PostAnalyticsResult } from '../types.js';
import { AppError } from '../../../types/index.js';

export class YouTubeAnalyticsProvider implements SocialAnalyticsProvider {
  readonly platform = 'youtube' as const;

  getCapabilities(): PlatformAnalyticsCapabilities {
    return {
      platform: 'youtube',
      views: 'SUPPORTED',
      likes: 'SUPPORTED',
      comments: 'SUPPORTED',
      shares: 'NOT_SUPPORTED', // Not exposed in public video statistics API
      saves: 'NOT_SUPPORTED',
      watchTime: 'NOT_SUPPORTED', // Requires full YouTube Analytics API with channel owner reporting
      averageWatchTime: 'NOT_SUPPORTED',
      impressions: 'NOT_SUPPORTED',
      reach: 'NOT_SUPPORTED',
      clicks: 'NOT_SUPPORTED',
      followersGained: 'NOT_SUPPORTED',
    };
  }

  async fetchPostAnalytics(providerPostId: string, accessToken: string): Promise<PostAnalyticsResult> {
    if (!accessToken) {
      throw new AppError('YouTube access token required.', 401, 'AUTH_MISSING');
    }

    // Call Google YouTube Data API v3 videos endpoint
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(providerPostId)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new AppError(`YouTube analytics API error (${response.status}): ${errBody}`, response.status, 'PROVIDER_API_ERROR');
    }

    const data = await response.json() as any;
    const item = data.items?.[0];
    if (!item) {
      throw new AppError(`YouTube video ${providerPostId} not found.`, 404, 'VIDEO_NOT_FOUND');
    }

    const stats = item.statistics || {};
    const views = parseInt(stats.viewCount || '0', 10);
    const likes = parseInt(stats.likeCount || '0', 10);
    const comments = parseInt(stats.commentCount || '0', 10);
    const engagement = likes + comments;
    const engagementRate = views > 0 ? engagement / views : 0;

    return {
      metrics: {
        views,
        likes,
        comments,
        shares: 0,
        saves: 0,
        engagement_rate: Math.round(engagementRate * 10000) / 10000,
      },
      rawResponse: stats,
      unsupportedMetrics: ['shares', 'saves', 'watch_time_seconds', 'reach'],
    };
  }
}

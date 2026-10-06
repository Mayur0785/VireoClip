import { SocialAnalyticsProvider, PlatformAnalyticsCapabilities, PostAnalyticsResult } from '../types.js';
import { AppError } from '../../../types/index.js';

export class InstagramAnalyticsProvider implements SocialAnalyticsProvider {
  readonly platform = 'instagram' as const;

  getCapabilities(): PlatformAnalyticsCapabilities {
    return {
      platform: 'instagram',
      views: 'SUPPORTED',
      likes: 'SUPPORTED',
      comments: 'SUPPORTED',
      shares: 'SUPPORTED',
      saves: 'SUPPORTED',
      watchTime: 'NOT_SUPPORTED',
      averageWatchTime: 'NOT_SUPPORTED',
      impressions: 'SUPPORTED',
      reach: 'SUPPORTED',
      clicks: 'NOT_SUPPORTED',
      followersGained: 'NOT_SUPPORTED',
    };
  }

  async fetchPostAnalytics(providerPostId: string, accessToken: string): Promise<PostAnalyticsResult> {
    if (!accessToken) {
      throw new AppError('Instagram access token required.', 401, 'AUTH_MISSING');
    }

    // Call Meta Graph API for media insights:
    // GET /{media-id}/insights?metric=impressions,reach,saved,shares,video_views,likes,comments
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(providerPostId)}/insights?metric=impressions,reach,saved,shares,video_views&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      // Fall back to basic media fields if insights are unavailable
      const basicUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(providerPostId)}?fields=like_count,comments_count&access_token=${encodeURIComponent(accessToken)}`;
      const basicRes = await fetch(basicUrl, { headers: { Accept: 'application/json' } });
      if (!basicRes.ok) {
        throw new AppError(`Instagram API error (${response.status})`, response.status, 'PROVIDER_API_ERROR');
      }
      const basicData = await basicRes.json() as any;
      const likes = basicData.like_count || 0;
      const comments = basicData.comments_count || 0;
      return {
        metrics: {
          views: 0,
          likes,
          comments,
          shares: 0,
          saves: 0,
          engagement_rate: 0,
        },
        rawResponse: basicData,
      };
    }

    const data = await response.json() as any;
    const metricMap: Record<string, number> = {};
    for (const item of (data.data || [])) {
      if (item.name && item.values?.[0]?.value !== undefined) {
        metricMap[item.name] = item.values[0].value;
      }
    }

    const views = metricMap['video_views'] || 0;
    const saves = metricMap['saved'] || 0;
    const shares = metricMap['shares'] || 0;
    const reach = metricMap['reach'] || 0;
    const impressions = metricMap['impressions'] || 0;

    return {
      metrics: {
        views,
        likes: 0,
        comments: 0,
        shares,
        saves,
        reach,
        impressions,
        engagement_rate: views > 0 ? (saves + shares) / views : 0,
      },
      rawResponse: metricMap,
    };
  }
}

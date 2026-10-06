import { SocialAnalyticsProvider, PlatformAnalyticsCapabilities, PostAnalyticsResult } from '../types.js';
import { AppError } from '../../../types/index.js';

export class XAnalyticsProvider implements SocialAnalyticsProvider {
  readonly platform = 'x' as const;

  getCapabilities(): PlatformAnalyticsCapabilities {
    return {
      platform: 'x',
      views: 'SUPPORTED',
      likes: 'SUPPORTED',
      comments: 'SUPPORTED',
      shares: 'SUPPORTED',
      saves: 'SUPPORTED',
      watchTime: 'NOT_SUPPORTED',
      averageWatchTime: 'NOT_SUPPORTED',
      impressions: 'SUPPORTED',
      reach: 'NOT_SUPPORTED',
      clicks: 'NOT_SUPPORTED',
      followersGained: 'NOT_SUPPORTED',
    };
  }

  async fetchPostAnalytics(providerPostId: string, accessToken: string): Promise<PostAnalyticsResult> {
    if (!accessToken) {
      throw new AppError('X access token required.', 401, 'AUTH_MISSING');
    }

    // Call X API v2: GET /2/tweets/:id?tweet.fields=public_metrics
    const url = `https://api.twitter.com/2/tweets/${encodeURIComponent(providerPostId)}?tweet.fields=public_metrics`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new AppError(`X API error (${response.status})`, response.status, 'PROVIDER_API_ERROR');
    }

    const data = await response.json() as any;
    const tweet = data.data;
    if (!tweet) {
      throw new AppError(`Tweet ${providerPostId} not found.`, 404, 'TWEET_NOT_FOUND');
    }

    const metrics = tweet.public_metrics || {};
    const views = metrics.impression_count || 0;
    const likes = metrics.like_count || 0;
    const comments = metrics.reply_count || 0;
    const shares = metrics.retweet_count || 0;
    const saves = metrics.bookmark_count || 0;
    const engagement = likes + comments + shares + saves;

    return {
      metrics: {
        views,
        likes,
        comments,
        shares,
        saves,
        impressions: views,
        engagement_rate: views > 0 ? engagement / views : 0,
      },
      rawResponse: metrics,
    };
  }
}

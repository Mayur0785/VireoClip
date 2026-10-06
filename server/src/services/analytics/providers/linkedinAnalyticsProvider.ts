import { SocialAnalyticsProvider, PlatformAnalyticsCapabilities, PostAnalyticsResult } from '../types.js';
import { AppError } from '../../../types/index.js';

export class LinkedInAnalyticsProvider implements SocialAnalyticsProvider {
  readonly platform = 'linkedin' as const;

  getCapabilities(): PlatformAnalyticsCapabilities {
    return {
      platform: 'linkedin',
      views: 'NOT_SUPPORTED',
      likes: 'SUPPORTED',
      comments: 'SUPPORTED',
      shares: 'SUPPORTED',
      saves: 'NOT_SUPPORTED',
      watchTime: 'NOT_SUPPORTED',
      averageWatchTime: 'NOT_SUPPORTED',
      impressions: 'SUPPORTED',
      reach: 'NOT_SUPPORTED',
      clicks: 'SUPPORTED',
      followersGained: 'NOT_SUPPORTED',
    };
  }

  async fetchPostAnalytics(providerPostId: string, accessToken: string): Promise<PostAnalyticsResult> {
    if (!accessToken) {
      throw new AppError('LinkedIn access token required.', 401, 'AUTH_MISSING');
    }

    // Call LinkedIn Community Management API: /rest/socialActions/{shareUrn}
    const url = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(providerPostId)}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new AppError(`LinkedIn API error (${response.status})`, response.status, 'PROVIDER_API_ERROR');
    }

    const data = await response.json() as any;
    const likes = data.likesSummary?.totalLikes || 0;
    const comments = data.commentsSummary?.totalComments || 0;
    const shares = data.sharesSummary?.totalShares || 0;

    return {
      metrics: {
        views: 0,
        likes,
        comments,
        shares,
        saves: 0,
        engagement_rate: 0,
      },
      rawResponse: data,
    };
  }
}

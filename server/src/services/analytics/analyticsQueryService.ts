import { getMongoDb } from '../../db/mongoClient.js';
import {
  ContentAnalyticsRecord,
  AnalyticsOverview,
  SocialPlatform,
  AppError,
} from '../../types/index.js';

export interface DateRangeFilter {
  days?: number;
  startDate?: Date;
  endDate?: Date;
}

export class AnalyticsQueryService {
  /**
   * Retrieves overall account analytics metrics aggregated across all published content.
   */
  public static async getOverview(
    userId: string,
    filter: DateRangeFilter = { days: 30 }
  ): Promise<AnalyticsOverview> {
    const db = await getMongoDb();
    const days = filter.days || 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Fetch latest snapshot per post published within range
    const pipeline = [
      {
        $match: {
          user_id: userId,
          captured_at: { $gte: sinceDate },
        },
      },
      {
        $sort: { captured_at: -1 },
      },
      {
        $group: {
          _id: '$published_post_id',
          latest: { $first: '$$ROOT' },
        },
      },
      {
        $replaceRoot: { newRoot: '$latest' },
      },
    ];

    const snapshots = await db.collection<ContentAnalyticsRecord>('content_analytics').aggregate(pipeline).toArray();

    if (snapshots.length === 0) {
      return {
        total_views: 0,
        total_engagement: 0,
        average_engagement_rate: 0,
        total_watch_time_seconds: 0,
        total_published_posts: 0,
        followers_gained: 0,
        best_performing_clip: null,
        best_performing_platform: null,
        period_change: null,
        has_sufficient_data: false,
      };
    }

    let totalViews = 0;
    let totalEngagement = 0;
    let totalWatchTime = 0;
    let followersGained = 0;
    let maxEngagement = -1;
    let bestClip: any = null;
    const platformEngagementMap: Record<string, number> = {};

    for (const snap of snapshots) {
      const m = snap.metrics || { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
      const views = m.views || 0;
      const eng = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);

      totalViews += views;
      totalEngagement += eng;
      totalWatchTime += m.watch_time_seconds || 0;
      followersGained += m.followers_gained || 0;

      platformEngagementMap[snap.platform] = (platformEngagementMap[snap.platform] || 0) + eng;

      if (eng > maxEngagement) {
        maxEngagement = eng;
        bestClip = {
          clip_id: snap.clip_id || '',
          project_id: snap.project_id,
          title: (snap.metadata?.title as string) || 'Published Clip',
          views,
          engagement: eng,
          platform: snap.platform,
        };
      }
    }

    let bestPlatform: SocialPlatform | null = null;
    let maxPlatEng = -1;
    for (const [p, eng] of Object.entries(platformEngagementMap)) {
      if (eng > maxPlatEng) {
        maxPlatEng = eng;
        bestPlatform = p as SocialPlatform;
      }
    }

    const avgEngagementRate = totalViews > 0 ? totalEngagement / totalViews : 0;

    return {
      total_views: totalViews,
      total_engagement: totalEngagement,
      average_engagement_rate: Math.round(avgEngagementRate * 10000) / 10000,
      total_watch_time_seconds: totalWatchTime,
      total_published_posts: snapshots.length,
      followers_gained: followersGained,
      best_performing_clip: bestClip,
      best_performing_platform: bestPlatform,
      period_change: null, // Populated when multi-period data exists
      has_sufficient_data: snapshots.length >= 3,
    };
  }

  /**
   * Retrieves timeline performance points for charting views and engagement over time.
   */
  public static async getTimeline(userId: string, days = 30): Promise<Array<{ date: string; views: number; engagement: number }>> {
    const db = await getMongoDb();
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await db.collection<ContentAnalyticsRecord>('content_analytics').find({
      user_id: userId,
      captured_at: { $gte: sinceDate },
    }).sort({ captured_at: 1 }).toArray();

    const dateMap = new Map<string, { views: number; engagement: number }>();

    for (const snap of snapshots) {
      const dateKey = snap.captured_at.toISOString().split('T')[0];
      const m = snap.metrics || { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
      const eng = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);

      const curr = dateMap.get(dateKey) || { views: 0, engagement: 0 };
      curr.views += m.views || 0;
      curr.engagement += eng;
      dateMap.set(dateKey, curr);
    }

    return Array.from(dateMap.entries()).map(([date, val]) => ({
      date,
      views: val.views,
      engagement: val.engagement,
    }));
  }

  /**
   * Platform breakdown comparison.
   */
  public static async getPlatformComparison(userId: string) {
    const db = await getMongoDb();
    const snapshots = await db.collection<ContentAnalyticsRecord>('content_analytics').find({
      user_id: userId,
    }).toArray();

    const platforms: Record<string, { views: number; engagement: number; posts: number }> = {};

    for (const snap of snapshots) {
      const p = snap.platform;
      platforms[p] ??= { views: 0, engagement: 0, posts: 0 };
      const m = snap.metrics || { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
      platforms[p].views += m.views || 0;
      platforms[p].engagement += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
      platforms[p].posts += 1;
    }

    return Object.entries(platforms).map(([platform, data]) => ({
      platform,
      views: data.views,
      engagement: data.engagement,
      posts: data.posts,
      engagementRate: data.views > 0 ? Math.round((data.engagement / data.views) * 10000) / 10000 : 0,
    }));
  }

  /**
   * Content performance list showing each published post with its latest analytics.
   */
  public static async getPostsPerformance(userId: string) {
    const db = await getMongoDb();

    const pipeline = [
      { $match: { user_id: userId } },
      { $sort: { captured_at: -1 } },
      {
        $group: {
          _id: '$published_post_id',
          latest: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$latest' } },
      { $sort: { captured_at: -1 } },
    ];

    return db.collection<ContentAnalyticsRecord>('content_analytics').aggregate(pipeline).toArray();
  }

  /**
   * Retrieves unified content performance dashboard metrics and content table.
   */
  public static async getDashboard(userId: string, options: any = {}) {
    const { ContentPerformanceDashboardService } = await import('./contentPerformanceDashboardService.js');
    return ContentPerformanceDashboardService.getDashboard(userId, options);
  }
}

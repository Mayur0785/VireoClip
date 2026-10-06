import { SocialPlatform, PostMetrics } from '../../types/index.js';

export type MetricCapability = 'SUPPORTED' | 'NOT_SUPPORTED' | 'NOT_CONFIGURED' | 'TEMPORARILY_UNAVAILABLE';

export interface PlatformAnalyticsCapabilities {
  platform: SocialPlatform;
  views: MetricCapability;
  likes: MetricCapability;
  comments: MetricCapability;
  shares: MetricCapability;
  saves: MetricCapability;
  watchTime: MetricCapability;
  averageWatchTime: MetricCapability;
  impressions: MetricCapability;
  reach: MetricCapability;
  clicks: MetricCapability;
  followersGained: MetricCapability;
}

export interface PostAnalyticsResult {
  metrics: PostMetrics;
  rawResponse?: Record<string, any>;
  unsupportedMetrics?: string[];
}

export interface SocialAnalyticsProvider {
  readonly platform: SocialPlatform;
  getCapabilities(): PlatformAnalyticsCapabilities;
  fetchPostAnalytics(
    providerPostId: string,
    accessToken: string
  ): Promise<PostAnalyticsResult>;
}

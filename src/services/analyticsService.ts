import { backendRequest } from './backendClient';

export interface AnalyticsOverview {
  total_views: number;
  total_engagement: number;
  average_engagement_rate: number;
  total_watch_time_seconds: number;
  total_published_posts: number;
  followers_gained: number;
  best_performing_clip?: {
    clip_id: string;
    project_id: string;
    title: string;
    views: number;
    engagement: number;
    platform: string;
  } | null;
  best_performing_platform?: string | null;
  has_sufficient_data: boolean;
}

export interface PlatformStat {
  platform: string;
  views: number;
  engagement: number;
  posts: number;
  engagementRate: number;
}

export interface TimelinePoint {
  date: string;
  views: number;
  engagement: number;
}

export interface GrowthRecommendation {
  id: string;
  category: 'working' | 'try' | 'avoid' | 'next_idea';
  title: string;
  recommendation: string;
  evidence: string;
  confidence: 'low' | 'medium' | 'high';
  supporting_metrics: Record<string, any>;
  platform?: string;
}

export interface ContentMemory {
  id: string;
  category: string;
  pattern: string;
  evidence: string;
  confidence: 'low' | 'medium' | 'high';
  sample_size: number;
  performance_multiplier?: number;
  first_seen: string;
  last_updated: string;
}

export const analyticsService = {
  async getOverview(days = 30): Promise<AnalyticsOverview> {
    const res = await backendRequest<{ status: string; data: AnalyticsOverview }>(`/analytics/overview?days=${days}`);
    return res.data;
  },

  async getTimeline(days = 30): Promise<TimelinePoint[]> {
    const res = await backendRequest<{ status: string; data: TimelinePoint[] }>(`/analytics/timeline?days=${days}`);
    return res.data;
  },

  async getPlatforms(): Promise<PlatformStat[]> {
    const res = await backendRequest<{ status: string; data: PlatformStat[] }>('/analytics/platforms');
    return res.data;
  },

  async getPosts(): Promise<any[]> {
    const res = await backendRequest<{ status: string; data: any[] }>('/analytics/posts');
    return res.data;
  },

  async getGrowthCoach(): Promise<GrowthRecommendation[]> {
    const res = await backendRequest<{ status: string; data: GrowthRecommendation[] }>('/analytics/growth-coach');
    return res.data;
  },

  async getMemories(): Promise<ContentMemory[]> {
    const res = await backendRequest<{ status: string; data: ContentMemory[] }>('/analytics/memories');
    return res.data;
  },

  async syncAnalytics(publishedPostId?: string): Promise<any> {
    const res = await backendRequest<{ status: string; data: any }>('/analytics/sync', {
      method: 'POST',
      body: JSON.stringify(publishedPostId ? { publishedPostId } : {}),
    });
    return res.data;
  },

  async getDashboard(options: any = {}): Promise<any> {
    const params = new URLSearchParams();
    if (options.days !== undefined) params.append('days', String(options.days));
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.platform) params.append('platform', options.platform);
    if (options.clipId) params.append('clipId', options.clipId);
    if (options.status) params.append('status', options.status);
    if (options.page) params.append('page', String(options.page));
    if (options.limit) params.append('limit', String(options.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await backendRequest<{ status: string; data: any }>(`/analytics/dashboard${qs}`);
    return res.data;
  },
};


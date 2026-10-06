import { backendRequest } from './backendClient';
import { SocialPlatform, SafeSocialAccountConnection } from './socialService';

export type PublishStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type PublishType = 'now' | 'scheduled';

export interface PublishPayload {
  title?: string;
  description?: string;
  caption?: string;
  tags?: string[];
  hashtags?: string[];
  privacy?: 'public' | 'unlisted' | 'private';
  platform_custom?: Record<string, any>;
}

export interface PublishedPost {
  id: string;
  user_id: string;
  project_id: string;
  clip_id?: string | null;
  content_output_id?: string | null;
  social_connection_id: string;
  provider: SocialPlatform;
  provider_account_id: string;
  provider_post_id?: string | null;
  provider_post_url?: string | null;
  status: PublishStatus;
  publish_type: PublishType;
  scheduled_for?: string | null;
  timezone?: string | null;
  published_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  retry_count: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  payload: PublishPayload;
  created_at: string;
  updated_at: string;
}

export interface PublishPreviewResult {
  valid: boolean;
  provider: SocialPlatform;
  account_name: string;
  account_username?: string | null;
  platform_requirements: {
    max_title_length?: number;
    max_description_length?: number;
    supported_media_formats: string[];
    max_video_duration_seconds?: number;
    max_video_size_bytes?: number;
  };
  normalized_payload: PublishPayload;
  media_metadata?: {
    clip_id?: string | null;
    duration_seconds?: number;
    aspect_ratio?: string;
    render_status?: string;
  };
  warnings: string[];
}

export const publishingService = {
  async getAccounts(): Promise<SafeSocialAccountConnection[]> {
    const res = await backendRequest<{ status: 'ok'; data: { accounts: SafeSocialAccountConnection[] } }>('/publishing/accounts');
    return res.data.accounts;
  },

  async preview(socialConnectionId: string, clipId: string | null | undefined, payload: PublishPayload): Promise<PublishPreviewResult> {
    const res = await backendRequest<{ status: 'ok'; data: PublishPreviewResult }>('/publishing/preview', {
      method: 'POST',
      body: JSON.stringify({ socialConnectionId, clipId, payload }),
    });
    return res.data;
  },

  async publishNow(data: {
    projectId: string;
    clipId?: string | null;
    contentOutputId?: string | null;
    socialConnectionId: string;
    payload: PublishPayload;
  }): Promise<{ post: PublishedPost }> {
    const res = await backendRequest<{ status: 'ok'; data: { post: PublishedPost } }>('/publishing/publish', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async schedule(data: {
    projectId: string;
    clipId?: string | null;
    contentOutputId?: string | null;
    socialConnectionId: string;
    payload: PublishPayload;
    scheduledFor: string;
    timezone?: string;
  }): Promise<{ post: PublishedPost }> {
    const res = await backendRequest<{ status: 'ok'; data: { post: PublishedPost } }>('/publishing/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getPosts(filters?: { status?: string; provider?: string; limit?: number; offset?: number }): Promise<{ posts: PublishedPost[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.provider) params.set('provider', filters.provider);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await backendRequest<{ status: 'ok'; data: { posts: PublishedPost[]; total: number } }>(`/publishing/posts${qs}`);
    return res.data;
  },

  async cancelPost(postId: string): Promise<void> {
    await backendRequest<{ status: 'ok'; message: string }>(`/publishing/posts/${postId}/cancel`, {
      method: 'POST',
    });
  },

  async reschedulePost(postId: string, scheduledFor: string, timezone?: string): Promise<void> {
    await backendRequest<{ status: 'ok'; message: string }>(`/publishing/posts/${postId}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduledFor, timezone }),
    });
  },

  async retryPost(postId: string): Promise<void> {
    await backendRequest<{ status: 'ok'; message: string }>(`/publishing/posts/${postId}/retry`, {
      method: 'POST',
    });
  },
};

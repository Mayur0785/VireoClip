import { backendRequest } from './backendClient';

export interface AdminOverviewData {
  users: {
    total: number;
    createdToday: number;
    createdThisWeek: number;
    createdThisMonth: number;
  };
  projects: {
    total: number;
    today: number;
    processing: number;
    completed: number;
    failed: number;
  };
  usage: {
    sourceMinutesCurrentMonth: number;
    clipRendersCurrentMonth: number;
    totalUsageEvents: number;
  };
  subscriptions: {
    freeUsers: number;
    creatorSubscribers: number;
    proSubscribers: number;
    studioSubscribers: number;
    activeSubscriptions: number;
    canceledSubscriptions: number;
    pastDueSubscriptions: number;
  };
  publishing: {
    queued: number;
    processing: number;
    published: number;
    failed: number;
  };
  renders: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  system: {
    mongoConnected: boolean;
    r2Configured: boolean;
    supabaseConfigured: boolean;
    openRouterConfigured: boolean;
    groqConfigured: boolean;
    ffmpegAvailable: boolean;
    paddleConfigured: boolean;
    razorpayConfigured: boolean;
    stripeConfigured: boolean;
  };
}

export interface AdminUserItem {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  plan_id: string;
  subscription_status: string;
  provider: string | null;
  project_count: number;
  clip_count: number;
  social_connection_count: number;
}

export interface AdminProjectItem {
  id: string;
  user_id: string;
  title: string;
  source_type: string;
  duration_seconds: number | null;
  video_status: string;
  created_at: string;
  updated_at: string;
}

export interface AdminSubscriptionItem {
  id: string;
  user_id: string;
  plan_id: string;
  provider: string;
  provider_subscription_id: string;
  status: string;
  billing_interval: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminRenderJobItem {
  id: string;
  clip_id: string;
  user_id: string;
  status: string;
  progress: number;
  attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPublishingItem {
  id: string;
  user_id: string;
  status: string;
  provider: string;
  clip_id: string | null;
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSocialAccountItem {
  id: string;
  user_id: string;
  provider: string;
  account_name: string;
  provider_account_id: string;
  status: string;
  connected_at: string;
  last_verified_at: string | null;
}

export interface AdminHealthData {
  status: string;
  timestamp: string;
  services: {
    mongo: { connected: boolean; latencyMs: number; configured: boolean };
    r2: { configured: boolean; sourceBucket: string; clipsBucket: string };
    supabase: { configured: boolean };
    ai: { openRouterConfigured: boolean; groqConfigured: boolean; transcriptionProvider: string };
    ffmpeg: { available: boolean; version: string };
    billing: {
      paddle: { configured: boolean; environment: string };
      razorpay: { configured: boolean; mode: string };
      stripe: { configured: boolean };
    };
  };
}

export class AdminService {
  static async getOverview(): Promise<AdminOverviewData> {
    const res = await backendRequest<{ status: string; data: AdminOverviewData }>('/admin/overview');
    return res.data;
  }

  static async getUsers(params: { page?: number; limit?: number; search?: string; plan?: string }): Promise<{
    users: AdminUserItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    if (params.plan) query.set('plan', params.plan);

    const res = await backendRequest<{
      status: string;
      data: { users: AdminUserItem[]; total: number; page: number; totalPages: number };
    }>(`/admin/users?${query.toString()}`);
    return res.data;
  }

  static async getProjects(params: { page?: number; limit?: number; status?: string; search?: string }): Promise<{
    projects: AdminProjectItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);

    const res = await backendRequest<{
      status: string;
      data: { projects: AdminProjectItem[]; total: number; page: number; totalPages: number };
    }>(`/admin/projects?${query.toString()}`);
    return res.data;
  }

  static async getRenderJobs(params: { page?: number; limit?: number; status?: string }): Promise<{
    renderJobs: AdminRenderJobItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', params.status);

    const res = await backendRequest<{
      status: string;
      data: { renderJobs: AdminRenderJobItem[]; total: number; page: number; totalPages: number };
    }>(`/admin/render-jobs?${query.toString()}`);
    return res.data;
  }

  static async getSubscriptions(params: { page?: number; limit?: number; provider?: string }): Promise<{
    subscriptions: AdminSubscriptionItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.provider) query.set('provider', params.provider);

    const res = await backendRequest<{
      status: string;
      data: { subscriptions: AdminSubscriptionItem[]; total: number; page: number; totalPages: number };
    }>(`/admin/subscriptions?${query.toString()}`);
    return res.data;
  }

  static async getPublishing(params: { page?: number; limit?: number; provider?: string }): Promise<{
    jobs: AdminPublishingItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.provider) query.set('provider', params.provider);

    const res = await backendRequest<{
      status: string;
      data: { jobs: AdminPublishingItem[]; total: number; page: number; totalPages: number };
    }>(`/admin/publishing?${query.toString()}`);
    return res.data;
  }

  static async getSocialAccounts(params: { page?: number; limit?: number }): Promise<{
    accounts: AdminSocialAccountItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const res = await backendRequest<{
      status: string;
      data: { accounts: AdminSocialAccountItem[]; total: number; page: number; totalPages: number };
    }>(`/admin/social-accounts?${query.toString()}`);
    return res.data;
  }

  static async getHealth(): Promise<AdminHealthData> {
    const res = await backendRequest<{ status: string; data: AdminHealthData }>('/admin/health');
    return res.data;
  }
}

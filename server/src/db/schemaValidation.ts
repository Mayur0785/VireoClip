import { AppError, isValidUUID, VALID_PLATFORMS, VIDEO_STATUSES } from '../types/index.js';

const enums: Record<string, Record<string, readonly string[]>> = {
  projects: { source_type: ['upload', 'url'], video_status: VIDEO_STATUSES },
  content_outputs: { platform: VALID_PLATFORMS },
  clip_candidates: { status: ['suggested', 'selected', 'dismissed'] },
  clips: { aspect_ratio: ['9:16', '1:1', '16:9'], crop_mode: ['center', 'manual', 'smart'],
    render_status: ['draft', 'queued', 'rendering', 'uploading', 'ready', 'failed'] },
  render_jobs: { status: ['queued', 'processing', 'uploading', 'completed', 'failed'] },
  reframe_tracks: { status: ['pending', 'analyzing', 'ready', 'failed'] },
  social_account_connections: {
    provider: ['youtube', 'instagram', 'tiktok', 'linkedin', 'x'],
    status: ['connected', 'expired', 'revoked', 'error'],
  },
  oauth_states: {
    provider: ['youtube', 'instagram', 'tiktok', 'linkedin', 'x'],
  },
  published_posts: {
    provider: ['youtube', 'instagram', 'tiktok', 'linkedin', 'x'],
    status: ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'],
    publish_type: ['now', 'scheduled'],
  },
  publish_jobs: {
    status: ['scheduled', 'publishing', 'completed', 'failed', 'cancelled'],
  },
  billing_customers: {
    provider: ['paddle', 'razorpay', 'stripe'],
  },
  subscriptions: {
    provider: ['paddle', 'razorpay', 'stripe'],
    plan_id: ['free', 'creator', 'pro', 'studio'],
    status: ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused', 'incomplete_expired'],
    billing_interval: ['month', 'year'],
  },
  billing_events: {
    provider: ['paddle', 'razorpay', 'stripe'],
    status: ['processed', 'failed', 'ignored'],
  },
  billing_invoices: {
    provider: ['paddle', 'razorpay', 'stripe'],
    status: ['paid', 'open', 'void', 'uncollectible', 'draft'],
  },
  content_analytics: {
    provider: ['youtube', 'instagram', 'tiktok', 'linkedin', 'x'],
    sync_status: ['synced', 'failed', 'not_supported', 'not_configured'],
  },
  content_memories: {
    category: ['topic', 'hook', 'duration', 'platform', 'format', 'cta', 'posting_time'],
    confidence: ['low', 'medium', 'high'],
  },
};
const numericFields = new Set([
  'duration_seconds', 'start_seconds', 'end_seconds', 'engagement_score',
  'start_segment_index', 'end_segment_index', 'trim_start_offset', 'trim_end_offset',
  'progress', 'attempts', 'render_version', 'editor_version', 'analysis_version',
  'sample_interval_ms', 'source_width', 'source_height', 'detected_face_count',
  'retry_count', 'max_attempts',
  'amount_due', 'amount_paid',
  'views', 'likes', 'comments', 'shares', 'saves', 'watch_time_seconds',
  'average_watch_time_seconds', 'impressions', 'reach', 'clicks', 'followers_gained',
  'engagement_rate', 'sample_size', 'performance_multiplier',
]);
const arrayFields = new Set(['segments', 'words', 'raw_samples', 'smoothed_keyframes', 'scopes', 'tags', 'hashtags']);
const objectFields = new Set(['metadata', 'crop_config', 'overlay_config', 'caption_config', 'caption_overrides', 'payload', 'platform_custom']);

export function validateRecord(name: string, row: Record<string, unknown>): void {
  for (const field of ['id', 'user_id', 'project_id', 'clip_id', 'candidate_id']) {
    const value = row[field];
    if (value !== undefined && value !== null && (typeof value !== 'string' || !isValidUUID(value))) {
      throw new AppError(`Invalid ${field}.`, 400, 'INVALID_UUID');
    }
  }
  for (const [field, allowed] of Object.entries(enums[name] || {})) {
    const value = row[field];
    if (value !== undefined && value !== null && !allowed.includes(String(value))) {
      throw new AppError(`Invalid ${field}.`, 400, 'INVALID_FIELD');
    }
  }
  for (const [field, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    if (numericFields.has(field) && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new AppError(`Invalid ${field}.`, 400, 'INVALID_NUMBER');
    }
    if (arrayFields.has(field) && !Array.isArray(value)) throw new AppError(`Invalid ${field}.`, 400, 'INVALID_FIELD');
    if (objectFields.has(field) && (typeof value !== 'object' || Array.isArray(value))) {
      throw new AppError(`Invalid ${field}.`, 400, 'INVALID_FIELD');
    }
  }
}

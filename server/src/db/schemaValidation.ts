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
  video_analyses: {
    status: ['queued', 'processing', 'completed', 'failed'],
  },
  video_analysis_jobs: {
    status: ['queued', 'processing', 'completed', 'failed'],
  },
  producer_plans: {
    mode: ['LIGHT', 'BALANCED', 'AGGRESSIVE'],
    status: ['draft', 'preview_rendering', 'preview_ready', 'applied', 'rejected'],
    target_platform: VALID_PLATFORMS,
  },
  editor_projects: {
    status: ['draft', 'rendering', 'ready', 'failed'],
  },
  media_assets: {
    source_type: ['USER_UPLOAD', 'PROJECT_SOURCE', 'GENERATED_CLIP', 'STOCK', 'GENERATED_AI', 'BRAND_ASSET'],
    media_type: ['VIDEO', 'IMAGE', 'AUDIO'],
  },
  broll_plans: {
    status: ['draft', 'searching', 'ready', 'applied', 'failed'],
    style: ['MINIMAL', 'BALANCED', 'DYNAMIC'],
  },
  audio_assets: {
    source_type: ['ORIGINAL_DIALOGUE', 'MUSIC', 'SFX', 'VOICEOVER', 'DUB', 'BROLL_AUDIO', 'USER_UPLOAD'],
    media_type: ['AUDIO'],
  },
  voiceovers: {
    status: ['pending', 'generating', 'ready', 'failed'],
  },
  translation_projects: {
    status: ['draft', 'translating', 'ready', 'reviewed', 'rendering', 'completed', 'failed'],
    style: ['literal', 'natural', 'creator', 'professional'],
  },
  dub_projects: {
    status: ['draft', 'generating', 'ready', 'failed'],
    voice_strategy: ['ORIGINAL_STYLE', 'SELECTED_VOICE', 'AUTHORIZED_CLONE'],
  },
  brand_brain_profiles: {
    status: ['active', 'archived'],
  },
  brand_evidence: {
    source_type: ['USER_SETTING', 'APPROVED_EDIT', 'CREATOR_PROFILE', 'PROJECT', 'PUBLISHED_CONTENT', 'ANALYTICS', 'TRANSLATION_GLOSSARY', 'BRAND_ASSET', 'HOOK_LAB'],
    confidence: ['LOW', 'MEDIUM', 'HIGH'],
  },
  content_packs: {
    status: ['DRAFT', 'GENERATING', 'READY', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'FAILED'],
    generation_mode: ['QUICK', 'BALANCED', 'FULL'],
  },
  content_pack_items: {
    type: [
      'PRIMARY_TITLE', 'ALT_TITLE', 'HOOK', 'SHORT_CAPTION', 'LONG_CAPTION',
      'SHORT_DESCRIPTION', 'LONG_DESCRIPTION', 'CTA', 'HASHTAGS', 'KEYWORDS',
      'THUMBNAIL_TEXT', 'THUMBNAIL_DIRECTION', 'ALT_TEXT', 'PINNED_COMMENT',
      'EMAIL_SNIPPET', 'BLOG_SNIPPET',
    ],
    status: ['DRAFT', 'GENERATED', 'EDITED', 'APPROVED', 'REJECTED'],
  },
  hook_lab_sessions: {
    status: ['DRAFT', 'ANALYZING', 'READY', 'APPLIED', 'APPROVED', 'FAILED'],
  },
  hook_candidates: {
    hook_type: [
      'DIRECT', 'DIRECT_STATEMENT', 'QUESTION', 'CURIOSITY', 'CURIOSITY_GAP',
      'CONTRARIAN', 'RESULT_FIRST', 'WARNING', 'NUMBER', 'CONFESSION',
      'STORY_OPEN', 'PATTERN_INTERRUPT', 'PROBLEM', 'BENEFIT',
    ],
    delivery_mode: ['SPOKEN_REWRITE', 'TEXT_OVERLAY', 'CAPTION_OPEN', 'EDITORIAL_TRIM', 'REORDER_EXISTING', 'COMBINED'],
    status: ['GENERATED', 'EDITED', 'APPLIED', 'APPROVED', 'REJECTED'],
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
  'overall_score', 'hook_score', 'standalone_score', 'insight_score',
  'visual_activity_score', 'audio_energy_score', 'platform_fit_score',
  'version', 'original_duration', 'estimated_duration',
  'playhead', 'width', 'height', 'fps', 'duration', 'channels', 'sample_rate',
  'weight', 'loudness_target_lufs', 'music_level', 'stroke_width', 'position_y',
  'variant_index', 'brand_brain_version', 'overall_hook_fit',
]);
const arrayFields = new Set([
  'segments', 'words', 'raw_samples', 'smoothed_keyframes', 'scopes', 'tags', 'hashtags', 'scene_cuts', 'silence_intervals', 'face_intervals', 'keyframes', 'reasons', 'operations', 'key_decisions', 'tracks', 'items', 'effects', 'transitions', 'opportunities', 'suggestions', 'search_queries', 'voices', 'languages', 'terms', 'locked_terms',
  'primary_colors', 'secondary_colors', 'accent_colors', 'fonts', 'logo_asset_ids', 'preferred_aspect_ratios', 'preferred_layouts', 'tones', 'writing_styles', 'preferred_phrasing', 'avoid_phrasing', 'preferred_hook_types', 'banned_patterns', 'example_hooks', 'preferred_cta_types', 'approved_phrases', 'blocked_phrases', 'emphasis_rules',
  'source_evidence', 'brand_rules_used', 'validation_warnings', 'leading_filler_words', 'issues', 'strengths', 'analysis_signals_used', 'positives', 'cautions',
]);
const objectFields = new Set([
  'metadata', 'crop_config', 'overlay_config', 'caption_config', 'caption_overrides', 'payload', 'platform_custom', 'timeline', 'summary_metadata', 'platform_suitability', 'scores', 'explanation', 'parameters', 'canvas', 'settings', 'transform', 'speed', 'audio', 'text', 'caption', 'color', 'filter', 'mask', 'chroma_key', 'density_rules', 'density_summary', 'applied_item', 'analysis', 'ducking', 'enhancement', 'stats', 'timing_adjustment',
  'identity', 'voice', 'visual', 'captions', 'hooks', 'cta', 'editing', 'publishing', 'translation', 'locks', 'rule_states', 'learning', 'snapshot', 'watermark_config', 'platform_preferences', 'confidence_by_dimension', 'preferred_clip_length_range', 'value',
  'item_counts', 'opening_window', 'multimodal_signals', 'reorder_plan', 'trim_plan', 'text_overlay_plan',
]);

export function validateRecord(name: string, row: Record<string, unknown>): void {
  for (const field of ['id', 'user_id', 'project_id', 'clip_id', 'candidate_id', 'parent_plan_id', 'producer_plan_id', 'editor_project_id', 'source_asset_id', 'translation_project_id', 'brand_brain_id', 'watermark_asset_id', 'content_pack_id', 'content_pack_item_id', 'hook_lab_session_id']) {
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
    if (name === 'content_packs' && field === 'source') {
      if (typeof value !== 'object' || Array.isArray(value)) throw new AppError(`Invalid ${field}.`, 400, 'INVALID_FIELD');
      continue;
    }
    if ((name === 'content_pack_items' || name === 'hook_candidates') && field === 'text') {
      if (typeof value !== 'string') throw new AppError(`Invalid ${field}.`, 400, 'INVALID_STRING');
      continue;
    }
    if (name === 'content_pack_items' && field === 'explanation') {
      if (typeof value !== 'string') throw new AppError(`Invalid ${field}.`, 400, 'INVALID_STRING');
      continue;
    }
    if (numericFields.has(field) && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new AppError(`Invalid ${field}.`, 400, 'INVALID_NUMBER');
    }
    if (arrayFields.has(field) && !Array.isArray(value)) throw new AppError(`Invalid ${field}.`, 400, 'INVALID_FIELD');
    if (objectFields.has(field) && (typeof value !== 'object' || Array.isArray(value))) {
      throw new AppError(`Invalid ${field}.`, 400, 'INVALID_FIELD');
    }
  }
}

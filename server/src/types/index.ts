import { User } from '@supabase/supabase-js';
import { Request } from 'express';

// ── Canonical Video Status State Machine ──────────────────────────
// These are the ONLY valid values for projects.video_status in the database.
// The schema default is 'uploading'. Transitions are enforced in videoProcessingService.
export type VideoStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'transcribing'
  | 'transcribed'
  | 'generating'
  | 'completed'
  | 'failed';

export const VIDEO_STATUSES: readonly VideoStatus[] = [
  'uploading',
  'uploaded',
  'processing',
  'transcribing',
  'transcribed',
  'generating',
  'completed',
  'failed',
] as const;

/** States that allow starting/retrying processing */
export const PROCESSABLE_STATUSES: readonly VideoStatus[] = ['uploaded', 'failed'] as const;

/** States that indicate active background work */
export const ACTIVE_PROCESSING_STATUSES: readonly VideoStatus[] = [
  'processing',
  'transcribing',
  'generating',
] as const;

// ── API Response Types ────────────────────────────────────────────

export interface ApiSuccessResponse<T = unknown> {
  status: 'ok';
  data?: T;
  message?: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  status: 'error';
  code?: string;
  message: string;
  requestId?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp?: string;
  version?: string;
}

// ── Application Error ─────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ── Request Types ─────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: User;
  requestId?: string;
}

// ── UUID Validation ───────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ── Transcript Types ──────────────────────────────────────────────

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface TranscriptRecord {
  id: string;
  project_id: string;
  user_id: string;
  transcript_text: string;
  language: string;
  duration_seconds: number | null;
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
  created_at: string;
  updated_at: string;
}

// ── Content Output Types ──────────────────────────────────────────

export type OutputPlatform = 'youtube' | 'instagram' | 'shorts' | 'tiktok' | 'linkedin' | 'x';

export const VALID_PLATFORMS: readonly OutputPlatform[] = [
  'youtube',
  'instagram',
  'shorts',
  'tiktok',
  'linkedin',
  'x',
] as const;

export type OutputContentType =
  | 'title'
  | 'description'
  | 'chapters'
  | 'keywords'
  | 'hook'
  | 'caption'
  | 'hashtags'
  | 'moment'
  | 'post'
  | 'thread';

export interface ContentOutputRecord {
  id: string;
  project_id: string;
  platform: OutputPlatform;
  content_type: OutputContentType;
  content: string;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreatorProfileData {
  brand_name?: string;
  niche?: string;
  target_audience?: string;
  brand_description?: string;
  language?: string;
  tone?: string;
  custom_tone?: string;
  content_goals?: string;
  website_url?: string;
  newsletter_url?: string;
  podcast_url?: string;
  youtube_cta?: string;
  instagram_cta?: string;
  linkedin_cta?: string;
  twitter_cta?: string;
  tiktok_cta?: string;
  preferred_hook_style?: string;
  brand_rules?: string;
  forbidden_phrases?: string;
}

export interface GenerationOverrides {
  overrideTone?: string;
  overrideLanguage?: string;
  overrideCTA?: string;
}

// ── Structured Platform AI Outputs ────────────────────────────────

export interface YouTubeGeneratedContent {
  titles: string[];
  description: string;
  chapters: Array<{ timestamp: string; title: string }>;
  keywords: string[];
}

export interface InstagramGeneratedContent {
  hooks: string[];
  caption: string;
  hashtags: string[];
}

export interface ShortsGeneratedContent {
  moments: Array<{
    start?: string;
    end?: string;
    hook: string;
    description: string;
    timestamps_available?: boolean;
  }>;
}

export interface TikTokGeneratedContent {
  hooks: string[];
  caption: string;
  moment: {
    start?: string;
    end?: string;
    description: string;
    timestamps_available?: boolean;
  };
}

export interface LinkedInGeneratedContent {
  post: string;
}

export interface TwitterGeneratedContent {
  post: string;
  thread: string[];
}

export interface GeneratedPlatformKit {
  youtube?: YouTubeGeneratedContent;
  instagram?: InstagramGeneratedContent;
  shorts?: ShortsGeneratedContent;
  tiktok?: TikTokGeneratedContent;
  linkedin?: LinkedInGeneratedContent;
  x?: TwitterGeneratedContent;
}

// ── Clip Candidates (Phase 10: AI Auto Clip Finder) ───────────────

export type ClipCandidateStatus = 'suggested' | 'selected' | 'dismissed';

export type ClipCandidateCategory =
  | 'educational'
  | 'story'
  | 'controversial'
  | 'insight'
  | 'emotional'
  | 'entertaining'
  | 'tutorial'
  | 'general';

export interface ClipCandidate {
  id: string;
  project_id: string;
  user_id: string;

  start_segment_index: number;
  end_segment_index: number;

  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;

  title: string;
  hook: string;
  reason: string;
  category: ClipCandidateCategory | string;
  engagement_score: number;

  status: ClipCandidateStatus;

  metadata?: Record<string, any>;

  created_at: string;
  updated_at: string;
}

export interface AIClipCandidate {
  start_segment_index: number;
  end_segment_index: number;

  title: string;
  hook: string;
  reason: string;

  category: ClipCandidateCategory;

  hook_score: number;
  standalone_score: number;
  insight_score: number;
  emotion_score: number;
  platform_score: number;
}

export interface AIClipAnalysisResponse {
  clips: AIClipCandidate[];
}

// ── Phase 11: Clip Rendering Engine Types ─────────────────────────

export type ClipAspectRatio = '9:16' | '1:1' | '16:9';
export type ClipCropMode = 'center' | 'manual';
export type ClipRenderStatus = 'draft' | 'queued' | 'rendering' | 'uploading' | 'ready' | 'failed';
export type RenderJobStatus = 'queued' | 'processing' | 'uploading' | 'completed' | 'failed';
export type RenderJobStage =
  | 'queued'
  | 'downloading'
  | 'cutting'
  | 'reframing'
  | 'encoding'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface RenderJobRecord {
  id: string;
  clip_id: string;
  user_id: string;
  status: RenderJobStatus;
  progress: number;
  stage: RenderJobStage | string;
  attempts: number;
  max_attempts?: number;
  worker_id?: string | null;
  locked_at?: string | Date | null;
  next_retry_at?: string | Date | null;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipRecord {
  id: string;
  project_id: string;
  candidate_id?: string | null;
  user_id: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  aspect_ratio: ClipAspectRatio;
  crop_mode: ClipCropMode;
  render_status: ClipRenderStatus;
  source_storage_path: string;
  output_storage_path?: string | null;
  render_error_code?: string | null;
  render_error_message?: string | null;
  created_at: string;
  updated_at: string;
  latest_job?: RenderJobRecord | null;

  // Phase 12 Editor Fields
  trim_start_offset?: number;
  trim_end_offset?: number;
  caption_enabled?: boolean;
  caption_style?: CaptionStyle;
  caption_position?: CaptionPosition;
  caption_config?: CaptionConfig;
  crop_config?: CropConfig;
  overlay_config?: OverlayConfig;
  volume?: number;
  muted?: boolean;
  editor_version?: number;
  render_version?: number;
  reframe_mode?: 'smart' | 'fallback_center' | 'manual';
  reframe_metadata?: Record<string, any>;
}

export interface CreateClipDTO {
  candidateId: string;
  aspectRatio?: ClipAspectRatio;
}

// ── Phase 12: Caption Engine & Focused Clip Editor ───────────────

export type CaptionStyle = 'clean' | 'bold' | 'minimal' | 'podcast' | 'highlight' | 'karaoke';
export type CaptionPosition = 'top' | 'center' | 'bottom';
export type CaptionTimingMode = 'word' | 'segment';

export type CropMode = 'center' | 'manual' | 'smart';

export interface CropConfig {
  mode?: CropMode;
  focusX?: number; // 0 to 1, default 0.5 (center)
  focusY?: number; // 0 to 1, default 0.5 (center)
  smart?: {
    trackId?: string;
    strength?: number;
  };
}

export type OverlayPosition = 'top' | 'center' | 'bottom';
export type OverlaySize = 'sm' | 'md' | 'lg';

export interface OverlayConfig {
  enabled: boolean;
  text: string;
  position?: OverlayPosition;
  size?: OverlaySize;
}

export const SAFE_FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Arial Black',
  'DejaVu Sans',
  'Liberation Sans',
] as const;

export type SafeFontFamily = (typeof SAFE_FONT_FAMILIES)[number];

export type CaptionAnimation = 'none' | 'fade' | 'pop' | 'word_pop';
export type CaptionTextAlign = 'left' | 'center' | 'right';

export interface CaptionCueOverride {
  cueId: string;
  text: string;
}

export interface CaptionConfig {
  // Typography
  fontFamily?: SafeFontFamily | string;
  fontSize?: number;
  fontWeight?: number; // 400 - 900
  uppercase?: boolean;

  // Colors & stroke
  textColor?: string; // Hex #RRGGBB
  primaryColor?: string; // Alias for textColor
  activeWordColor?: string; // Hex #RRGGBB
  highlightColor?: string; // Alias for activeWordColor
  strokeColor?: string; // Hex #RRGGBB
  outlineColor?: string; // Alias for strokeColor
  strokeWidth?: number; // 0 to 8
  outlineWidth?: number; // Alias for strokeWidth

  // Shadow
  shadowEnabled?: boolean;
  shadowOpacity?: number; // 0 to 1
  shadow?: number; // Alias / shadow offset (0 to 5)

  // Background Box
  backgroundEnabled?: boolean;
  backgroundColor?: string; // Hex #RRGGBB
  backgroundOpacity?: number; // 0 to 1

  // Placement & alignment
  position?: CaptionPosition;
  positionY?: number; // 0 to 1 (normalized vertical position)
  positionX?: number; // 0 to 1 (normalized horizontal position)
  textAlign?: CaptionTextAlign;

  // Cue chunk sizing
  maxWordsPerCue?: number; // 2, 3, 4, 5, 6 (default 4)
  maxLines?: number; // 1 or 2 (default 2)

  // Animation
  animation?: CaptionAnimation;

  // Manual cue text corrections
  caption_overrides?: CaptionCueOverride[];
}

export interface TimedCaptionToken {
  text: string;
  start: number; // local to clip (seconds)
  end: number;   // local to clip (seconds)
}

export interface TimedCaptionCue {
  id: string;
  start: number; // local to clip (seconds)
  end: number;   // local to clip (seconds)
  text: string;
  words?: TimedCaptionToken[];
  tokens?: TimedCaptionToken[];
}

export interface ClipEditorUpdateDTO {
  trimStartOffset?: number;
  trimEndOffset?: number;
  aspectRatio?: ClipAspectRatio;
  captionEnabled?: boolean;
  captionStyle?: CaptionStyle;
  captionPosition?: CaptionPosition;
  captionConfig?: CaptionConfig;
  cropConfig?: CropConfig;
  overlayConfig?: OverlayConfig;
  volume?: number;
  muted?: boolean;
}

// ── Phase 13: Smart Auto-Reframe + Face Tracking ─────────────────

export interface NormalizedFaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  center_x: number;
  center_y: number;
  confidence: number;
  track_id?: string;
  area?: number;
}

export interface ReframeSample {
  time: number;
  faces: NormalizedFaceDetection[];
}

export interface ReframeKeyframe {
  time: number;
  centerX: number;
  centerY: number;
}

export interface ReframeTrackRecord {
  id: string;
  clip_id: string;
  project_id: string;
  user_id: string;
  status: 'pending' | 'analyzing' | 'ready' | 'failed';
  analysis_version: number;
  sample_interval_ms: number;
  source_width: number | null;
  source_height: number | null;
  detected_face_count: number;
  dominant_track_id: string | null;
  raw_samples: ReframeSample[];
  smoothed_keyframes: ReframeKeyframe[];
  metadata: Record<string, any>;
  error_code: string | null;
  error_message: string | null;
  analyzed_trim_start: number;
  analyzed_trim_end: number;
  analyzed_aspect_ratio: string;
  created_at: string;
  updated_at: string;
}

// ── Social OAuth & Account Connections (Phase 9) ──────────────────
export type SocialPlatform = 'youtube' | 'instagram' | 'tiktok' | 'linkedin' | 'x';

export const VALID_SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'youtube',
  'instagram',
  'tiktok',
  'linkedin',
  'x',
] as const;

export type SocialConnectionStatus = 'connected' | 'expired' | 'revoked' | 'error';

export interface SocialAccountConnectionRecord {
  id: string;
  user_id: string;
  provider: SocialPlatform;
  provider_account_id: string;
  provider_account_name: string;
  provider_username?: string | null;
  provider_avatar_url?: string | null;
  access_token: string; // Encrypted AES-256-GCM
  refresh_token?: string | null; // Encrypted AES-256-GCM
  token_expires_at?: Date | null;
  scopes: string[];
  status: SocialConnectionStatus;
  metadata?: Record<string, any>;
  last_verified_at?: Date | null;
  last_error_at?: Date | null;
  last_error_code?: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Safe projection returned to frontend (NO sensitive token data) */
export interface SafeSocialAccountConnection {
  id: string;
  provider: SocialPlatform;
  account_name: string;
  username?: string | null;
  avatar_url?: string | null;
  status: SocialConnectionStatus;
  scopes: string[];
  connected_at: string;
  last_verified_at?: string | null;
  is_configured: boolean;
}

export interface OAuthStateRecord {
  id: string;
  user_id: string;
  provider: SocialPlatform;
  state_hash: string;
  code_verifier?: string; // Optional PKCE verifier (for X/Twitter)
  redirect_uri: string;
  expires_at: Date;
  consumed_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Phase 10: Publishing & Scheduling ──────────────────────────────
export type PublishStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type PublishType = 'now' | 'scheduled';

export const VALID_PUBLISH_STATUSES: readonly PublishStatus[] = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const;

export const VALID_PUBLISH_TYPES: readonly PublishType[] = ['now', 'scheduled'] as const;

export interface PublishPayload {
  title?: string;
  description?: string;
  caption?: string;
  tags?: string[];
  hashtags?: string[];
  privacy?: 'public' | 'unlisted' | 'private';
  platform_custom?: Record<string, any>;
}

export interface PublishedPostRecord {
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
  scheduled_for?: Date | null;
  timezone?: string | null;
  published_at?: Date | null;
  failed_at?: Date | null;
  cancelled_at?: Date | null;
  retry_count: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  request_fingerprint: string;
  payload: PublishPayload;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export type PublishJobStatus = 'scheduled' | 'publishing' | 'completed' | 'failed' | 'cancelled';

export interface PublishJobRecord {
  id: string;
  user_id: string;
  published_post_id: string;
  scheduled_for: Date;
  status: PublishJobStatus;
  attempts: number;
  locked_at?: Date | null;
  started_at?: Date | null;
  completed_at?: Date | null;
  next_retry_at?: Date | null;
  last_error?: string | null;
  created_at: Date;
  updated_at: Date;
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

// ── Phase 11: Billing, Plans & Subscriptions Types ────────────────

// ── Phase 11: Billing, Plans & Subscriptions Types ────────────────

export type BillingProviderName = 'paddle' | 'razorpay' | 'stripe';

export type PlanId = 'free' | 'creator' | 'pro' | 'studio';

export type BillingInterval = 'month' | 'year';

export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'paused'
  | 'incomplete_expired';

export interface PlanDefinition {
  id: PlanId;
  display_name: string;
  monthly_price: number; // Global USD
  yearly_price: number;
  inr_monthly_price: number; // India INR
  currency: string;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  features: string[];
  is_recommended?: boolean;
  paddle_price_id_monthly?: string;
  paddle_price_id_yearly?: string;
  razorpay_plan_id_monthly?: string;
  razorpay_plan_id_yearly?: string;
  stripe_price_id?: string;
}

export interface BillingCustomerRecord {
  id: string;
  user_id: string;
  provider: BillingProviderName;
  provider_customer_id: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  provider: BillingProviderName;
  provider_customer_id: string;
  provider_subscription_id: string;
  provider_product_id?: string | null;
  provider_price_id?: string | null;
  plan_id: PlanId;
  status: SubscriptionStatus;
  currency?: string;
  amount?: number;
  billing_interval: BillingInterval;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  canceled_at?: Date | null;
  trial_start?: Date | null;
  trial_end?: Date | null;
  latest_invoice_id?: string | null;
  scheduled_change?: Record<string, unknown> | null;
  last_provider_event_id?: string | null;
  last_provider_event_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface BillingEventRecord {
  id: string;
  provider: BillingProviderName;
  provider_event_id: string;
  event_type: string;
  processed_at: Date;
  status: 'processed' | 'failed' | 'ignored';
  payload_hash?: string;
  error_code?: string | null;
  error_message?: string | null;
  created_at: Date;
}

export interface BillingInvoiceRecord {
  id: string;
  user_id: string;
  provider: BillingProviderName;
  provider_invoice_id: string;
  provider_customer_id: string;
  subscription_id?: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible' | 'draft';
  hosted_invoice_url?: string | null;
  invoice_pdf_url?: string | null;
  period_start: Date;
  period_end: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserEntitlement {
  plan_id: PlanId | 'developer';
  display_name: string;
  is_unlimited: boolean;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  subscription?: {
    id: string;
    provider: BillingProviderName;
    status: SubscriptionStatus;
    cancel_at_period_end: boolean;
    current_period_end: string;
    billing_interval: BillingInterval;
  } | null;
}

// ── Phase 15: Vireo Analytics & Growth Intelligence ───────────────

export interface PostMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_time_seconds?: number | null;
  average_watch_time_seconds?: number | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  followers_gained?: number | null;
  engagement_rate?: number; // Calculated (likes + comments + shares + saves) / max(views, 1)
}

export type SyncStatus = 'synced' | 'failed' | 'not_supported' | 'not_configured';

export interface ContentAnalyticsRecord {
  id: string;
  user_id: string;
  project_id: string;
  clip_id?: string | null;
  published_post_id: string;
  social_connection_id?: string | null;
  provider: SocialPlatform;
  provider_post_id: string;
  platform: SocialPlatform;
  captured_at: Date;
  published_at?: Date | null;
  metrics: PostMetrics;
  previous_metrics?: PostMetrics | null;
  sync_status: SyncStatus;
  last_error?: string | null;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export type MemoryCategory = 'topic' | 'hook' | 'duration' | 'platform' | 'format' | 'cta' | 'posting_time';
export type MemoryConfidence = 'low' | 'medium' | 'high';

export interface ContentMemoryRecord {
  id: string;
  user_id: string;
  category: MemoryCategory;
  pattern: string;
  evidence: string;
  confidence: MemoryConfidence;
  sample_size: number;
  performance_multiplier?: number; // e.g. 1.35 = 35% higher engagement than avg
  metadata?: Record<string, any>;
  first_seen: Date;
  last_updated: Date;
  created_at: Date;
  updated_at: Date;
}

export interface GrowthRecommendation {
  id: string;
  category: 'working' | 'try' | 'avoid' | 'next_idea';
  title: string;
  recommendation: string;
  evidence: string;
  confidence: MemoryConfidence;
  supporting_metrics: Record<string, any>;
  platform?: SocialPlatform | 'all';
}

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
    platform: SocialPlatform;
  } | null;
  best_performing_platform?: SocialPlatform | null;
  period_change?: {
    views_change_pct: number | null;
    engagement_change_pct: number | null;
    posts_change: number;
  } | null;
  has_sufficient_data: boolean;
}


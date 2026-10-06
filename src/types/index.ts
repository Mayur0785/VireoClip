export type ProjectStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'transcribing'
  | 'transcribed'
  | 'analyzing'
  | 'generating'
  | 'completed'
  | 'complete'
  | 'queued'
  | 'failed';

export const isProcessing = (s: string) =>
  ['processing', 'transcribing', 'analyzing', 'generating'].includes(s);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  id: string;
  project_id: string;
  user_id: string;
  transcript_text: string;
  language: string;
  duration_seconds: number | null;
  segments: TranscriptSegment[];
  created_at: string;
  updated_at: string;
}

export type OutputPlatform = 'youtube' | 'instagram' | 'shorts' | 'tiktok' | 'linkedin' | 'x';

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

export interface ContentOutput {
  id: string;
  project_id: string;
  platform: OutputPlatform;
  content_type: OutputContentType;
  content: string;
  position: number;
}

export interface Project {
  id: string;
  user_id?: string;
  title: string;
  source_type?: 'upload' | 'url';
  source_url?: string | null;
  video_url?: string | null;
  notes?: string;
  status: ProjectStatus;
  video_status?: ProjectStatus;
  created_at: string;
  updated_at?: string;
}

export interface CreatorProfile {
  name: string;
  email: string;
  brand_name?: string;
  niche: string;
  audience: string;
  brand_description?: string;
  language: string;
  tone: string;
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

export interface BillingUsage {
  billing_period: string;
  reset_date: string;
  plan_tier: string;
  limit_minutes: number;
  settled_minutes: number;
  reserved_minutes: number;
  total_used_minutes: number;
  remaining_minutes: number;
  is_quota_exceeded: boolean;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp?: string;
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

// ── Phase 11: Rendered Clips & Render Jobs ──────────────────────────

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

export interface RenderJob {
  id: string;
  clip_id: string;
  user_id: string;
  status: RenderJobStatus;
  progress: number;
  stage: RenderJobStage | string;
  attempts: number;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenderedClip {
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
  latest_job?: RenderJob | null;

  // Phase 12 Editor fields
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

// ── Phase 12: Caption Engine & Focused Clip Editor ───────────────

export type CaptionStyle = 'clean' | 'bold' | 'minimal' | 'podcast' | 'highlight' | 'karaoke';
export type CaptionPosition = 'top' | 'center' | 'bottom';
export type CaptionTimingMode = 'word' | 'segment';

export type CropMode = 'center' | 'manual' | 'smart';

export interface CropConfig {
  mode?: CropMode;
  focusX: number; // 0 to 1, default 0.5 (center)
  focusY: number; // 0 to 1, default 0.5 (center)
  smart?: {
    trackId?: string;
    strength?: number;
  };
}

export interface ReframeKeyframe {
  time: number;
  centerX: number;
  centerY: number;
}

export interface ReframeStatusResponse {
  status: 'pending' | 'analyzing' | 'ready' | 'failed';
  detectedFaceCount: number;
  dominantTrackId: string | null;
  smoothedKeyframes: ReframeKeyframe[];
  analysisVersion: number;
  analyzedTrimStart?: number;
  analyzedTrimEnd?: number;
  analyzedAspectRatio?: string;
  isStale?: boolean;
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
  fontFamily?: SafeFontFamily | string;
  fontSize?: number;
  fontWeight?: number;
  uppercase?: boolean;

  textColor?: string;
  primaryColor?: string;
  activeWordColor?: string;
  highlightColor?: string;
  strokeColor?: string;
  outlineColor?: string;
  strokeWidth?: number;
  outlineWidth?: number;

  shadowEnabled?: boolean;
  shadowOpacity?: number;
  shadow?: number;

  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;

  position?: CaptionPosition;
  positionY?: number; // 0 to 1
  positionX?: number; // 0 to 1
  textAlign?: CaptionTextAlign;

  maxWordsPerCue?: number; // 2..6
  maxLines?: number; // 1..2

  animation?: CaptionAnimation;

  caption_overrides?: CaptionCueOverride[];
}

export interface TimedCaptionToken {
  text: string;
  start: number;
  end: number;
}

export interface TimedCaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: TimedCaptionToken[];
  tokens?: TimedCaptionToken[];
}

export interface ClipEditorConfig {
  trimStartOffset: number;
  trimEndOffset: number;
  aspectRatio: ClipAspectRatio;
  captionEnabled: boolean;
  captionStyle: CaptionStyle;
  captionPosition: CaptionPosition;
  captionConfig: CaptionConfig;
  cropConfig: CropConfig;
  overlayConfig: OverlayConfig;
  volume: number;
  muted: boolean;
}



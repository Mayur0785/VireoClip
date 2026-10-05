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
  niche?: string;
  target_audience?: string;
  language?: string;
  tone?: string;
  custom_tone?: string;
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



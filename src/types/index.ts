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

export type ClipAspectRatio = '9:16' | '1:1' | '16:9' | '4:5';
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
  title?: string;
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

// ── Phase 16: Multimodal Video Intelligence ───────────────────────

export interface PlatformFitDetail {
  suitable: boolean;
  score: number;
  recommended_ratio: ClipAspectRatio;
  reason: string;
}

export interface VireoClipScoreExplanation {
  overall_score: number;
  hook_score: number;
  standalone_score: number;
  insight_score: number;
  visual_activity_score: number;
  audio_energy_score: number;
  platform_fit_score: number;
  reasons: string[];
  platform_suitability: Record<string, PlatformFitDetail>;
}

export interface MomentSearchResult {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  title: string;
  hook: string;
  reason: string;
  vireo_score: number;
  match_confidence: number;
  match_reasons: string[];
  explanation: VireoClipScoreExplanation;
  category: ClipCandidateCategory;
}

// ── Phase 17: Vireo Producer (AI Editing Agent) ───────────────────

export type ProducerMode = 'LIGHT' | 'BALANCED' | 'AGGRESSIVE';

export type ProducerPlanStatus =
  | 'draft'
  | 'preview_rendering'
  | 'preview_ready'
  | 'applied'
  | 'rejected';

export type ProducerOperationType =
  | 'TRIM'
  | 'INTRO_TRIM'
  | 'OUTRO_TRIM'
  | 'CUT'
  | 'REMOVE_RANGE'
  | 'REFRAME'
  | 'CAPTION_STYLE'
  | 'CAPTION_EMPHASIS'
  | 'AUDIO_GAIN'
  | 'NORMALIZE_AUDIO'
  | 'AUDIO_FADE'
  | 'TEXT_OVERLAY'
  | 'HOOK_TEXT'
  | 'BRAND_OVERLAY'
  | 'WATERMARK'
  | 'PUNCH_IN';

export interface ProducerOperationParameters {
  start_sec?: number;
  end_sec?: number;
  cut_ranges?: Array<{ start: number; end: number; duration: number }>;
  aspect_ratio?: ClipAspectRatio;
  crop_mode?: ClipCropMode;
  style?: CaptionStyle;
  position?: CaptionPosition;
  font_size?: number;
  primary_color?: string;
  highlight_color?: string;
  emphasis_words?: string[];
  gain_db?: number;
  target_lufs?: number;
  fade_in_sec?: number;
  fade_out_sec?: number;
  text?: string;
  position_overlay?: 'top' | 'center' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
  display_start_sec?: number;
  display_end_sec?: number;
  scale?: number;
  punch_in_start_sec?: number;
  punch_in_duration_sec?: number;
  [key: string]: any;
}

export interface ProducerOperation {
  id: string;
  type: ProducerOperationType;
  enabled: boolean;
  label: string;
  description: string;
  parameters: ProducerOperationParameters;
  confidence: number;
  reason: string;
}

export interface ProducerScore {
  overall: number; // 0-100
  hook: number; // 0-100
  pacing: number; // 0-100
  audio: number; // 0-100
  visual: number; // 0-100
  retention_estimate: number; // 0-100
}

export interface ProducerScoreComparison {
  before: ProducerScore;
  after: ProducerScore;
  delta: number;
}

export interface ProducerExplanation {
  summary: string;
  key_decisions: string[];
  pacing_notes: string;
  audio_notes: string;
  visual_notes: string;
}

export interface ProducerEditPlan {
  id: string;
  clip_id: string;
  project_id: string;
  user_id: string;
  version: number;
  parent_plan_id: string | null;
  mode: ProducerMode;
  target_platform: OutputPlatform;
  status: ProducerPlanStatus;
  title: string;
  user_instruction: string | null;
  original_duration: number;
  estimated_duration: number;
  operations: ProducerOperation[];
  scores: ProducerScoreComparison;
  explanation: ProducerExplanation;
  preview_video_url: string | null;
  preview_storage_path: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateProducerPlanDTO {
  mode?: ProducerMode;
  target_platform?: OutputPlatform;
  instruction?: string;
  target_duration?: number;
}

export interface ReviseProducerPlanDTO {
  instruction?: string;
  mode?: ProducerMode;
  operation_overrides?: Array<{
    id: string;
    enabled: boolean;
    parameters?: Record<string, any>;
  }>;
}

// ── Phase 18: Vireo Pro Video Editor (Multi-Track Timeline) ───────

export type EditorTrackType =
  | 'VIDEO'
  | 'AUDIO'
  | 'TEXT'
  | 'CAPTION'
  | 'IMAGE'
  | 'OVERLAY'
  | 'BROLL_PLACEHOLDER';

export const EDITOR_TRACK_TYPES: readonly EditorTrackType[] = [
  'VIDEO',
  'AUDIO',
  'TEXT',
  'CAPTION',
  'IMAGE',
  'OVERLAY',
  'BROLL_PLACEHOLDER',
] as const;

export type EditorProjectStatus = 'draft' | 'rendering' | 'ready' | 'failed';

export interface EditorCanvasConfig {
  width: number;
  height: number;
  aspect_ratio: ClipAspectRatio;
  fps: number;
  duration: number;
  background_color: string;
  background_mode: 'color' | 'blur_source' | 'transparent';
}

export interface EditorTransform {
  position_x: number; // pixels offset from center
  position_y: number; // pixels offset from center
  scale: number; // 1.0 = 100%
  rotation: number; // degrees
  opacity: number; // 0 to 1
}

export interface EditorKeyframe {
  id: string;
  time: number; // seconds relative to item start
  property: 'position_x' | 'position_y' | 'scale' | 'rotation' | 'opacity' | 'volume';
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export type EditorTransitionType =
  | 'cut'
  | 'cross_dissolve'
  | 'fade'
  | 'dip_to_black'
  | 'slide'
  | 'push'
  | 'zoom_lite';

export interface EditorTransition {
  type: EditorTransitionType;
  duration: number; // seconds (0.1 to 2.0)
  direction?: 'left' | 'right' | 'up' | 'down';
}

export type EditorEffectType =
  | 'blur'
  | 'sharpen'
  | 'vignette'
  | 'grain'
  | 'glow_lite'
  | 'pixelate';

export const EDITOR_EFFECT_TYPES: readonly EditorEffectType[] = [
  'blur',
  'sharpen',
  'vignette',
  'grain',
  'glow_lite',
  'pixelate',
] as const;

export interface EditorEffect {
  type: EditorEffectType;
  intensity: number; // 0 to 1
  parameters?: Record<string, any>;
}

export type EditorFilterPreset =
  | 'none'
  | 'clean'
  | 'warm'
  | 'cool'
  | 'film'
  | 'punch'
  | 'soft'
  | 'mono'
  | 'creator';

export const EDITOR_FILTER_PRESETS: readonly EditorFilterPreset[] = [
  'none',
  'clean',
  'warm',
  'cool',
  'film',
  'punch',
  'soft',
  'mono',
  'creator',
] as const;

export interface EditorFilter {
  preset: EditorFilterPreset;
  intensity: number; // 0 to 1
}

export interface EditorColorAdjustments {
  exposure: number; // -1 to 1
  brightness: number; // -1 to 1
  contrast: number; // -1 to 1
  highlights: number; // -1 to 1
  shadows: number; // -1 to 1
  saturation: number; // -1 to 1
  temperature: number; // -1 to 1
  tint: number; // -1 to 1
  fade: number; // 0 to 1
  sharpen: number; // 0 to 1
}

export interface EditorMask {
  type: 'rectangle' | 'circle' | 'linear';
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
  inverted: boolean;
}

export interface EditorChromaKey {
  enabled: boolean;
  color: string;
  similarity: number;
  smoothness: number;
}

export interface EditorSpeedConfig {
  speed: number;
  pitch_preserved: boolean;
  speed_ramp?: 'smooth' | 'punch' | 'fast_in' | 'fast_out';
  reverse?: boolean;
}

export type EditorTextPreset =
  | 'minimal'
  | 'bold'
  | 'creator'
  | 'editorial'
  | 'punch'
  | 'clean'
  | 'highlight';

export type EditorTextAnimation =
  | 'none'
  | 'fade'
  | 'slide_up'
  | 'pop'
  | 'typewriter'
  | 'scale'
  | 'bounce_lite';

export interface EditorTextConfig {
  text: string;
  font_family: string;
  font_size: number;
  font_weight: 'normal' | 'medium' | 'bold' | 'black';
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  color: string;
  stroke_color?: string;
  stroke_width?: number;
  shadow_color?: string;
  shadow_blur?: number;
  background_color?: string;
  background_padding?: number;
  background_corner_radius?: number;
  letter_spacing?: number;
  line_height?: number;
  preset?: EditorTextPreset;
  animation?: EditorTextAnimation;
  animation_duration?: number;
}

export interface EditorCaptionItem {
  cues: TimedCaptionCue[];
  style: CaptionStyle;
  position: CaptionPosition;
  highlight_color: string;
  primary_color: string;
  animation?: 'none' | 'pop' | 'bounce' | 'karaoke' | 'highlight' | 'typewriter';
  emphasis_words?: string[];
}

export interface EditorAudioConfig {
  volume: number;
  fade_in: number;
  fade_out: number;
  normalized: boolean;
  target_lufs: number;
  eq_low?: number;
  eq_mid?: number;
  eq_high?: number;
  enhancement?: AudioEnhancementConfig;
  ducking?: AudioDuckingConfig;
  broll_audio_mode?: BrollAudioMode;
  is_ducking_target?: boolean;
  is_dialogue_master?: boolean;
}

export interface EditorTrackItem {
  id: string;
  track_id: string;
  type: EditorTrackType;
  source_asset_id?: string | null;
  source_path?: string | null;
  timeline_start: number;
  timeline_end: number;
  source_start: number;
  source_end: number;
  transform: EditorTransform;
  crop?: {
    mode: 'fit' | 'fill' | 'custom';
    focusX?: number;
    focusY?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  speed: EditorSpeedConfig;
  audio?: EditorAudioConfig;
  text?: EditorTextConfig;
  caption?: EditorCaptionItem;
  color?: EditorColorAdjustments;
  filter?: EditorFilter;
  effects: EditorEffect[];
  transition_in?: EditorTransition;
  transition_out?: EditorTransition;
  keyframes: EditorKeyframe[];
  mask?: EditorMask;
  chroma_key?: EditorChromaKey;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  z_index: number;
}

export interface EditorTrack {
  id: string;
  type: EditorTrackType;
  name: string;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  solo?: boolean;
  height?: number;
  items: EditorTrackItem[];
}

export interface EditorSettings {
  snapping: boolean;
  safe_guides: boolean;
  snap_tolerance_sec: number;
  show_safe_zones: boolean;
}

export interface EditorProject {
  id: string;
  user_id: string;
  project_id: string;
  clip_id: string;
  version: number;
  status: EditorProjectStatus;
  title: string;
  canvas: EditorCanvasConfig;
  tracks: EditorTrack[];
  playhead: number;
  settings: EditorSettings;
  producer_plan_id?: string | null;
  output_storage_path?: string | null;
  preview_video_url?: string | null;
  created_at: string;
  updated_at: string;
}

export const EDITOR_RESOURCE_LIMITS = {
  MAX_TRACKS: 16,
  MAX_TIMELINE_ITEMS: 120,
  MAX_TEXT_LAYERS: 25,
  MAX_EFFECTS_PER_ITEM: 5,
  MAX_KEYFRAMES_PER_ITEM: 30,
  MAX_TRANSITIONS: 30,
  MAX_EDITOR_DURATION: 300,
  MAX_IMAGE_ASSET_SIZE: 15 * 1024 * 1024,
} as const;

export const SAFE_EDITOR_FONTS = [
  'Arial',
  'Inter',
  'Roboto',
  'Montserrat',
  'Impact',
  'Oswald',
  'Courier New',
  'Georgia',
  'Helvetica',
  'DejaVu Sans',
  'Noto Sans Devanagari',
  'Kohinoor Devanagari',
  'Noto Sans CJK JP',
  'Noto Sans CJK SC',
  'Noto Sans CJK KR',
  'Hiragino Sans',
  'Noto Sans Arabic',
] as const;

export type SafeEditorFont = (typeof SAFE_EDITOR_FONTS)[number];

export interface CreateEditorProjectDTO {
  clip_id: string;
  title?: string;
  aspect_ratio?: ClipAspectRatio;
  from_producer_plan_id?: string;
}

export interface UpdateEditorProjectDTO {
  title?: string;
  canvas?: Partial<EditorCanvasConfig>;
  tracks?: EditorTrack[];
  playhead?: number;
  settings?: Partial<EditorSettings>;
  version?: number;
}

export interface SplitItemDTO {
  track_id: string;
  item_id: string;
  split_time: number;
}

export interface RippleDeleteDTO {
  track_id: string;
  item_id: string;
}

export interface DuplicateItemDTO {
  track_id: string;
  item_id: string;
}

export interface FreezeFrameDTO {
  track_id: string;
  item_id: string;
  freeze_time: number;
  duration?: number;
}

// ── Phase 19: Vireo AI B-Roll & Media Intelligence ───────────────────

export type MediaSourceType =
  | 'USER_UPLOAD'
  | 'PROJECT_SOURCE'
  | 'GENERATED_CLIP'
  | 'STOCK'
  | 'GENERATED_AI'
  | 'BRAND_ASSET';

export const MEDIA_SOURCE_TYPES: readonly MediaSourceType[] = [
  'USER_UPLOAD',
  'PROJECT_SOURCE',
  'GENERATED_CLIP',
  'STOCK',
  'GENERATED_AI',
  'BRAND_ASSET',
] as const;

export type MediaType = 'VIDEO' | 'IMAGE' | 'AUDIO';

export const MEDIA_TYPES: readonly MediaType[] = ['VIDEO', 'IMAGE', 'AUDIO'] as const;

export interface MediaAssetRecord {
  id: string;
  user_id: string;
  project_id?: string | null;
  clip_id?: string | null;
  source_type: MediaSourceType;
  media_type: MediaType;
  provider?: string | null;
  provider_asset_id?: string | null;
  storage_path?: string | null;
  external_preview_url?: string | null;
  title: string;
  description?: string | null;
  tags: string[];
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  aspect_ratio?: ClipAspectRatio | null;
  license_type?: string | null;
  license_source?: string | null;
  source_page_url?: string | null;
  attribution?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  proxy_path?: string | null;
  proxy_url?: string | null;
  semantic_text: string;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

export type BrollOpportunityImportance = 'HIGH' | 'MEDIUM' | 'LOW';

export interface BrollOpportunity {
  id: string;
  start_time: number;
  end_time: number;
  duration: number;
  concept: string;
  search_queries: string[];
  reason: string;
  confidence: number;
  importance: BrollOpportunityImportance;
  visual_context?: string;
  status: 'suggested' | 'approved' | 'dismissed' | 'applied';
}

export interface BrollExplanation {
  summary: string;
  matching_factors: string[];
  duration_fit: string;
  aspect_fit: string;
  score?: number;
  rationale?: string;
}

export interface BrollSuggestion {
  id: string;
  opportunity_id: string;
  opportunity?: BrollOpportunity;
  asset?: MediaAssetRecord | null;
  candidate_assets?: NormalizedMediaItem[];
  selected_asset?: NormalizedMediaItem | null;
  relevance_score: number; // 0–100
  explanation: BrollExplanation;
  suggested_timeline_start: number;
  suggested_timeline_end: number;
  suggested_source_start: number;
  suggested_source_end: number;
  status?: 'suggested' | 'approved' | 'dismissed' | 'applied';
  applied_item_id?: string | null;
}

export type BrollPlanStatus = 'draft' | 'searching' | 'ready' | 'applied' | 'failed';

export type BrollStyle = 'MINIMAL' | 'BALANCED' | 'DYNAMIC';

export interface BrollPlanRecord {
  id: string;
  user_id: string;
  clip_id: string;
  editor_project_id?: string | null;
  status: BrollPlanStatus;
  style: BrollStyle;
  opportunities: BrollOpportunity[];
  suggestions: BrollSuggestion[];
  applied_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProviderCapabilityStatus =
  | 'SUPPORTED'
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'TEMP_UNAVAILABLE'
  | 'ERROR';

export interface ProviderCapabilities {
  provider: string;
  status: ProviderCapabilityStatus;
  supports_video: boolean;
  supports_image: boolean;
  supports_similar: boolean;
  requires_attribution: boolean;
  rate_limit_remaining?: number;
  max_results_per_page?: number;
  supported_orientations?: string[];
  message?: string;
}

export interface NormalizedMediaItem {
  id: string;
  provider: string;
  provider_asset_id: string;
  media_type: MediaType;
  title: string;
  preview_url: string;
  download_url?: string;
  source_url?: string;
  duration?: number;
  width: number;
  height: number;
  aspect_ratio?: ClipAspectRatio;
  tags: string[];
  license_type: string;
  license_source?: string;
  source_page_url?: string;
  attribution?: string | null;
  relevance_score?: number;
  relevance_explanation?: string;
  priority_source?: 'project' | 'user_library' | 'brand' | 'stock';
}

export interface MediaSearchFilter {
  query?: string;
  media_type?: MediaType;
  aspect_ratio?: ClipAspectRatio;
  orientation?: 'portrait' | 'landscape' | 'square';
  target_duration?: number;
  min_duration?: number;
  max_duration?: number;
  source_type?: MediaSourceType;
  project_id?: string;
  provider?: string;
  page?: number;
  per_page?: number;
  page_size?: number;
}

export interface MediaSearchResult {
  provider: string;
  status: ProviderCapabilityStatus;
  items: NormalizedMediaItem[];
  total_count: number;
  page: number;
  has_more?: boolean;
}

export const BROLL_DENSITY_RULES = {
  MINIMAL: {
    max_broll_per_minute: 2,
    min_broll_duration: 2.5,
    max_broll_duration: 5.0,
    min_gap_between_broll: 6.0,
    max_broll_coverage_percent: 20,
  },
  BALANCED: {
    max_broll_per_minute: 4,
    min_broll_duration: 2.0,
    max_broll_duration: 4.5,
    min_gap_between_broll: 3.5,
    max_broll_coverage_percent: 35,
  },
  DYNAMIC: {
    max_broll_per_minute: 7,
    min_broll_duration: 1.5,
    max_broll_duration: 3.5,
    min_gap_between_broll: 2.0,
    max_broll_coverage_percent: 50,
  },
} as const;

export interface InsertBrollDTO {
  opportunity_id?: string;
  asset_id: string;
  timeline_start: number;
  timeline_end: number;
  source_start?: number;
  source_end?: number;
  fit_mode?: 'fill' | 'fit' | 'smart_crop';
  mute_audio?: boolean;
}

// ============================================================================
// PHASE 20 — AUDIO + VOICE STUDIO TYPES
// ============================================================================

export type AudioSourceType =
  | 'ORIGINAL_DIALOGUE'
  | 'MUSIC'
  | 'SFX'
  | 'VOICEOVER'
  | 'DUB'
  | 'BROLL_AUDIO'
  | 'USER_UPLOAD';

export type AudioCleanPreset = 'off' | 'natural' | 'clean' | 'podcast' | 'studio';

export type AudioDuckingPreset = 'subtle' | 'balanced' | 'strong' | 'custom';

export type AudioSilenceRemovalMode = 'natural' | 'tight' | 'fast';

export type BrollAudioMode = 'muted' | 'original' | 'auto_duck';

export interface AudioAnalysisMetrics {
  integrated_lufs: number;
  loudness_range_lu: number;
  true_peak_db: number;
  rms_db: number;
  mean_volume_db: number;
  max_volume_db: number;
  silence_ratio: number;
  speech_ratio: number;
  is_clipping: boolean;
  clipping_count: number;
  channels: number;
  sample_rate: number;
  duration_sec: number;
  noise_floor_estimate_db?: number;
  spectral_centroid_hz?: number;
}

export interface AudioAssetRecord {
  id: string;
  user_id: string;
  project_id?: string;
  clip_id?: string;
  source_type: AudioSourceType;
  media_type: 'AUDIO';
  storage_path: string;
  duration: number;
  channels: number;
  sample_rate: number;
  codec: string;
  title: string;
  analysis?: AudioAnalysisMetrics;
  created_at: string;
  updated_at: string;
}

export interface AudioEnhancementConfig {
  preset: AudioCleanPreset;
  denoise_enabled: boolean;
  denoise_amount: number;
  hum_removal_enabled: boolean;
  highpass_freq: number;
  deess_enabled: boolean;
  compressor_enabled: boolean;
  compressor_threshold_db?: number;
  compressor_ratio?: number;
  compressor_attack_ms?: number;
  compressor_release_ms?: number;
  eq_low_db?: number;
  eq_mid_db?: number;
  eq_high_db?: number;
  normalize_enabled: boolean;
  target_lufs: number;
  limiter_enabled: boolean;
  limiter_ceiling_db: number;
}

export interface AudioDuckingConfig {
  enabled: boolean;
  preset: AudioDuckingPreset;
  threshold_db: number;
  duck_ratio: number;
  attack_ms: number;
  release_ms: number;
}

export interface FillerWordMatch {
  word: string;
  start: number;
  end: number;
  confidence: number;
  safe_to_remove: boolean;
  reason?: string;
}

export interface RepeatedPhraseMatch {
  phrase: string;
  first_start: number;
  first_end: number;
  second_start: number;
  second_end: number;
  pause_duration: number;
  suggested_trim_start: number;
  suggested_trim_end: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  accent?: string;
  preview_url?: string;
  provider: string;
}

export interface VoiceProviderCapabilities {
  text_to_speech: ProviderCapabilityStatus;
  multilingual_tts: ProviderCapabilityStatus;
  voice_cloning: ProviderCapabilityStatus;
  voice_conversion: ProviderCapabilityStatus;
  echo_reduction: ProviderCapabilityStatus;
  stem_separation: ProviderCapabilityStatus;
  languages: string[];
  voices: VoiceOption[];
}

export interface TTSRequest {
  text: string;
  language: string;
  voice_id: string;
  speed?: number;
  pitch?: number;
}

export interface TTSResult {
  asset_id: string;
  storage_path: string;
  duration: number;
  provider: string;
  voice_id: string;
  language: string;
  text: string;
}

export interface VoiceProfile {
  id: string;
  user_id: string;
  provider: string;
  provider_voice_id: string;
  display_name: string;
  consent_confirmed_at: string;
  consent_statement: string;
  source_asset_id: string;
  created_at: string;
}

export interface VoiceCloneRequest {
  display_name: string;
  source_asset_id: string;
  consent_confirmed: boolean;
  consent_statement: string;
}

export const AUDIO_RESOURCE_LIMITS = {
  MAX_AUDIO_DURATION: 600,
  MAX_AUDIO_TRACKS: 6,
  MAX_VOICEOVER_LENGTH: 300,
  MAX_TTS_REQUEST_CHARS: 2000,
  MAX_AUDIO_PROCESSING_TIME_MS: 60000,
  MAX_SIMULTANEOUS_AUDIO_JOBS: 4,
} as const;

export const AUDIO_DUCKING_PRESETS: Record<AudioDuckingPreset, Omit<AudioDuckingConfig, 'enabled' | 'preset'>> = {
  subtle: {
    threshold_db: -28,
    duck_ratio: 4,
    attack_ms: 40,
    release_ms: 300,
  },
  balanced: {
    threshold_db: -30,
    duck_ratio: 8,
    attack_ms: 30,
    release_ms: 350,
  },
  strong: {
    threshold_db: -32,
    duck_ratio: 16,
    attack_ms: 20,
    release_ms: 450,
  },
  custom: {
    threshold_db: -30,
    duck_ratio: 8,
    attack_ms: 30,
    release_ms: 350,
  },
};

export const AUDIO_CLEAN_PRESETS: Record<AudioCleanPreset, AudioEnhancementConfig> = {
  off: {
    preset: 'off',
    denoise_enabled: false,
    denoise_amount: 0,
    hum_removal_enabled: false,
    highpass_freq: 0,
    deess_enabled: false,
    compressor_enabled: false,
    normalize_enabled: false,
    target_lufs: -16,
    limiter_enabled: false,
    limiter_ceiling_db: -1.0,
  },
  natural: {
    preset: 'natural',
    denoise_enabled: true,
    denoise_amount: 15,
    hum_removal_enabled: true,
    highpass_freq: 80,
    deess_enabled: false,
    compressor_enabled: true,
    compressor_threshold_db: -20,
    compressor_ratio: 2.5,
    compressor_attack_ms: 30,
    compressor_release_ms: 250,
    normalize_enabled: true,
    target_lufs: -16,
    limiter_enabled: true,
    limiter_ceiling_db: -1.0,
  },
  clean: {
    preset: 'clean',
    denoise_enabled: true,
    denoise_amount: 30,
    hum_removal_enabled: true,
    highpass_freq: 100,
    deess_enabled: true,
    compressor_enabled: true,
    compressor_threshold_db: -18,
    compressor_ratio: 3.0,
    compressor_attack_ms: 20,
    compressor_release_ms: 200,
    eq_low_db: -1.5,
    eq_mid_db: 1.0,
    eq_high_db: 1.5,
    normalize_enabled: true,
    target_lufs: -16,
    limiter_enabled: true,
    limiter_ceiling_db: -1.0,
  },
  podcast: {
    preset: 'podcast',
    denoise_enabled: true,
    denoise_amount: 25,
    hum_removal_enabled: true,
    highpass_freq: 90,
    deess_enabled: true,
    compressor_enabled: true,
    compressor_threshold_db: -16,
    compressor_ratio: 3.5,
    compressor_attack_ms: 15,
    compressor_release_ms: 180,
    eq_low_db: 1.5,
    eq_mid_db: 1.5,
    eq_high_db: 2.0,
    normalize_enabled: true,
    target_lufs: -16,
    limiter_enabled: true,
    limiter_ceiling_db: -1.0,
  },
  studio: {
    preset: 'studio',
    denoise_enabled: true,
    denoise_amount: 40,
    hum_removal_enabled: true,
    highpass_freq: 100,
    deess_enabled: true,
    compressor_enabled: true,
    compressor_threshold_db: -14,
    compressor_ratio: 4.0,
    compressor_attack_ms: 10,
    compressor_release_ms: 150,
    eq_low_db: -2.0,
    eq_mid_db: 2.0,
    eq_high_db: 3.0,
    normalize_enabled: true,
    target_lufs: -14,
    limiter_enabled: true,
    limiter_ceiling_db: -0.5,
  },
};

// ============================================================================
// Phase 21: Vireo Translate & Multilingual Dubbing Types
// ============================================================================

export type ScriptFamily = 'latin' | 'devanagari' | 'cjk' | 'arabic' | 'other';
export type TextDirection = 'ltr' | 'rtl';

export interface LanguageDefinition {
  code: string;
  bcp47: string;
  name: string;
  native_name: string;
  script_family: ScriptFamily;
  direction: TextDirection;
  safe_fonts: string[];
}

export type TranslationStyle = 'literal' | 'natural' | 'creator' | 'professional';
export type TranslationProjectStatus = 'draft' | 'translating' | 'ready' | 'reviewed' | 'rendering' | 'completed' | 'failed';

export interface TranslatedSegment {
  segment_id: string;
  source_text: string;
  translated_text: string;
  start_time: number;
  end_time: number;
  speaker_id?: string;
  locked_terms?: string[];
  confidence?: number;
  reviewed: boolean;
  is_manually_edited?: boolean;
  cues?: TimedCaptionCue[];
}

export interface TranslationProject {
  id: string;
  user_id: string;
  project_id: string;
  clip_id: string;
  source_language: string;
  target_language: string;
  status: TranslationProjectStatus;
  provider: string;
  version: number;
  style: TranslationStyle;
  segments: TranslatedSegment[];
  stats?: {
    characters_billed?: number;
    tokens_used?: number;
    segment_count: number;
  };
  created_at: string;
  updated_at: string;
}

export type DubVoiceStrategy = 'ORIGINAL_STYLE' | 'SELECTED_VOICE' | 'AUTHORIZED_CLONE';
export type DubAudioMode = 'dub_only' | 'original_low' | 'original_muted';

export interface DubSegment {
  segment_id: string;
  text: string;
  target_voice: string;
  start_time: number;
  target_duration: number;
  actual_duration?: number;
  generated_audio_path?: string;
  speed_multiplier?: number; // 0.85 to 1.20
  timing_fit: 'exact' | 'speed_adjusted' | 'shortened' | 'overflow';
  smart_shortening_suggestion?: string;
}

export interface DubProject {
  id: string;
  user_id: string;
  translation_project_id: string;
  clip_id: string;
  target_language: string;
  voice_strategy: DubVoiceStrategy;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  audio_mode: DubAudioMode;
  output_audio_path?: string;
  segments: DubSegment[];
  created_at: string;
  updated_at: string;
}

export interface TranslationMemoryRecord {
  id: string;
  user_id: string;
  source_hash: string;
  source_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  created_at: string;
  updated_at: string;
}

export interface GlossaryTerm {
  term: string;
  translated_term?: string;
  case_sensitive: boolean;
  category?: 'brand' | 'product' | 'name' | 'tech';
}

export interface GlossaryRecord {
  id: string;
  user_id: string;
  project_id?: string;
  terms: GlossaryTerm[];
  created_at: string;
  updated_at: string;
}

export interface TranslationProviderCapabilities {
  provider_name: string;
  configured: boolean;
  capabilities: Array<'TRANSLATE_TEXT' | 'TRANSLATE_SEGMENTS' | 'LANGUAGE_DETECTION' | 'GLOSSARY' | 'FORMALITY' | 'CONTEXT_AWARE_TRANSLATION'>;
  supported_languages: string[];
}

export interface LipSyncProviderCapabilities {
  provider_name: string;
  status: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED';
}

export const TRANSLATION_RESOURCE_LIMITS = {
  MAX_LANGUAGES_PER_PROJECT: 10,
  MAX_TRANSLATION_CHARS: 25000,
  MAX_SEGMENTS: 200,
  MAX_DUB_DURATION: 300, // seconds
  MAX_CONCURRENT_LANGUAGE_JOBS: 3,
  TTS_SPEED_MIN: 0.85,
  TTS_SPEED_MAX: 1.20,
} as const;

// ============================================================================
// Phase 22: Vireo Brand Brain Types
// ============================================================================

export type RuleState = 'LOCKED' | 'PREFERRED' | 'LEARNED' | 'DEFAULT';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EvidenceSourceType =
  | 'USER_SETTING'
  | 'APPROVED_EDIT'
  | 'CREATOR_PROFILE'
  | 'PROJECT'
  | 'PUBLISHED_CONTENT'
  | 'ANALYTICS'
  | 'TRANSLATION_GLOSSARY'
  | 'BRAND_ASSET'
  | 'HOOK_LAB';

export type BrandDimension =
  | 'identity'
  | 'voice'
  | 'visual'
  | 'captions'
  | 'hooks'
  | 'cta'
  | 'editing'
  | 'audio'
  | 'publishing'
  | 'translation';

export type HookType =
  | 'DIRECT'
  | 'DIRECT_STATEMENT'
  | 'QUESTION'
  | 'CURIOSITY'
  | 'CURIOSITY_GAP'
  | 'CONTRARIAN'
  | 'RESULT_FIRST'
  | 'WARNING'
  | 'NUMBER'
  | 'CONFESSION'
  | 'STORY_OPEN'
  | 'PATTERN_INTERRUPT'
  | 'PROBLEM'
  | 'BENEFIT';

export type CtaType =
  | 'NONE'
  | 'SOFT'
  | 'DIRECT'
  | 'COMMENT'
  | 'FOLLOW'
  | 'SHARE'
  | 'SAVE'
  | 'LINK'
  | 'DM';

export interface BrandBrainIdentity {
  brand_name: string;
  tagline?: string;
  description?: string;
  industry?: string;
  website_url?: string;
}

export interface BrandBrainVoice {
  tones: string[];
  writing_styles: string[];
  preferred_phrasing: string[];
  avoid_phrasing: string[];
  formality: 'casual' | 'neutral' | 'formal';
  humor_level: 'none' | 'subtle' | 'high';
  sentence_length_preference: 'short' | 'medium' | 'long' | 'mixed';
  emoji_policy: 'never' | 'minimal' | 'moderate' | 'frequent';
}

export interface BrandBrainVisual {
  primary_colors: string[];
  secondary_colors: string[];
  accent_colors: string[];
  background_color?: string;
  text_color?: string;
  fonts: string[];
  logo_asset_ids: string[];
  watermark_asset_id?: string;
  watermark_config?: {
    position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
    opacity: number;
    scale: number;
    padding: number;
  };
  preferred_aspect_ratios: string[];
  preferred_layouts: string[];
}

export interface BrandBrainCaptions {
  default_style: string;
  highlight_style: string;
  font: string;
  case_style: 'uppercase' | 'lowercase' | 'titlecase' | 'normal';
  max_words_per_line: number;
  stroke_color?: string;
  stroke_width?: number;
  background_color?: string;
  emphasis_rules?: string[];
  position_y?: number;
}

export interface BrandBrainHooks {
  preferred_hook_types: HookType[];
  preferred_hook_length: 'short' | 'medium' | 'long';
  banned_patterns: string[];
  example_hooks: string[];
}

export interface BrandBrainCta {
  preferred_cta_types: CtaType[];
  approved_phrases: string[];
  blocked_phrases: string[];
}

export interface BrandBrainEditing {
  pacing_style: 'slow' | 'balanced' | 'fast' | 'ultra_fast';
  broll_density: 'minimal' | 'balanced' | 'dense';
  transition_style: 'none' | 'cut' | 'crossfade' | 'zoom' | 'slide';
  punch_in_frequency: 'none' | 'low' | 'moderate' | 'high';
  silence_style: 'tight' | 'natural' | 'relaxed';
  preferred_clip_length_range?: { min: number; max: number };
  intro_style?: 'immediate' | 'hook_title' | 'fade_in';
  outro_style?: 'hard_cut' | 'cta_card' | 'fade_out';
}

export interface BrandBrainAudio {
  cleanup_preset: 'subtle' | 'clean' | 'podcast' | 'studio' | 'aggressive';
  loudness_target_lufs: number;
  music_level: number;
  ducking_style: 'subtle' | 'balanced' | 'aggressive' | 'broadcast';
}

export interface BrandBrainPublishing {
  platform_preferences: Record<
    string,
    {
      tone?: string;
      caption_speed?: string;
      cta_type?: string;
      hashtag_count?: number;
    }
  >;
  metadata_style: 'minimal' | 'seo_rich' | 'engaging';
  hashtag_style: 'none' | 'targeted' | 'broad';
}

export interface BrandBrainTranslation {
  glossary_id?: string;
  tone_preservation_mode: 'strict' | 'adaptive';
}

export interface BrandBrainLearningSummary {
  last_learned_at?: string;
  evidence_count: number;
  confidence_by_dimension: Record<string, ConfidenceLevel>;
}

export interface BrandBrainProfile {
  id: string;
  user_id: string;
  workspace_id?: string;
  version: number;
  status: 'active' | 'archived';
  identity: BrandBrainIdentity;
  voice: BrandBrainVoice;
  visual: BrandBrainVisual;
  captions: BrandBrainCaptions;
  hooks: BrandBrainHooks;
  cta: BrandBrainCta;
  editing: BrandBrainEditing;
  audio: BrandBrainAudio;
  publishing: BrandBrainPublishing;
  translation: BrandBrainTranslation;
  locks: Record<string, boolean>;
  rule_states: Record<string, RuleState>;
  learning: BrandBrainLearningSummary;
  created_at: string;
  updated_at: string;
}

export interface BrandEvidence {
  id: string;
  user_id: string;
  brand_brain_id: string;
  dimension: BrandDimension;
  source_type: EvidenceSourceType;
  source_id: string;
  idempotency_key: string;
  value: any;
  weight: number;
  confidence: ConfidenceLevel;
  created_at: string;
}

export interface BrandBrainVersion {
  id: string;
  user_id: string;
  brand_brain_id: string;
  version: number;
  snapshot: BrandBrainProfile;
  change_summary: string;
  source: string;
  created_at: string;
}

export interface BrandContext {
  brand_name: string;
  task_type: string;
  rules_applied: string[];
  identity?: Partial<BrandBrainIdentity>;
  voice?: Partial<BrandBrainVoice>;
  visual?: Partial<BrandBrainVisual>;
  captions?: Partial<BrandBrainCaptions>;
  hooks?: Partial<BrandBrainHooks>;
  cta?: Partial<BrandBrainCta>;
  editing?: Partial<BrandBrainEditing>;
  audio?: Partial<BrandBrainAudio>;
  publishing?: Partial<BrandBrainPublishing>;
  translation?: Partial<BrandBrainTranslation>;
}

export interface BrandCheckResult {
  passed: boolean;
  score: number; // 0 to 100
  warnings: Array<{ rule: string; message: string; severity: 'warning' | 'blocking' }>;
  match_breakdown: Record<string, { matched: boolean; details: string }>;
}

export interface BrandRecommendation {
  id: string;
  dimension: BrandDimension;
  title: string;
  description: string;
  evidence: string;
  confidence: ConfidenceLevel;
  suggested_value: any;
  current_value: any;
}

export const BRAND_RESOURCE_LIMITS = {
  MAX_BRAND_PROFILES: 5,
  MAX_BRAND_ASSETS: 20,
  MAX_EXAMPLES_PER_DIMENSION: 15,
  MAX_BRAND_COLORS: 10,
  MAX_APPROVED_PHRASES: 30,
  MAX_AVOID_PHRASES: 30,
  MAX_EVIDENCE_RECORDS_PER_PROFILE: 200,
  MAX_IMPORTED_GUIDELINE_SIZE_BYTES: 2 * 1024 * 1024,
} as const;

// ── Phase 23: Vireo Content Pack Types ──────────────────────────────

export type ContentPackStatus =
  | 'DRAFT'
  | 'GENERATING'
  | 'READY'
  | 'REVIEWED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'FAILED';

export type ContentPackItemType =
  | 'PRIMARY_TITLE'
  | 'ALT_TITLE'
  | 'HOOK'
  | 'SHORT_CAPTION'
  | 'LONG_CAPTION'
  | 'SHORT_DESCRIPTION'
  | 'LONG_DESCRIPTION'
  | 'CTA'
  | 'HASHTAGS'
  | 'KEYWORDS'
  | 'THUMBNAIL_TEXT'
  | 'THUMBNAIL_DIRECTION'
  | 'ALT_TEXT'
  | 'PINNED_COMMENT'
  | 'EMAIL_SNIPPET'
  | 'BLOG_SNIPPET';

export type ContentPackItemStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'EDITED'
  | 'APPROVED'
  | 'REJECTED';

export type ContentPackGenerationMode = 'QUICK' | 'BALANCED' | 'FULL';

export type ContentPackTemplate =
  | 'Creator'
  | 'Podcast'
  | 'Education'
  | 'Business'
  | 'Interview'
  | 'Gaming'
  | 'Vlog';

export type ContentPackCtaType =
  | 'NONE'
  | 'FOLLOW'
  | 'COMMENT'
  | 'SAVE'
  | 'SHARE'
  | 'LINK'
  | 'DM'
  | 'WATCH_MORE';

export type TitleVariantCategory =
  | 'DIRECT'
  | 'CURIOSITY'
  | 'BENEFIT'
  | 'QUESTION'
  | 'CONTRARIAN';

export type ContentPackProviderState =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'TEMP_UNAVAILABLE'
  | 'ERROR';

export interface ContentPackSource {
  transcript_source?: string;
  source_language?: string;
  clip_start?: number;
  clip_end?: number;
  duration?: number;
  topic_summary?: string;
}

export interface ContentPackEvidence {
  source_segment_ids?: string[];
  source_timestamps?: Array<{ start: number; end: number }>;
  source_topics?: string[];
  quote_snippet?: string;
}

export interface ContentPackItem {
  id: string;
  user_id?: string;
  content_pack_id: string;
  type: ContentPackItemType;
  platform?: OutputPlatform | 'all';
  variant_index: number;
  text: string;
  status: ContentPackItemStatus;
  source_evidence: ContentPackEvidence[];
  generation_source?: 'ai' | 'template' | 'manual' | 'translation';
  brand_rules_used: string[];
  manual_edit: boolean;
  locked: boolean;
  approved: boolean;
  explanation?: string;
  validation_warnings?: string[];
  created_at: string;
  updated_at: string;
}

export interface ContentPack {
  id: string;
  user_id: string;
  workspace_id?: string;
  project_id: string;
  clip_id: string;
  brand_brain_id?: string;
  brand_brain_version?: number;
  source: ContentPackSource;
  status: ContentPackStatus;
  version: number;
  generation_mode: ContentPackGenerationMode;
  template?: ContentPackTemplate;
  user_instruction?: string;
  items?: ContentPackItem[];
  item_counts?: Record<string, number>;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ContentPackVersion {
  id: string;
  user_id: string;
  content_pack_id: string;
  version: number;
  snapshot: ContentPack;
  change_summary: string;
  created_at: string;
}

export interface PlatformConstraint {
  name: string;
  maxTitleLength?: number;
  maxCaptionLength?: number;
  maxDescriptionLength?: number;
  maxHashtags?: number;
  minHashtags?: number;
  supportedItemTypes: ContentPackItemType[];
  requiresHashtags?: boolean;
  requiresTitle?: boolean;
}

export const PLATFORM_CONSTRAINTS: Record<OutputPlatform, PlatformConstraint> = {
  youtube: {
    name: 'YouTube',
    maxTitleLength: 100,
    maxDescriptionLength: 5000,
    maxHashtags: 15,
    supportedItemTypes: [
      'PRIMARY_TITLE',
      'ALT_TITLE',
      'HOOK',
      'SHORT_DESCRIPTION',
      'LONG_DESCRIPTION',
      'KEYWORDS',
      'THUMBNAIL_TEXT',
      'THUMBNAIL_DIRECTION',
      'PINNED_COMMENT',
      'ALT_TEXT',
    ],
    requiresTitle: true,
  },
  shorts: {
    name: 'YouTube Shorts',
    maxTitleLength: 100,
    maxDescriptionLength: 5000,
    maxHashtags: 15,
    supportedItemTypes: [
      'PRIMARY_TITLE',
      'ALT_TITLE',
      'HOOK',
      'SHORT_CAPTION',
      'SHORT_DESCRIPTION',
      'HASHTAGS',
      'KEYWORDS',
      'THUMBNAIL_TEXT',
      'THUMBNAIL_DIRECTION',
      'PINNED_COMMENT',
    ],
    requiresTitle: true,
  },
  instagram: {
    name: 'Instagram Reels',
    maxCaptionLength: 2200,
    maxHashtags: 30,
    supportedItemTypes: [
      'PRIMARY_TITLE',
      'HOOK',
      'SHORT_CAPTION',
      'LONG_CAPTION',
      'CTA',
      'HASHTAGS',
      'KEYWORDS',
      'THUMBNAIL_TEXT',
      'PINNED_COMMENT',
    ],
    requiresHashtags: true,
  },
  tiktok: {
    name: 'TikTok',
    maxCaptionLength: 2200,
    maxHashtags: 10,
    supportedItemTypes: [
      'PRIMARY_TITLE',
      'HOOK',
      'SHORT_CAPTION',
      'CTA',
      'HASHTAGS',
      'KEYWORDS',
      'THUMBNAIL_TEXT',
    ],
  },
  linkedin: {
    name: 'LinkedIn',
    maxCaptionLength: 3000,
    maxHashtags: 5,
    supportedItemTypes: [
      'PRIMARY_TITLE',
      'HOOK',
      'SHORT_CAPTION',
      'LONG_CAPTION',
      'CTA',
      'HASHTAGS',
      'KEYWORDS',
    ],
  },
  x: {
    name: 'X',
    maxCaptionLength: 280,
    maxHashtags: 4,
    supportedItemTypes: [
      'PRIMARY_TITLE',
      'HOOK',
      'SHORT_CAPTION',
      'CTA',
      'HASHTAGS',
    ],
  },
};

export const CONTENT_PACK_LIMITS = {
  MAX_PACKS_PER_PROJECT: 20,
  MAX_VARIANTS_PER_TYPE: 10,
  MAX_TEXT_LENGTH: 5000,
  MAX_USER_INSTRUCTION_LENGTH: 500,
  MAX_PLATFORMS_PER_REQUEST: 6,
  MAX_TRANSLATION_LANGUAGES: 10,
  MAX_REGENERATION_BATCH: 15,
} as const;

// ============================================================================
// PHASE 24: VIREO HOOK LAB TYPES
// ============================================================================

export type HookLabStatus =
  | 'DRAFT'
  | 'ANALYZING'
  | 'READY'
  | 'APPLIED'
  | 'APPROVED'
  | 'FAILED';

export type HookCandidateStatus =
  | 'GENERATED'
  | 'EDITED'
  | 'APPLIED'
  | 'APPROVED'
  | 'REJECTED';

export type HookDeliveryMode =
  | 'SPOKEN_REWRITE'
  | 'TEXT_OVERLAY'
  | 'CAPTION_OPEN'
  | 'EDITORIAL_TRIM'
  | 'REORDER_EXISTING'
  | 'COMBINED';

export type HookOpeningLatencyLabel = 'FAST' | 'MODERATE' | 'SLOW';

export interface HookOpeningWindow {
  start_seconds: number;
  end_seconds: number;
}

export interface HookMultimodalSignals {
  speech_energy_db?: number;
  visual_activity_score?: number;
  scene_cuts_in_window?: number;
  face_present?: boolean;
  ocr_text_present?: boolean;
  audio_energy_score?: number;
}

export interface HookOpeningAnalysis {
  current_hook_text: string;
  current_hook_source: 'TRANSCRIPT' | 'TEXT_OVERLAY' | 'CAPTION' | 'NO_CLEAR_HOOK';
  current_hook_type?: HookType | string;
  current_hook_score?: number;
  time_to_first_meaningful_speech_sec: number;
  latency_label: HookOpeningLatencyLabel;
  has_leading_silence: boolean;
  leading_silence_duration_sec: number;
  has_leading_filler: boolean;
  leading_filler_words: string[];
  multimodal_signals: HookMultimodalSignals;
  issues: string[];
  strengths: string[];
}

export interface HookLabSession {
  id: string;
  user_id: string;
  project_id: string;
  clip_id: string;
  content_pack_id?: string;
  brand_brain_id?: string;
  brand_brain_version?: number;
  source_language: string;
  status: HookLabStatus;
  version: number;
  opening_window: HookOpeningWindow;
  analysis: HookOpeningAnalysis;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface HookSourceEvidence {
  start_seconds: number;
  end_seconds: number;
  text: string;
  segment_id?: string;
  reason?: string;
}

export interface HookScoreBreakdown {
  grounding: number;      // 0–100 (25% weight)
  clarity: number;        // 0–100 (15% weight)
  specificity: number;    // 0–100 (15% weight)
  curiosity: number;      // 0–100 (10% weight)
  brevity: number;        // 0–100 (10% weight)
  brand_fit: number;      // 0–100 (10% weight)
  opening_fit: number;    // 0–100 (15% weight)
}

export interface HookScoreExplanation {
  summary: string;
  positives: string[];
  cautions: string[];
  source_reference: string;
}

export interface HookReorderPlan {
  source_start: number;
  source_end: number;
  source_text: string;
  target_timeline_position: number;
  resume_original_at: number;
}

export interface HookTrimPlan {
  trim_start: number;
  trim_end: number;
  reason: string;
}

export interface HookTextOverlayPlan {
  text: string;
  start_time: number;
  end_time: number;
  position_y: number;
  font_family: string;
  font_size: number;
  color: string;
}

export interface HookCandidate {
  id: string;
  hook_lab_session_id: string;
  user_id: string;
  variant_index: number;
  hook_type: HookType;
  text: string;
  delivery_mode: HookDeliveryMode;
  source_evidence: HookSourceEvidence[];
  brand_rules_used: string[];
  analysis_signals_used: string[];
  scores: HookScoreBreakdown;
  overall_hook_fit: number; // 0–100
  explanation: HookScoreExplanation;
  reorder_plan?: HookReorderPlan;
  trim_plan?: HookTrimPlan;
  text_overlay_plan?: HookTextOverlayPlan;
  status: HookCandidateStatus;
  locked: boolean;
  manual_edit: boolean;
  approved: boolean;
  applied: boolean;
  validation_warnings: string[];
  created_at: string | Date;
  updated_at: string | Date;
}

export const HOOK_LAB_LIMITS = {
  MAX_HOOK_CANDIDATES: 10,
  DEFAULT_CANDIDATE_COUNT: 5,
  MAX_HOOK_TEXT_LENGTH: 500,
  MAX_OPENING_WINDOW_SEC: 10.0,
  DEFAULT_OPENING_WINDOW_SEC: 3.0,
  MIN_OPENING_WINDOW_SEC: 1.0,
  MAX_USER_INSTRUCTION_LENGTH: 500,
  MAX_SOURCE_SEARCH_WINDOW: 60.0,
  MAX_REGENERATION_BATCH: 10,
  MAX_HOOK_SESSIONS_PER_CLIP: 20,
} as const;

export interface HookLabCapabilityModel {
  opening_analysis: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'ERROR';
  source_line_search: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'ERROR';
  hook_generation: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'ERROR';
  hook_scoring: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'ERROR';
  editor_apply: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'ERROR';
  analytics_signal: 'SUPPORTED' | 'INSUFFICIENT_DATA' | 'NOT_SUPPORTED' | 'ERROR';
  voiceover: 'SUPPORTED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'ERROR';
  thumbnail_lab: 'DEFERRED_TO_PHASE_25';
  autopilot: 'DEFERRED_TO_PHASE_26';
  ab_studio: 'DEFERRED_TO_PHASE_27';
}




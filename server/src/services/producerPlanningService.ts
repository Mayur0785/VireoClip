import crypto from 'node:crypto';
import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { OpenRouterContentProvider } from './aiProviderClient.js';
import { config } from '../config/index.js';
import {
  AppError,
  ClipRecord,
  ClipCandidate,
  ProjectRecord,
  TranscriptRecord,
  TranscriptWord,
  VideoAnalysisRecord,
  CreatorProfileRecord,
  ProducerMode,
  ProducerPlanStatus,
  ProducerOperationType,
  ProducerOperation,
  ProducerScore,
  ProducerScoreComparison,
  ProducerExplanation,
  ProducerEditPlan,
  GenerateProducerPlanDTO,
  ReviseProducerPlanDTO,
  OutputPlatform,
  PRODUCER_OPERATION_TYPES,
  PRODUCER_MODES,
  isValidUUID,
} from '../types/index.js';

export interface PlanGenerationContext {
  clip: ClipRecord;
  candidate?: ClipCandidate | null;
  project?: ProjectRecord | null;
  transcript?: TranscriptRecord | null;
  analysis?: VideoAnalysisRecord | null;
  creatorProfile?: CreatorProfileRecord | null;
}

export class ProducerPlanningService {
  /**
   * Generates a new comprehensive ProducerEditPlan for a given clip.
   */
  public static async generatePlan(
    clipId: string,
    userId: string,
    dto: GenerateProducerPlanDTO = {}
  ): Promise<ProducerEditPlan> {
    if (!isMongoConfigured) {
      throw new AppError('Database service is not configured.', 503, 'SERVICE_UNAVAILABLE');
    }

    if (!isValidUUID(clipId)) {
      throw new AppError('Invalid clip ID format.', 400, 'INVALID_UUID');
    }

    const mode: ProducerMode = dto.mode && PRODUCER_MODES.includes(dto.mode) ? dto.mode : 'BALANCED';
    const targetPlatform: OutputPlatform = dto.target_platform || 'tiktok';

    // 1. Fetch clip record
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
    }

    // 2. Fetch context: candidate, project, transcript, multimodal analysis, creator profile
    const ctx = await this.fetchContext(clip, userId);

    // 3. Build editing operations based on mode, signals, and instruction
    const { operations, estimatedDuration, explanation, scores } = await this.synthesizePlan(
      clip,
      ctx,
      mode,
      targetPlatform,
      dto.instruction,
      dto.target_duration
    );

    // 4. Construct plan record
    const now = new Date();
    const planId = crypto.randomUUID();
    const title = clip.title
      ? `Producer Edit: ${clip.title}`
      : `Producer ${mode} Edit (${targetPlatform})`;

    const plan: ProducerEditPlan = {
      id: planId,
      clip_id: clip.id,
      project_id: clip.project_id,
      user_id: userId,
      version: 1,
      parent_plan_id: null,
      mode,
      target_platform: targetPlatform,
      status: 'draft',
      title,
      user_instruction: dto.instruction?.trim() || null,
      original_duration: Number((clip.end_seconds - clip.start_seconds).toFixed(2)),
      estimated_duration: Number(estimatedDuration.toFixed(2)),
      operations,
      scores,
      explanation,
      preview_video_url: null,
      preview_storage_path: null,
      applied_at: null,
      created_at: now,
      updated_at: now,
    };

    // 5. Save to MongoDB producer_plans
    const { error: insertErr } = await dataRepository
      .from('producer_plans')
      .insert(plan);

    if (insertErr) {
      logger.error('Failed to persist producer plan', { clipId, planId, error: insertErr.message });
      throw new AppError(`Failed to save producer plan: ${insertErr.message}`, 500, 'DATABASE_ERROR');
    }

    logger.info(`[ProducerPlanning] Generated v1 plan ${planId} for clip ${clipId} (mode=${mode}, ops=${operations.length})`);
    return plan;
  }

  /**
   * Revises an existing plan through natural-language instructions and/or operation toggles.
   * Produces a new version linked to the parent plan.
   */
  public static async revisePlan(
    planId: string,
    userId: string,
    dto: ReviseProducerPlanDTO
  ): Promise<ProducerEditPlan> {
    if (!isValidUUID(planId)) {
      throw new AppError('Invalid plan ID.', 400, 'INVALID_UUID');
    }

    // 1. Fetch parent plan
    const { data: parentPlan, error: planErr } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (planErr || !parentPlan) {
      throw new AppError('Producer plan not found or access denied.', 404, 'PLAN_NOT_FOUND');
    }

    // 2. Fetch clip
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', parentPlan.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Associated clip not found.', 404, 'CLIP_NOT_FOUND');
    }

    const mode: ProducerMode = dto.mode && PRODUCER_MODES.includes(dto.mode)
      ? dto.mode
      : parentPlan.mode;

    const ctx = await this.fetchContext(clip, userId);

    // Clone parent operations as starting baseline
    let operations: ProducerOperation[] = JSON.parse(JSON.stringify(parentPlan.operations));

    // Apply explicit operation overrides if supplied
    if (dto.operation_overrides && Array.isArray(dto.operation_overrides)) {
      for (const override of dto.operation_overrides) {
        const op = operations.find((o) => o.id === override.id);
        if (op) {
          if (typeof override.enabled === 'boolean') {
            op.enabled = override.enabled;
          }
          if (override.parameters && typeof override.parameters === 'object') {
            op.parameters = { ...op.parameters, ...override.parameters };
          }
        }
      }
    }

    // Apply instruction-driven adjustments
    const instruction = dto.instruction?.trim();
    if (instruction) {
      operations = this.applyInstructionHeuristics(operations, instruction, mode);
    }

    // Recalculate estimated duration and scores
    const clipDuration = clip.end_seconds - clip.start_seconds;
    const estimatedDuration = this.calculateEstimatedDuration(clipDuration, operations);
    const scores = this.calculateScores(clipDuration, operations, mode, ctx);
    
    // Build updated explanation
    const keyDecisions = [
      `Revised based on creator instruction: "${instruction || 'manual parameter adjustments'}"`,
      ...operations.filter((o) => o.enabled).map((o) => `${o.label}: ${o.reason}`),
    ];

    const explanation: ProducerExplanation = {
      summary: `Revision v${parentPlan.version + 1}: ${instruction || 'Adjusted operations plan'}`,
      key_decisions: keyDecisions.slice(0, 8),
      pacing_notes: `Adjusted pacing resulting in ${estimatedDuration.toFixed(1)}s duration (${((estimatedDuration / clipDuration) * 100).toFixed(0)}% of original).`,
      audio_notes: operations.some((o) => o.type === 'NORMALIZE_AUDIO' && o.enabled)
        ? 'EBU R128 audio normalization active.'
        : 'Audio normalization bypassed.',
      visual_notes: operations.some((o) => o.type === 'PUNCH_IN' && o.enabled)
        ? 'Visual punch-in emphasis active on climax segment.'
        : 'Standard framing retained without punch-in.',
    };

    const now = new Date();
    const newPlanId = crypto.randomUUID();

    const newPlan: ProducerEditPlan = {
      id: newPlanId,
      clip_id: clip.id,
      project_id: clip.project_id,
      user_id: userId,
      version: parentPlan.version + 1,
      parent_plan_id: parentPlan.id,
      mode,
      target_platform: parentPlan.target_platform,
      status: 'draft',
      title: `${parentPlan.title} (Rev v${parentPlan.version + 1})`,
      user_instruction: instruction || parentPlan.user_instruction,
      original_duration: parentPlan.original_duration,
      estimated_duration: Number(estimatedDuration.toFixed(2)),
      operations,
      scores,
      explanation,
      preview_video_url: null,
      preview_storage_path: null,
      applied_at: null,
      created_at: now,
      updated_at: now,
    };

    const { error: insertErr } = await dataRepository
      .from('producer_plans')
      .insert(newPlan);

    if (insertErr) {
      throw new AppError(`Failed to save revised plan: ${insertErr.message}`, 500, 'DATABASE_ERROR');
    }

    logger.info(`[ProducerPlanning] Created revised v${newPlan.version} plan ${newPlanId} from parent ${parentPlan.id}`);
    return newPlan;
  }

  /**
   * Fetches context documents from the database.
   */
  private static async fetchContext(clip: ClipRecord, userId: string): Promise<PlanGenerationContext> {
    const ctx: PlanGenerationContext = { clip };

    // Candidate
    if (clip.candidate_id) {
      const { data: candidate } = await dataRepository
        .from('clip_candidates')
        .select('*')
        .eq('id', clip.candidate_id)
        .maybeSingle();
      ctx.candidate = candidate || null;
    }

    // Project
    const { data: project } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', clip.project_id)
      .eq('user_id', userId)
      .maybeSingle();
    ctx.project = project || null;

    // Transcript
    const { data: transcript } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .maybeSingle();
    ctx.transcript = transcript || null;

    // Multimodal Analysis
    const { data: analysis } = await dataRepository
      .from('video_analyses')
      .select('*')
      .eq('project_id', clip.project_id)
      .maybeSingle();
    ctx.analysis = analysis || null;

    // Creator Profile
    const { data: profile } = await dataRepository
      .from('creator_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    ctx.creatorProfile = profile || null;

    return ctx;
  }

  /**
   * Core synthesis engine creating operations, scores, and explanations.
   */
  private static async synthesizePlan(
    clip: ClipRecord,
    ctx: PlanGenerationContext,
    mode: ProducerMode,
    targetPlatform: OutputPlatform,
    userInstruction?: string,
    targetDuration?: number
  ): Promise<{
    operations: ProducerOperation[];
    estimatedDuration: number;
    explanation: ProducerExplanation;
    scores: ProducerScoreComparison;
  }> {
    const operations: ProducerOperation[] = [];
    const clipStart = clip.start_seconds;
    const clipEnd = clip.end_seconds;
    const rawDuration = clipEnd - clipStart;

    // 1. Extract words within clip window
    const wordsInClip = this.getWordsInClip(ctx.transcript, clipStart, clipEnd);

    // 2. Intro Dead Air / Hook Trim
    const introTrimOp = this.evaluateIntroTrim(clipStart, wordsInClip, mode);
    if (introTrimOp) operations.push(introTrimOp);

    // 3. Outro Dead Air Trim
    const outroTrimOp = this.evaluateOutroTrim(clipEnd, wordsInClip, mode);
    if (outroTrimOp) operations.push(outroTrimOp);

    // 4. Interior Silence / Dead Space Removal
    if (mode !== 'LIGHT') {
      const cutRangesOp = this.evaluateDeadSpaceCuts(clipStart, clipEnd, wordsInClip, ctx.analysis, mode);
      if (cutRangesOp) operations.push(cutRangesOp);
    }

    // 5. Visual Reframe
    const reframeOp = this.evaluateReframe(clip, targetPlatform, ctx.analysis, mode);
    if (reframeOp) operations.push(reframeOp);

    // 6. Hook Banner Text Overlay (First 3.5 seconds)
    const hookOp = this.evaluateHookText(clip, ctx, targetPlatform, mode, userInstruction);
    if (hookOp) operations.push(hookOp);

    // 7. Visual Punch-In (Climax / Hook Emphasis)
    const punchInOp = this.evaluatePunchIn(clipStart, clipEnd, wordsInClip, ctx.analysis, mode);
    if (punchInOp) operations.push(punchInOp);

    // 8. Kinetic Captions
    const captionOp = this.evaluateCaptionStyle(clip, targetPlatform, mode, ctx.creatorProfile);
    if (captionOp) operations.push(captionOp);

    // 9. Caption Emphasis
    const emphasisOp = this.evaluateCaptionEmphasis(wordsInClip, mode);
    if (emphasisOp) operations.push(emphasisOp);

    // 10. Audio Normalization (EBU R128)
    const normOp = this.evaluateAudioNormalization(mode);
    if (normOp) operations.push(normOp);

    // 11. Audio Edge Fades
    const fadeOp = this.evaluateAudioFades(mode);
    if (fadeOp) operations.push(fadeOp);

    // 12. Brand Overlay (if Creator Profile specifies handle or watermark)
    const brandOp = this.evaluateBrandOverlay(ctx.creatorProfile);
    if (brandOp) operations.push(brandOp);

    // Optional LLM enhancement for editorial title and hook text if OpenRouter is active
    if (config.openrouterApiKey && userInstruction) {
      await this.enrichPlanWithAI(operations, ctx, userInstruction, mode);
    }

    // Apply user instruction heuristics if provided
    if (userInstruction) {
      this.applyInstructionHeuristics(operations, userInstruction, mode);
    }

    // Duration calculation
    const estimatedDuration = this.calculateEstimatedDuration(rawDuration, operations);

    // Scoring calculation
    const scores = this.calculateScores(rawDuration, operations, mode, ctx);

    // Explanation synthesis
    const explanation = this.buildExplanation(operations, mode, targetPlatform, rawDuration, estimatedDuration, scores);

    return {
      operations,
      estimatedDuration,
      explanation,
      scores,
    };
  }

  /**
   * Extracts transcript words located within the clip's timestamp boundaries.
   */
  private static getWordsInClip(
    transcript: TranscriptRecord | null | undefined,
    clipStart: number,
    clipEnd: number
  ): TranscriptWord[] {
    if (!transcript) return [];

    let allWords: TranscriptWord[] = [];
    if (transcript.words && Array.isArray(transcript.words) && transcript.words.length > 0) {
      allWords = transcript.words;
    } else if (transcript.segments && Array.isArray(transcript.segments)) {
      for (const seg of transcript.segments) {
        if (seg.words && Array.isArray(seg.words)) {
          allWords.push(...seg.words);
        }
      }
    }

    return allWords.filter(
      (w) => w.start >= clipStart - 0.5 && w.end <= clipEnd + 0.5
    );
  }

  /**
   * Detects dead air at the beginning of the clip before speech starts.
   */
  private static evaluateIntroTrim(
    clipStart: number,
    words: TranscriptWord[],
    mode: ProducerMode
  ): ProducerOperation | null {
    if (words.length === 0) return null;

    const firstWord = words[0];
    const speechDelay = firstWord.start - clipStart;

    // Thresholds per mode
    const minDelay = mode === 'LIGHT' ? 0.8 : mode === 'BALANCED' ? 0.35 : 0.2;
    if (speechDelay <= minDelay) return null;

    // Leave a small natural breath buffer (0.10s) before first word
    const trimAmount = Math.max(0.1, Number((speechDelay - 0.1).toFixed(2)));

    return {
      id: 'op_intro_trim',
      type: 'INTRO_TRIM',
      enabled: true,
      label: 'Trim Intro Dead Air',
      description: `Remove ${trimAmount}s of silent pause before speech begins to create an immediate opening hook.`,
      parameters: {
        start_sec: trimAmount,
      },
      confidence: 0.94,
      reason: `Eliminates ${trimAmount}s of dead air before the first spoken word ("${firstWord.word}") for instant retention.`,
    };
  }

  /**
   * Detects trailing silence at the end of the clip after speech ends.
   */
  private static evaluateOutroTrim(
    clipEnd: number,
    words: TranscriptWord[],
    mode: ProducerMode
  ): ProducerOperation | null {
    if (words.length === 0) return null;

    const lastWord = words[words.length - 1];
    const trailingSilence = clipEnd - lastWord.end;

    const minTrailing = mode === 'LIGHT' ? 1.0 : mode === 'BALANCED' ? 0.5 : 0.25;
    if (trailingSilence <= minTrailing) return null;

    // Leave 0.2s of outro room
    const trimEndAmount = Math.max(0.1, Number((trailingSilence - 0.2).toFixed(2)));

    return {
      id: 'op_outro_trim',
      type: 'OUTRO_TRIM',
      enabled: true,
      label: 'Snappy Outro Trim',
      description: `Tighten ${trimEndAmount}s trailing silence after the punchline for higher looping rate.`,
      parameters: {
        end_sec: trimEndAmount,
      },
      confidence: 0.91,
      reason: `Snaps off trailing dead space after final word ("${lastWord.word}") to maximize viewer loop completion.`,
    };
  }

  /**
   * Identifies awkward mid-clip pauses and dead space between words without cutting speech.
   */
  private static evaluateDeadSpaceCuts(
    clipStart: number,
    clipEnd: number,
    words: TranscriptWord[],
    analysis: VideoAnalysisRecord | null | undefined,
    mode: ProducerMode
  ): ProducerOperation | null {
    if (words.length < 2) return null;

    const cutRanges: Array<{ start: number; end: number; duration: number }> = [];
    const pauseThreshold = mode === 'AGGRESSIVE' ? 0.65 : 1.1; // Seconds of silence to trigger cut
    const naturalBreath = mode === 'AGGRESSIVE' ? 0.22 : 0.35; // Kept breath room

    for (let i = 0; i < words.length - 1; i++) {
      const current = words[i];
      const next = words[i + 1];
      const pauseDuration = next.start - current.end;

      if (pauseDuration >= pauseThreshold) {
        // Safe cut boundary: keep natural breath buffer on either side
        const cutStart = Number((current.end + naturalBreath / 2).toFixed(2));
        const cutEnd = Number((next.start - naturalBreath / 2).toFixed(2));
        const cutDuration = Number((cutEnd - cutStart).toFixed(2));

        if (cutDuration >= 0.25 && cutEnd < clipEnd && cutStart > clipStart) {
          cutRanges.push({
            start: cutStart,
            end: cutEnd,
            duration: cutDuration,
          });
        }
      }
    }

    if (cutRanges.length === 0) return null;

    const totalCutSeconds = cutRanges.reduce((acc, c) => acc + c.duration, 0);

    return {
      id: 'op_remove_dead_space',
      type: 'REMOVE_RANGE',
      enabled: true,
      label: `Cut ${cutRanges.length} Awkward Pause${cutRanges.length > 1 ? 's' : ''}`,
      description: `Removes ${totalCutSeconds.toFixed(1)}s of dead space while preserving conversational breath room.`,
      parameters: {
        cut_ranges: cutRanges,
      },
      confidence: 0.89,
      reason: `Eliminates conversational dead air (> ${pauseThreshold}s) between sentences to boost short-form pace.`,
    };
  }

  /**
   * Recommends optimal aspect ratio and smart auto-reframe crop.
   */
  private static evaluateReframe(
    clip: ClipRecord,
    targetPlatform: OutputPlatform,
    analysis: VideoAnalysisRecord | null | undefined,
    mode: ProducerMode
  ): ProducerOperation | null {
    const recommendedRatio =
      targetPlatform === 'youtube' ? '16:9' : targetPlatform === 'linkedin' ? '1:1' : '9:16';

    const hasFaces = analysis?.timeline?.face_intervals && analysis.timeline.face_intervals.length > 0;
    const cropMode = hasFaces ? 'smart' : 'center';

    return {
      id: 'op_reframe',
      type: 'REFRAME',
      enabled: true,
      label: `Reframe to ${recommendedRatio}`,
      description: `Reframes source video to ${recommendedRatio} vertical format using ${cropMode} face tracking.`,
      parameters: {
        aspect_ratio: recommendedRatio,
        crop_mode: cropMode,
      },
      confidence: 0.95,
      reason: `Optimizes aspect ratio for ${targetPlatform} feeds with subject centering.`,
    };
  }

  /**
   * Generates opening hook text overlay (first 3-4 seconds).
   */
  private static evaluateHookText(
    clip: ClipRecord,
    ctx: PlanGenerationContext,
    targetPlatform: OutputPlatform,
    mode: ProducerMode,
    userInstruction?: string
  ): ProducerOperation | null {
    if (mode === 'LIGHT') return null;

    // Formulate hook text: from candidate hook, candidate title, or clip title
    let rawHook =
      ctx.candidate?.hook ||
      ctx.candidate?.title ||
      clip.title ||
      'Key Insight You Need to Know';

    // Sanitize and shorten to snappy punchline (< 45 chars)
    let cleanHook = rawHook
      .replace(/[^\w\s?!'":.,-]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanHook.length > 42) {
      cleanHook = cleanHook.slice(0, 39).trim() + '...';
    }

    return {
      id: 'op_hook_text',
      type: 'HOOK_TEXT',
      enabled: true,
      label: 'Opening Hook Banner',
      description: `Overlays punchy teaser banner "${cleanHook}" during the opening 3.5s to stop feed scrolling.`,
      parameters: {
        text: cleanHook.toUpperCase(),
        position_overlay: 'top',
        size: 'md',
        display_start_sec: 0,
        display_end_sec: 3.5,
      },
      confidence: 0.88,
      reason: '70% of viewers decide in the first 3 seconds; this visual headline locks in attention.',
    };
  }

  /**
   * Evaluates subtle punch-in zoom during key energetic moments.
   */
  private static evaluatePunchIn(
    clipStart: number,
    clipEnd: number,
    words: TranscriptWord[],
    analysis: VideoAnalysisRecord | null | undefined,
    mode: ProducerMode
  ): ProducerOperation | null {
    if (mode === 'LIGHT') return null;

    const clipDuration = clipEnd - clipStart;
    if (clipDuration < 8.0) return null;

    // Pick a moment near 35%-60% of the clip (climax)
    const punchStart = Number((clipStart + clipDuration * 0.4).toFixed(2));
    const punchDuration = mode === 'AGGRESSIVE' ? 3.0 : 2.5;
    const scale = mode === 'AGGRESSIVE' ? 1.08 : 1.06;

    return {
      id: 'op_punch_in',
      type: 'PUNCH_IN',
      enabled: true,
      label: 'Punch-In Zoom on Climax',
      description: `Subtle dynamic camera punch-in (${((scale - 1) * 100).toFixed(0)}% zoom) for ${punchDuration}s during the key insight.`,
      parameters: {
        scale,
        punch_in_start_sec: punchStart,
        punch_in_duration_sec: punchDuration,
      },
      confidence: 0.85,
      reason: 'Breaks visual monotony and emphasizes the primary emotional punchline.',
    };
  }

  /**
   * Evaluates caption preset and placement.
   */
  private static evaluateCaptionStyle(
    clip: ClipRecord,
    targetPlatform: OutputPlatform,
    mode: ProducerMode,
    profile?: CreatorProfileRecord | null
  ): ProducerOperation | null {
    const style = mode === 'AGGRESSIVE' ? 'bold' : mode === 'BALANCED' ? 'highlight' : 'clean';
    const position = targetPlatform === 'tiktok' ? 'bottom' : 'bottom';
    const primaryColor = profile?.brand_colors?.[0] || (mode === 'AGGRESSIVE' ? '#FACC15' : '#FFFFFF');

    return {
      id: 'op_caption_style',
      type: 'CAPTION_STYLE',
      enabled: true,
      label: `Captions: ${style.toUpperCase()}`,
      description: `Render subtitles with ${style} typography, high-contrast outline, and mobile safe margin.`,
      parameters: {
        style,
        position,
        primary_color: primaryColor,
        font_size: mode === 'AGGRESSIVE' ? 52 : 46,
      },
      confidence: 0.96,
      reason: '85% of short-form video is watched on mute; dynamic subtitles maximize retention.',
    };
  }

  /**
   * Highlights key impact words in captions.
   */
  private static evaluateCaptionEmphasis(
    words: TranscriptWord[],
    mode: ProducerMode
  ): ProducerOperation | null {
    if (mode === 'LIGHT' || words.length === 0) return null;

    // Find punchy words (> 5 chars, excluding common stopwords)
    const stopwords = new Set([
      'the', 'and', 'that', 'with', 'have', 'this', 'from', 'they', 'will', 'would', 'there',
      'their', 'what', 'about', 'which', 'when', 'make', 'like', 'time', 'just', 'know', 'take',
      'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
      'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
    ]);

    const candidates = words
      .map((w) => w.word.toLowerCase().replace(/[^\w]/g, ''))
      .filter((w) => w.length >= 5 && !stopwords.has(w));

    const uniqueWords = Array.from(new Set(candidates)).slice(0, mode === 'AGGRESSIVE' ? 6 : 4);
    if (uniqueWords.length === 0) return null;

    return {
      id: 'op_caption_emphasis',
      type: 'CAPTION_EMPHASIS',
      enabled: true,
      label: 'Keyword Color Emphasis',
      description: `Highlight high-impact words (${uniqueWords.slice(0, 3).join(', ')}) with accent color.`,
      parameters: {
        emphasis_words: uniqueWords,
        highlight_color: '#FACC15',
      },
      confidence: 0.87,
      reason: 'Directs viewer focus onto core keywords to reinforce audio message.',
    };
  }

  /**
   * Audio normalization (EBU R128).
   */
  private static evaluateAudioNormalization(mode: ProducerMode): ProducerOperation {
    return {
      id: 'op_normalize_audio',
      type: 'NORMALIZE_AUDIO',
      enabled: true,
      label: 'Normalize Audio (-16 LUFS)',
      description: 'Standardize audio loudness to -16 LUFS broadcast standard to eliminate quiet whispers or blown-out peaks.',
      parameters: {
        target_lufs: -16,
        gain_db: mode === 'AGGRESSIVE' ? 1.5 : 0.0,
      },
      confidence: 0.98,
      reason: 'Prevents viewers from scrolling past due to quiet, inconsistent mobile audio.',
    };
  }

  /**
   * Edge audio fades to prevent harsh clicks.
   */
  private static evaluateAudioFades(mode: ProducerMode): ProducerOperation {
    return {
      id: 'op_audio_fade',
      type: 'AUDIO_FADE',
      enabled: true,
      label: 'Anti-Click Audio Fades',
      description: 'Gentle 0.15s fade-in and 0.25s fade-out at clip boundaries for smooth playback transition.',
      parameters: {
        fade_in_sec: 0.15,
        fade_out_sec: 0.25,
      },
      confidence: 0.93,
      reason: 'Eliminates abrupt audio pops at clip boundaries on looping feeds.',
    };
  }

  /**
   * Brand overlay if profile specifies branding.
   */
  private static evaluateBrandOverlay(profile?: CreatorProfileRecord | null): ProducerOperation | null {
    if (!profile?.creator_name && !profile?.tagline) return null;

    const brandText = `@${(profile.creator_name || 'VireoCreator').toLowerCase().replace(/\s+/g, '')}`;

    return {
      id: 'op_brand_overlay',
      type: 'BRAND_OVERLAY',
      enabled: false, // Default off so creator can explicitly opt in
      label: `Brand Tag (${brandText})`,
      description: `Subtle watermark handle tag in lower third for organic credit.`,
      parameters: {
        text: brandText,
        position_overlay: 'bottom',
        size: 'sm',
      },
      confidence: 0.75,
      reason: 'Maintains creator attribution when video is reposted across platforms.',
    };
  }

  /**
   * Computes the new estimated duration after trims and cuts.
   */
  private static calculateEstimatedDuration(
    originalDuration: number,
    operations: ProducerOperation[]
  ): number {
    let duration = originalDuration;

    for (const op of operations) {
      if (!op.enabled) continue;

      if (op.type === 'INTRO_TRIM' && op.parameters.start_sec) {
        duration -= op.parameters.start_sec;
      } else if (op.type === 'OUTRO_TRIM' && op.parameters.end_sec) {
        duration -= op.parameters.end_sec;
      } else if (op.type === 'TRIM') {
        if (op.parameters.start_sec) duration -= op.parameters.start_sec;
        if (op.parameters.end_sec) duration -= op.parameters.end_sec;
      } else if (op.type === 'REMOVE_RANGE' && Array.isArray(op.parameters.cut_ranges)) {
        for (const range of op.parameters.cut_ranges) {
          duration -= range.duration || 0;
        }
      }
    }

    return Math.max(3.0, Number(duration.toFixed(2)));
  }

  /**
   * Calculates ProducerScore metrics before and after edits.
   */
  private static calculateScores(
    originalDuration: number,
    operations: ProducerOperation[],
    mode: ProducerMode,
    ctx: PlanGenerationContext
  ): ProducerScoreComparison {
    // Before scores (unoptimized baseline)
    const baseHook = 58;
    const basePacing = mode === 'AGGRESSIVE' ? 52 : 62;
    const baseAudio = 64;
    const baseVisual = 60;
    const baseRetention = Math.round((baseHook * 0.35 + basePacing * 0.25 + baseAudio * 0.2 + baseVisual * 0.2));

    const before: ProducerScore = {
      overall: baseRetention,
      hook: baseHook,
      pacing: basePacing,
      audio: baseAudio,
      visual: baseVisual,
      retention_estimate: baseRetention,
    };

    // After scores: award points for enabled producer operations
    let hookBonus = 0;
    let pacingBonus = 0;
    let audioBonus = 0;
    let visualBonus = 0;

    for (const op of operations) {
      if (!op.enabled) continue;
      switch (op.type) {
        case 'INTRO_TRIM':
          hookBonus += 12;
          pacingBonus += 6;
          break;
        case 'OUTRO_TRIM':
          pacingBonus += 7;
          break;
        case 'REMOVE_RANGE':
          pacingBonus += 15;
          break;
        case 'HOOK_TEXT':
          hookBonus += 18;
          visualBonus += 8;
          break;
        case 'REFRAME':
          visualBonus += 14;
          break;
        case 'PUNCH_IN':
          visualBonus += 10;
          pacingBonus += 4;
          break;
        case 'CAPTION_STYLE':
          visualBonus += 12;
          break;
        case 'CAPTION_EMPHASIS':
          visualBonus += 6;
          hookBonus += 4;
          break;
        case 'NORMALIZE_AUDIO':
          audioBonus += 22;
          break;
        case 'AUDIO_FADE':
          audioBonus += 8;
          break;
      }
    }

    const afterHook = Math.min(98, baseHook + hookBonus);
    const afterPacing = Math.min(97, basePacing + pacingBonus);
    const afterAudio = Math.min(96, baseAudio + audioBonus);
    const afterVisual = Math.min(95, baseVisual + visualBonus);
    const afterRetention = Math.round(
      afterHook * 0.35 + afterPacing * 0.25 + afterAudio * 0.2 + afterVisual * 0.2
    );

    const after: ProducerScore = {
      overall: afterRetention,
      hook: afterHook,
      pacing: afterPacing,
      audio: afterAudio,
      visual: afterVisual,
      retention_estimate: afterRetention,
    };

    return {
      before,
      after,
      delta: after.overall - before.overall,
    };
  }

  /**
   * Synthesizes transparent explanations for why each edit was planned.
   */
  private static buildExplanation(
    operations: ProducerOperation[],
    mode: ProducerMode,
    targetPlatform: OutputPlatform,
    originalDuration: number,
    estimatedDuration: number,
    scores: ProducerScoreComparison
  ): ProducerExplanation {
    const savedSeconds = (originalDuration - estimatedDuration).toFixed(1);
    const pctSaved = Math.round(((originalDuration - estimatedDuration) / originalDuration) * 100);

    const summary = `Vireo Producer (${mode} Mode) optimized this clip for ${targetPlatform}: tightened duration by ${savedSeconds}s (-${pctSaved}%), boosted retention score by +${scores.delta} pts, and burned mobile kinetic captions.`;

    const keyDecisions: string[] = operations
      .filter((o) => o.enabled)
      .map((o) => `${o.label}: ${o.reason}`);

    const pacingNotes = `${savedSeconds}s of dead air and pauses removed (${originalDuration.toFixed(1)}s → ${estimatedDuration.toFixed(1)}s). Pacing score improved from ${scores.before.pacing} to ${scores.after.pacing}.`;
    const audioNotes = 'Audio normalized to EBU R128 (-16 LUFS) with subtle anti-click fades at clip edges.';
    const visualNotes = 'Reframed with mobile safe zones, hook title banner, and key insight visual punch-in.';

    return {
      summary,
      key_decisions: keyDecisions,
      pacing_notes: pacingNotes,
      audio_notes: audioNotes,
      visual_notes: visualNotes,
    };
  }

  /**
   * Natural language heuristic updater for user instructions.
   */
  private static applyInstructionHeuristics(
    operations: ProducerOperation[],
    instruction: string,
    mode: ProducerMode
  ): ProducerOperation[] {
    const lower = instruction.toLowerCase();

    // 1. Pauses / Dead space requests
    if (lower.includes('keep pause') || lower.includes("don't cut") || lower.includes('no cut') || lower.includes('leave silence')) {
      const deadSpaceOp = operations.find((o) => o.type === 'REMOVE_RANGE');
      if (deadSpaceOp) deadSpaceOp.enabled = false;
    } else if (lower.includes('cut pause') || lower.includes('snappy') || lower.includes('fast pace') || lower.includes('aggressive')) {
      const deadSpaceOp = operations.find((o) => o.type === 'REMOVE_RANGE');
      if (deadSpaceOp) deadSpaceOp.enabled = true;
    }

    // 2. Hook text requests
    if (lower.includes('no hook') || lower.includes('remove banner') || lower.includes('no text overlay')) {
      const hookOp = operations.find((o) => o.type === 'HOOK_TEXT');
      if (hookOp) hookOp.enabled = false;
    } else if (lower.includes('add hook') || lower.includes('banner')) {
      const hookOp = operations.find((o) => o.type === 'HOOK_TEXT');
      if (hookOp) hookOp.enabled = true;
    }

    // 3. Caption styling requests
    if (lower.includes('bold') && !lower.includes('no bold')) {
      const capOp = operations.find((o) => o.type === 'CAPTION_STYLE');
      if (capOp) {
        capOp.parameters.style = 'bold';
        capOp.label = 'Captions: BOLD';
      }
    } else if (lower.includes('clean') || lower.includes('minimal')) {
      const capOp = operations.find((o) => o.type === 'CAPTION_STYLE');
      if (capOp) {
        capOp.parameters.style = 'clean';
        capOp.label = 'Captions: CLEAN';
      }
    }
    if (lower.includes('yellow')) {
      const capOp = operations.find((o) => o.type === 'CAPTION_STYLE');
      if (capOp) capOp.parameters.primary_color = '#FACC15';
    }

    // 4. Punch-in requests
    if (lower.includes('no zoom') || lower.includes('no punch')) {
      const punchOp = operations.find((o) => o.type === 'PUNCH_IN');
      if (punchOp) punchOp.enabled = false;
    } else if (lower.includes('punch in') || lower.includes('zoom')) {
      const punchOp = operations.find((o) => o.type === 'PUNCH_IN');
      if (punchOp) punchOp.enabled = true;
    }

    // 5. Audio requests
    if (lower.includes('boost audio') || lower.includes('louder')) {
      const normOp = operations.find((o) => o.type === 'NORMALIZE_AUDIO');
      if (normOp) normOp.parameters.gain_db = 2.0;
    }

    return operations;
  }

  /**
   * Optional AI completion using OpenRouter for high-context hook synthesis.
   */
  private static async enrichPlanWithAI(
    operations: ProducerOperation[],
    ctx: PlanGenerationContext,
    instruction: string,
    mode: ProducerMode
  ): Promise<void> {
    try {
      const client = new OpenRouterContentProvider();
      const prompt = `You are Vireo AI Video Producer. The creator requested: "${instruction}".
Clip Title: "${ctx.clip.title || ''}"
Candidate Hook: "${ctx.candidate?.hook || ''}"
Suggest an ultra-compelling 3-5 word hook headline for a short-form video overlay. Output strictly JSON:
{ "hookText": "STRING" }`;

      const res = await client.generateJsonCompletion<{ hookText?: string }>({
        systemPrompt: 'You are an elite short-form video producer. Return JSON only.',
        userPrompt: prompt,
        maxTokens: 100,
        temperature: 0.6,
      });

      if (res?.hookText) {
        const hookOp = operations.find((o) => o.type === 'HOOK_TEXT');
        if (hookOp) {
          hookOp.parameters.text = res.hookText.toUpperCase().slice(0, 42);
        }
      }
    } catch (aiErr: any) {
      logger.warn(`AI hook enhancement fallback to rule heuristics: ${aiErr.message}`);
    }
  }
}

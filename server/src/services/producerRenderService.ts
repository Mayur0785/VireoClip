import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  AppError,
  ClipRecord,
  ProjectRecord,
  ProducerEditPlan,
  ProducerOperation,
  ClipAspectRatio,
  CropConfig,
  OverlayConfig,
  CaptionConfig,
  CaptionStyle,
  CaptionPosition,
  isValidUUID,
} from '../types/index.js';
import {
  downloadObjectToFile,
  uploadFile,
  signObjectGet,
} from './objectStorageService.js';
import { CaptionService } from './captionService.js';
import { ClipRenderService, buildCropFilter } from './clipRenderService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export interface RenderGraphResult {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  videoFilters: string[];
  audioFilters: string[];
}

export class ProducerRenderService {
  /**
   * Generates a lightweight 720p preview render executing the plan's edits.
   * Uploads to storage or provides local access and updates plan status to 'preview_ready'.
   */
  public static async generatePreview(
    planId: string,
    userId: string,
    customSourcePath?: string
  ): Promise<{ previewUrl: string; duration: number }> {
    if (!isValidUUID(planId)) {
      throw new AppError('Invalid plan ID format.', 400, 'INVALID_UUID');
    }

    // 1. Fetch plan
    const { data: plan, error: planErr } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (planErr || !plan) {
      throw new AppError('Producer plan not found or access denied.', 404, 'PLAN_NOT_FOUND');
    }

    // 2. Fetch clip
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', plan.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found.', 404, 'CLIP_NOT_FOUND');
    }

    // 3. Fetch project
    const { data: project, error: projErr } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', clip.project_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr || !project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    // Update status to preview_rendering
    await dataRepository
      .from('producer_plans')
      .update({ status: 'preview_rendering', updated_at: new Date() })
      .eq('id', planId);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `vireo-prod-preview-${planId.slice(0, 8)}-`));
    const outputPath = path.join(tmpDir, 'producer_preview.mp4');
    let localSourceFile = customSourcePath || '';

    try {
      // 4. Resolve source video file
      if (!localSourceFile || !fs.existsSync(localSourceFile)) {
        if (project.source_storage_path) {
          localSourceFile = path.join(tmpDir, 'source.mp4');
          logger.info(`[ProducerRender] Downloading project source: ${project.source_storage_path}`);
          await downloadObjectToFile('source', project.source_storage_path, localSourceFile);
        } else {
          throw new AppError('Source video is not available for preview rendering.', 400, 'SOURCE_NOT_FOUND');
        }
      }

      // 5. Build render graph filters and timing
      const renderGraph = await this.buildRenderGraph(plan, clip, localSourceFile, outputPath, tmpDir);

      logger.info(`[ProducerRender] Rendering preview for plan ${planId}: dur=${renderGraph.duration}s, vf_count=${renderGraph.videoFilters.length}`);

      // 6. Execute FFmpeg
      const ffmpegArgs = [
        '-y',
        '-ss', renderGraph.startTime.toFixed(3),
        '-t', renderGraph.duration.toFixed(3),
        '-i', renderGraph.inputPath,
      ];

      if (renderGraph.videoFilters.length > 0) {
        ffmpegArgs.push('-vf', renderGraph.videoFilters.join(','));
      }

      ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-pix_fmt', 'yuv420p');

      if (renderGraph.audioFilters.length > 0) {
        ffmpegArgs.push('-af', renderGraph.audioFilters.join(','));
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
      } else {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
      }

      ffmpegArgs.push(renderGraph.outputPath);

      await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 120000 });

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new AppError('Preview MP4 generation failed or produced empty file.', 500, 'FFMPEG_FAILED');
      }

      const outputSize = fs.statSync(outputPath).size;
      const previewStorageKey = `users/${userId}/projects/${clip.project_id}/clips/${clip.id}/producer_preview_${plan.id}.mp4`;

      let finalPreviewUrl = '';

      // Upload if cloud storage is configured
      if (config.r2AccountId && config.r2AccessKeyId) {
        await uploadFile('clips', previewStorageKey, outputPath, outputSize, 'video/mp4');
        finalPreviewUrl = await signObjectGet('clips', previewStorageKey);
      } else {
        // Fallback for local testing / offline dev
        finalPreviewUrl = `/api/clips/${clip.id}/producer/preview-file/${plan.id}`;
      }

      // Update plan record to preview_ready
      await dataRepository
        .from('producer_plans')
        .update({
          status: 'preview_ready',
          preview_video_url: finalPreviewUrl,
          preview_storage_path: previewStorageKey,
          updated_at: new Date(),
        })
        .eq('id', planId);

      return {
        previewUrl: finalPreviewUrl,
        duration: renderGraph.duration,
      };
    } catch (err: any) {
      await dataRepository
        .from('producer_plans')
        .update({ status: 'draft', updated_at: new Date() })
        .eq('id', planId);

      logger.error('Producer preview rendering failed', { planId, error: err.message });
      throw err;
    } finally {
      // Remove temp directory
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Applies the approved ProducerEditPlan to the Clip.
   * Updates clip configurations non-destructively and triggers the background ClipRenderService.
   */
  public static async applyPlanToClip(
    planId: string,
    userId: string
  ): Promise<{ clip: ClipRecord; plan: ProducerEditPlan }> {
    if (!isValidUUID(planId)) {
      throw new AppError('Invalid plan ID format.', 400, 'INVALID_UUID');
    }

    // 1. Fetch plan
    const { data: plan, error: planErr } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (planErr || !plan) {
      throw new AppError('Producer plan not found or access denied.', 404, 'PLAN_NOT_FOUND');
    }

    // 2. Fetch clip
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', plan.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found.', 404, 'CLIP_NOT_FOUND');
    }

    // 3. Extract parameter updates from enabled plan operations
    let trimStartOffset = clip.trim_start_offset || 0;
    let trimEndOffset = clip.trim_end_offset || 0;
    let aspectRatio: ClipAspectRatio = clip.aspect_ratio || '9:16';
    let cropConfig: CropConfig = clip.crop_config || { mode: 'center', focusX: 0.5, focusY: 0.5 };
    let captionStyle: CaptionStyle = clip.caption_style || 'clean';
    let captionPosition: CaptionPosition = clip.caption_position || 'bottom';
    let captionConfig: CaptionConfig = clip.caption_config || {};
    let overlayConfig: OverlayConfig = clip.overlay_config || { enabled: false };
    let volume = clip.volume !== undefined ? clip.volume : 1.0;

    for (const op of plan.operations) {
      if (!op.enabled) continue;

      if (op.type === 'INTRO_TRIM' && op.parameters.start_sec !== undefined) {
        trimStartOffset = Number(op.parameters.start_sec);
      } else if (op.type === 'OUTRO_TRIM' && op.parameters.end_sec !== undefined) {
        trimEndOffset = Number(op.parameters.end_sec);
      } else if (op.type === 'REFRAME') {
        if (op.parameters.aspect_ratio) aspectRatio = op.parameters.aspect_ratio;
        if (op.parameters.crop_mode) cropConfig.mode = op.parameters.crop_mode;
      } else if (op.type === 'CAPTION_STYLE') {
        if (op.parameters.style) captionStyle = op.parameters.style;
        if (op.parameters.position) captionPosition = op.parameters.position;
        if (op.parameters.font_size) captionConfig.fontSize = op.parameters.font_size;
        if (op.parameters.primary_color) captionConfig.primaryColor = op.parameters.primary_color;
      } else if (op.type === 'CAPTION_EMPHASIS') {
        if (op.parameters.highlight_color) captionConfig.highlightColor = op.parameters.highlight_color;
      } else if (op.type === 'HOOK_TEXT') {
        overlayConfig = {
          enabled: true,
          text: op.parameters.text || 'Key Insight',
          position: op.parameters.position_overlay || 'top',
          size: op.parameters.size || 'md',
        };
      } else if (op.type === 'NORMALIZE_AUDIO' && op.parameters.gain_db !== undefined) {
        if (op.parameters.gain_db > 0) {
          volume = Math.min(2.0, 1.0 + op.parameters.gain_db / 10);
        }
      }
    }

    const editorVersion = (clip.editor_version || 1) + 1;
    const now = new Date();

    // 4. Update clip record non-destructively
    const { data: updatedClip, error: updateClipErr } = await dataRepository
      .from('clips')
      .update({
        trim_start_offset: trimStartOffset,
        trim_end_offset: trimEndOffset,
        aspect_ratio: aspectRatio,
        crop_config: cropConfig,
        caption_style: captionStyle,
        caption_position: captionPosition,
        caption_config: captionConfig,
        overlay_config: overlayConfig,
        volume: volume,
        editor_version: editorVersion,
        render_status: 'draft',
        updated_at: now,
      })
      .eq('id', clip.id)
      .select('*')
      .single();

    if (updateClipErr) {
      throw new AppError(`Failed to update clip: ${updateClipErr.message}`, 500, 'DATABASE_ERROR');
    }

    // 5. Update plan status -> applied
    const { data: updatedPlan, error: updatePlanErr } = await dataRepository
      .from('producer_plans')
      .update({
        status: 'applied',
        applied_at: now,
        updated_at: now,
      })
      .eq('id', planId)
      .select('*')
      .single();

    if (updatePlanErr) {
      logger.warn(`Could not mark plan ${planId} as applied: ${updatePlanErr.message}`);
    }

    logger.info(`[ProducerRender] Applied plan ${planId} to clip ${clip.id} (editorVersion=${editorVersion})`);

    // 6. Trigger ClipRenderService in background
    ClipRenderService.renderClipJob(clip.id, userId).catch((rErr) => {
      logger.error(`Clip re-render failed after applying Producer plan: ${rErr.message}`);
    });

    return {
      clip: (updatedClip || clip) as ClipRecord,
      plan: (updatedPlan || plan) as ProducerEditPlan,
    };
  }

  /**
   * Constructs the FFmpeg filter graph and timings from plan operations.
   */
  public static async buildRenderGraph(
    plan: ProducerEditPlan,
    clip: ClipRecord,
    inputPath: string,
    outputPath: string,
    tmpDir: string
  ): Promise<RenderGraphResult> {
    const videoFilters: string[] = [];
    const audioFilters: string[] = [];

    // Calculate baseline start and duration
    let startSec = clip.start_seconds;
    let endSec = clip.end_seconds;

    // Apply intro trim
    const introTrim = plan.operations.find((o) => o.type === 'INTRO_TRIM' && o.enabled);
    if (introTrim && introTrim.parameters.start_sec) {
      startSec += Number(introTrim.parameters.start_sec);
    }

    // Apply outro trim
    const outroTrim = plan.operations.find((o) => o.type === 'OUTRO_TRIM' && o.enabled);
    if (outroTrim && outroTrim.parameters.end_sec) {
      endSec -= Number(outroTrim.parameters.end_sec);
    }

    let durationSec = Math.max(1.0, endSec - startSec);

    // 1. Reframe / Aspect Ratio crop
    const reframeOp = plan.operations.find((o) => o.type === 'REFRAME' && o.enabled);
    const targetRatio = (reframeOp?.parameters.aspect_ratio || clip.aspect_ratio || '9:16') as ClipAspectRatio;
    const cropFilter = buildCropFilter(targetRatio, clip.crop_config);
    videoFilters.push(cropFilter);

    // 2. Visual Punch-In (Dynamic Crop Zoom on Climax)
    const punchInOp = plan.operations.find((o) => o.type === 'PUNCH_IN' && o.enabled);
    if (punchInOp && punchInOp.parameters.punch_in_start_sec !== undefined) {
      const punchStart = Math.max(0, punchInOp.parameters.punch_in_start_sec - startSec);
      const punchDuration = punchInOp.parameters.punch_in_duration_sec || 2.5;
      const punchEnd = punchStart + punchDuration;
      const scale = punchInOp.parameters.scale || 1.06;

      const punchFilter = `crop=w='if(between(t,${punchStart.toFixed(2)},${punchEnd.toFixed(2)}), in_w/${scale}, in_w)':h='if(between(t,${punchStart.toFixed(2)},${punchEnd.toFixed(2)}), in_h/${scale}, in_h)':x=(in_w-out_w)/2:y=(in_h-out_h)/2,scale=1080:1920`;
      videoFilters.push(punchFilter);
    }

    // 3. Hook Text Banner
    const hookOp = plan.operations.find((o) => o.type === 'HOOK_TEXT' && o.enabled);
    if (hookOp && hookOp.parameters.text) {
      const safeText = String(hookOp.parameters.text).replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 50).trim();
      if (safeText) {
        const displayStart = hookOp.parameters.display_start_sec || 0;
        const displayEnd = hookOp.parameters.display_end_sec || 3.5;
        const drawTextFilter = `drawtext=text='${safeText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.75:boxborderw=14:x=(w-text_w)/2:y=140:enable='between(t,${displayStart},${displayEnd})'`;
        videoFilters.push(drawTextFilter);
      }
    }

    // 4. Captions (Burn ASS subtitles if caption style is present)
    const captionStyleOp = plan.operations.find((o) => o.type === 'CAPTION_STYLE' && o.enabled);
    if (captionStyleOp) {
      try {
        const assPath = path.join(tmpDir, 'producer_captions.ass');
        const capResult = await CaptionService.generateCaptionsForClip({
          clip: {
            ...clip,
            caption_style: captionStyleOp.parameters.style || 'clean',
            caption_position: captionStyleOp.parameters.position || 'bottom',
            caption_config: {
              fontSize: captionStyleOp.parameters.font_size || 48,
              primaryColor: captionStyleOp.parameters.primary_color || '#FFFFFF',
            },
          },
          targetAspectRatio: targetRatio,
          outputPath: assPath,
        });

        if (capResult.cues.length > 0 && fs.existsSync(assPath)) {
          const safeAss = assPath.replace(/\\/g, '/').replace(':', '\\\\:');
          videoFilters.push(`ass=${safeAss}`);
        }
      } catch (capErr: any) {
        logger.warn(`Producer caption generation skipped: ${capErr.message}`);
      }
    }

    // 5. Audio Normalization & Dynamics
    const normOp = plan.operations.find((o) => o.type === 'NORMALIZE_AUDIO' && o.enabled);
    if (normOp) {
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
      if (normOp.parameters.gain_db && normOp.parameters.gain_db > 0) {
        audioFilters.push(`volume=${normOp.parameters.gain_db}dB`);
      }
    }

    // 6. Audio Fades
    const fadeOp = plan.operations.find((o) => o.type === 'AUDIO_FADE' && o.enabled);
    if (fadeOp) {
      const fadeIn = fadeOp.parameters.fade_in_sec || 0.15;
      const fadeOut = fadeOp.parameters.fade_out_sec || 0.25;
      const fadeOutStart = Math.max(0, durationSec - fadeOut);
      audioFilters.push(`afade=t=in:ss=0:d=${fadeIn}`);
      audioFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut}`);
    }

    return {
      inputPath,
      outputPath,
      startTime: Number(startSec.toFixed(3)),
      duration: Number(durationSec.toFixed(3)),
      videoFilters,
      audioFilters,
    };
  }
}

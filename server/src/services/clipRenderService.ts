import { createClipWithJob } from '../db/repositories/clipRepository.js';
import { isMongoConfigured, getMongoDb } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { clipObjectPrefix, deletePrefix, downloadObjectToFile, renderObjectKey, signObjectGet, uploadFile } from './objectStorageService.js';
import { deleteClipRecords } from '../db/repositories/deletionRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  ClipRecord,
  RenderJobRecord,
  ClipAspectRatio,
  ClipCropMode,
  CaptionStyle,
  CaptionPosition,
  CropConfig,
  OverlayConfig,
  CaptionConfig,
  ClipEditorUpdateDTO,
  AppError,
  isValidUUID,
  ReframeKeyframe,
} from '../types/index.js';
import { CaptionService } from './captionService.js';
import { SmartReframeService } from './smartReframeService.js';
import { JobReliabilityService } from './queue/jobReliabilityService.js';


// Configure fluent-ffmpeg to use ffmpeg-static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

// In-memory set to prevent duplicate simultaneous render jobs for the same clip
export const activeRenderSet = new Set<string>();

export interface CreateClipResult {
  clip: ClipRecord;
  renderJob: RenderJobRecord;
}

export interface SignedUrlResult {
  signedUrl: string;
  filename?: string;
  expiresInSeconds: number;
}

/**
 * Checks if a clip is currently rendering in-memory
 */
export function isClipRenderActive(clipId: string): boolean {
  return activeRenderSet.has(clipId);
}

/**
 * Sanitizes a title string into a safe, valid filename without special characters
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/\.\.+/g, '')
    .replace(/[^\w\s.-]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return sanitized || 'clip';
}

/**
 * Generates the FFmpeg video filter string for scaling and center/manual cropping
 * to the requested target aspect ratio without distortion.
 */
export function buildCropFilter(
  aspectRatio: ClipAspectRatio = '9:16',
  cropConfig?: { focusX?: number; focusY?: number }
): string {
  const fx = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusX ?? 0.5)));
  const fy = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusY ?? 0.5)));

  // If focus is default center (0.5, 0.5), return the canonical center-crop filter
  if (fx === 0.5 && fy === 0.5) {
    switch (aspectRatio) {
      case '9:16':
        return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
      case '1:1':
        return 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080';
      case '16:9':
        return 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
      default:
        return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
    }
  }

  // Manual framing crop using exact clamped focus offsets
  switch (aspectRatio) {
    case '9:16':
      return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
    case '1:1':
      return `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
    case '16:9':
      return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
    default:
      return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
  }
}

/**
 * Builds an FFmpeg dynamic crop filter graph expression for smart auto-reframe
 */
export function buildSmartCropFilter(
  keyframes: ReframeKeyframe[],
  aspectRatio: ClipAspectRatio = '9:16',
  sourceWidth = 1920,
  sourceHeight = 1080,
  duration = 30.0
): string {
  return SmartReframeService.buildSmartCropFilter(keyframes, aspectRatio, sourceWidth, sourceHeight, duration);
}

/**
 * Parses FFmpeg timemark strings (HH:MM:SS.ms) into total seconds
 */

export function parseTimemarkToSeconds(timemark: string): number {
  if (!timemark || typeof timemark !== 'string') return 0;
  const parts = timemark.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return parseFloat(timemark) || 0;
}

export class ClipRenderService {
  /**
   * Creates a new clip record grounded strictly in an existing AI candidate,
   * creates an initial render_jobs row, and triggers async rendering.
   */
  public static async createClipFromCandidate(
    projectId: string,
    userId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16',
    cropMode: ClipCropMode = 'center'
  ): Promise<CreateClipResult> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    if (!isValidUUID(projectId) || !isValidUUID(candidateId)) {
      const err = new Error('Valid UUIDs required for project and candidate.');
      (err as any).code = 'INVALID_UUID';
      throw err;
    }

    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    const validAspectRatio = validRatios.includes(aspectRatio) ? aspectRatio : '9:16';
    const { clip, renderJob } = await createClipWithJob(projectId, candidateId, userId, validAspectRatio, cropMode);

    // 6. Launch in-process background rendering
    ClipRenderService.renderClipJob(clip.id, userId, renderJob.id).catch((renderErr) => {
      logger.error('Background clip rendering caught top-level error', {
        clipId: clip.id,
        error: renderErr instanceof Error ? renderErr.message : String(renderErr),
      });
    });

    return {
      clip: clip as ClipRecord,
      renderJob: renderJob as RenderJobRecord,
    };
  }

  /**
   * Executes the real FFmpeg cut, reframe, encode, and storage upload pipeline.
   */
  public static async renderClipJob(
    clipId: string,
    userId: string,
    existingJobId?: string
  ): Promise<void> {
    if (activeRenderSet.has(clipId)) {
      const err = new Error('Render is already in progress for this clip.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    // Fetch clip and verify ownership
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    // Concurrency check on DB state (allow recovery if stuck > 15m)
    const isStale =
      Date.now() - new Date(clip.updated_at || clip.created_at).getTime() > 15 * 60 * 1000;
    if (['rendering', 'uploading'].includes(clip.render_status) && !isStale) {
      const err = new Error('Clip is currently being rendered. Please wait.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    // Distributed worker and lease identification
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
    const RENDER_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes stale lease recovery
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - RENDER_LOCK_TIMEOUT_MS);

    let jobId = existingJobId;
    const db = await getMongoDb();
    const renderJobsCol = db.collection('render_jobs');

    // Ensure a render job exists in MongoDB
    if (!jobId) {
      const existingJob = await renderJobsCol.findOne({ clip_id: clipId, user_id: userId }, { sort: { created_at: -1 } });
      if (existingJob) {
        jobId = existingJob.id;
      } else {
        const newId = crypto.randomUUID();
        await renderJobsCol.insertOne({
          id: newId,
          clip_id: clipId,
          user_id: userId,
          status: 'queued',
          progress: 0,
          stage: 'queued',
          attempts: 0,
          max_attempts: 3,
          worker_id: null,
          locked_at: null,
          created_at: now,
          updated_at: now,
        });
        jobId = newId;
      }
    }

    // Atomic distributed lease acquisition:
    // Claim only if queued OR processing with an expired stale lock
    const claimedJob = await renderJobsCol.findOneAndUpdate(
      {
        id: jobId,
        $or: [
          { status: 'queued' },
          { status: 'processing', locked_at: { $lt: staleCutoff } },
        ],
      },
      {
        $set: {
          status: 'processing',
          stage: 'downloading',
          worker_id: workerId,
          locked_at: now,
          started_at: now,
          updated_at: now,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!claimedJob) {
      const currentJob = await renderJobsCol.findOne({ id: jobId });
      if (currentJob?.status === 'completed') {
        logger.info(`[ClipRender] Clip ${clipId} is already rendered and completed.`);
        return;
      }
      const err = new Error('Render is already in progress for this clip by another worker.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    activeRenderSet.add(clipId);

    // Heartbeat timer to renew lease during long rendering operations
    const heartbeatTimer = setInterval(async () => {
      try {
        await db.collection('render_jobs').updateOne(
          { id: jobId, worker_id: workerId },
          { $set: { locked_at: new Date(), updated_at: new Date() } }
        );
      } catch (hbErr: any) {
        logger.warn(`[ClipRender] Heartbeat failed for job ${jobId}: ${hbErr.message}`);
      }
    }, 15000);
    heartbeatTimer.unref();

    const uniqueTag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempDir = path.join(os.tmpdir(), `vireo-render-${clipId}-${uniqueTag}`);

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // Update stage: downloading (5%)
      await ClipRenderService.updateJobStage(jobId, clipId, 'downloading', 5, 'rendering', workerId);

      // 1. Download private source video
      const sourcePath = path.join(tempDir, 'source.mp4');
      const outputPath = path.join(tempDir, 'rendered.mp4');

      logger.info(`[ClipRender] Downloading source video from Storage: ${clip.source_storage_path}`, {
        clipId,
        sourcePath: clip.source_storage_path,
      });

      await downloadObjectToFile('source', clip.source_storage_path, sourcePath);

      // 2. FFmpeg cut, manual framing, ASS subtitles, text overlay, and MP4 encode
      await ClipRenderService.updateJobStage(jobId, clipId, 'cutting', 10, 'rendering', workerId);

      const trimStart = Number(clip.trim_start_offset || 0);
      const trimEnd = Number(clip.trim_end_offset || 0);
      const startSec = Number(clip.start_seconds) + trimStart;
      const originalDuration = Number(clip.duration_seconds || (clip.end_seconds - clip.start_seconds));
      const durationSec = Math.max(0.1, Number((originalDuration - trimStart - trimEnd).toFixed(3)));
      const timeoutMs = config.clipRenderTimeoutMs || 300000;

      let cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config);

      let actualReframeMode: 'smart' | 'fallback_center' | 'manual' = 
        clip.crop_config?.mode === 'manual' ? 'manual' : 'fallback_center';
      let reframeMetadata: Record<string, any> | undefined = undefined;

      // Phase 13: Dynamic Smart Auto-Reframe
      if (clip.crop_config?.mode === 'smart') {
        try {
          const track = await SmartReframeService.getReframeTrack(clipId, clip.user_id);
          if (
            track &&
            track.status === 'ready' &&
            Array.isArray(track.smoothed_keyframes) &&
            track.smoothed_keyframes.length > 0
          ) {
            if (track.isStale) {
              logger.warn(`[ClipRender] Smart reframe track is stale for clip ${clipId}. Falling back to center crop.`);
              actualReframeMode = 'fallback_center';
              reframeMetadata = {
                reason: 'stale_track',
                detected_face_count: track.detected_face_count || 0,
              };
              cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
            } else if ((track.detected_face_count || 0) === 0 || !track.dominant_track_id) {
              logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clipId}. Using fallback center.`);
              actualReframeMode = 'fallback_center';
              reframeMetadata = {
                reason: 'no_subject_detected',
                detected_face_count: 0,
              };
              cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
            } else {
              cropFilter = SmartReframeService.buildSmartCropFilter(
                track.smoothed_keyframes,
                clip.aspect_ratio as ClipAspectRatio,
                track.source_width || 1920,
                track.source_height || 1080,
                durationSec
              );
              actualReframeMode = 'smart';
              reframeMetadata = {
                dominant_track_id: track.dominant_track_id,
                detected_face_count: track.detected_face_count,
                keyframe_count: track.smoothed_keyframes.length,
                dominant_score: track.metadata?.dominant_score,
              };
              logger.info(`[ClipRender] Applied dynamic smart reframe filter with ${track.smoothed_keyframes.length} keyframes for clip ${clipId}`);
            }
          } else {
            logger.warn(`[ClipRender] No ready smart reframe track found for clip ${clipId}. Falling back to center crop.`);
            actualReframeMode = 'fallback_center';
            reframeMetadata = {
              reason: 'no_ready_track',
            };
            cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
          }
        } catch (reframeErr: any) {
          logger.warn(`[ClipRender] Smart reframe resolution error for clip ${clipId}: ${reframeErr.message}. Falling back to center crop.`);
          actualReframeMode = 'fallback_center';
          reframeMetadata = {
            reason: 'error',
            error: reframeErr.message,
          };
          cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
        }
      }

      const videoFilters: string[] = [cropFilter];


      // ASS Subtitles burn-in
      if (clip.caption_enabled !== false) {
        await ClipRenderService.updateJobStage(jobId, clipId, 'preparing_captions', 12, 'rendering');
        const assPath = path.join(tempDir, 'subtitles.ass');
        try {
          const captionResult = await CaptionService.generateCaptionsForClip({
            clip,
            targetAspectRatio: clip.aspect_ratio as ClipAspectRatio,
            outputPath: assPath,
          });

          if (captionResult.cues.length > 0 && fs.existsSync(assPath)) {
            const safeAss = assPath.replace(/\\/g, '/').replace(':', '\\\\:');
            videoFilters.push(`ass=${safeAss}`);
            logger.info(`[ClipRender] Burning ${captionResult.cues.length} caption cues using style "${clip.caption_style || 'clean'}"`);
          }
        } catch (capErr: any) {
          logger.warn(`Failed to generate ASS subtitles for clip ${clipId}: ${capErr.message}. Rendering without subtitles.`);
        }
      }

      // Text Overlay burn-in
      if (clip.overlay_config?.enabled && clip.overlay_config?.text) {
        const rawText = String(clip.overlay_config.text);
        const safeText = rawText.replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 120).trim();
        if (safeText) {
          const pos = clip.overlay_config.position || 'top';
          const size = clip.overlay_config.size || 'md';
          const fontSize = size === 'sm' ? 36 : size === 'lg' ? 60 : 46;
          let yExpr = '120';
          if (pos === 'center') yExpr = '(h-text_h)/2';
          else if (pos === 'bottom') yExpr = 'h-text_h-260';

          videoFilters.push(
            `drawtext=text='${safeText}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=${yExpr}`
          );
        }
      }

      logger.info(
        `[ClipRender] Executing FFmpeg for clip ${clipId}: start=${startSec}s, dur=${durationSec}s, filters=${videoFilters.length}`
      );

      await new Promise<void>((resolve, reject) => {
        let isResolved = false;
        let lastProgressUpdate = 0;

        const cmd = ffmpeg(sourcePath)
          .setStartTime(startSec)
          .setDuration(durationSec)
          .videoFilters(videoFilters)
          .videoCodec('libx264');

        if (clip.muted) {
          cmd.noAudio();
        } else {
          cmd.audioCodec('aac');
          if (clip.volume !== undefined && Number(clip.volume) !== 1.0) {
            const vol = Math.min(2.0, Math.max(0.0, Number(clip.volume)));
            cmd.audioFilters(`volume=${vol}`);
          }
        }

        const outputOpts = [
          '-pix_fmt yuv420p',
          '-preset fast',
          '-crf 22',
          '-movflags +faststart',
        ];
        if (!clip.muted) {
          outputOpts.push('-b:a 128k');
        }

        cmd.outputOptions(outputOpts)
        .output(outputPath);

        // Explicit timeout enforcement
        const timer = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            try {
              cmd.kill('SIGKILL');
            } catch (kErr) {}
            const err = new Error(`FFmpeg rendering timed out after ${timeoutMs / 1000}s`);
            (err as any).code = 'RENDER_TIMEOUT';
            reject(err);
          }
        }, timeoutMs);

        // Progress listener
        cmd.on('progress', (progress) => {
          const now = Date.now();
          if (now - lastProgressUpdate > 1500) {
            lastProgressUpdate = now;
            const currentSec = parseTimemarkToSeconds(progress.timemark);
            const rawProgress = 15 + Math.round((currentSec / durationSec) * 70);
            const clampedProgress = Math.min(85, Math.max(15, rawProgress));

            ClipRenderService.updateJobProgress(jobId, clampedProgress, 'encoding').catch(() => {});
          }
        });

        cmd.on('end', () => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            resolve();
          }
        });

        cmd.on('error', (err) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            const wrappedErr = new Error(`FFmpeg processing failed: ${err.message}`);
            (wrappedErr as any).code = 'FFMPEG_FAILED';
            reject(wrappedErr);
          }
        });

        cmd.run();
      });

      // Verify output file exists and has size
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        const err = new Error('Rendered output file was not generated or is empty.');
        (err as any).code = 'FFMPEG_FAILED';
        throw err;
      }

      // 3. Upload rendered MP4 to storage with revision versioning
      await ClipRenderService.updateJobStage(jobId, clipId, 'uploading', 90, 'uploading', workerId);

      const renderedSize = (await fs.promises.stat(outputPath)).size;
      const renderVersion = Number(clip.render_version || 1);
      const outputStoragePath = renderObjectKey(clip.user_id, clip.project_id, clip.id, renderVersion);

      logger.info(
        `[ClipRender] Uploading rendered MP4 v${renderVersion} (${(renderedSize / (1024 * 1024)).toFixed(2)} MB) to path: ${outputStoragePath}`
      );
      await uploadFile('clips', outputStoragePath, outputPath, renderedSize, 'video/mp4');
      const finalStoragePath = outputStoragePath;

      // Output verification guard: ensure deliverable exists before marking ready
      JobReliabilityService.verifyRequiredOutputs('clip_render', { output_storage_path: finalStoragePath });

      // 4. Update clip status -> 'ready'
      await dataRepository
        .from('clips')
        .update({
          render_status: 'ready',
          output_storage_path: finalStoragePath,
          output_object_key: finalStoragePath,
          reframe_mode: actualReframeMode,
          reframe_metadata: reframeMetadata || null,
          render_error_code: null,
          render_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);

      // 5. Update render job -> 'completed' (100%) - only if worker still owns it
      if (jobId) {
        await db.collection('render_jobs').updateOne(
          { id: jobId, worker_id: workerId },
          {
            $set: {
              status: 'completed',
              progress: 100,
              stage: 'completed',
              completed_at: new Date(),
              updated_at: new Date(),
            },
          }
        );
      }

      logger.info(`[ClipRender] Successfully rendered and published clip ${clipId} to ${finalStoragePath}`);
    } catch (err: any) {
      const code = err.code || 'RENDER_FAILED';
      const isTransient = JobReliabilityService.isTransientError(err) || ['RENDER_TIMEOUT', 'STORAGE_UNAVAILABLE', 'FFMPEG_FAILED', 'NETWORK_ERROR'].includes(code);
      const message = JobReliabilityService.sanitizeErrorMessage(err.message || 'Video rendering failed.');

      logger.error(`[ClipRender] Clip rendering failed for clip ${clipId}`, {
        clipId,
        code,
        message,
      });

      // Update clip to failed
      try {
        await dataRepository
          .from('clips')
          .update({
            render_status: 'failed',
            render_error_code: code,
            render_error_message: message.substring(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', clipId);
      } catch {}

      // Update render job status with retry logic (Step 5)
      if (jobId) {
        try {
          const currentJob = await db.collection('render_jobs').findOne({ id: jobId });
          const attempts = currentJob?.attempts || 1;
          const maxAttempts = currentJob?.max_attempts || 3;

          if (isTransient && attempts < maxAttempts) {
            // Exponential backoff with jitter
            const delayMs = JobReliabilityService.computeBackoffDelayMs(attempts, { baseDelayMs: 2000, maxDelayMs: 30000, jitter: true });
            const nextRetryAt = new Date(Date.now() + delayMs);

            await db.collection('render_jobs').updateOne(
              { id: jobId },
              {
                $set: {
                  status: 'queued',
                  stage: 'queued',
                  worker_id: null,
                  locked_at: null,
                  next_retry_at: nextRetryAt,
                  error_code: code,
                  error_message: message.substring(0, 500),
                  updated_at: new Date(),
                },
              }
            );
            logger.warn(`[ClipRender] Transient failure for clip ${clipId}. Job ${jobId} scheduled for retry ${attempts + 1}/${maxAttempts} at ${nextRetryAt.toISOString()}`);
          } else {
            await db.collection('render_jobs').updateOne(
              { id: jobId },
              {
                $set: {
                  status: 'failed',
                  stage: 'failed',
                  worker_id: null,
                  locked_at: null,
                  next_retry_at: null,
                  error_code: code,
                  error_message: message.substring(0, 500),
                  updated_at: new Date(),
                },
              }
            );
            logger.error(`[ClipRender] Permanent render job failure for clip ${clipId} (${attempts}/${maxAttempts})`);
          }
        } catch (dbErr) {
          logger.error('Failed to update render job status on failure', { jobId, dbErr });
        }
      }
    } finally {
      clearInterval(heartbeatTimer);
      // 6. Reliable cleanup of all temporary directories and files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr) {
        logger.warn(`Failed to clean up temp render directory: ${tempDir}`);
      }
      activeRenderSet.delete(clipId);
    }
  }

  /**
   * Helper to update job progress safely
   */
  private static async updateJobProgress(
    jobId?: string,
    progress?: number,
    stage?: string
  ): Promise<void> {
    if (!jobId) return;
    const clamped = Math.min(100, Math.max(0, progress || 0));
    try {
      await dataRepository
        .from('render_jobs')
        .update({
          progress: clamped,
          stage: stage || 'encoding',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch {}
  }

  /**
   * Helper to update stage and clip render_status
   */
  public static async updateJobStage(
    jobId: string | undefined,
    clipId: string,
    stage: string,
    progress: number,
    clipStatus: string,
    expectedWorkerId?: string
  ): Promise<void> {
    if (jobId) {
      const db = await getMongoDb();
      const filter: any = { id: jobId };
      if (expectedWorkerId) {
        filter.worker_id = expectedWorkerId;
      }
      const res = await db.collection('render_jobs').updateOne(
        filter,
        {
          $set: {
            stage,
            progress,
            status: 'processing',
            ...(stage === 'cutting' ? { started_at: new Date() } : {}),
            updated_at: new Date(),
          },
        }
      );
      if (expectedWorkerId && res.matchedCount === 0) {
        throw new AppError('Render lease was expired or claimed by another worker.', 409, 'FENCING_TOKEN_MISMATCH');
      }
    }

    try {
      await dataRepository
        .from('clips')
        .update({
          render_status: clipStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);
    } catch {}
  }

  /**
   * Background processor: claims due queued render jobs and recovers stale leases
   */
  public static async processDueRenderJobs(): Promise<number> {
    if (!isMongoConfigured) return 0;
    const db = await getMongoDb();
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 15 * 60 * 1000); // 15 min stale lease

    // 1. Recover stale locks
    await db.collection('render_jobs').updateMany(
      {
        status: 'processing',
        locked_at: { $lt: staleCutoff },
      },
      {
        $set: {
          status: 'queued',
          stage: 'queued',
          worker_id: null,
          locked_at: null,
          updated_at: now,
        },
      }
    );

    // 2. Claim next due job
    const dueJob = await db.collection('render_jobs').findOne(
      {
        status: 'queued',
        attempts: { $lt: 3 },
        $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }],
      },
      { sort: { created_at: 1 } }
    );

    if (!dueJob) return 0;

    try {
      await this.renderClipJob(dueJob.clip_id, dueJob.user_id, dueJob.id);
      return 1;
    } catch (err: any) {
      logger.warn(`[ClipRender] Error processing due render job ${dueJob.id}: ${err.message}`);
      return 1;
    }
  }

  /**
   * Fetches all clips belonging to a project and user, attaching the latest render job.
   */
  public static async getProjectClips(projectId: string, userId: string): Promise<ClipRecord[]> {
    if (!isMongoConfigured) return [];

    const { data: clips, error } = await dataRepository
      .from('clips')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !clips) {
      logger.error('Error fetching project clips', { error: error?.message, projectId, userId });
      return [];
    }

    // Attach latest render job for each clip
    const enrichedClips: ClipRecord[] = await Promise.all(
      clips.map(async (clip: any) => {
        const { data: job } = await dataRepository
          .from('render_jobs')
          .select('*')
          .eq('clip_id', clip.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...clip,
          latest_job: job || null,
        } as ClipRecord;
      })
    );

    return enrichedClips;
  }

  /**
   * Fetches a single clip and its latest render job.
   */
  public static async getClip(clipId: string, userId: string): Promise<ClipRecord> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    const { data: clip, error } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !clip) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    const { data: job } = await dataRepository
      .from('render_jobs')
      .select('*')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ...clip,
      latest_job: job || null,
    } as ClipRecord;
  }

  /**
   * Generates a short-lived signed URL for previewing the rendered MP4.
   */
  public static async getSignedPreviewUrl(clipId: string, userId: string): Promise<SignedUrlResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    if (clip.render_status !== 'ready' || !clip.output_storage_path) {
      const err = new Error('Clip is not ready for preview.');
      (err as any).code = 'CLIP_NOT_READY';
      throw err;
    }

    const expiresIn = 300;
    const signedUrl = await signObjectGet('clips', clip.output_storage_path);

    return {
      signedUrl,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Generates a short-lived signed URL with content-disposition download attachment header.
   */
  public static async getSignedDownloadUrl(clipId: string, userId: string): Promise<SignedUrlResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    if (clip.render_status !== 'ready' || !clip.output_storage_path) {
      const err = new Error('Clip is not ready for download.');
      (err as any).code = 'CLIP_NOT_READY';
      throw err;
    }

    // Fetch project title and candidate title for human-friendly filename
    const { data: project } = await dataRepository
      .from('projects')
      .select('title')
      .eq('id', clip.project_id)
      .maybeSingle();

    let candidateTitle = 'clip';
    if (clip.candidate_id) {
      const { data: cand } = await dataRepository
        .from('clip_candidates')
        .select('title')
        .eq('id', clip.candidate_id)
        .maybeSingle();
      if (cand?.title) candidateTitle = cand.title;
    }

    const safeProj = sanitizeFilename(project?.title || 'vireo');
    const safeTitle = sanitizeFilename(candidateTitle);
    const downloadFilename = `vireo-${safeProj}-${safeTitle}.mp4`;

    const expiresIn = 300;
    const signedUrl = await signObjectGet('clips', clip.output_storage_path, downloadFilename);

    return {
      signedUrl,
      filename: downloadFilename,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Deletes a clip record, cleans up all rendered video revisions from Storage, and cascades to render_jobs.
   */
  public static async deleteClip(clipId: string, userId: string): Promise<void> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    await deletePrefix('clips', clipObjectPrefix(clip.user_id, clip.project_id, clip.id));

    await deleteClipRecords(userId, clipId);
  }

  /**
   * Updates editor configuration (trim, aspect ratio, framing, captions, text overlay, audio).
   * Validates limits strictly and increments editor_version.
   */
  public static async updateClipEditorConfig(
    clipId: string,
    userId: string,
    update: ClipEditorUpdateDTO
  ): Promise<ClipRecord> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    if (update.aspectRatio && !validRatios.includes(update.aspectRatio)) {
      const err = new Error(`Invalid aspect ratio. Supported: ${validRatios.join(', ')}`);
      (err as any).code = 'INVALID_ASPECT_RATIO';
      throw err;
    }

    const validStyles: CaptionStyle[] = ['clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke'];
    if (update.captionStyle && !validStyles.includes(update.captionStyle)) {
      const err = new Error(`Invalid caption style. Supported: ${validStyles.join(', ')}`);
      (err as any).code = 'INVALID_CAPTION_STYLE';
      throw err;
    }

    const validPositions: CaptionPosition[] = ['top', 'center', 'bottom'];
    if (update.captionPosition && !validPositions.includes(update.captionPosition)) {
      const err = new Error(`Invalid caption position. Supported: ${validPositions.join(', ')}`);
      (err as any).code = 'INVALID_CAPTION_POSITION';
      throw err;
    }

    // Trim validation: cannot exceed original candidate boundaries; effective duration >= 3s
    const originalDuration = Number(clip.end_seconds - clip.start_seconds);
    const trimStart = update.trimStartOffset !== undefined
      ? Math.max(0, Number(update.trimStartOffset))
      : Number(clip.trim_start_offset || 0);

    const trimEnd = update.trimEndOffset !== undefined
      ? Math.max(0, Number(update.trimEndOffset))
      : Number(clip.trim_end_offset || 0);

    if (isNaN(trimStart) || isNaN(trimEnd) || trimStart < 0 || trimEnd < 0) {
      const err = new Error('Trim offsets must be non-negative numbers.');
      (err as any).code = 'INVALID_TRIM';
      throw err;
    }

    const effectiveDuration = Number((originalDuration - trimStart - trimEnd).toFixed(3));
    if (effectiveDuration < 3.0) {
      const err = new Error(`Trimmed duration (${effectiveDuration.toFixed(1)}s) cannot be shorter than 3 seconds.`);
      (err as any).code = 'TRIM_TOO_SHORT';
      throw err;
    }

    // Crop config
    let safeCrop = clip.crop_config || { mode: 'center', focusX: 0.5, focusY: 0.5 };
    if (update.cropConfig) {
      const mode = update.cropConfig.mode === 'smart' ? 'smart' : update.cropConfig.mode === 'manual' ? 'manual' : 'center';
      safeCrop = {
        mode,
        focusX: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusX ?? 0.5))),
        focusY: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusY ?? 0.5))),
        smart: update.cropConfig.smart ? {
          trackId: update.cropConfig.smart.trackId ? String(update.cropConfig.smart.trackId) : undefined,
          strength: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.smart.strength ?? 1.0))),
        } : undefined,
      };
    }


    // Overlay config
    let safeOverlay = clip.overlay_config || { enabled: false, text: '' };
    if (update.overlayConfig) {
      const text = typeof update.overlayConfig.text === 'string'
        ? update.overlayConfig.text.replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 120).trim()
        : '';
      safeOverlay = {
        enabled: Boolean(update.overlayConfig.enabled),
        text,
        position: update.overlayConfig.position || 'top',
        size: update.overlayConfig.size || 'md',
      };
    }

    // Caption config validation & sanitization
    let safeCaptionConfig: CaptionConfig = clip.caption_config || {};
    if (update.captionConfig) {
      const incoming = update.captionConfig;
      const sanitized: CaptionConfig = {};

      if (incoming.fontFamily) {
        sanitized.fontFamily = CaptionService.validateFontFamily(String(incoming.fontFamily));
      }
      if (incoming.fontSize !== undefined) {
        sanitized.fontSize = Math.min(110, Math.max(32, Math.round(Number(incoming.fontSize) || 64)));
      }
      if (incoming.fontWeight !== undefined) {
        const fw = Math.round(Number(incoming.fontWeight) || 700);
        sanitized.fontWeight = [400, 500, 600, 700, 800, 900].includes(fw) ? fw : 700;
      }
      if (incoming.uppercase !== undefined) {
        sanitized.uppercase = Boolean(incoming.uppercase);
      }

      const hexRegex = /^#?([0-9a-fA-F]{6})$/;
      if (incoming.textColor && hexRegex.test(incoming.textColor)) {
        sanitized.textColor = incoming.textColor.startsWith('#') ? incoming.textColor : `#${incoming.textColor}`;
      } else if (incoming.primaryColor && hexRegex.test(incoming.primaryColor)) {
        sanitized.textColor = incoming.primaryColor.startsWith('#') ? incoming.primaryColor : `#${incoming.primaryColor}`;
      }

      if (incoming.activeWordColor && hexRegex.test(incoming.activeWordColor)) {
        sanitized.activeWordColor = incoming.activeWordColor.startsWith('#') ? incoming.activeWordColor : `#${incoming.activeWordColor}`;
      } else if (incoming.highlightColor && hexRegex.test(incoming.highlightColor)) {
        sanitized.activeWordColor = incoming.highlightColor.startsWith('#') ? incoming.highlightColor : `#${incoming.highlightColor}`;
      }

      if (incoming.strokeColor && hexRegex.test(incoming.strokeColor)) {
        sanitized.strokeColor = incoming.strokeColor.startsWith('#') ? incoming.strokeColor : `#${incoming.strokeColor}`;
      } else if (incoming.outlineColor && hexRegex.test(incoming.outlineColor)) {
        sanitized.strokeColor = incoming.outlineColor.startsWith('#') ? incoming.outlineColor : `#${incoming.outlineColor}`;
      }

      if (incoming.strokeWidth !== undefined || incoming.outlineWidth !== undefined) {
        const sw = Number(incoming.strokeWidth ?? incoming.outlineWidth);
        sanitized.strokeWidth = Math.min(8, Math.max(0, Number(sw.toFixed(1))));
      }

      if (incoming.shadowEnabled !== undefined) {
        sanitized.shadowEnabled = Boolean(incoming.shadowEnabled);
      }
      if (incoming.shadowOpacity !== undefined) {
        sanitized.shadowOpacity = Math.min(1.0, Math.max(0.0, Number(Number(incoming.shadowOpacity).toFixed(2))));
      }
      if (incoming.shadow !== undefined) {
        sanitized.shadow = Math.min(5, Math.max(0, Number(Number(incoming.shadow).toFixed(1))));
      }

      if (incoming.backgroundEnabled !== undefined) {
        sanitized.backgroundEnabled = Boolean(incoming.backgroundEnabled);
      }
      if (incoming.backgroundColor && hexRegex.test(incoming.backgroundColor)) {
        sanitized.backgroundColor = incoming.backgroundColor.startsWith('#') ? incoming.backgroundColor : `#${incoming.backgroundColor}`;
      }
      if (incoming.backgroundOpacity !== undefined) {
        sanitized.backgroundOpacity = Math.min(1.0, Math.max(0.0, Number(Number(incoming.backgroundOpacity).toFixed(2))));
      }

      if (incoming.position && ['top', 'center', 'bottom'].includes(incoming.position)) {
        sanitized.position = incoming.position as CaptionPosition;
      }
      if (incoming.positionY !== undefined) {
        sanitized.positionY = Math.min(1.0, Math.max(0.0, Number(Number(incoming.positionY).toFixed(3))));
      }
      if (incoming.positionX !== undefined) {
        sanitized.positionX = Math.min(1.0, Math.max(0.0, Number(Number(incoming.positionX).toFixed(3))));
      }
      if (incoming.textAlign && ['left', 'center', 'right'].includes(incoming.textAlign)) {
        sanitized.textAlign = incoming.textAlign as any;
      }

      if (incoming.maxWordsPerCue !== undefined) {
        sanitized.maxWordsPerCue = Math.min(6, Math.max(2, Math.round(Number(incoming.maxWordsPerCue))));
      }
      if (incoming.maxLines !== undefined) {
        sanitized.maxLines = Math.min(2, Math.max(1, Math.round(Number(incoming.maxLines))));
      }

      if (incoming.animation && ['none', 'fade', 'pop', 'word_pop'].includes(incoming.animation)) {
        sanitized.animation = incoming.animation as any;
      }

      if (Array.isArray(incoming.caption_overrides)) {
        sanitized.caption_overrides = incoming.caption_overrides
          .filter((o: any) => o && typeof o.cueId === 'string' && typeof o.text === 'string')
          .map((o: any) => ({
            cueId: String(o.cueId).slice(0, 50),
            text: CaptionService.sanitizeAssText(o.text).slice(0, 200),
          }));
      } else if (Array.isArray(clip.caption_config?.caption_overrides)) {
        sanitized.caption_overrides = clip.caption_config.caption_overrides;
      }

      safeCaptionConfig = { ...safeCaptionConfig, ...sanitized };
    }

    // Audio
    const safeVolume = update.volume !== undefined
      ? Math.min(2.0, Math.max(0.0, Number(update.volume)))
      : (clip.volume ?? 1.0);
    const safeMuted = update.muted !== undefined ? Boolean(update.muted) : Boolean(clip.muted);

    const nextEditorVersion = Number(clip.editor_version || 1) + 1;

    const payload: any = {
      trim_start_offset: trimStart,
      trim_end_offset: trimEnd,
      aspect_ratio: update.aspectRatio || clip.aspect_ratio,
      caption_enabled: update.captionEnabled !== undefined ? Boolean(update.captionEnabled) : (clip.caption_enabled ?? true),
      caption_style: update.captionStyle || clip.caption_style || 'clean',
      caption_position: update.captionPosition || clip.caption_position || 'bottom',
      caption_config: safeCaptionConfig,
      crop_config: safeCrop,
      overlay_config: safeOverlay,
      volume: safeVolume,
      muted: safeMuted,
      editor_version: nextEditorVersion,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await dataRepository
      .from('clips')
      .update(payload)
      .eq('id', clipId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      logger.error('Failed to update clip editor config in DB', { clipId, error: updateErr.message });
      throw new Error(`Failed to save editor changes: ${updateErr.message}`);
    }

    return updated as ClipRecord;
  }

  /**
   * Resets clip editor configuration back to Phase 11 baseline defaults.
   */
  public static async resetClipEditorConfig(clipId: string, userId: string): Promise<ClipRecord> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    const payload: any = {
      trim_start_offset: 0,
      trim_end_offset: 0,
      aspect_ratio: '9:16',
      caption_enabled: true,
      caption_style: 'clean',
      caption_position: 'bottom',
      caption_config: {},
      crop_config: { focusX: 0.5, focusY: 0.5 },
      overlay_config: { enabled: false, text: '' },
      volume: 1.0,
      muted: false,
      editor_version: Number(clip.editor_version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    const { data: resetClip, error } = await dataRepository
      .from('clips')
      .update(payload)
      .eq('id', clipId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to reset editor config: ${error.message}`);
    }

    return resetClip as ClipRecord;
  }

  /**
   * Fetches complete editor data bundle for frontend workspace
   */
  public static async getClipEditorData(clipId: string, userId: string): Promise<{
    clip: ClipRecord;
    timingMode: string;
    availablePresets: CaptionStyle[];
    previewUrl?: string;
  }> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Get timing mode from transcript
    let timingMode = 'segment';
    try {
      const { data: trans } = await dataRepository
        .from('transcripts')
        .select('words')
        .eq('project_id', clip.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (trans && Array.isArray(trans.words) && trans.words.length > 0) {
        timingMode = 'word';
      }
    } catch {}

    let previewUrl: string | undefined;
    if (clip.render_status === 'ready') {
      try {
        const preview = await ClipRenderService.getSignedPreviewUrl(clipId, userId);
        previewUrl = preview.signedUrl;
      } catch {}
    }

    const availablePresets: CaptionStyle[] = [
      'clean',
      'bold',
      'minimal',
      'podcast',
      'highlight',
      'karaoke',
    ];

    return {
      clip,
      timingMode,
      availablePresets,
      previewUrl,
    };
  }
}

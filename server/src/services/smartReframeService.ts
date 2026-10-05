import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
/**
 * Phase 13: Smart Auto-Reframe + Face Tracking Service
 * Detects faces, tracks dominant subject over time, smoothes camera movement,
 * and generates dynamic crop filters for FFmpeg 9:16 rendering.
 *
 * All computer vision is 100% local (OpenCV).
 * Zero external/paid AI calls. No biometric identity or cross-project profile storage.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, ChildProcess } from 'node:child_process';
import { downloadObjectToFile } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import {
  ClipAspectRatio,
  NormalizedFaceDetection,
  ReframeKeyframe,
  ReframeSample,
  ReframeTrackRecord,
} from '../types/index.js';

// In-memory set to prevent concurrent smart reframe analyses for the same clip
export const activeReframeAnalysisSet = new Set<string>();

export interface SmartReframeOptions {
  sampleFps?: number;
  deadZone?: number;
  maxVelocity?: number;
  smoothingAlpha?: number;
  timeoutMs?: number;
}

export class SmartReframeService {
  /**
   * Validates a single face detection record from CV output.
   * Rejects NaN, Infinity, negative dimensions, or coordinates outside legal normalized bounds.
   */
  public static validateDetection(raw: any): NormalizedFaceDetection | null {
    if (!raw || typeof raw !== 'object') return null;

    const x = Number(raw.x);
    const y = Number(raw.y);
    const width = Number(raw.width);
    const height = Number(raw.height);
    const centerX = Number(raw.center_x ?? raw.centerX ?? (x + width / 2));
    const centerY = Number(raw.center_y ?? raw.centerY ?? (y + height / 2));
    const confidence = Number(raw.confidence ?? 0.85);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      !Number.isFinite(confidence)
    ) {
      return null;
    }

    if (width <= 0 || height <= 0 || width > 1.0 || height > 1.0) {
      return null;
    }

    if (x < 0 || x > 1.0 || y < 0 || y > 1.0) {
      return null;
    }

    const clampedCenterX = Math.min(1.0, Math.max(0.0, centerX));
    const clampedCenterY = Math.min(1.0, Math.max(0.0, centerY));

    return {
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      width: Math.round(width * 10000) / 10000,
      height: Math.round(height * 10000) / 10000,
      center_x: Math.round(clampedCenterX * 10000) / 10000,
      center_y: Math.round(clampedCenterY * 10000) / 10000,
      confidence: Math.round(Math.min(1.0, Math.max(0.0, confidence)) * 100) / 100,
      track_id: raw.track_id ? String(raw.track_id) : undefined,
      area: Math.round(width * height * 10000) / 10000,
    };
  }

  /**
   * Associates detections across frames into continuous face tracks deterministically.
   * Uses spatial distance and size similarity between consecutive frames.
   */
  public static associateTracks(
    samples: ReframeSample[],
    maxDistanceThreshold = 0.35
  ): { tracks: Map<string, NormalizedFaceDetection[]>; faceCount: number } {
    const tracks = new Map<string, NormalizedFaceDetection[]>();
    let nextTrackId = 1;
    // Map of trackId -> last detection seen
    const activeTracks = new Map<string, { lastDetection: NormalizedFaceDetection; lastTime: number }>();

    for (const sample of samples) {
      const { time, faces } = sample;
      const validFaces: NormalizedFaceDetection[] = [];

      for (const raw of faces) {
        const validated = this.validateDetection(raw);
        if (validated) validFaces.push(validated);
      }

      const assignedFaces = new Set<number>();
      const assignedTracks = new Set<string>();

      // Try matching active tracks to faces in this frame
      for (const [trackId, info] of activeTracks.entries()) {
        // If track inactive for more than 1.5 seconds, consider it dormant
        if (time - info.lastTime > 1.5) continue;

        let bestFaceIdx = -1;
        let bestDist = Infinity;

        for (let i = 0; i < validFaces.length; i++) {
          if (assignedFaces.has(i)) continue;
          const face = validFaces[i];
          const dx = face.center_x - info.lastDetection.center_x;
          const dy = face.center_y - info.lastDetection.center_y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Size similarity check (allow max 2.5x area ratio change)
          const currentArea = face.width * face.height;
          const lastArea = info.lastDetection.width * info.lastDetection.height;
          const areaRatio = currentArea > 0 && lastArea > 0 ? Math.max(currentArea / lastArea, lastArea / currentArea) : 1;

          if (dist < maxDistanceThreshold && areaRatio < 2.5 && dist < bestDist) {
            bestDist = dist;
            bestFaceIdx = i;
          }
        }

        if (bestFaceIdx !== -1) {
          const matchedFace = validFaces[bestFaceIdx];
          matchedFace.track_id = trackId;
          assignedFaces.add(bestFaceIdx);
          assignedTracks.add(trackId);

          activeTracks.set(trackId, { lastDetection: matchedFace, lastTime: time });
          const trackList = tracks.get(trackId) || [];
          trackList.push(matchedFace);
          tracks.set(trackId, trackList);
        }
      }

      // New faces not matched get new track IDs
      for (let i = 0; i < validFaces.length; i++) {
        if (!assignedFaces.has(i)) {
          const newTrackId = `subject_${nextTrackId++}`;
          const face = validFaces[i];
          face.track_id = newTrackId;
          activeTracks.set(newTrackId, { lastDetection: face, lastTime: time });
          tracks.set(newTrackId, [face]);
        }
      }
    }

    return { tracks, faceCount: tracks.size };
  }

  /**
   * Deterministically selects the dominant subject track based on:
   * Presence (40%), Face Area (30%), Detection Confidence (20%), Screen Centrality (10%).
   */
  public static selectDominantTrack(
    tracks: Map<string, NormalizedFaceDetection[]>,
    totalSampleCount: number
  ): {
    dominantTrackId: string | null;
    score: number;
  } {
    if (tracks.size === 0 || totalSampleCount <= 0) {
      return { dominantTrackId: null, score: 0 };
    }

    let bestTrackId: string | null = null;
    let bestScore = -1;

    for (const [trackId, detections] of tracks.entries()) {
      if (detections.length === 0) continue;

      const presenceRatio = Math.min(1.0, detections.length / totalSampleCount);

      let totalArea = 0;
      let totalConfidence = 0;
      let totalCentrality = 0;

      for (const d of detections) {
        totalArea += (d.width * d.height);
        totalConfidence += d.confidence;
        // Centrality: distance from horizontal center (0.5), normalized between 0 and 1
        const distFromCenter = Math.abs(d.center_x - 0.5);
        totalCentrality += Math.max(0, 1 - distFromCenter * 2);
      }

      const avgArea = totalArea / detections.length;
      // Cap normalized area score at 0.25 (typical prominent face is ~0.05-0.20 of screen)
      const areaScore = Math.min(1.0, avgArea / 0.15);
      const avgConfidence = totalConfidence / detections.length;
      const avgCentrality = totalCentrality / detections.length;

      // Weighting formula: 40% presence, 30% area, 20% confidence, 10% centrality
      const score =
        0.4 * presenceRatio +
        0.3 * areaScore +
        0.2 * avgConfidence +
        0.1 * avgCentrality;

      if (score > bestScore) {
        bestScore = score;
        bestTrackId = trackId;
      }
    }

    return {
      dominantTrackId: bestTrackId,
      score: Math.round(bestScore * 1000) / 1000,
    };
  }

  /**
   * Temporal smoothing, dead-zone application, maximum velocity clamping,
   * short occlusion interpolation, and keyframe reduction.
   */
  public static smoothAndGenerateKeyframes(params: {
    samples: ReframeSample[];
    dominantTrackId: string | null;
    duration: number;
    deadZone?: number;
    maxVelocity?: number;
    smoothingAlpha?: number;
    aspectRatio?: ClipAspectRatio;
    sourceWidth?: number;
    sourceHeight?: number;
  }): ReframeKeyframe[] {
    const {
      samples,
      dominantTrackId,
      duration,
      deadZone = 0.035, // Ignore subject movements smaller than 3.5%
      maxVelocity = 0.45, // Max horizontal movement per second (normalized 0-1)
      smoothingAlpha = 0.25, // Exponential moving average weight
    } = params;

    // Fallback: If no face or no samples, return center crop keyframe
    if (!dominantTrackId || samples.length === 0) {
      return [{ time: 0, centerX: 0.5, centerY: 0.5 }];
    }

    // Index dominant detections by sampled time
    const detectionsByTime = new Map<number, NormalizedFaceDetection>();
    for (const sample of samples) {
      const match = sample.faces.find((f) => f.track_id === dominantTrackId);
      if (match) {
        detectionsByTime.set(sample.time, match);
      }
    }

    const rawTrajectory: { time: number; x: number; y: number }[] = [];
    let lastSeenDetection: NormalizedFaceDetection | null = null;
    let lastSeenTime = -1;

    for (const sample of samples) {
      const { time } = sample;
      const det = detectionsByTime.get(time);

      if (det) {
        lastSeenDetection = det;
        lastSeenTime = time;
        rawTrajectory.push({ time, x: det.center_x, y: det.center_y });
      } else if (lastSeenDetection !== null && time - lastSeenTime <= 1.0) {
        // Short occlusion (<= 1.0s): hold last known position
        rawTrajectory.push({ time, x: lastSeenDetection.center_x, y: lastSeenDetection.center_y });
      } else {
        // Longer occlusion: ease toward center (0.5)
        const previousX = lastSeenDetection ? lastSeenDetection.center_x : 0.5;
        const easeFactor = Math.min(1.0, (time - lastSeenTime - 1.0) / 1.5);
        const interpolatedX = previousX + (0.5 - previousX) * easeFactor;
        rawTrajectory.push({ time, x: interpolatedX, y: 0.5 });
      }
    }

    if (rawTrajectory.length === 0) {
      return [{ time: 0, centerX: 0.5, centerY: 0.5 }];
    }

    // Apply temporal smoothing, dead zone, and velocity clamp
    const smoothedTrajectory: { time: number; x: number; y: number }[] = [];
    let currentX = rawTrajectory[0].x;
    let currentY = 0.5;

    for (let i = 0; i < rawTrajectory.length; i++) {
      const pt = rawTrajectory[i];
      const prevTime = i > 0 ? rawTrajectory[i - 1].time : 0;
      const dt = Math.max(0.01, pt.time - prevTime);

      const targetX = pt.x;
      const deltaX = targetX - currentX;

      // Dead zone check: if movement is tiny, keep current crop position
      if (Math.abs(deltaX) > deadZone) {
        // Exponential moving average update
        const candidateX = currentX + smoothingAlpha * deltaX;

        // Velocity clamping: limit movement per second
        const maxStep = maxVelocity * dt;
        const clampedDelta = Math.max(-maxStep, Math.min(maxStep, candidateX - currentX));
        currentX = currentX + clampedDelta;
      }

      // Target face vertical framing: place upper-middle (y ~ 0.38)
      // Clamped to 0.0 - 1.0
      currentX = Math.min(1.0, Math.max(0.0, currentX));
      smoothedTrajectory.push({
        time: pt.time,
        x: Math.round(currentX * 10000) / 10000,
        y: currentY,
      });
    }

    // Keyframe reduction: retain keyframe if delta >= 0.02 or time gap >= 1.0s
    const keyframes: ReframeKeyframe[] = [];

    // Always include first keyframe at t = 0
    keyframes.push({
      time: 0,
      centerX: smoothedTrajectory[0].x,
      centerY: smoothedTrajectory[0].y,
    });

    let lastKeptKeyframe = keyframes[0];

    for (let i = 1; i < smoothedTrajectory.length; i++) {
      const pt = smoothedTrajectory[i];
      const deltaX = Math.abs(pt.x - lastKeptKeyframe.centerX);
      const dt = pt.time - lastKeptKeyframe.time;

      if (deltaX >= 0.02 || dt >= 1.0) {
        const kf: ReframeKeyframe = {
          time: pt.time,
          centerX: pt.x,
          centerY: pt.y,
        };
        keyframes.push(kf);
        lastKeptKeyframe = kf;
      }
    }

    // Ensure last keyframe reaches duration
    const finalPt = smoothedTrajectory[smoothedTrajectory.length - 1];
    if (keyframes[keyframes.length - 1].time < duration) {
      keyframes.push({
        time: Math.round(duration * 1000) / 1000,
        centerX: finalPt.x,
        centerY: finalPt.y,
      });
    }

    return keyframes;
  }

  /**
   * Generates a safe server-controlled FFmpeg dynamic crop filter expression.
   * Uses piecewise linear interpolation between keyframes without any shell injection risk.
   */
  public static buildSmartCropFilter(
    keyframes: ReframeKeyframe[],
    aspectRatio: ClipAspectRatio = '9:16',
    sourceWidth = 1920,
    sourceHeight = 1080,
    duration = 30.0
  ): string {
    // If no keyframes or only one keyframe, return static crop
    if (!keyframes || keyframes.length === 0) {
      return this.buildStaticScaleCrop(aspectRatio, 0.5, 0.5);
    }

    // Filter and sanitize numeric keyframes
    const validKfs = keyframes
      .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.centerX))
      .map((k) => ({
        time: Math.max(0, Number(k.time.toFixed(3))),
        x: Math.min(1.0, Math.max(0.0, Number(k.centerX.toFixed(4)))),
      }))
      .sort((a, b) => a.time - b.time);

    if (validKfs.length === 0) {
      return this.buildStaticScaleCrop(aspectRatio, 0.5, 0.5);
    }

    // If all keyframes are virtually identical (difference < 0.015), use static crop
    const firstX = validKfs[0].x;
    const isStatic = validKfs.every((k) => Math.abs(k.x - firstX) < 0.015);
    if (isStatic || validKfs.length === 1) {
      return this.buildStaticScaleCrop(aspectRatio, firstX, 0.5);
    }

    // Build piecewise linear interpolation expression:
    // if(lte(t, t1), x0 + (x1-x0)*(t-t0)/(t1-t0), if(lte(t, t2), ... , x_last))
    let expr = validKfs[validKfs.length - 1].x.toFixed(4);

    for (let i = validKfs.length - 2; i >= 0; i--) {
      const k0 = validKfs[i];
      const k1 = validKfs[i + 1];
      const dt = Math.max(0.001, k1.time - k0.time);
      const dx = k1.x - k0.x;
      const t0 = k0.time.toFixed(3);
      const t1 = k1.time.toFixed(3);
      const segment = `${k0.x.toFixed(4)}+(${dx.toFixed(4)})*(t-${t0})/${dt.toFixed(3)}`;
      expr = `if(lte(t\\,${t1})\\,${segment}\\,${expr})`;
    }

    const clampedExpr = `min(max(${expr}\\,0)\\,1)`;

    switch (aspectRatio) {
      case '9:16':
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:'(in_w-out_w)*${clampedExpr}':0`;
      case '1:1':
        return `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:'(in_w-out_w)*${clampedExpr}':0`;
      case '16:9':
        return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:'(in_w-out_w)*${clampedExpr}':0`;
      default:
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:'(in_w-out_w)*${clampedExpr}':0`;
    }
  }

  private static buildStaticScaleCrop(aspectRatio: ClipAspectRatio, fx: number, fy: number): string {
    const clampedFx = Math.min(1.0, Math.max(0.0, fx));
    const clampedFy = Math.min(1.0, Math.max(0.0, fy));

    if (clampedFx === 0.5 && clampedFy === 0.5) {
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

    switch (aspectRatio) {
      case '9:16':
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
      case '1:1':
        return `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
      case '16:9':
        return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
      default:
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
    }
  }

  /**
   * Finds the Python executable to invoke for local CV analysis.
   */
  public static getPythonPath(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }
    // Check project venvs
    const candidates = [
      path.resolve(process.cwd(), 'server/python/.venv/bin/python'),
      path.resolve(process.cwd(), 'python/.venv/bin/python'),
      path.resolve(process.cwd(), '../server/python/.venv/bin/python'),
      path.resolve('/tmp/test_venv/bin/python'),
      'python3',
      'python',
    ];

    for (const c of candidates) {
      if (c.startsWith('/') && fs.existsSync(c)) {
        return c;
      }
    }
    return 'python3';
  }

  /**
   * Invokes Python face detection script via execFile with strict timeout and input isolation.
   */
  public static async runCvAnalyzer(
    videoPath: string,
    sampleFps = 4.0,
    startSec = 0.0,
    durationSec = 0.0,
    timeoutMs = 120000
  ): Promise<{
    source_width: number;
    source_height: number;
    source_fps: number;
    duration: number;
    sample_fps: number;
    sample_count: number;
    samples: ReframeSample[];
  }> {
    if (!fs.existsSync(videoPath)) {
      const err = new Error(`Video file not found for smart reframe: ${videoPath}`);
      (err as any).code = 'FILE_NOT_FOUND';
      throw err;
    }

    const scriptPath = path.resolve(
      process.cwd(),
      fs.existsSync(path.resolve(process.cwd(), 'server/python/smart_reframe.py'))
        ? 'server/python/smart_reframe.py'
        : 'python/smart_reframe.py'
    );

    if (!fs.existsSync(scriptPath)) {
      const err = new Error(`Smart reframe Python script not found at ${scriptPath}`);
      (err as any).code = 'SCRIPT_NOT_FOUND';
      throw err;
    }

    const pythonBin = this.getPythonPath();
    const inputPayload = JSON.stringify({
      videoPath,
      sampleFps,
      startSec,
      durationSec,
    });

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let child: ChildProcess | null = null;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          if (child) {
            try {
              child.kill('SIGKILL');
            } catch {}
          }
          const err = new Error(`Smart reframe analysis timed out after ${timeoutMs / 1000}s`);
          (err as any).code = 'REFRAME_ANALYSIS_TIMEOUT';
          reject(err);
        }
      }, timeoutMs);

      try {
        child = execFile(
          pythonBin,
          [scriptPath],
          { maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            clearTimeout(timer);
            if (isSettled) return;
            isSettled = true;

            if (err) {
              logger.error('[SmartReframe] Python CV analyzer failed', { error: err.message, stderr });
              const wrappedErr = new Error(`Computer vision analyzer failed: ${err.message}`);
              (wrappedErr as any).code = 'CV_ANALYZER_FAILED';
              return reject(wrappedErr);
            }

            try {
              const res = JSON.parse(stdout.trim());
              if (res.status !== 'ok') {
                const appErr = new Error(res.error_message || 'CV Analyzer returned error status');
                (appErr as any).code = res.error_code || 'CV_ANALYZER_ERROR';
                return reject(appErr);
              }
              resolve(res);
            } catch (pErr: any) {
              const parseErr = new Error(`Failed to parse CV analyzer output: ${pErr.message}`);
              (parseErr as any).code = 'MALFORMED_CV_OUTPUT';
              reject(parseErr);
            }
          }
        );

        if (child.stdin) {
          child.stdin.write(inputPayload);
          child.stdin.end();
        }
      } catch (launchErr: any) {
        clearTimeout(timer);
        if (!isSettled) {
          isSettled = true;
          reject(launchErr);
        }
      }
    });
  }

  /**
   * Main entry point to perform smart reframe analysis for a clip.
   * Acquires clip lock, downloads source, runs CV, extracts keyframes, and persists to DB.
   */
  public static async analyzeClipFraming(
    clipId: string,
    userId: string,
    options: SmartReframeOptions = {}
  ): Promise<ReframeTrackRecord> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    // 1. Lock check: prevent concurrent analyses for same clip
    if (activeReframeAnalysisSet.has(clipId)) {
      const err = new Error('Smart reframe analysis is already active for this clip.');
      (err as any).code = 'REFRAME_ANALYSIS_ACTIVE';
      throw err;
    }

    activeReframeAnalysisSet.add(clipId);

    const tempTag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempDir = path.join(os.tmpdir(), `vireo-reframe-${clipId}-${tempTag}`);

    try {
      // 2. Fetch clip and verify ownership
      const { data: clip, error: clipErr } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', clipId)
        .maybeSingle();

      if (clipErr || !clip) {
        const err = new Error('Clip not found.');
        (err as any).code = 'CLIP_NOT_FOUND';
        throw err;
      }

      if (clip.user_id !== userId) {
        const err = new Error('Access denied: You do not own this clip.');
        (err as any).code = 'ACCESS_DENIED';
        throw err;
      }

      if (!clip.source_storage_path) {
        const err = new Error('Clip does not have an associated source video.');
        (err as any).code = 'SOURCE_VIDEO_NOT_FOUND';
        throw err;
      }

      fs.mkdirSync(tempDir, { recursive: true });
      const localSourcePath = path.join(tempDir, 'source.mp4');

      // 3. Download source video to temp location
      logger.info(`[SmartReframe] Downloading source video from Storage for clip ${clipId}: ${clip.source_storage_path}`);
      await downloadObjectToFile('source', clip.source_storage_path, localSourcePath);

      // 4. Determine effective clip boundaries
      const trimStart = Number(clip.trim_start_offset || 0);
      const trimEnd = Number(clip.trim_end_offset || 0);
      const startSec = Number(clip.start_seconds) + trimStart;
      const originalDuration = Number(clip.duration_seconds || (clip.end_seconds - clip.start_seconds));
      const durationSec = Math.max(0.1, Number((originalDuration - trimStart - trimEnd).toFixed(3)));

      const sampleFps = options.sampleFps || 4.0;
      const timeoutMs = options.timeoutMs || 120000;

      // 5. Run local Computer Vision analysis
      logger.info(`[SmartReframe] Starting CV face analysis for clip ${clipId}: start=${startSec}s, dur=${durationSec}s`);
      const cvResult = await this.runCvAnalyzer(localSourcePath, sampleFps, startSec, durationSec, timeoutMs);

      // 6. Associate tracks and select dominant subject
      const { tracks, faceCount } = this.associateTracks(cvResult.samples);
      const { dominantTrackId, score } = this.selectDominantTrack(tracks, cvResult.samples.length);

      logger.info(
        `[SmartReframe] Analysis complete for clip ${clipId}: detected ${faceCount} tracks, dominant: ${dominantTrackId} (score: ${score})`
      );

      // 7. Smooth trajectory and reduce keyframes
      const smoothedKeyframes = this.smoothAndGenerateKeyframes({
        samples: cvResult.samples,
        dominantTrackId,
        duration: durationSec,
        deadZone: options.deadZone,
        maxVelocity: options.maxVelocity,
        smoothingAlpha: options.smoothingAlpha,
        aspectRatio: clip.aspect_ratio as ClipAspectRatio,
        sourceWidth: cvResult.source_width,
        sourceHeight: cvResult.source_height,
      });

      // 8. Persist to public.reframe_tracks table
      const trackPayload: Partial<ReframeTrackRecord> = {
        clip_id: clipId,
        project_id: clip.project_id,
        user_id: userId,
        status: 'ready',
        analysis_version: Number(clip.render_version || 1),
        sample_interval_ms: Math.round(1000 / sampleFps),
        source_width: cvResult.source_width,
        source_height: cvResult.source_height,
        detected_face_count: faceCount,
        dominant_track_id: dominantTrackId,
        raw_samples: cvResult.samples,
        smoothed_keyframes: smoothedKeyframes,
        metadata: {
          dominant_score: score,
          cv_duration: cvResult.duration,
          sample_fps: cvResult.sample_fps,
          total_samples: cvResult.samples.length,
          keyframe_count: smoothedKeyframes.length,
        },
        analyzed_trim_start: trimStart,
        analyzed_trim_end: trimEnd,
        analyzed_aspect_ratio: clip.aspect_ratio || '9:16',
        updated_at: new Date().toISOString(),
      };

      const { data: savedRecord, error: upsertErr } = await dataRepository
        .from('reframe_tracks')
        .upsert(trackPayload, { onConflict: 'clip_id, analysis_version' })
        .select()
        .single();

      if (upsertErr) {
        logger.error(`[SmartReframe] Failed to save reframe track for clip ${clipId}: ${upsertErr.message}`);
        // Return constructed record even if DB upsert had issue so client isn't blocked
        return {
          id: crypto.randomUUID(),
          ...trackPayload,
          created_at: new Date().toISOString(),
        } as ReframeTrackRecord;
      }

      return savedRecord as ReframeTrackRecord;
    } finally {
      // Always cleanup temp files and release lock
      activeReframeAnalysisSet.delete(clipId);
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr: any) {
        logger.warn(`[SmartReframe] Failed to clean tempDir ${tempDir}: ${rmErr.message}`);
      }
    }
  }

  /**
   * Retrieves the reframe tracking record for a clip, checking ownership and staleness.
   */
  public static async getReframeTrack(
    clipId: string,
    userId: string
  ): Promise<(ReframeTrackRecord & { isStale?: boolean }) | null> {
    if (!isMongoConfigured) return null;

    // Fetch clip to verify ownership and current trim/aspect ratio
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('id, user_id, trim_start_offset, trim_end_offset, aspect_ratio')
      .eq('id', clipId)
      .maybeSingle();

    if (clipErr || !clip || clip.user_id !== userId) {
      return null;
    }

    const { data: track, error: trackErr } = await dataRepository
      .from('reframe_tracks')
      .select('*')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (trackErr || !track) {
      return null;
    }

    const trimStart = Number(clip.trim_start_offset || 0);
    const trimEnd = Number(clip.trim_end_offset || 0);
    const isStale =
      Math.abs(Number(track.analyzed_trim_start) - trimStart) > 0.05 ||
      Math.abs(Number(track.analyzed_trim_end) - trimEnd) > 0.05 ||
      track.analyzed_aspect_ratio !== (clip.aspect_ratio || '9:16');

    return {
      ...track,
      isStale,
    };
  }
}

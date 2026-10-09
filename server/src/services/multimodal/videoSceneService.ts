import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../utils/logger.js';
import { VideoSceneCut, VideoKeyframe } from '../../types/index.js';

const execFileAsync = promisify(execFile);

/**
 * Phase 16: Video Scene Service
 * Detects visual scene cuts and extracts bounded keyframes using local FFmpeg.
 * All temporary files are guaranteed to be cleaned up.
 */
export class VideoSceneService {
  /**
   * Resolves the FFmpeg binary path.
   */
  public static getFfmpegPath(): string {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }
    // Check ffmpeg-static npm package if present
    try {
      const ffmpegStaticPath = path.resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe');
      if (fs.existsSync(ffmpegStaticPath)) return ffmpegStaticPath;
      const ffmpegStaticUnix = path.resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
      if (fs.existsSync(ffmpegStaticUnix)) return ffmpegStaticUnix;
    } catch {}

    const candidates = [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      'ffmpeg',
    ];
    for (const c of candidates) {
      if (c.startsWith('/') && fs.existsSync(c)) {
        return c;
      }
    }
    return 'ffmpeg';
  }

  /**
   * Detects visual scene change cuts using FFmpeg's scene change filter.
   * Returns list of cut timestamps and cut confidence scores.
   */
  public static async detectSceneCuts(
    videoPath: string,
    threshold = 0.25,
    timeoutMs = 90000
  ): Promise<VideoSceneCut[]> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found for scene cut detection: ${videoPath}`);
    }

    const ffmpegBin = this.getFfmpegPath();
    const args = [
      '-nostdin',
      '-hide_banner',
      '-i',
      videoPath,
      '-vf',
      `select='gt(scene,${threshold})',metadata=print:key=lavfi.scene_score`,
      '-f',
      'null',
      '-',
    ];

    try {
      const { stderr } = await execFileAsync(ffmpegBin, args, {
        timeout: timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
      });

      return this.parseSceneCutOutput(stderr);
    } catch (err: any) {
      // In FFmpeg, output may still be in err.stderr if non-zero exit or normal stderr logging
      if (err.stderr) {
        const cuts = this.parseSceneCutOutput(err.stderr);
        if (cuts.length > 0) return cuts;
      }
      logger.warn(`[VideoSceneService] FFmpeg scene detection returned warning: ${err.message}`);
      return [];
    }
  }

  /**
   * Parses FFmpeg metadata print output for scene cuts.
   */
  public static parseSceneCutOutput(rawOutput: string): VideoSceneCut[] {
    const cuts: VideoSceneCut[] = [];
    const lines = rawOutput.split('\n');

    let currentPtsTime: number | null = null;

    for (const line of lines) {
      const ptsMatch = line.match(/pts_time:([0-9.]+)/);
      if (ptsMatch) {
        currentPtsTime = parseFloat(ptsMatch[1]);
      }

      const scoreMatch = line.match(/lavfi\.scene_score=([0-9.]+)/);
      if (scoreMatch && currentPtsTime !== null) {
        const score = parseFloat(scoreMatch[1]);
        if (Number.isFinite(currentPtsTime) && Number.isFinite(score)) {
          cuts.push({
            timestamp: Math.round(currentPtsTime * 1000) / 1000,
            score: Math.round(score * 1000) / 1000,
          });
        }
        currentPtsTime = null;
      }
    }

    // Deduplicate scene cuts that are too close (within 0.5s)
    const deduped: VideoSceneCut[] = [];
    for (const cut of cuts) {
      if (deduped.length === 0 || cut.timestamp - deduped[deduped.length - 1].timestamp >= 0.4) {
        deduped.push(cut);
      }
    }

    return deduped;
  }

  /**
   * Extracts bounded keyframes for scene cuts or at regular intervals.
   * Caps to maxKeyframes (default 24), scaled to 640x360 for light storage and fast OCR.
   * Temp directory is automatically managed and returned paths can be read before cleanup.
   */
  public static async extractKeyframes(params: {
    videoPath: string;
    timestamps?: number[];
    maxKeyframes?: number;
    videoDuration?: number;
    targetDir?: string;
    width?: number;
    height?: number;
  }): Promise<{ keyframes: VideoKeyframe[]; tempDir: string; cleanup: () => void }> {
    const {
      videoPath,
      timestamps,
      maxKeyframes = 24,
      videoDuration = 60,
      width = 640,
      height = 360,
    } = params;

    const ffmpegBin = this.getFfmpegPath();
    const tag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const rawTempDir = params.targetDir || path.join(os.tmpdir(), `vireo-keyframes-${tag}`);
    fs.mkdirSync(rawTempDir, { recursive: true });
    // Resolve canonical path to prevent symlink resolution issues on macOS /tmp -> /private/tmp
    const tempDir = fs.realpathSync(rawTempDir);

    // Determine target sample timestamps
    let sampleTimes: number[] = [];
    if (timestamps && timestamps.length > 0) {
      sampleTimes = [...timestamps].filter((t) => t >= 0 && t <= videoDuration);
    }

    // If too few scene cuts or not provided, sample evenly across duration
    if (sampleTimes.length === 0) {
      const step = Math.max(1, videoDuration / Math.min(maxKeyframes, 12));
      for (let t = 0.5; t < videoDuration; t += step) {
        sampleTimes.push(Math.round(t * 100) / 100);
      }
    }

    // Cap to maxKeyframes
    if (sampleTimes.length > maxKeyframes) {
      const stride = Math.ceil(sampleTimes.length / maxKeyframes);
      sampleTimes = sampleTimes.filter((_, idx) => idx % stride === 0).slice(0, maxKeyframes);
    }

    const keyframes: VideoKeyframe[] = [];

    for (let i = 0; i < sampleTimes.length; i++) {
      const time = sampleTimes[i];
      const frameFilename = `frame_${i.toString().padStart(3, '0')}_${Math.round(time * 10)}.jpg`;
      const framePath = path.join(tempDir, frameFilename);

      try {
        await execFileAsync(
          ffmpegBin,
          [
            '-nostdin',
            '-y',
            '-ss',
            time.toFixed(3),
            '-i',
            videoPath,
            '-frames:v',
            '1',
            '-update',
            '1',
            '-s',
            `${width}x${height}`,
            framePath,
          ],
          { timeout: 15000 }
        );

        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 0) {
          keyframes.push({
            timestamp: time,
            frame_path: framePath,
            scene_index: i,
          });
        }
      } catch (fErr: any) {
        logger.warn(`[VideoSceneService] Failed to extract keyframe at ${time}s: ${fErr.message}`);
      }
    }

    const cleanup = () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr: any) {
        logger.warn(`[VideoSceneService] Failed to remove tempDir ${tempDir}: ${rmErr.message}`);
      }
    };

    return { keyframes, tempDir, cleanup };
  }

  /**
   * Deterministically calculates visual activity score (0–100) for a given time window
   * based on scene cut frequency and visual motion density.
   */
  public static calculateVisualActivityScore(
    windowStart: number,
    windowEnd: number,
    sceneCuts: VideoSceneCut[]
  ): number {
    const duration = Math.max(0.1, windowEnd - windowStart);
    const cutsInWindow = sceneCuts.filter(
      (c) => c.timestamp >= windowStart && c.timestamp <= windowEnd
    );

    // Baseline: short-form videos typically have a cut every 2.5–5 seconds (0.2–0.4 cuts/sec)
    const cutsPerSecond = cutsInWindow.length / duration;

    // Weight cut frequency:
    // 0 cuts: score 45 (talking head / static camera)
    // 1 cut per 5s (0.2/s): score 65
    // 1 cut per 3s (0.33/s): score 80
    // 1 cut per 2s (0.5/s): score 95
    let score = 45;
    if (cutsPerSecond > 0) {
      score = Math.min(100, Math.round(45 + Math.min(cutsPerSecond / 0.5, 1.0) * 50));
    }

    // Boost slightly if cuts have high intensity score
    const avgCutIntensity =
      cutsInWindow.length > 0
        ? cutsInWindow.reduce((acc, c) => acc + c.score, 0) / cutsInWindow.length
        : 0;
    if (avgCutIntensity > 0.4) {
      score = Math.min(100, score + 5);
    }

    return Math.max(0, Math.min(100, score));
  }
}

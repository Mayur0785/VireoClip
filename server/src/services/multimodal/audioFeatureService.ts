import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../utils/logger.js';
import { AudioSilenceInterval } from '../../types/index.js';
import { VideoSceneService } from './videoSceneService.js';

const execFileAsync = promisify(execFile);

export interface AudioVolumeStats {
  mean_volume_db: number;
  max_volume_db: number;
  energy_score: number; // 0–100 normalized score
}

/**
 * Phase 16: Audio Feature Service
 * Extracts audio silence intervals and loudness/energy metrics using FFmpeg.
 * Provides boundary snapping to natural conversational pauses.
 */
export class AudioFeatureService {
  /**
   * Runs FFmpeg silencedetect to find all silence intervals (pauses).
   */
  public static async detectSilenceIntervals(
    audioOrVideoPath: string,
    noiseThresholdDb = -30,
    minDurationSec = 0.3,
    timeoutMs = 60000
  ): Promise<AudioSilenceInterval[]> {
    if (!fs.existsSync(audioOrVideoPath)) {
      throw new Error(`Media file not found for silence detection: ${audioOrVideoPath}`);
    }

    const ffmpegBin = VideoSceneService.getFfmpegPath();
    const filter = `silencedetect=noise=${noiseThresholdDb}dB:d=${minDurationSec}`;
    const args = [
      '-nostdin',
      '-hide_banner',
      '-i',
      audioOrVideoPath,
      '-af',
      filter,
      '-f',
      'null',
      '-',
    ];

    try {
      const { stderr } = await execFileAsync(ffmpegBin, args, {
        timeout: timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
      });

      return this.parseSilenceOutput(stderr);
    } catch (err: any) {
      if (err.stderr) {
        const intervals = this.parseSilenceOutput(err.stderr);
        if (intervals.length > 0) return intervals;
      }
      logger.warn(`[AudioFeatureService] Silence detection warning: ${err.message}`);
      return [];
    }
  }

  /**
   * Parses FFmpeg silencedetect output into structured intervals.
   */
  public static parseSilenceOutput(rawOutput: string): AudioSilenceInterval[] {
    const intervals: AudioSilenceInterval[] = [];
    const lines = rawOutput.split('\n');

    let currentStart: number | null = null;

    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
      if (startMatch) {
        currentStart = parseFloat(startMatch[1]);
      }

      const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
      if (endMatch) {
        const end = parseFloat(endMatch[1]);
        const dur = parseFloat(endMatch[2]);
        const start = currentStart !== null ? currentStart : Math.max(0, end - dur);

        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          intervals.push({
            start: Math.round(start * 1000) / 1000,
            end: Math.round(end * 1000) / 1000,
            duration: Math.round(dur * 1000) / 1000,
          });
        }
        currentStart = null;
      }
    }

    return intervals;
  }

  /**
   * Computes audio loudness statistics using FFmpeg volumedetect.
   */
  public static async detectAudioVolume(
    audioOrVideoPath: string,
    timeoutMs = 60000
  ): Promise<AudioVolumeStats> {
    if (!fs.existsSync(audioOrVideoPath)) {
      throw new Error(`Media file not found for volume detection: ${audioOrVideoPath}`);
    }

    const ffmpegBin = VideoSceneService.getFfmpegPath();
    const args = [
      '-nostdin',
      '-hide_banner',
      '-i',
      audioOrVideoPath,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ];

    try {
      const { stderr } = await execFileAsync(ffmpegBin, args, {
        timeout: timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
      });

      return this.parseVolumeOutput(stderr);
    } catch (err: any) {
      if (err.stderr) {
        return this.parseVolumeOutput(err.stderr);
      }
      logger.warn(`[AudioFeatureService] Volume detection warning: ${err.message}`);
      return { mean_volume_db: -24.0, max_volume_db: -6.0, energy_score: 70 };
    }
  }

  /**
   * Parses volumedetect output to extract dB levels and computes 0–100 energy score.
   */
  public static parseVolumeOutput(rawOutput: string): AudioVolumeStats {
    let meanVolume = -24.0;
    let maxVolume = -6.0;

    const meanMatch = rawOutput.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/);
    if (meanMatch) {
      meanVolume = parseFloat(meanMatch[1]);
    }

    const maxMatch = rawOutput.match(/max_volume:\s*(-?[0-9.]+)\s*dB/);
    if (maxMatch) {
      maxVolume = parseFloat(maxMatch[1]);
    }

    // Standard broadcast/web speech target: mean_volume around -24dB to -14dB
    // If mean_volume is too low (e.g. < -40dB), energy is low
    // If mean_volume is between -24dB and -12dB, energy is ideal (80–95)
    let energyScore = 70;
    if (meanVolume > -16) {
      energyScore = 90;
    } else if (meanVolume >= -26) {
      energyScore = 80;
    } else if (meanVolume >= -35) {
      energyScore = 60;
    } else {
      energyScore = 35;
    }

    // Boost if healthy dynamic range without clipping (maxVolume between -3dB and -0.5dB)
    if (maxVolume >= -6 && maxVolume <= -1) {
      energyScore = Math.min(100, energyScore + 8);
    }

    return {
      mean_volume_db: Math.round(meanVolume * 10) / 10,
      max_volume_db: Math.round(maxVolume * 10) / 10,
      energy_score: Math.min(100, Math.max(0, energyScore)),
    };
  }

  /**
   * Refines a boundary (start or end) by snapping to a nearby natural silence/pause.
   * Prevents jarring mid-syllable cuts.
   *
   * For start boundary: snaps forward to the end of a silence pause that covers or precedes the start.
   * For end boundary: snaps backward to the start of a silence pause that follows or covers the end.
   */
  public static snapBoundaryToSilence(params: {
    targetSecond: number;
    silenceIntervals: AudioSilenceInterval[];
    type: 'start' | 'end';
    maxToleranceSec?: number;
  }): { snappedSecond: number; wasSnapped: boolean } {
    const { targetSecond, silenceIntervals, type, maxToleranceSec = 1.0 } = params;

    if (!silenceIntervals || silenceIntervals.length === 0) {
      return { snappedSecond: targetSecond, wasSnapped: false };
    }

    if (type === 'start') {
      // Find a silence interval whose end is within [targetSecond - maxToleranceSec, targetSecond + maxToleranceSec]
      // Preferably starting speech right when silence ends
      let bestCandidate: number | null = null;
      let minDistance = Infinity;

      for (const silence of silenceIntervals) {
        // If target falls inside silence, speech starts at silence.end
        if (targetSecond >= silence.start && targetSecond <= silence.end) {
          return { snappedSecond: silence.end, wasSnapped: true };
        }

        const dist = Math.abs(silence.end - targetSecond);
        if (dist <= maxToleranceSec && dist < minDistance) {
          minDistance = dist;
          bestCandidate = silence.end;
        }
      }

      if (bestCandidate !== null) {
        return { snappedSecond: bestCandidate, wasSnapped: true };
      }
    } else {
      // For end boundary: find silence interval whose start is within tolerance
      let bestCandidate: number | null = null;
      let minDistance = Infinity;

      for (const silence of silenceIntervals) {
        // If target falls inside silence, clip can cleanly conclude at silence.start
        if (targetSecond >= silence.start && targetSecond <= silence.end) {
          return { snappedSecond: silence.start, wasSnapped: true };
        }

        const dist = Math.abs(silence.start - targetSecond);
        if (dist <= maxToleranceSec && dist < minDistance) {
          minDistance = dist;
          bestCandidate = silence.start;
        }
      }

      if (bestCandidate !== null) {
        return { snappedSecond: bestCandidate, wasSnapped: true };
      }
    }

    return { snappedSecond: targetSecond, wasSnapped: false };
  }
}

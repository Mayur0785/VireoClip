import fs from 'node:fs';
import { logger } from '../../utils/logger.js';
import { FacePresenceInterval } from '../../types/index.js';
import { SmartReframeService } from '../smartReframeService.js';

export interface FaceAnalysisResult {
  face_presence_ratio: number; // 0.0 to 1.0 (fraction of sampled frames with >= 1 face)
  intervals: FacePresenceInterval[];
  sample_count: number;
}

/**
 * Phase 16: Face Feature Service
 * Uses local OpenCV Haar Cascade through SmartReframeService to evaluate face presence.
 * Strictly checks visual presence and camera framing. Zero biometric identification.
 */
export class FaceFeatureService {
  /**
   * Analyzes face presence throughout the video file at a lightweight sampling rate (1.0 - 2.0 fps).
   */
  public static async analyzeFacePresence(
    videoPath: string,
    videoDuration: number,
    sampleFps = 1.0,
    timeoutMs = 90000
  ): Promise<FaceAnalysisResult> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found for face presence analysis: ${videoPath}`);
    }

    try {
      const cvResult = await SmartReframeService.runCvAnalyzer(
        videoPath,
        sampleFps,
        0,
        videoDuration,
        timeoutMs
      );

      const samples = cvResult.samples || [];
      if (samples.length === 0) {
        return {
          face_presence_ratio: 0,
          intervals: [],
          sample_count: 0,
        };
      }

      let faceSampleCount = 0;
      const intervals: FacePresenceInterval[] = [];

      let currentIntervalStart: number | null = null;
      let intervalConfidences: number[] = [];

      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const hasFace = Array.isArray(sample.faces) && sample.faces.length > 0;

        if (hasFace) {
          faceSampleCount++;
          const maxConf = Math.max(...sample.faces.map((f: any) => f.confidence || 0.85));

          if (currentIntervalStart === null) {
            currentIntervalStart = sample.time;
            intervalConfidences = [maxConf];
          } else {
            intervalConfidences.push(maxConf);
          }
        } else {
          if (currentIntervalStart !== null) {
            const endTime = samples[i - 1]?.time || currentIntervalStart;
            const avgConf =
              intervalConfidences.reduce((a, b) => a + b, 0) / intervalConfidences.length;
            intervals.push({
              start: Math.round(currentIntervalStart * 100) / 100,
              end: Math.round(endTime * 100) / 100,
              dominant_face_ratio: 1.0,
              average_confidence: Math.round(avgConf * 100) / 100,
            });
            currentIntervalStart = null;
            intervalConfidences = [];
          }
        }
      }

      // Close open interval at the end
      if (currentIntervalStart !== null && samples.length > 0) {
        const endTime = samples[samples.length - 1].time;
        const avgConf =
          intervalConfidences.reduce((a, b) => a + b, 0) / intervalConfidences.length;
        intervals.push({
          start: Math.round(currentIntervalStart * 100) / 100,
          end: Math.round(endTime * 100) / 100,
          dominant_face_ratio: 1.0,
          average_confidence: Math.round(avgConf * 100) / 100,
        });
      }

      const presenceRatio = Math.round((faceSampleCount / samples.length) * 1000) / 1000;

      return {
        face_presence_ratio: presenceRatio,
        intervals,
        sample_count: samples.length,
      };
    } catch (err: any) {
      logger.warn(`[FaceFeatureService] Face detection notice: ${err.message}`);
      return {
        face_presence_ratio: 0,
        intervals: [],
        sample_count: 0,
      };
    }
  }

  /**
   * Checks whether a specific time window has face presence.
   */
  public static hasFaceInWindow(
    windowStart: number,
    windowEnd: number,
    intervals: FacePresenceInterval[]
  ): { hasFace: boolean; confidence: number } {
    const overlapping = intervals.filter(
      (int) => Math.max(windowStart, int.start) < Math.min(windowEnd, int.end)
    );

    if (overlapping.length === 0) {
      return { hasFace: false, confidence: 0 };
    }

    const avgConf =
      overlapping.reduce((a, b) => a + b.average_confidence, 0) / overlapping.length;

    return {
      hasFace: true,
      confidence: Math.round(avgConf * 100) / 100,
    };
  }
}

import crypto from 'node:crypto';
import { dataRepository } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import {
  MultimodalTimeline,
  MultimodalTimelineSegment,
  VideoAnalysisRecord,
  VideoSceneCut,
  VideoKeyframe,
  AudioSilenceInterval,
  FacePresenceInterval,
  TranscriptSegment,
} from '../../types/index.js';
import { VideoSceneService } from './videoSceneService.js';
import { FaceFeatureService } from './faceFeatureService.js';

export interface FuseTimelineOptions {
  projectId: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
  sceneCuts: VideoSceneCut[];
  keyframes: VideoKeyframe[];
  silenceIntervals: AudioSilenceInterval[];
  faceIntervals: FacePresenceInterval[];
  audioEnergyDb?: number;
  facePresenceRatio?: number;
  ocrStatus?: 'detected' | 'empty' | 'NOT_CONFIGURED';
}

/**
 * Phase 16: Multimodal Timeline Service
 * Synthesizes visual, auditory, and transcript signals into a unified timeline.
 * Stores and queries multimodal analyses from MongoDB.
 */
export class MultimodalTimelineService {
  /**
   * Fuses all multimodal components into a structured MultimodalTimeline.
   */
  public static fuseTimeline(options: FuseTimelineOptions): MultimodalTimeline {
    const {
      projectId,
      durationSeconds,
      segments,
      sceneCuts,
      keyframes,
      silenceIntervals,
      faceIntervals,
      audioEnergyDb = -24.0,
      facePresenceRatio = 0,
      ocrStatus = 'empty',
    } = options;

    const timelineSegments: MultimodalTimelineSegment[] = [];

    let totalVisualActivity = 0;

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      const start = Number(seg.start.toFixed(3));
      const end = Number(seg.end.toFixed(3));

      // 1. Scene cuts in this segment
      const cutsInSeg = sceneCuts.filter((c) => c.timestamp >= start && c.timestamp <= end);

      // 2. Visual activity score (0–100)
      const visualActivity = VideoSceneService.calculateVisualActivityScore(start, end, sceneCuts);
      totalVisualActivity += visualActivity;

      // 3. Face presence check
      const faceInfo = FaceFeatureService.hasFaceInWindow(start, end, faceIntervals);

      // 4. Check for keyframe OCR in this segment
      const keyframesInSeg = keyframes.filter((k) => k.timestamp >= start && k.timestamp <= end);
      const ocrTexts = keyframesInSeg
        .map((k) => k.ocr_text)
        .filter((t): t is string => Boolean(t && t.length > 0));
      const ocrDetectedText = ocrTexts.length > 0 ? ocrTexts.join(' | ') : undefined;

      // 5. Silence boundary alignment
      const hasSilenceAtStart = silenceIntervals.some(
        (s) => Math.abs(s.end - start) <= 0.6 || (start >= s.start && start <= s.end)
      );
      const hasSilenceAtEnd = silenceIntervals.some(
        (s) => Math.abs(s.start - end) <= 0.6 || (end >= s.start && end <= s.end)
      );

      timelineSegments.push({
        start,
        end,
        transcript_text: seg.text,
        transcript_words: seg.words,
        scene_cut_count: cutsInSeg.length,
        visual_activity_score: visualActivity,
        has_face_presence: faceInfo.hasFace,
        face_confidence: faceInfo.confidence,
        ocr_detected_text: ocrDetectedText,
        audio_energy_db: audioEnergyDb,
        has_silence_boundary_start: hasSilenceAtStart,
        has_silence_boundary_end: hasSilenceAtEnd,
        speaker_label: 'speaker_unknown', // Zero fabrication
        object_status: 'NOT_CONFIGURED',   // Zero fabrication
        ocr_status: ocrStatus,
      });
    }

    // Silence ratio across the entire video
    const totalSilenceSec = silenceIntervals.reduce((acc, s) => acc + s.duration, 0);
    const silenceRatio =
      durationSeconds > 0
        ? Math.round((totalSilenceSec / durationSeconds) * 1000) / 1000
        : 0;

    const avgVisualActivity =
      segments.length > 0 ? Math.round(totalVisualActivity / segments.length) : 50;

    return {
      project_id: projectId,
      duration_seconds: durationSeconds,
      scene_cuts: sceneCuts,
      silence_intervals: silenceIntervals,
      face_intervals: faceIntervals,
      segments: timelineSegments,
      keyframes,
      summary_metadata: {
        total_scene_cuts: sceneCuts.length,
        average_visual_activity: avgVisualActivity,
        silence_ratio: Math.min(1.0, silenceRatio),
        face_presence_ratio: facePresenceRatio,
        ocr_status: ocrStatus,
      },
    };
  }

  /**
   * Persists the generated multimodal analysis to MongoDB.
   */
  public static async persistAnalysis(params: {
    projectId: string;
    userId: string;
    timeline: MultimodalTimeline;
  }): Promise<VideoAnalysisRecord> {
    const { projectId, userId, timeline } = params;

    const payload: Partial<VideoAnalysisRecord> = {
      project_id: projectId,
      user_id: userId,
      status: 'completed',
      timeline,
      metadata: {
        analyzed_at: new Date().toISOString(),
        duration_seconds: timeline.duration_seconds,
        segment_count: timeline.segments.length,
      },
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await dataRepository
      .from('video_analyses')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error: updateErr } = await dataRepository
        .from('video_analyses')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) {
        throw new Error(`Failed to update video analysis: ${updateErr.message}`);
      }
      return updated as VideoAnalysisRecord;
    } else {
      const newId = crypto.randomUUID();
      const insertPayload = {
        id: newId,
        ...payload,
        created_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertErr } = await dataRepository
        .from('video_analyses')
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        throw new Error(`Failed to insert video analysis: ${insertErr.message}`);
      }
      return inserted as VideoAnalysisRecord;
    }
  }

  /**
   * Retrieves multimodal analysis for a project, verifying ownership.
   */
  public static async getAnalysis(
    projectId: string,
    userId: string
  ): Promise<VideoAnalysisRecord | null> {
    const { data, error } = await dataRepository
      .from('video_analyses')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.warn(`[MultimodalTimelineService] Fetch analysis error: ${error.message}`);
      return null;
    }
    return (data as VideoAnalysisRecord) || null;
  }
}

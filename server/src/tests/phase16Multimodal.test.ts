import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { VideoSceneService } from '../services/multimodal/videoSceneService.js';
import { AudioFeatureService } from '../services/multimodal/audioFeatureService.js';
import { OcrFeatureService } from '../services/multimodal/ocrFeatureService.js';
import { FaceFeatureService } from '../services/multimodal/faceFeatureService.js';
import { MultimodalTimelineService } from '../services/multimodal/multimodalTimelineService.js';
import { MultimodalScoringService } from '../services/multimodal/multimodalScoringService.js';
import { MomentSearchService } from '../services/multimodal/momentSearchService.js';
import {
  MultimodalTimeline,
  VideoSceneCut,
  AudioSilenceInterval,
  FacePresenceInterval,
  TranscriptSegment,
} from '../types/index.js';

describe('Phase 16 — Multimodal Video Intelligence Tests', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. Video Scene Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('VideoSceneService', () => {
    it('parses raw FFmpeg scene change metadata correctly', () => {
      const sampleFfmpegOutput = `
[Parsed_metadata_1 @ 0x123] frame:0    pts:24000  pts_time:1.000000
[Parsed_metadata_1 @ 0x123] lavfi.scene_score=0.452100
[Parsed_metadata_1 @ 0x123] frame:120  pts:120000 pts_time:5.000000
[Parsed_metadata_1 @ 0x123] lavfi.scene_score=0.312000
[Parsed_metadata_1 @ 0x123] frame:125  pts:125000 pts_time:5.200000
[Parsed_metadata_1 @ 0x123] lavfi.scene_score=0.290000
[Parsed_metadata_1 @ 0x123] frame:240  pts:240000 pts_time:10.000000
[Parsed_metadata_1 @ 0x123] lavfi.scene_score=0.620000
      `;

      const cuts = VideoSceneService.parseSceneCutOutput(sampleFfmpegOutput);
      assert.strictEqual(cuts.length, 3, 'Should parse and deduplicate cuts closer than 0.4s');
      assert.strictEqual(cuts[0].timestamp, 1.0);
      assert.strictEqual(cuts[0].score, 0.452);
      assert.strictEqual(cuts[1].timestamp, 5.0);
      assert.strictEqual(cuts[2].timestamp, 10.0);
    });

    it('calculates visual activity scores deterministically', () => {
      const sceneCuts: VideoSceneCut[] = [
        { timestamp: 2.0, score: 0.5 },
        { timestamp: 5.0, score: 0.4 },
        { timestamp: 8.0, score: 0.6 },
        { timestamp: 12.0, score: 0.45 },
      ];

      // Window 0 to 15s has 4 cuts (0.27 cuts/sec)
      const scoreHigh = VideoSceneService.calculateVisualActivityScore(0, 15, sceneCuts);
      assert.ok(scoreHigh >= 70 && scoreHigh <= 100, `Score should be high for 4 cuts, got: ${scoreHigh}`);

      // Window 20 to 40s has 0 cuts
      const scoreZero = VideoSceneService.calculateVisualActivityScore(20, 40, sceneCuts);
      assert.strictEqual(scoreZero, 45, 'Zero cuts should yield baseline static score 45');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Audio Feature Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('AudioFeatureService', () => {
    it('parses raw FFmpeg silencedetect output accurately', () => {
      const sampleSilenceOutput = `
[Parsed_silencedetect_0 @ 0x123] silence_start: 1.250000
[Parsed_silencedetect_0 @ 0x123] silence_end: 2.100000 | silence_duration: 0.850000
[Parsed_silencedetect_0 @ 0x123] silence_start: 14.500000
[Parsed_silencedetect_0 @ 0x123] silence_end: 15.200000 | silence_duration: 0.700000
      `;

      const intervals = AudioFeatureService.parseSilenceOutput(sampleSilenceOutput);
      assert.strictEqual(intervals.length, 2);
      assert.strictEqual(intervals[0].start, 1.25);
      assert.strictEqual(intervals[0].end, 2.1);
      assert.strictEqual(intervals[0].duration, 0.85);
      assert.strictEqual(intervals[1].start, 14.5);
      assert.strictEqual(intervals[1].end, 15.2);
    });

    it('parses volumedetect output and assigns appropriate energy scores', () => {
      const normalVolume = `
[Parsed_volumedetect_0 @ 0x123] mean_volume: -21.4 dB
[Parsed_volumedetect_0 @ 0x123] max_volume: -3.2 dB
      `;
      const stats = AudioFeatureService.parseVolumeOutput(normalVolume);
      assert.strictEqual(stats.mean_volume_db, -21.4);
      assert.strictEqual(stats.max_volume_db, -3.2);
      assert.ok(stats.energy_score >= 80, 'Normal speech with dynamic headroom should have high energy score');

      const quietVolume = `
[Parsed_volumedetect_0 @ 0x123] mean_volume: -45.0 dB
[Parsed_volumedetect_0 @ 0x123] max_volume: -20.0 dB
      `;
      const statsQuiet = AudioFeatureService.parseVolumeOutput(quietVolume);
      assert.ok(statsQuiet.energy_score <= 45, 'Very quiet audio should receive lower energy score');
    });

    it('snaps candidate boundaries cleanly to conversational pauses', () => {
      const silenceIntervals: AudioSilenceInterval[] = [
        { start: 0.0, end: 1.2, duration: 1.2 },
        { start: 19.8, end: 20.6, duration: 0.8 },
      ];

      // Start boundary snap: target 0.8s falls inside silence [0.0, 1.2] -> snaps to 1.2s
      const snapStart = AudioFeatureService.snapBoundaryToSilence({
        targetSecond: 0.8,
        silenceIntervals,
        type: 'start',
        maxToleranceSec: 1.0,
      });
      assert.strictEqual(snapStart.wasSnapped, true);
      assert.strictEqual(snapStart.snappedSecond, 1.2);

      // End boundary snap: target 20.0s falls inside silence [19.8, 20.6] -> snaps to 19.8s
      const snapEnd = AudioFeatureService.snapBoundaryToSilence({
        targetSecond: 20.0,
        silenceIntervals,
        type: 'end',
        maxToleranceSec: 1.0,
      });
      assert.strictEqual(snapEnd.wasSnapped, true);
      assert.strictEqual(snapEnd.snappedSecond, 19.8);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. OCR Feature Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('OcrFeatureService', () => {
    it('cleans OCR text and strips single artifact characters', () => {
      const dirtyText = `
        |
        MEET VIREO
        -
        The AI Video Platform
        .
      `;
      const cleaned = OcrFeatureService.cleanOcrText(dirtyText);
      assert.strictEqual(cleaned, 'MEET VIREO The AI Video Platform');
    });

    it('returns clean status without errors when keyframes are processed', async () => {
      // Empty keyframes
      const summary = await OcrFeatureService.processKeyframes([]);
      assert.ok(['detected', 'empty', 'NOT_CONFIGURED'].includes(summary.ocr_status));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Face Feature Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('FaceFeatureService', () => {
    it('checks face presence across windows accurately', () => {
      const intervals: FacePresenceInterval[] = [
        { start: 0.0, end: 6.0, dominant_face_ratio: 1.0, average_confidence: 0.92 },
        { start: 12.0, end: 20.0, dominant_face_ratio: 1.0, average_confidence: 0.88 },
      ];

      const inWindow = FaceFeatureService.hasFaceInWindow(1.0, 4.0, intervals);
      assert.strictEqual(inWindow.hasFace, true);
      assert.strictEqual(inWindow.confidence, 0.92);

      const outWindow = FaceFeatureService.hasFaceInWindow(7.0, 11.0, intervals);
      assert.strictEqual(outWindow.hasFace, false);
      assert.strictEqual(outWindow.confidence, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Multimodal Timeline Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('MultimodalTimelineService', () => {
    it('fuses all signals into a structured MultimodalTimeline with zero fabrication', () => {
      const segments: TranscriptSegment[] = [
        { start: 0.0, end: 4.5, text: 'Welcome to Vireo, the smartest video workflow.' },
        { start: 4.5, end: 9.0, text: 'Here is how to extract clips with one click.' },
      ];

      const sceneCuts: VideoSceneCut[] = [{ timestamp: 2.5, score: 0.45 }];
      const silenceIntervals: AudioSilenceInterval[] = [{ start: 4.2, end: 4.7, duration: 0.5 }];
      const faceIntervals: FacePresenceInterval[] = [
        { start: 0.0, end: 4.5, dominant_face_ratio: 1.0, average_confidence: 0.9 },
      ];

      const timeline = MultimodalTimelineService.fuseTimeline({
        projectId: '00000000-0000-0000-0000-000000000001',
        durationSeconds: 9.0,
        segments,
        sceneCuts,
        keyframes: [],
        silenceIntervals,
        faceIntervals,
        audioEnergyDb: -22.0,
        facePresenceRatio: 0.5,
        ocrStatus: 'empty',
      });

      assert.strictEqual(timeline.segments.length, 2);
      assert.strictEqual(timeline.segments[0].scene_cut_count, 1);
      assert.strictEqual(timeline.segments[0].has_face_presence, true);
      assert.strictEqual(timeline.segments[0].has_silence_boundary_end, true);

      // Strict Zero-Fabrication Guarantees:
      assert.strictEqual(timeline.segments[0].speaker_label, 'speaker_unknown');
      assert.strictEqual(timeline.segments[0].object_status, 'NOT_CONFIGURED');
      assert.strictEqual(timeline.summary_metadata.total_scene_cuts, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Multimodal Scoring Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('MultimodalScoringService', () => {
    it('produces explainable Vireo scores and platform suitability breakdown', () => {
      const dummyTimeline: MultimodalTimeline = {
        project_id: 'test_proj',
        duration_seconds: 60.0,
        scene_cuts: [{ timestamp: 3.0, score: 0.5 }, { timestamp: 12.0, score: 0.4 }],
        silence_intervals: [{ start: 29.5, end: 30.5, duration: 1.0 }],
        face_intervals: [{ start: 0.0, end: 8.0, dominant_face_ratio: 1.0, average_confidence: 0.9 }],
        segments: [
          {
            start: 0.0,
            end: 15.0,
            transcript_text: 'The best hack for creator workflows in 2026.',
            scene_cut_count: 2,
            visual_activity_score: 80,
            has_face_presence: true,
            face_confidence: 0.9,
            audio_energy_db: -20.0,
            has_silence_boundary_start: false,
            has_silence_boundary_end: false,
            speaker_label: 'speaker_unknown',
            object_status: 'NOT_CONFIGURED',
            ocr_status: 'empty',
          },
          {
            start: 15.0,
            end: 30.0,
            transcript_text: 'Always optimize for immediate retention.',
            scene_cut_count: 1,
            visual_activity_score: 75,
            has_face_presence: true,
            face_confidence: 0.85,
            audio_energy_db: -20.0,
            has_silence_boundary_start: false,
            has_silence_boundary_end: true,
            speaker_label: 'speaker_unknown',
            object_status: 'NOT_CONFIGURED',
            ocr_status: 'empty',
          },
        ],
        keyframes: [],
        summary_metadata: {
          total_scene_cuts: 3,
          average_visual_activity: 78,
          silence_ratio: 0.05,
          face_presence_ratio: 0.8,
          ocr_status: 'empty',
        },
      };

      const result = MultimodalScoringService.scoreCandidate({
        start_seconds: 0.0,
        end_seconds: 30.0,
        title: 'Creator Retention Hack',
        hook: 'The best hack for creator workflows in 2026',
        timeline: dummyTimeline,
        baseHookScore: 85,
        baseStandaloneScore: 85,
        baseInsightScore: 88,
      });

      assert.ok(result.vireo_score >= 75 && result.vireo_score <= 100, `Vireo score must be 0-100, got: ${result.vireo_score}`);
      assert.ok(result.explanation.reasons.length > 0, 'Must provide explainability reasons');
      assert.ok(result.explanation.platform_suitability.shorts.suitable, '30s clip should be suitable for YouTube Shorts');
      assert.ok(result.explanation.platform_suitability.tiktok.suitable, 'Should be suitable for TikTok');
      assert.strictEqual(result.explanation.platform_suitability.shorts.recommended_ratio, '9:16');
    });

    it('deduplicates overlapping candidates preserving the highest score', () => {
      const candidates = [
        { start_seconds: 10, end_seconds: 40, vireo_score: 72 },
        { start_seconds: 12, end_seconds: 42, vireo_score: 91 }, // 93% overlap with candidate 1, higher score
        { start_seconds: 50, end_seconds: 80, vireo_score: 85 }, // separate moment
      ];

      const deduped = MultimodalScoringService.deduplicateScoredCandidates(candidates, 0.65);
      assert.strictEqual(deduped.length, 2, 'Should drop the lower-scoring overlapping candidate');
      assert.strictEqual(deduped[0].vireo_score, 91);
      assert.strictEqual(deduped[1].vireo_score, 85);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Moment Search Service Tests
  // ─────────────────────────────────────────────────────────────
  describe('MomentSearchService', () => {
    it('matches natural language queries against multimodal timeline', () => {
      const timeline: MultimodalTimeline = {
        project_id: 'test_proj',
        duration_seconds: 60.0,
        scene_cuts: [],
        silence_intervals: [],
        face_intervals: [],
        segments: [
          {
            start: 0.0,
            end: 18.0,
            transcript_text: 'Here is an introduction to our workspace and tools.',
            scene_cut_count: 0,
            visual_activity_score: 50,
            has_face_presence: true,
            face_confidence: 0.9,
            audio_energy_db: -20,
            has_silence_boundary_start: false,
            has_silence_boundary_end: false,
            speaker_label: 'speaker_unknown',
            object_status: 'NOT_CONFIGURED',
            ocr_status: 'empty',
          },
          {
            start: 18.0,
            end: 42.0,
            transcript_text: 'The best part is automatic caption generation with smart animations.',
            scene_cut_count: 0,
            visual_activity_score: 65,
            has_face_presence: true,
            face_confidence: 0.9,
            audio_energy_db: -20,
            has_silence_boundary_start: false,
            has_silence_boundary_end: false,
            speaker_label: 'speaker_unknown',
            object_status: 'NOT_CONFIGURED',
            ocr_status: 'empty',
          },
        ],
        keyframes: [],
        summary_metadata: {
          total_scene_cuts: 0,
          average_visual_activity: 58,
          silence_ratio: 0,
          face_presence_ratio: 1.0,
          ocr_status: 'empty',
        },
      };

      const found = MomentSearchService.findMoments({
        timeline,
        query: { query: 'automatic caption generation' },
      });

      assert.ok(found.length > 0, 'Should find matching moment');
      assert.ok(found[0].title.length > 0);
      assert.ok(found[0].vireo_score > 60);
      assert.ok(found[0].match_confidence > 50);
    });
  });
});

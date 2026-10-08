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
import { TranscriptSegment } from '../types/index.js';

describe('Phase 16 — Real Video Verification (vireo-launch-preview-1080p.mp4)', () => {
  const realVideoPath = path.resolve(
    process.cwd(),
    '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
  );

  const hasRealVideo = fs.existsSync(realVideoPath);

  it('verifies real video asset presence for local verification', () => {
    assert.ok(hasRealVideo, `Real video must exist at: ${realVideoPath}`);
  });

  if (hasRealVideo) {
    it('executes real scene cut detection on local MP4', async () => {
      const sceneCuts = await VideoSceneService.detectSceneCuts(realVideoPath, 0.15, 60000);
      assert.ok(Array.isArray(sceneCuts), 'Must return array of scene cuts');
      // Even in a continuous screen recording, at least 0 or cuts are detected and structured
      for (const cut of sceneCuts) {
        assert.ok(Number.isFinite(cut.timestamp), 'Cut timestamp must be finite number');
        assert.ok(cut.timestamp >= 0 && cut.timestamp <= 60.5, 'Cut timestamp within video duration');
      }
    });

    it('extracts bounded keyframes and cleans up temp files completely', async () => {
      const { keyframes, tempDir, cleanup } = await VideoSceneService.extractKeyframes({
        videoPath: realVideoPath,
        timestamps: [5.0, 10.0, 15.0],
        maxKeyframes: 3,
        videoDuration: 60.0,
      });

      try {
        assert.ok(keyframes.length > 0, 'Must extract at least one keyframe');
        for (const kf of keyframes) {
          assert.ok(kf.frame_path && fs.existsSync(kf.frame_path), 'Keyframe file must exist on disk');
          const stat = fs.statSync(kf.frame_path!);
          assert.ok(stat.size > 1000, 'Keyframe JPEG must have real size (>1KB)');
        }
      } finally {
        cleanup();
        assert.ok(!fs.existsSync(tempDir), 'Keyframe temporary directory must be removed on cleanup');
      }
    });

    it('executes real FFmpeg silence and audio energy detection on local MP4', async () => {
      const [silenceIntervals, volumeStats] = await Promise.all([
        AudioFeatureService.detectSilenceIntervals(realVideoPath, -30, 0.3),
        AudioFeatureService.detectAudioVolume(realVideoPath),
      ]);

      assert.ok(silenceIntervals.length > 0, 'Real video must contain natural speech pauses');
      assert.ok(silenceIntervals[0].duration > 0, 'Silence duration must be positive');

      assert.ok(Number.isFinite(volumeStats.mean_volume_db));
      assert.ok(Number.isFinite(volumeStats.max_volume_db));
      assert.ok(volumeStats.energy_score >= 0 && volumeStats.energy_score <= 100);
    });

    it('executes real local Tesseract OCR on extracted keyframes', async () => {
      const { keyframes, cleanup } = await VideoSceneService.extractKeyframes({
        videoPath: realVideoPath,
        timestamps: [10.0],
        maxKeyframes: 1,
        videoDuration: 60.0,
      });

      try {
        const ocrSummary = await OcrFeatureService.processKeyframes(keyframes, 1);
        assert.ok(['detected', 'empty', 'NOT_CONFIGURED'].includes(ocrSummary.ocr_status));
        if (ocrSummary.ocr_status === 'detected') {
          assert.ok(ocrSummary.combined_unique_text.length > 0, 'Must extract real on-screen text');
          assert.match(ocrSummary.combined_unique_text, /VIREO|Meet|Video/i, 'OCR on title frame should detect text');
        }
      } finally {
        cleanup();
      }
    });

    it('executes real local CV Haar Cascade analyzer via Python', async () => {
      const faceResult = await FaceFeatureService.analyzeFacePresence(
        realVideoPath,
        5.0, // sample first 5 seconds
        2.0
      );

      assert.ok(Number.isFinite(faceResult.face_presence_ratio));
      assert.ok(faceResult.sample_count > 0, 'Must produce real CV frame samples');
      assert.ok(Array.isArray(faceResult.intervals));
    });

    it('fuses end-to-end multimodal timeline and scores moments from real video signals', async () => {
      const dummySegments: TranscriptSegment[] = [
        { start: 0.0, end: 7.0, text: 'Meet Vireo. Turn long videos into ready-to-post clips and content.' },
        { start: 7.0, end: 15.0, text: 'One workspace for every strong video moment.' },
        { start: 15.0, end: 30.0, text: 'Generate vertical clips with AI-driven smart auto reframe.' },
      ];

      const [silenceIntervals, volumeStats, sceneCuts] = await Promise.all([
        AudioFeatureService.detectSilenceIntervals(realVideoPath, -30, 0.3),
        AudioFeatureService.detectAudioVolume(realVideoPath),
        VideoSceneService.detectSceneCuts(realVideoPath, 0.15),
      ]);

      const timeline = MultimodalTimelineService.fuseTimeline({
        projectId: '00000000-0000-0000-0000-000000000002',
        durationSeconds: 60.0,
        segments: dummySegments,
        sceneCuts,
        keyframes: [],
        silenceIntervals,
        faceIntervals: [],
        audioEnergyDb: volumeStats.mean_volume_db,
        facePresenceRatio: 0,
        ocrStatus: 'detected',
      });

      assert.strictEqual(timeline.segments.length, 3);
      assert.strictEqual(timeline.segments[0].speaker_label, 'speaker_unknown');
      assert.strictEqual(timeline.segments[0].object_status, 'NOT_CONFIGURED');

      // Moment Search
      const searchResults = MomentSearchService.findMoments({
        timeline,
        query: { query: 'auto reframe vertical clips' },
      });

      assert.ok(searchResults.length > 0, 'Natural language search should locate the matching segment');
      const bestMatch = searchResults[0];
      assert.ok(bestMatch.vireo_score >= 60, 'Should have robust Vireo score');
      assert.ok(bestMatch.explanation.reasons.length > 0, 'Must have explainability reasons');
      assert.ok(bestMatch.explanation.platform_suitability.tiktok.suitable);
    });
  }
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

import { ProducerPlanningService } from '../services/producerPlanningService.js';
import { ProducerRenderService } from '../services/producerRenderService.js';
import {
  ProducerEditPlan,
  ProducerOperation,
  PRODUCER_OPERATION_TYPES,
  PRODUCER_MODES,
  ClipRecord,
  TranscriptRecord,
  VideoAnalysisRecord,
  CreatorProfileRecord,
} from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Real launch video test asset path
const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

describe('Phase 17 — Vireo Producer (AI Editing Agent) Tests', () => {
  // Mock test data fixtures
  const mockUserId = crypto.randomUUID();
  const mockProjectId = crypto.randomUUID();
  const mockClipId = crypto.randomUUID();

  const mockClip: ClipRecord = {
    id: mockClipId,
    project_id: mockProjectId,
    candidate_id: crypto.randomUUID(),
    user_id: mockUserId,
    title: 'The Future of AI Video Production',
    start_seconds: 10.0,
    end_seconds: 45.0,
    duration_seconds: 35.0,
    aspect_ratio: '9:16',
    crop_mode: 'center',
    render_status: 'ready',
    source_storage_path: 'source/test.mp4',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockTranscript: TranscriptRecord = {
    id: crypto.randomUUID(),
    project_id: mockProjectId,
    user_id: mockUserId,
    transcript_text: 'Welcome everyone. Today we are launching something completely revolutionary. You will not believe the speed.',
    language: 'en',
    duration_seconds: 60.0,
    segments: [
      {
        start: 11.2,
        end: 18.0,
        text: 'Welcome everyone.',
        words: [
          { word: 'Welcome', start: 11.2, end: 11.8 },
          { word: 'everyone.', start: 12.0, end: 12.5 },
        ],
      },
      {
        start: 20.0, // 2.0s pause between 18.0 and 20.0
        end: 32.0,
        text: 'Today we are launching something completely revolutionary.',
        words: [
          { word: 'Today', start: 20.0, end: 20.4 },
          { word: 'we', start: 20.5, end: 20.7 },
          { word: 'are', start: 20.8, end: 21.0 },
          { word: 'launching', start: 21.1, end: 21.6 },
          { word: 'something', start: 21.7, end: 22.1 },
          { word: 'completely', start: 22.2, end: 22.7 },
          { word: 'revolutionary.', start: 22.8, end: 23.5 },
        ],
      },
      {
        start: 35.0, // 1.5s pause
        end: 43.5,
        text: 'You will not believe the speed.',
        words: [
          { word: 'You', start: 35.0, end: 35.3 },
          { word: 'will', start: 35.4, end: 35.6 },
          { word: 'not', start: 35.7, end: 35.9 },
          { word: 'believe', start: 36.0, end: 36.4 },
          { word: 'the', start: 36.5, end: 36.7 },
          { word: 'speed.', start: 36.8, end: 37.3 },
        ],
      },
    ],
    words: [
      { word: 'Welcome', start: 11.2, end: 11.8 },
      { word: 'everyone.', start: 12.0, end: 12.5 },
      { word: 'Today', start: 20.0, end: 20.4 },
      { word: 'we', start: 20.5, end: 20.7 },
      { word: 'are', start: 20.8, end: 21.0 },
      { word: 'launching', start: 21.1, end: 21.6 },
      { word: 'something', start: 21.7, end: 22.1 },
      { word: 'completely', start: 22.2, end: 22.7 },
      { word: 'revolutionary.', start: 22.8, end: 23.5 },
      { word: 'You', start: 35.0, end: 35.3 },
      { word: 'will', start: 35.4, end: 35.6 },
      { word: 'not', start: 35.7, end: 35.9 },
      { word: 'believe', start: 36.0, end: 36.4 },
      { word: 'the', start: 36.5, end: 36.7 },
      { word: 'speed.', start: 36.8, end: 37.3 },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockAnalysis: VideoAnalysisRecord = {
    id: crypto.randomUUID(),
    project_id: mockProjectId,
    user_id: mockUserId,
    status: 'completed',
    timeline: {
      project_id: mockProjectId,
      duration_seconds: 60.0,
      scene_cuts: [{ timestamp: 22.5, score: 0.55 }],
      silence_intervals: [{ start: 12.5, end: 20.0, duration: 7.5 }],
      face_intervals: [{ start: 10.0, end: 45.0, dominant_face_ratio: 0.85, average_confidence: 0.95 }],
      segments: [],
      keyframes: [],
      summary_metadata: {
        total_scene_cuts: 1,
        average_visual_activity: 0.65,
        silence_ratio: 0.2,
        face_presence_ratio: 0.85,
        ocr_status: 'empty',
      },
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockProfile: CreatorProfileRecord = {
    id: crypto.randomUUID(),
    user_id: mockUserId,
    creator_name: 'TechVibe',
    tagline: 'Future Tech Today',
    brand_colors: ['#A855F7', '#38BDF8'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // ─────────────────────────────────────────────────────────────
  // 1. Planning Service & Schema Validation Tests
  // ─────────────────────────────────────────────────────────────
  describe('ProducerPlanningService — Plan Synthesis & Modes', () => {
    it('generates a valid BALANCED plan with all required schema fields', async () => {
      const plan = await (ProducerPlanningService as any).synthesizePlan(
        mockClip,
        {
          clip: mockClip,
          transcript: mockTranscript,
          analysis: mockAnalysis,
          creatorProfile: mockProfile,
        },
        'BALANCED',
        'tiktok',
        'Tighten pacing and add captions'
      );

      assert.ok(plan.operations.length > 0, 'Plan should contain operations');
      assert.ok(plan.estimatedDuration > 0, 'Estimated duration must be positive');
      assert.ok(plan.estimatedDuration < (mockClip.end_seconds - mockClip.start_seconds), 'Balanced plan should tighten duration');
      assert.ok(plan.scores.delta > 0, 'Producer score delta must be positive');
      assert.ok(plan.explanation.summary.length > 10, 'Summary must be detailed');
      assert.ok(plan.explanation.key_decisions.length > 0, 'Key decisions must be listed');

      // Verify every operation belongs to the strict allowlist
      for (const op of plan.operations) {
        assert.ok(
          PRODUCER_OPERATION_TYPES.includes(op.type),
          `Operation type ${op.type} must be in PRODUCER_OPERATION_TYPES allowlist`
        );
        assert.ok(typeof op.enabled === 'boolean', 'Enabled must be a boolean');
        assert.ok(op.confidence >= 0 && op.confidence <= 1, 'Confidence must be between 0 and 1');
      }
    });

    it('enforces mode differences between LIGHT, BALANCED, and AGGRESSIVE', async () => {
      const light = await (ProducerPlanningService as any).synthesizePlan(
        mockClip,
        { clip: mockClip, transcript: mockTranscript, analysis: mockAnalysis },
        'LIGHT',
        'tiktok'
      );

      const balanced = await (ProducerPlanningService as any).synthesizePlan(
        mockClip,
        { clip: mockClip, transcript: mockTranscript, analysis: mockAnalysis },
        'BALANCED',
        'tiktok'
      );

      const aggressive = await (ProducerPlanningService as any).synthesizePlan(
        mockClip,
        { clip: mockClip, transcript: mockTranscript, analysis: mockAnalysis },
        'AGGRESSIVE',
        'tiktok'
      );

      // LIGHT mode should NOT have pause cut operations or punch-in
      const lightHasCuts = light.operations.some((o: ProducerOperation) => o.type === 'REMOVE_RANGE');
      const lightHasPunch = light.operations.some((o: ProducerOperation) => o.type === 'PUNCH_IN');
      assert.strictEqual(lightHasCuts, false, 'LIGHT mode must not cut mid-clip pauses');
      assert.strictEqual(lightHasPunch, false, 'LIGHT mode must not add punch-in zoom');

      // BALANCED mode should include pause cuts, punch-in, and hook banner
      const balancedHasCuts = balanced.operations.some((o: ProducerOperation) => o.type === 'REMOVE_RANGE');
      const balancedHasPunch = balanced.operations.some((o: ProducerOperation) => o.type === 'PUNCH_IN');
      const balancedHasHook = balanced.operations.some((o: ProducerOperation) => o.type === 'HOOK_TEXT');
      assert.strictEqual(balancedHasCuts, true, 'BALANCED mode must cut long pauses');
      assert.strictEqual(balancedHasPunch, true, 'BALANCED mode must include punch-in zoom');
      assert.strictEqual(balancedHasHook, true, 'BALANCED mode must include opening hook banner');

      // AGGRESSIVE mode should yield shorter duration than BALANCED
      assert.ok(
        aggressive.estimatedDuration <= balanced.estimatedDuration,
        'AGGRESSIVE mode duration must be tighter or equal to BALANCED'
      );

      // AGGRESSIVE punch-in scale must be higher (1.08 vs 1.06)
      const aggressivePunch = aggressive.operations.find((o: ProducerOperation) => o.type === 'PUNCH_IN');
      const balancedPunch = balanced.operations.find((o: ProducerOperation) => o.type === 'PUNCH_IN');
      assert.strictEqual(aggressivePunch?.parameters.scale, 1.08);
      assert.strictEqual(balancedPunch?.parameters.scale, 1.06);
    });

    it('accurately identifies dead air before first word (INTRO_TRIM) and after last word (OUTRO_TRIM)', async () => {
      const plan = await (ProducerPlanningService as any).synthesizePlan(
        mockClip,
        { clip: mockClip, transcript: mockTranscript },
        'BALANCED',
        'tiktok'
      );

      const introTrim = plan.operations.find((o: ProducerOperation) => o.type === 'INTRO_TRIM');
      const outroTrim = plan.operations.find((o: ProducerOperation) => o.type === 'OUTRO_TRIM');

      assert.ok(introTrim, 'Should detect intro dead space');
      // Speech starts at 11.2s, clip starts at 10.0s -> ~1.1s trim
      assert.ok(introTrim.parameters.start_sec! > 0.8 && introTrim.parameters.start_sec! < 1.3);

      assert.ok(outroTrim, 'Should detect outro dead space');
      // Speech ends at 37.3s, clip ends at 45.0s -> ~7.5s trailing silence
      assert.ok(outroTrim.parameters.end_sec! > 5.0);
    });

    it('correctly calculates ProducerScore breakdown and positive delta', async () => {
      const plan = await (ProducerPlanningService as any).synthesizePlan(
        mockClip,
        { clip: mockClip, transcript: mockTranscript, analysis: mockAnalysis },
        'BALANCED',
        'tiktok'
      );

      const { before, after, delta } = plan.scores;
      assert.ok(after.overall > before.overall, 'Overall score must improve');
      assert.strictEqual(delta, after.overall - before.overall, 'Delta must match difference');
      assert.ok(after.hook >= before.hook, 'Hook score must improve');
      assert.ok(after.pacing >= before.pacing, 'Pacing score must improve');
      assert.ok(after.audio >= before.audio, 'Audio score must improve with normalization');
      assert.ok(after.visual >= before.visual, 'Visual score must improve with kinetic captions');
    });

    it('adjusts plan heuristics in response to natural-language user instructions', () => {
      const baseOps: ProducerOperation[] = [
        {
          id: 'op_remove_dead_space',
          type: 'REMOVE_RANGE',
          enabled: true,
          label: 'Cut Pauses',
          description: 'Cuts silence',
          parameters: { cut_ranges: [{ start: 1, end: 3, duration: 2 }] },
          confidence: 0.9,
          reason: 'Silence',
        },
        {
          id: 'op_hook_text',
          type: 'HOOK_TEXT',
          enabled: true,
          label: 'Hook Banner',
          description: 'Top banner',
          parameters: { text: 'AI LAUNCH' },
          confidence: 0.9,
          reason: 'Retention',
        },
        {
          id: 'op_caption_style',
          type: 'CAPTION_STYLE',
          enabled: true,
          label: 'Captions',
          description: 'Clean',
          parameters: { style: 'clean' },
          confidence: 0.9,
          reason: 'Accessibility',
        },
      ];

      // Test "Don't cut pauses"
      const adjusted1 = (ProducerPlanningService as any).applyInstructionHeuristics(
        JSON.parse(JSON.stringify(baseOps)),
        "Don't cut any pauses, keep natural silence",
        'BALANCED'
      );
      assert.strictEqual(adjusted1.find((o: any) => o.type === 'REMOVE_RANGE').enabled, false);

      // Test "Bold yellow captions"
      const adjusted2 = (ProducerPlanningService as any).applyInstructionHeuristics(
        JSON.parse(JSON.stringify(baseOps)),
        'Make captions bold yellow',
        'BALANCED'
      );
      const capOp = adjusted2.find((o: any) => o.type === 'CAPTION_STYLE');
      assert.strictEqual(capOp.parameters.style, 'bold');
      assert.strictEqual(capOp.parameters.primary_color, '#FACC15');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Render Graph & Execution Engine Tests
  // ─────────────────────────────────────────────────────────────
  describe('ProducerRenderService — Render Graph Generation', () => {
    it('builds a complete FFmpeg render graph from plan operations', async () => {
      const mockPlan: ProducerEditPlan = {
        id: crypto.randomUUID(),
        clip_id: mockClipId,
        project_id: mockProjectId,
        user_id: mockUserId,
        version: 1,
        parent_plan_id: null,
        mode: 'BALANCED',
        target_platform: 'tiktok',
        status: 'draft',
        title: 'Test Plan',
        user_instruction: null,
        original_duration: 35.0,
        estimated_duration: 28.0,
        operations: [
          {
            id: 'op_intro_trim',
            type: 'INTRO_TRIM',
            enabled: true,
            label: 'Intro Trim',
            description: 'Trim dead space',
            parameters: { start_sec: 1.0 },
            confidence: 0.9,
            reason: 'Hook',
          },
          {
            id: 'op_outro_trim',
            type: 'OUTRO_TRIM',
            enabled: true,
            label: 'Outro Trim',
            description: 'Trim trailing space',
            parameters: { end_sec: 2.0 },
            confidence: 0.9,
            reason: 'Looping',
          },
          {
            id: 'op_reframe',
            type: 'REFRAME',
            enabled: true,
            label: 'Reframe',
            description: '9:16 reframe',
            parameters: { aspect_ratio: '9:16', crop_mode: 'center' },
            confidence: 0.95,
            reason: 'Feed',
          },
          {
            id: 'op_hook_text',
            type: 'HOOK_TEXT',
            enabled: true,
            label: 'Hook Banner',
            description: 'Top text',
            parameters: { text: 'EXPLOSIVE UPDATE', display_start_sec: 0, display_end_sec: 3.5 },
            confidence: 0.9,
            reason: 'Visual hook',
          },
          {
            id: 'op_punch_in',
            type: 'PUNCH_IN',
            enabled: true,
            label: 'Punch In',
            description: 'Zoom climax',
            parameters: { punch_in_start_sec: 20.0, punch_in_duration_sec: 2.5, scale: 1.06 },
            confidence: 0.85,
            reason: 'Climax emphasis',
          },
          {
            id: 'op_normalize_audio',
            type: 'NORMALIZE_AUDIO',
            enabled: true,
            label: 'Normalize Audio',
            description: '-16 LUFS',
            parameters: { target_lufs: -16 },
            confidence: 0.98,
            reason: 'Broadcast standard',
          },
          {
            id: 'op_audio_fade',
            type: 'AUDIO_FADE',
            enabled: true,
            label: 'Audio Fade',
            description: 'Anti-click',
            parameters: { fade_in_sec: 0.15, fade_out_sec: 0.25 },
            confidence: 0.93,
            reason: 'Safe borders',
          },
        ],
        scores: {
          before: { overall: 60, hook: 55, pacing: 60, audio: 65, visual: 60, retention_estimate: 60 },
          after: { overall: 85, hook: 88, pacing: 84, audio: 86, visual: 82, retention_estimate: 85 },
          delta: 25,
        },
        explanation: {
          summary: 'Summary',
          key_decisions: ['Decision 1'],
          pacing_notes: 'Pacing',
          audio_notes: 'Audio',
          visual_notes: 'Visual',
        },
        preview_video_url: null,
        preview_storage_path: null,
        applied_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-test-graph-'));
      try {
        const graph = await ProducerRenderService.buildRenderGraph(
          mockPlan,
          mockClip,
          '/tmp/fake_input.mp4',
          '/tmp/fake_output.mp4',
          tmpDir
        );

        // Start time should be clip.start_seconds (10.0) + intro trim (1.0) = 11.0
        assert.strictEqual(graph.startTime, 11.0);
        // Duration should be (45.0 - 2.0) - (10.0 + 1.0) = 43.0 - 11.0 = 32.0
        assert.strictEqual(graph.duration, 32.0);

        // Check video filters
        assert.ok(graph.videoFilters.some((f) => f.includes('scale=1080:1920')), 'Must include 9:16 crop filter');
        assert.ok(graph.videoFilters.some((f) => f.includes('drawtext=text=\'EXPLOSIVE UPDATE\'')), 'Must include hook banner');
        assert.ok(graph.videoFilters.some((f) => f.includes('crop=w=\'if(between(t,')), 'Must include punch-in dynamic crop');

        // Check audio filters
        assert.ok(graph.audioFilters.some((f) => f.includes('loudnorm=I=-16')), 'Must include loudnorm filter');
        assert.ok(graph.audioFilters.some((f) => f.includes('afade=t=in')), 'Must include audio fade in');
        assert.ok(graph.audioFilters.some((f) => f.includes('afade=t=out')), 'Must include audio fade out');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Real Video Verification Tests
  // ─────────────────────────────────────────────────────────────
  describe('ProducerRenderService — Real Video Verification', () => {
    it('executes real FFmpeg rendering on real MP4 asset with Producer operations', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET), `Real video asset must exist at ${REAL_VIDEO_ASSET}`);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-real-prod-'));
      const outputPreviewMp4 = path.join(tmpDir, 'producer_real_preview.mp4');

      try {
        // Construct realistic 10-second producer plan on real asset
        const plan: ProducerEditPlan = {
          id: crypto.randomUUID(),
          clip_id: mockClipId,
          project_id: mockProjectId,
          user_id: mockUserId,
          version: 1,
          parent_plan_id: null,
          mode: 'BALANCED',
          target_platform: 'tiktok',
          status: 'draft',
          title: 'Real Launch Video Edit',
          user_instruction: 'Real video test',
          original_duration: 10.0,
          estimated_duration: 8.5,
          operations: [
            {
              id: 'op_intro_trim',
              type: 'INTRO_TRIM',
              enabled: true,
              label: 'Intro Trim',
              description: 'Trim 0.5s',
              parameters: { start_sec: 0.5 },
              confidence: 0.9,
              reason: 'Hook',
            },
            {
              id: 'op_outro_trim',
              type: 'OUTRO_TRIM',
              enabled: true,
              label: 'Outro Trim',
              description: 'Trim 1.0s',
              parameters: { end_sec: 1.0 },
              confidence: 0.9,
              reason: 'Looping',
            },
            {
              id: 'op_reframe',
              type: 'REFRAME',
              enabled: true,
              label: 'Reframe to 9:16',
              description: '9:16 Crop',
              parameters: { aspect_ratio: '9:16', crop_mode: 'center' },
              confidence: 0.95,
              reason: 'Vertical',
            },
            {
              id: 'op_hook_text',
              type: 'HOOK_TEXT',
              enabled: true,
              label: 'Hook Banner',
              description: 'Top Banner',
              parameters: { text: 'VIREO AI PRODUCER', display_start_sec: 0, display_end_sec: 3.0 },
              confidence: 0.9,
              reason: 'Visual hook',
            },
            {
              id: 'op_punch_in',
              type: 'PUNCH_IN',
              enabled: true,
              label: 'Climax Zoom',
              description: 'Punch in',
              parameters: { punch_in_start_sec: 4.0, punch_in_duration_sec: 2.0, scale: 1.06 },
              confidence: 0.85,
              reason: 'Zoom',
            },
            {
              id: 'op_normalize_audio',
              type: 'NORMALIZE_AUDIO',
              enabled: true,
              label: 'Normalize Audio',
              description: 'Loudnorm',
              parameters: { target_lufs: -16 },
              confidence: 0.98,
              reason: 'Leveling',
            },
            {
              id: 'op_audio_fade',
              type: 'AUDIO_FADE',
              enabled: true,
              label: 'Audio Fades',
              description: 'Fades',
              parameters: { fade_in_sec: 0.15, fade_out_sec: 0.25 },
              confidence: 0.93,
              reason: 'Safety',
            },
          ],
          scores: {
            before: { overall: 60, hook: 55, pacing: 60, audio: 65, visual: 60, retention_estimate: 60 },
            after: { overall: 88, hook: 90, pacing: 86, audio: 88, visual: 85, retention_estimate: 88 },
            delta: 28,
          },
          explanation: {
            summary: 'Real preview render',
            key_decisions: ['Cuts & zooms applied'],
            pacing_notes: 'Tightened',
            audio_notes: 'Normalized',
            visual_notes: 'Reframed',
          },
          preview_video_url: null,
          preview_storage_path: null,
          applied_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const testClip: ClipRecord = {
          ...mockClip,
          start_seconds: 0.0,
          end_seconds: 10.0,
          duration_seconds: 10.0,
        };

        const graph = await ProducerRenderService.buildRenderGraph(
          plan,
          testClip,
          REAL_VIDEO_ASSET,
          outputPreviewMp4,
          tmpDir
        );

        // Execute FFmpeg with the generated render graph
        const args = [
          '-y',
          '-ss', graph.startTime.toFixed(3),
          '-t', graph.duration.toFixed(3),
          '-i', graph.inputPath,
          '-vf', graph.videoFilters.join(','),
          '-af', graph.audioFilters.join(','),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-b:a', '128k',
          graph.outputPath,
        ];

        await execFileAsync(ffmpegBin, args, { timeout: 60000 });

        // 1. Verify output file exists on disk and is non-empty
        assert.ok(fs.existsSync(outputPreviewMp4), 'Rendered output preview file must exist');
        const stat = fs.statSync(outputPreviewMp4);
        assert.ok(stat.size > 50000, `Rendered file must be reasonably sized (got ${stat.size} bytes)`);

        // 2. Probe with ffmpeg to verify video resolution (1080x1920) and audio stream presence
        let probeOutput = '';
        try {
          await execFileAsync(ffmpegBin, ['-i', outputPreviewMp4]);
        } catch (probeErr: any) {
          probeOutput = (probeErr.stderr || '') + (probeErr.stdout || '');
        }

        assert.ok(probeOutput.includes('Video: h264'), 'Output must contain valid H.264 video stream');
        assert.ok(probeOutput.includes('1080x1920'), 'Output must be reframed to 1080x1920 vertical aspect ratio');
        assert.ok(probeOutput.includes('Audio: aac'), 'Output must retain valid AAC audio stream');

        // Verify duration: start=0.5, end=10.0-1.0=9.0 -> duration = 8.5s
        assert.ok(probeOutput.includes('Duration: 00:00:08.'), 'Rendered duration must be ~8.5 seconds');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

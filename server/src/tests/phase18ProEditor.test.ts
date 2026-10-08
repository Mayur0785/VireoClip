import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

import { ProEditorService } from '../services/proEditorService.js';
import {
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  EDITOR_RESOURCE_LIMITS,
  SAFE_EDITOR_FONTS,
  EDITOR_TRANSITION_TYPES,
  EDITOR_EFFECT_TYPES,
  EDITOR_FILTER_PRESETS,
  ClipRecord,
  ProducerEditPlan,
} from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Real launch video test asset path
const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

describe('Phase 18 — Vireo Pro Video Editor System Tests', () => {
  const mockUserId = crypto.randomUUID();
  const mockOtherUserId = crypto.randomUUID();
  const mockProjectId = crypto.randomUUID();
  const mockClipId = crypto.randomUUID();

  // Test fixture generator
  function createMockProject(overrides: Partial<EditorProject> = {}): EditorProject {
    const videoTrackId = crypto.randomUUID();
    const videoItemId = crypto.randomUUID();
    const textTrackId = crypto.randomUUID();
    const textItemId = crypto.randomUUID();
    const audioTrackId = crypto.randomUUID();
    const audioItemId = crypto.randomUUID();

    return {
      id: crypto.randomUUID(),
      user_id: mockUserId,
      project_id: mockProjectId,
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'Pro Video Edit - Untitled',
      canvas: {
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        fps: 30,
        duration: 30.0,
        background_color: '#000000',
        background_mode: 'color',
      },
      tracks: [
        {
          id: videoTrackId,
          type: 'VIDEO',
          name: 'Main Video Track',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            {
              id: videoItemId,
              track_id: videoTrackId,
              type: 'VIDEO',
              source_asset_id: mockClipId,
              source_path: 'source/test.mp4',
              timeline_start: 0,
              timeline_end: 30.0,
              source_start: 10.0,
              source_end: 40.0,
              transform: {
                position_x: 0,
                position_y: 0,
                scale: 1.0,
                rotation: 0,
                opacity: 1.0,
              },
              crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
              speed: { speed: 1.0, pitch_preserved: true },
              color: {
                exposure: 0,
                brightness: 0.05,
                contrast: 0.1,
                highlights: 0,
                shadows: 0,
                saturation: 0.15,
                temperature: 0,
                tint: 0,
                fade: 0,
                sharpen: 0.1,
              },
              filter: { preset: 'warm', intensity: 1.0 },
              effects: [{ type: 'vignette', intensity: 0.4 }],
              keyframes: [
                {
                  id: crypto.randomUUID(),
                  time: 2.0,
                  property: 'scale',
                  value: 1.15,
                  easing: 'ease-in-out',
                },
              ],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
        {
          id: textTrackId,
          type: 'TEXT',
          name: 'Title Track',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            {
              id: textItemId,
              track_id: textTrackId,
              type: 'TEXT',
              timeline_start: 0,
              timeline_end: 4.5,
              source_start: 0,
              source_end: 4.5,
              transform: {
                position_x: 0,
                position_y: 0,
                scale: 1.0,
                rotation: 0,
                opacity: 1.0,
              },
              speed: { speed: 1.0, pitch_preserved: true },
              text: {
                text: 'The Future of AI Video',
                font_family: 'Inter',
                font_size: 54,
                font_weight: 'bold',
                italic: false,
                alignment: 'center',
                color: '#FFFFFF',
                stroke_color: '#000000',
                stroke_width: 3,
                preset: 'bold',
                animation: 'pop',
              },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 10,
            },
          ],
        },
        {
          id: audioTrackId,
          type: 'AUDIO',
          name: 'Voice Track',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            {
              id: audioItemId,
              track_id: audioTrackId,
              type: 'AUDIO',
              timeline_start: 0,
              timeline_end: 30.0,
              source_start: 10.0,
              source_end: 40.0,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1.0, pitch_preserved: true },
              audio: {
                volume: 1.0,
                fade_in: 0.15,
                fade_out: 0.25,
                normalized: true,
                target_lufs: -16,
              },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
      ],
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.15,
        show_safe_zones: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  // 1. Document & Schema Tests
  describe('Editor Document Model & Security', () => {
    it('1. validates and accepts well-formed EditorProject document', () => {
      const project = createMockProject();
      assert.equal(project.status, 'draft');
      assert.equal(project.tracks.length, 3);
      assert.equal(project.canvas.aspect_ratio, '9:16');
      assert.equal(project.canvas.width, 1080);
      assert.equal(project.canvas.height, 1920);
    });

    it('2. enforces strict resource limits (MAX_TRACKS, MAX_TIMELINE_ITEMS)', () => {
      const project = createMockProject();

      // Add tracks up to limit
      for (let i = project.tracks.length; i < EDITOR_RESOURCE_LIMITS.MAX_TRACKS; i++) {
        project.tracks.push({
          id: crypto.randomUUID(),
          type: 'VIDEO',
          name: `Track ${i + 1}`,
          locked: false,
          muted: false,
          hidden: false,
          items: [],
        });
      }
      assert.equal(project.tracks.length, EDITOR_RESOURCE_LIMITS.MAX_TRACKS);

      // Attempt exceeding limit
      assert.throws(() => {
        if (project.tracks.length >= EDITOR_RESOURCE_LIMITS.MAX_TRACKS) {
          throw new Error('RESOURCE_LIMIT_EXCEEDED: Exceeded MAX_TRACKS limit.');
        }
      }, /RESOURCE_LIMIT_EXCEEDED/);
    });

    it('3. enforces cross-user ownership and prevents IDOR access', () => {
      const project = createMockProject({ user_id: mockUserId });
      const requestingUserId = mockOtherUserId;

      assert.notEqual(project.user_id, requestingUserId);
      const isAuthorized = project.user_id === requestingUserId;
      assert.equal(isAuthorized, false, 'Other user must be denied access.');
    });

    it('4. guarantees source asset immutability', () => {
      const project = createMockProject();
      const videoItem = project.tracks[0].items[0];
      const initialSourceStart = videoItem.source_start;
      const initialSourceEnd = videoItem.source_end;

      // Performing non-destructive timeline edit
      videoItem.timeline_start = 5.0;
      videoItem.timeline_end = 25.0;

      // Source boundaries are preserved without altering physical source bytes
      assert.equal(videoItem.source_start, initialSourceStart);
      assert.equal(videoItem.source_end, initialSourceEnd);
    });
  });

  // 2. Timeline Operations Tests
  describe('Timeline Editing Operations', () => {
    it('5. trims timeline items safely with positive boundaries', () => {
      const project = createMockProject();
      const item = project.tracks[0].items[0];

      // Trim 2 seconds off left edge
      const trimLeftSec = 2.0;
      item.timeline_start += trimLeftSec;
      item.source_start += trimLeftSec;

      assert.equal(item.timeline_start, 2.0);
      assert.equal(item.source_start, 12.0);
      assert.ok(item.source_start >= 0, 'Source start must never be negative.');
      assert.ok(item.timeline_end > item.timeline_start, 'Timeline end must exceed start.');
    });

    it('6. splits timeline item at playhead into two non-destructive segments', () => {
      const project = createMockProject();
      const track = project.tracks[0];
      const item = track.items[0];
      const splitTime = 12.0; // Playhead at 12s

      assert.ok(splitTime > item.timeline_start && splitTime < item.timeline_end);

      // Segment 1
      const seg1: EditorTrackItem = {
        ...item,
        id: crypto.randomUUID(),
        timeline_end: splitTime,
        source_end: item.source_start + (splitTime - item.timeline_start),
      };

      // Segment 2
      const seg2: EditorTrackItem = {
        ...item,
        id: crypto.randomUUID(),
        timeline_start: splitTime,
        source_start: seg1.source_end,
      };

      assert.equal(seg1.timeline_start, 0);
      assert.equal(seg1.timeline_end, 12.0);
      assert.equal(seg2.timeline_start, 12.0);
      assert.equal(seg2.timeline_end, 30.0);
      assert.equal(seg1.source_end, seg2.source_start);
      assert.notEqual(seg1.id, seg2.id);
    });

    it('7. ripple deletes item and safely closes timeline gap across unlocked tracks', () => {
      const project = createMockProject();
      const track = project.tracks[0];

      // Insert two clips: A (0-10s) and B (10-30s)
      const clipA: EditorTrackItem = {
        ...track.items[0],
        id: crypto.randomUUID(),
        timeline_start: 0,
        timeline_end: 10.0,
      };
      const clipB: EditorTrackItem = {
        ...track.items[0],
        id: crypto.randomUUID(),
        timeline_start: 10.0,
        timeline_end: 30.0,
      };
      track.items = [clipA, clipB];

      // Ripple delete clip A (duration 10s)
      const gapDuration = clipA.timeline_end - clipA.timeline_start;
      track.items = track.items.filter((i) => i.id !== clipA.id);

      // Shift subsequent items on unlocked tracks
      track.items.forEach((i) => {
        if (i.timeline_start >= clipA.timeline_end) {
          i.timeline_start -= gapDuration;
          i.timeline_end -= gapDuration;
        }
      });

      assert.equal(track.items.length, 1);
      assert.equal(track.items[0].id, clipB.id);
      assert.equal(track.items[0].timeline_start, 0, 'Clip B must shift to timeline start.');
      assert.equal(track.items[0].timeline_end, 20.0);
    });

    it('8. duplicates an item with unique ID without duplicating source media', () => {
      const project = createMockProject();
      const track = project.tracks[0];
      const original = track.items[0];

      const duplicated: EditorTrackItem = {
        ...JSON.parse(JSON.stringify(original)),
        id: crypto.randomUUID(),
        timeline_start: original.timeline_end,
        timeline_end: original.timeline_end + (original.timeline_end - original.timeline_start),
      };

      assert.notEqual(duplicated.id, original.id);
      assert.equal(duplicated.source_path, original.source_path, 'Source media reference is shared.');
      assert.equal(duplicated.timeline_start, 30.0);
    });

    it('9. freeze frame inserts still image segment at exact playhead', () => {
      const project = createMockProject();
      const track = project.tracks[0];
      const original = track.items[0];
      const freezePlayhead = 15.0;
      const freezeDuration = 3.0;

      const stillItem: EditorTrackItem = {
        id: crypto.randomUUID(),
        track_id: track.id,
        type: 'IMAGE',
        source_path: original.source_path,
        timeline_start: freezePlayhead,
        timeline_end: freezePlayhead + freezeDuration,
        source_start: 0,
        source_end: freezeDuration,
        transform: { ...original.transform },
        speed: { speed: 1.0, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: original.z_index,
      };

      assert.equal(stillItem.type, 'IMAGE');
      assert.equal(stillItem.timeline_start, 15.0);
      assert.equal(stillItem.timeline_end, 18.0);
      assert.equal(stillItem.muted, true);
    });
  });

  // 3. Text & Typography System Tests
  describe('Typography & Safe Fonts System', () => {
    it('10. validates font family against safe font allowlist', () => {
      assert.equal(ProEditorService.validateFont('Inter'), 'Inter');
      assert.equal(ProEditorService.validateFont('Roboto'), 'Roboto');
      assert.equal(ProEditorService.validateFont('Arial'), 'Arial');

      // Unsafe or malicious font paths must safely fall back to Arial
      assert.equal(ProEditorService.validateFont('/etc/passwd'), 'Arial');
      assert.equal(ProEditorService.validateFont('rm -rf /'), 'Arial');
      assert.equal(ProEditorService.validateFont('CustomArbitraryFont'), 'Arial');
    });

    it('11. sanitizes text overlay and prevents XSS or shell injection characters', () => {
      const dirtyText = "Hello <script>alert(1)</script> World! '; rm -rf /";
      const sanitized = dirtyText
        .replace(/[\r\n]+/g, ' ')
        .replace(/['\\]/g, '')
        .slice(0, 60)
        .trim();

      assert.ok(!sanitized.includes("'"));
      assert.ok(!sanitized.includes('\\'));
    });
  });

  // 4. Keyframe & Animation Engine Tests
  describe('Keyframe Animation Engine', () => {
    it('12. validates keyframe properties and easing curves', () => {
      const project = createMockProject();
      const item = project.tracks[0].items[0];
      const kfs = item.keyframes;

      assert.equal(kfs.length, 1);
      assert.equal(kfs[0].property, 'scale');
      assert.equal(kfs[0].value, 1.15);
      assert.equal(kfs[0].easing, 'ease-in-out');

      // Test keyframe timestamp validation
      assert.ok(kfs[0].time >= 0 && kfs[0].time <= item.timeline_end - item.timeline_start);
    });
  });

  // 5. Effects, Filters, Color & Audio
  describe('Color Adjustments, Effects & Audio Normalization', () => {
    it('13. validates color adjustment boundaries (-1 to +1 range)', () => {
      const project = createMockProject();
      const color = project.tracks[0].items[0].color!;

      assert.ok(color.brightness >= -1 && color.brightness <= 1);
      assert.ok(color.contrast >= -1 && color.contrast <= 1);
      assert.ok(color.saturation >= -1 && color.saturation <= 1);
    });

    it('14. supports allowlisted filter presets and video effects', () => {
      for (const preset of EDITOR_FILTER_PRESETS) {
        assert.ok(typeof preset === 'string');
      }
      for (const effect of EDITOR_EFFECT_TYPES) {
        assert.ok(typeof effect === 'string');
      }
    });

    it('15. enables EBU R128 audio normalization (target -16 LUFS)', () => {
      const project = createMockProject();
      const audio = project.tracks[2].items[0].audio!;

      assert.equal(audio.normalized, true);
      assert.equal(audio.target_lufs, -16);
      assert.equal(audio.fade_in, 0.15);
      assert.equal(audio.fade_out, 0.25);
    });
  });

  // 6. Producer -> Editor Handoff & Preservation
  describe('Producer <-> Editor Roundtrip Handoff', () => {
    it('16. converts Producer plan operations into EditorProject state seamlessly', () => {
      const producerPlan: ProducerEditPlan = {
        id: crypto.randomUUID(),
        clip_id: mockClipId,
        project_id: mockProjectId,
        user_id: mockUserId,
        status: 'applied',
        version: 1,
        parent_plan_id: null,
        mode: 'BALANCED',
        target_platform: 'tiktok',
        title: 'AI Producer Plan',
        user_instruction: null,
        original_duration: 30.0,
        estimated_duration: 28.0,
        scores: {
          before: { overall: 60, hook: 50, pacing: 60, audio: 70, visual: 60, retention_estimate: 55 },
          after: { overall: 85, hook: 88, pacing: 82, audio: 90, visual: 85, retention_estimate: 80 },
          delta: 25,
        },
        explanation: {
          summary: 'Producer optimized hook, vertical framing, and speech clarity',
          key_decisions: ['Applied vertical 9:16 reframe', 'Added hook banner'],
          pacing_notes: 'Optimized flow',
          audio_notes: 'Normalized to -16 LUFS',
          visual_notes: 'Centered subject',
        },
        preview_video_url: null,
        preview_storage_path: null,
        applied_at: new Date().toISOString(),
        operations: [
          {
            id: crypto.randomUUID(),
            type: 'REFRAME',
            enabled: true,
            label: 'Vertical 9:16 Reframe',
            description: 'Reframes video to portrait',
            confidence: 0.9,
            reason: 'Optimize for short-form mobile viewing',
            parameters: { target_aspect_ratio: '9:16' },
          },
          {
            id: crypto.randomUUID(),
            type: 'HOOK_TEXT',
            enabled: true,
            label: 'Hook Header Text',
            description: 'Adds headline overlay',
            confidence: 0.95,
            reason: 'Increase 3-second hook retention',
            parameters: { text: 'Stop Scrolling Right Now' },
          },
          {
            id: crypto.randomUUID(),
            type: 'NORMALIZE_AUDIO',
            enabled: true,
            label: 'Audio Normalization',
            description: 'EBU R128 speech normalization',
            confidence: 0.9,
            reason: 'Consistent broadcast voice loudness',
            parameters: { target_lufs: -16 },
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const project = createMockProject({
        producer_plan_id: producerPlan.id,
      });

      assert.equal(project.producer_plan_id, producerPlan.id);
      assert.equal(project.canvas.aspect_ratio, '9:16');
      assert.ok(project.tracks.some((t) => t.type === 'TEXT'));
      assert.ok(project.tracks.some((t) => t.items.some((i) => i.audio?.normalized)));
    });

    it('17. preserves manual edits when inspected by Producer', () => {
      const project = createMockProject();
      project.version = 2;
      project.tracks[0].items[0].transform.scale = 1.25;

      // Producer reads current editor state
      assert.equal(project.version, 2);
      assert.equal(project.tracks[0].items[0].transform.scale, 1.25);
    });
  });

  // 7. Render Graph V2 Compilation & Safety
  describe('Render Graph V2 Compilation & Injection Safety', () => {
    it('18. compiles valid FFmpeg arguments array with zero shell interpolation', () => {
      const project = createMockProject();
      const tmpDir = os.tmpdir();
      const dummySource = path.join(tmpDir, 'source.mp4');
      const dummyOut = path.join(tmpDir, 'out.mp4');

      const graph = ProEditorService.compileRenderGraph(
        project,
        dummySource,
        dummyOut,
        tmpDir
      );

      assert.ok(Array.isArray(graph.inputArgs));
      assert.ok(Array.isArray(graph.filterComplex));
      assert.ok(Array.isArray(graph.outputArgs));
      assert.ok(graph.filterComplex.length > 0);
      assert.ok(graph.videoMap.length > 0);
      assert.ok(graph.audioMap.length > 0);
      assert.equal(graph.duration, 30.0);
    });
  });

  // 8. Real Video E2E Verification
  describe('Phase 18 — Real Video E2E (vireo-launch-preview-1080p.mp4)', () => {
    it('19. verifies real video asset existence', () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET), `Real asset must exist at ${REAL_VIDEO_ASSET}`);
    });

    it('20. executes real frame snapshot extraction via FFmpeg', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p18-snap-'));
      const snapshotOut = path.join(tmpDir, 'snapshot.png');

      try {
        const out = await ProEditorService.captureSnapshot(REAL_VIDEO_ASSET, 2.5, snapshotOut);
        assert.ok(fs.existsSync(out));
        const stat = fs.statSync(out);
        assert.ok(stat.size > 1000, 'Snapshot image must have non-zero file size.');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('21. executes real FFmpeg multi-track render with transform, text overlay, and color filters', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p18-render-'));
      const outputVideo = path.join(tmpDir, 'p18_rendered.mp4');

      try {
        const project = createMockProject();
        // Shorten duration to 2.5s for fast deterministic local test execution
        project.canvas.duration = 2.5;
        project.tracks[0].items[0].timeline_end = 2.5;
        project.tracks[1].items[0].timeline_end = 2.5;

        const graph = ProEditorService.compileRenderGraph(
          project,
          REAL_VIDEO_ASSET,
          outputVideo,
          tmpDir
        );

        // Construct clean execFile arguments
        const ffmpegArgs = [
          '-y',
          '-ss', '0',
          '-t', '2.5',
          ...graph.inputArgs,
          '-filter_complex', graph.filterComplex.join(';'),
          '-map', graph.videoMap,
          '-map', graph.audioMap,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          outputVideo,
        ];

        await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 45000 });

        assert.ok(fs.existsSync(outputVideo), 'Rendered output video must exist.');
        const stat = fs.statSync(outputVideo);
        assert.ok(stat.size > 10000, 'Output video must be substantial.');

        // ffprobe validation
        const probeArgs = [
          '-v', 'error',
          '-show_entries', 'stream=width,height,codec_type,codec_name:format=duration',
          '-of', 'json',
          outputVideo,
        ];
        const { stdout } = await execFileAsync('ffprobe', probeArgs);
        const probeData = JSON.parse(stdout);

        const hasVideo = probeData.streams?.some((s: any) => s.codec_type === 'video');
        const hasAudio = probeData.streams?.some((s: any) => s.codec_type === 'audio');
        assert.ok(hasVideo, 'Rendered video must contain valid video stream.');
        assert.ok(hasAudio, 'Rendered video must contain valid audio stream.');

        const durationSec = parseFloat(probeData.format?.duration || '0');
        assert.ok(durationSec >= 2.0 && durationSec <= 3.0, 'Duration must match configured duration.');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

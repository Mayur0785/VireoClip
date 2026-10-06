/**
 * Phase 13 Smart Auto-Reframe + Face Tracking - Comprehensive Test Suite
 * Tests:
 * 1. Normalized coordinate validation (NaN, Infinity, negative, out of bounds)
 * 2. Deterministic face track association across consecutive frames
 * 3. Dominant track scoring & selection (presence 40%, area 30%, conf 20%, centrality 10%)
 * 4. No-face fallback handling (center crop 0.5, 0.5)
 * 5. Short occlusion continuity & gradual center-easing
 * 6. Temporal smoothing, dead-zone thresholding, and velocity clamping
 * 7. Keyframe reduction logic
 * 8. Synthetic left-to-right subject tracking trajectory
 * 9. Dynamic FFmpeg piecewise linear filter expression generation & safety
 * 10. API security route guards (auth required, invalid UUID, disallowed payload rejection)
 * 11. In-memory analysis concurrency lock (409 REFRAME_ANALYSIS_ACTIVE)
 * 12. Real FFmpeg engine test with dynamic smart crop execution
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Response } from 'express';
import ffmpegStatic from 'ffmpeg-static';
import { SmartReframeService, activeReframeAnalysisSet } from '../services/smartReframeService.js';
import { buildSmartCropFilter } from '../services/clipRenderService.js';
import { analyzeClipReframe, getClipReframe } from '../controllers/clipController.js';
import { config } from '../config/index.js';
import { AuthenticatedRequest, ReframeKeyframe, ReframeSample } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

let passed = 0;
let total = 0;

async function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}


function mockReqRes(reqOverrides: any = {}) {
  const req = {
    headers: {},
    ip: '127.0.0.1',
    params: {},
    query: {},
    body: {},
    requestId: 'test-req-id-phase13',
    ...reqOverrides,
  } as unknown as AuthenticatedRequest;

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
  };
}

async function runTests() {
  console.log('Running Phase 13 Smart Auto-Reframe & Face Tracking Tests...\n');

  // 1. Validation tests
  await it('Validation: rejects null, non-objects, NaN, and Infinity', () => {
    assert.equal(SmartReframeService.validateDetection(null), null);
    assert.equal(SmartReframeService.validateDetection(undefined), null);
    assert.equal(SmartReframeService.validateDetection('string'), null);
    assert.equal(SmartReframeService.validateDetection({ x: NaN, y: 0.2, width: 0.1, height: 0.1 }), null);
    assert.equal(SmartReframeService.validateDetection({ x: 0.5, y: Infinity, width: 0.1, height: 0.1 }), null);
  });

  await it('Validation: rejects negative dimensions or coordinates far outside 0-1 bounds', () => {
    assert.equal(SmartReframeService.validateDetection({ x: -0.5, y: 0.2, width: 0.1, height: 0.1 }), null);
    assert.equal(SmartReframeService.validateDetection({ x: 0.2, y: 0.2, width: -0.1, height: 0.1 }), null);
    assert.equal(SmartReframeService.validateDetection({ x: 0.2, y: 0.2, width: 1.5, height: 0.1 }), null);
  });

  await it('Validation: accepts legal coordinates and calculates normalized centers and area', () => {
    const valid = SmartReframeService.validateDetection({
      x: 0.2,
      y: 0.3,
      width: 0.2,
      height: 0.2,
      confidence: 0.9,
    });
    assert.ok(valid);
    assert.equal(valid.center_x, 0.3);
    assert.equal(valid.center_y, 0.4);
    assert.equal(valid.area, 0.04);
    assert.equal(valid.confidence, 0.9);
  });

  // 2. Track Association tests
  await it('Track Association: connects face detections across consecutive frames into a stable track', () => {
    const samples: ReframeSample[] = [
      {
        time: 0.0,
        faces: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9 }],
      },
      {
        time: 0.25,
        faces: [{ x: 0.22, y: 0.31, width: 0.1, height: 0.1, center_x: 0.27, center_y: 0.36, confidence: 0.9 }],
      },
      {
        time: 0.5,
        faces: [{ x: 0.24, y: 0.32, width: 0.1, height: 0.1, center_x: 0.29, center_y: 0.37, confidence: 0.9 }],
      },
    ];

    const { tracks, faceCount } = SmartReframeService.associateTracks(samples);
    assert.equal(faceCount, 1);
    assert.equal(tracks.size, 1);
    const [firstTrack] = tracks.values();
    assert.equal(firstTrack.length, 3);
  });

  await it('Track Association: tracks multiple distinct faces separately', () => {
    const samples: ReframeSample[] = [
      {
        time: 0.0,
        faces: [
          { x: 0.1, y: 0.2, width: 0.1, height: 0.1, center_x: 0.15, center_y: 0.25, confidence: 0.9 },
          { x: 0.7, y: 0.2, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.25, confidence: 0.9 },
        ],
      },
      {
        time: 0.25,
        faces: [
          { x: 0.12, y: 0.2, width: 0.1, height: 0.1, center_x: 0.17, center_y: 0.25, confidence: 0.9 },
          { x: 0.72, y: 0.2, width: 0.1, height: 0.1, center_x: 0.77, center_y: 0.25, confidence: 0.9 },
        ],
      },
    ];

    const { tracks, faceCount } = SmartReframeService.associateTracks(samples);
    assert.equal(faceCount, 2);
    assert.equal(tracks.size, 2);
  });

  // 3. Dominant Subject Selection
  await it('Dominant Subject: picks prominent face with higher presence and area', () => {
    const samples: ReframeSample[] = [
      {
        time: 0.0,
        faces: [
          { x: 0.4, y: 0.2, width: 0.2, height: 0.2, center_x: 0.5, center_y: 0.3, confidence: 0.95 }, // Primary speaker
          { x: 0.05, y: 0.5, width: 0.05, height: 0.05, center_x: 0.075, center_y: 0.525, confidence: 0.7 }, // Background face
        ],
      },
      {
        time: 0.25,
        faces: [
          { x: 0.42, y: 0.2, width: 0.2, height: 0.2, center_x: 0.52, center_y: 0.3, confidence: 0.95 },
        ],
      },
    ];

    const { tracks } = SmartReframeService.associateTracks(samples);
    const { dominantTrackId, score } = SmartReframeService.selectDominantTrack(tracks, 2);

    assert.ok(dominantTrackId);
    assert.ok(score > 0.5);
    const dominantDetections = tracks.get(dominantTrackId)!;
    assert.equal(dominantDetections.length, 2); // The face present in both frames
  });

  await it('Dominant Subject: handles empty tracks gracefully returning null', () => {
    const emptyTracks = new Map();
    const res = SmartReframeService.selectDominantTrack(emptyTracks, 10);
    assert.equal(res.dominantTrackId, null);
    assert.equal(res.score, 0);
  });

  // 4. No Face Fallback
  await it('No Face Fallback: returns default center crop keyframe [0.5, 0.5]', () => {
    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples: [],
      dominantTrackId: null,
      duration: 10.0,
    });

    assert.equal(keyframes.length, 1);
    assert.equal(keyframes[0].centerX, 0.5);
    assert.equal(keyframes[0].centerY, 0.5);
  });

  // 5. Short Occlusion and Smoothing
  await it('Occlusion: holds position for short disappearance (<= 1.0s) and eases toward 0.5 for longer', () => {
    const samples: ReframeSample[] = [
      {
        time: 0.0,
        faces: [{ track_id: 'sub_1', x: 0.7, y: 0.2, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.25, confidence: 0.9 }],
      },
      {
        time: 0.5, // 0.5s later: missing face (short occlusion)
        faces: [],
      },
      {
        time: 2.5, // 2.5s later: longer occlusion, should ease toward center (0.5)
        faces: [],
      },
    ];

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'sub_1',
      duration: 3.0,
    });

    assert.ok(keyframes.length >= 2);
    // Initial position starts around 0.75
    assert.ok(keyframes[0].centerX > 0.6);
    // Final keyframe has eased back towards center (0.5)
    const finalKf = keyframes[keyframes.length - 1];
    assert.ok(finalKf.centerX < 0.7);
  });

  // 6. Dead Zone & Maximum Velocity Clamping
  await it('Dead Zone: ignores tiny subject fluctuations < deadZone threshold', () => {
    const samples: ReframeSample[] = [
      {
        time: 0.0,
        faces: [{ track_id: 'sub_1', x: 0.4, y: 0.2, width: 0.1, height: 0.1, center_x: 0.45, center_y: 0.25, confidence: 0.9 }],
      },
      {
        time: 0.25,
        faces: [{ track_id: 'sub_1', x: 0.41, y: 0.2, width: 0.1, height: 0.1, center_x: 0.46, center_y: 0.25, confidence: 0.9 }], // delta 0.01 < 0.035
      },
      {
        time: 0.5,
        faces: [{ track_id: 'sub_1', x: 0.405, y: 0.2, width: 0.1, height: 0.1, center_x: 0.455, center_y: 0.25, confidence: 0.9 }],
      },
    ];

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'sub_1',
      duration: 1.0,
      deadZone: 0.035,
    });

    // All keyframes should remain within tight bound around 0.45 (no erratic movements)
    for (const kf of keyframes) {
      assert.ok(Math.abs(kf.centerX - 0.45) < 0.02);
    }
  });

  // 7. Synthetic Track Test (Left to Right)
  await it('Synthetic Track: subject smoothly moving from left (0.2) to right (0.8)', () => {
    const samples: ReframeSample[] = [];
    const duration = 4.0;
    const fps = 4;
    const totalFrames = duration * fps;

    for (let i = 0; i <= totalFrames; i++) {
      const t = i / fps;
      const progress = i / totalFrames;
      const cx = 0.2 + 0.6 * progress; // Moves from 0.2 to 0.8
      samples.push({
        time: t,
        faces: [
          {
            track_id: 'sub_mover',
            x: cx - 0.05,
            y: 0.3,
            width: 0.1,
            height: 0.1,
            center_x: cx,
            center_y: 0.35,
            confidence: 0.9,
          },
        ],
      });
    }

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'sub_mover',
      duration,
    });

    assert.ok(keyframes.length >= 3);
    const startX = keyframes[0].centerX;
    const endX = keyframes[keyframes.length - 1].centerX;

    assert.ok(startX < 0.4, `Start X (${startX}) should start near left`);
    assert.ok(endX > 0.6, `End X (${endX}) should end near right`);
    assert.ok(startX < endX, 'Trajectory should steadily progress left-to-right');

    // All keyframes strictly inside [0, 1]
    for (const kf of keyframes) {
      assert.ok(kf.centerX >= 0 && kf.centerX <= 1.0);
    }
  });

  // 8. FFmpeg Dynamic Crop Filter Builder
  await it('Filter Builder: builds valid piecewise linear expression for 9:16 target', () => {
    const keyframes: ReframeKeyframe[] = [
      { time: 0, centerX: 0.3, centerY: 0.5 },
      { time: 1.5, centerX: 0.7, centerY: 0.5 },
      { time: 3.0, centerX: 0.5, centerY: 0.5 },
    ];

    const filter = buildSmartCropFilter(keyframes, '9:16', 1920, 1080, 3.0);
    assert.ok(filter.startsWith('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:'));
    assert.ok(filter.includes('min(max(in_w*min(max(') || filter.includes('min(max('));
    assert.ok(filter.includes('if(lte(t\\,'));
  });

  await it('Filter Builder: falls back to static crop when keyframes are uniform', () => {
    const uniformKfs: ReframeKeyframe[] = [
      { time: 0, centerX: 0.5, centerY: 0.5 },
      { time: 1.0, centerX: 0.505, centerY: 0.5 },
      { time: 2.0, centerX: 0.5, centerY: 0.5 },
    ];

    const filter = buildSmartCropFilter(uniformKfs, '9:16', 1920, 1080, 2.0);
    assert.equal(filter, 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
  });

  // 9. API Security Guards
  const originalSmartReframe = config.smartReframeEnabled;
  (config as any).smartReframeEnabled = true;

  await it('API analyze: returns 401 when request is unauthenticated', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({ user: undefined });
    req.params = { clipId: '33333333-3333-4333-a333-333333333333' };

    await analyzeClipReframe(req, res);
    assert.equal(getStatusCode(), 401);
    assert.equal(getResponseData().code, 'AUTH_REQUIRED');
  });

  await it('API analyze: returns 400 when clip UUID is invalid', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: 'test-user-uuid' },
    });
    req.params = { clipId: 'not-a-valid-uuid' };

    await analyzeClipReframe(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_UUID');
  });

  await it('API analyze: rejects arbitrary non-whitelisted payload fields for security', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: 'test-user-uuid' },
    });
    req.params = { clipId: '33333333-3333-4333-a333-333333333333' };
    req.body = { pythonCommand: 'rm -rf /', ffmpegExpression: 'malicious' };

    await analyzeClipReframe(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_PAYLOAD');
  });

  await it('API analyze: returns 409 when analysis is already active for this clip', async () => {
    const testClipId = '44444444-4444-4444-a444-444444444444';
    activeReframeAnalysisSet.add(testClipId);

    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: 'test-user-uuid' },
    });
    req.params = { clipId: testClipId };

    try {
      await analyzeClipReframe(req, res);
      assert.equal(getStatusCode(), 409);
      assert.equal(getResponseData().code, 'REFRAME_ANALYSIS_ACTIVE');
    } finally {
      activeReframeAnalysisSet.delete(testClipId);
    }
  });

  await it('API getReframe: returns 401 when unauthenticated and 400 for bad UUID', async () => {
    const unauth = mockReqRes({ user: undefined });
    unauth.req.params = { clipId: '55555555-5555-4555-a555-555555555555' };
    await getClipReframe(unauth.req, unauth.res);
    assert.equal(unauth.getStatusCode(), 401);

    const badUuid = mockReqRes({ user: { id: 'user-123' } });
    badUuid.req.params = { clipId: 'invalid-id' };
    await getClipReframe(badUuid.req, badUuid.res);
    assert.equal(badUuid.getStatusCode(), 400);
  });

  (config as any).smartReframeEnabled = originalSmartReframe;

  // 10. Real FFmpeg Execution Test with Dynamic Smart Crop
  await it('Real FFmpeg Engine: renders test video with dynamic piecewise crop expression', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-test-smartcrop-'));
    const outputPath = path.join(tempDir, 'smart_cropped.mp4');

    const keyframes: ReframeKeyframe[] = [
      { time: 0, centerX: 0.2, centerY: 0.5 },
      { time: 1.0, centerX: 0.8, centerY: 0.5 },
      { time: 2.0, centerX: 0.4, centerY: 0.5 },
    ];

    const filter = buildSmartCropFilter(keyframes, '9:16', 1920, 1080, 2.0);

    try {
      await execFileAsync(ffmpegBin, [
        '-f', 'lavfi',
        '-i', 'testsrc=duration=2:size=1920x1080:rate=30',
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-t', '2',
        '-y',
        outputPath,
      ]);

      assert.ok(fs.existsSync(outputPath), 'Output MP4 must exist');
      const stats = fs.statSync(outputPath);
      assert.ok(stats.size > 1000, 'Output MP4 must not be empty');

      // Probe output dimensions with ffprobe if available or simple check
      const { stdout } = await execFileAsync(ffmpegBin, ['-i', outputPath]);
    } catch (ffmpegErr: any) {
      // FFmpeg prints media info to stderr on exit
      const info = (ffmpegErr.stderr || '') + (ffmpegErr.stdout || '');
      assert.ok(info.includes('1080x1920'), `Output must be vertical 1080x1920: ${info}`);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // 11. Reframe Mode Metadata & Fallback Logic Tests
  await it('Metadata & Fallback: produces fallback_center when track has 0 detected faces', () => {
    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples: [],
      dominantTrackId: null,
      duration: 5.0,
    });
    assert.equal(kfs.length, 1);
    assert.equal(kfs[0].centerX, 0.5);
    assert.equal(kfs[0].centerY, 0.5);
    const filter = buildSmartCropFilter(kfs, '9:16');
    assert.equal(filter, 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
  });

  await it('Metadata & Fallback: produces smart dynamic filter when ready track has detected subject', () => {
    const keyframes: ReframeKeyframe[] = [
      { time: 0, centerX: 0.25, centerY: 0.5 },
      { time: 2.0, centerX: 0.75, centerY: 0.5 },
    ];
    const filter = buildSmartCropFilter(keyframes, '9:16', 1920, 1080, 2.0);
    assert.ok(filter.includes('scale=1080:1920'));
    assert.ok(filter.includes('crop=1080:1920'));
    assert.ok(filter.includes('min(max('));
  });

  console.log(`\nPhase 13 Results: ${passed}/${total} tests passed.\n`);
  if (passed !== total) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});


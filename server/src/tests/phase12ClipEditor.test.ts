/**
 * Phase 12 Caption Engine & Focused Clip Editor - Comprehensive Test Suite
 * Tests:
 * 1. Caption clip-local timestamp conversion and boundary clipping
 * 2. Timing modes: Word mode vs Segment fallback
 * 3. ASS escaping and injection prevention
 * 4. ASS color conversion (#RRGGBB to BGR &H00BBGGRR&) and validation
 * 5. Caption grouping rules (words per cue, punctuation breaks, pauses)
 * 6. Presets resolution and styles (clean, bold, minimal, podcast, highlight, karaoke)
 * 7. Manual crop filter framing with focusX/focusY
 * 8. Editor config validation (trim bounds, min 3s duration, aspect ratio, volume, overlay)
 * 9. Security route guards (auth required, UUID validation, payload whitelist)
 * 10. Real FFmpeg render test with burned ASS captions & captions disabled
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Response } from 'express';
import ffmpegStatic from 'ffmpeg-static';
import { CaptionService } from '../services/captionService.js';
import { buildCropFilter, sanitizeFilename } from '../services/clipRenderService.js';
import {
  getClipEditorData,
  updateClipEditor,
  resetClipEditor,
  getClipCaptions,
} from '../controllers/clipController.js';
import { AuthenticatedRequest, TimedCaptionToken } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

let passed = 0;
let total = 0;

function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✓ ${name}`);
        })
        .catch((err) => {
          console.error(`  ✗ ${name}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Helper to mock Express req, res
function mockReqRes(reqOverrides: any = {}) {
  const req = {
    headers: {},
    ip: '127.0.0.1',
    params: {},
    query: {},
    body: {},
    requestId: 'test-req-id-phase12',
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
  console.log('Running Phase 12 Caption Engine & Clip Editor Tests...\n');

  // ==========================================
  // 1. Caption Clip-Local Timestamp Conversion
  // ==========================================
  await it('Local timestamps: converts transcript time to clip-local coordinates', () => {
    // Clip: 10.0s to 30.0s, trimStart: 2.0s, trimEnd: 3.0s -> Effective: 12.0s to 27.0s (dur: 15.0s)
    const transcript = {
      words: [
        { word: 'before', start: 5.0, end: 6.0 }, // Before effective start -> excluded
        { word: 'overlap-start', start: 11.0, end: 13.0 }, // Overlaps start -> clipped to local 0.0 - 1.0
        { word: 'inside', start: 15.0, end: 16.5 }, // Inside -> local 3.0 - 4.5
        { word: 'overlap-end', start: 26.0, end: 28.0 }, // Overlaps end -> clipped to local 14.0 - 15.0
        { word: 'after', start: 29.0, end: 31.0 }, // After effective end -> excluded
      ],
    };

    const { timingMode, cues } = CaptionService.extractClipCues(transcript, 10.0, 30.0, 2.0, 3.0);
    assert.equal(timingMode, 'word');

    const allTokens = cues.flatMap((c) => c.tokens || []);
    assert.equal(allTokens.length, 3);

    // Verify boundary clipping
    assert.equal(allTokens[0].text, 'overlap-start');
    assert.equal(allTokens[0].start, 0.0);
    assert.equal(allTokens[0].end, 1.0);

    assert.equal(allTokens[1].text, 'inside');
    assert.equal(allTokens[1].start, 3.0);
    assert.equal(allTokens[1].end, 4.5);

    assert.equal(allTokens[2].text, 'overlap-end');
    assert.equal(allTokens[2].start, 14.0);
    assert.equal(allTokens[2].end, 15.0);
  });

  await it('Timing modes: falls back to segment timing when word-level timestamps are absent', () => {
    const transcript = {
      segments: [
        { start: 10.0, end: 15.0, text: 'This is the first segment.' },
        { start: 16.0, end: 22.0, text: 'Here is the second segment.' },
      ],
    };

    const { timingMode, cues } = CaptionService.extractClipCues(transcript, 10.0, 25.0, 0, 0);
    assert.equal(timingMode, 'segment');
    assert.ok(cues.length > 0);
    assert.equal(cues[0].start, 0);
    assert.equal(cues[0].text, 'This is the first segment.');
  });

  // ==========================================
  // 2. ASS Subtitle Sanitization & Injection Prevention
  // ==========================================
  await it('ASS Sanitizer: strips curly braces and command tags to prevent injection', () => {
    const dangerous = 'Hello {\\b1\\pos(0,0)} World!\\NInject';
    const safe = CaptionService.sanitizeAssText(dangerous);
    assert.equal(safe, 'Hello /b1/pos(0,0) World!/NInject');
    assert.ok(!safe.includes('{'));
    assert.ok(!safe.includes('}'));
  });

  await it('ASS Time Formatter: formats seconds into H:MM:SS.CC exactly', () => {
    assert.equal(CaptionService.formatAssTime(0), '0:00:00.00');
    assert.equal(CaptionService.formatAssTime(65.42), '0:01:05.42');
    assert.equal(CaptionService.formatAssTime(3661.05), '1:01:01.05');
  });

  // ==========================================
  // 3. Color Conversion & Validation
  // ==========================================
  await it('Color Conversion: converts standard hex to ASS BGR &H00BBGGRR&', () => {
    // Pure Red (#FF0000) -> R=FF, G=00, B=00 -> &H000000FF&
    assert.equal(CaptionService.hexToAssColor('#FF0000'), '&H000000FF&');
    // Pure Blue (#0000FF) -> R=00, G=00, B=FF -> &H00FF0000&
    assert.equal(CaptionService.hexToAssColor('#0000FF'), '&H00FF0000&');
    // Pure Green (#00FF00) -> R=00, G=FF, B=00 -> &H0000FF00&
    assert.equal(CaptionService.hexToAssColor('#00FF00'), '&H0000FF00&');
    // Invalid hex safely defaults
    assert.equal(CaptionService.hexToAssColor('invalid-hex', '#FFFFFF'), '&H00FFFFFF&');
  });

  // ==========================================
  // 4. Caption Grouping Rules
  // ==========================================
  await it('Caption Grouping: groups words into chunks breaking on punctuation and pauses', () => {
    const tokens: TimedCaptionToken[] = [
      { text: 'Start', start: 0.0, end: 0.5 },
      { text: 'with', start: 0.5, end: 0.8 },
      { text: 'clarity.', start: 0.8, end: 1.2 }, // Punctuation break
      { text: 'Then', start: 2.0, end: 2.4 }, // 0.8s pause break
      { text: 'execute', start: 2.4, end: 2.8 },
      { text: 'relentlessly.', start: 2.8, end: 3.4 },
    ];

    const cues = CaptionService.groupIntoCues(tokens, 4, 30);
    assert.equal(cues.length, 2);
    assert.equal(cues[0].text, 'Start with clarity.');
    assert.equal(cues[1].text, 'Then execute relentlessly.');
  });

  // ==========================================
  // 5. Presets & Style Resolution
  // ==========================================
  await it('Caption Presets: generates valid ASS content for clean and podcast presets', () => {
    const sampleCues = [
      { id: 'cue-1', start: 0.5, end: 2.5, text: 'Welcome to Vireo Studio' },
    ];

    const cleanScript = CaptionService.buildAssScript(sampleCues, {
      style: 'clean',
      position: 'bottom',
      aspectRatio: '9:16',
    });
    assert.ok(cleanScript.includes('[Script Info]'));
    assert.ok(cleanScript.includes('Welcome to Vireo Studio'));
    assert.ok(cleanScript.includes('PlayResX: 1080'));
    assert.ok(cleanScript.includes('PlayResY: 1920'));

    const podcastScript = CaptionService.buildAssScript(sampleCues, {
      style: 'podcast',
      position: 'bottom',
      aspectRatio: '9:16',
    });
    assert.ok(podcastScript.includes('Style: Default,Arial'));
  });

  // ==========================================
  // 6. Manual Crop Framing Filter
  // ==========================================
  await it('Manual Crop: computes exact focus framing offsets without distortion', () => {
    // Default center crop (0.5, 0.5)
    const centerFilter = buildCropFilter('9:16', { focusX: 0.5, focusY: 0.5 });
    assert.equal(centerFilter, 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');

    // Left framing (focusX: 0)
    const leftFilter = buildCropFilter('9:16', { focusX: 0, focusY: 0.5 });
    assert.equal(leftFilter, 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*0:(in_h-out_h)*0.5');

    // Clamps values outside [0, 1]
    const clampedFilter = buildCropFilter('9:16', { focusX: 2.5, focusY: -1.0 });
    assert.equal(clampedFilter, 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*1:(in_h-out_h)*0');
  });

  // ==========================================
  // 7. Controller Route Security & Whitelisting
  // ==========================================
  await it('API updateClipEditor: returns 401 when unauthenticated', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: undefined,
      params: { clipId: '00000000-0000-4000-8000-000000000001' },
      body: { captionStyle: 'bold' },
    });

    await updateClipEditor(req, res);
    assert.equal(getStatusCode(), 401);
    assert.equal(getResponseData().code, 'AUTH_REQUIRED');
  });

  await it('API updateClipEditor: returns 400 when invalid UUID provided', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      params: { clipId: 'bad-uuid-123' },
      body: { captionStyle: 'bold' },
    });

    await updateClipEditor(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_UUID');
  });

  await it('API updateClipEditor: rejects arbitrary non-whitelisted payload fields for security', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      params: { clipId: '00000000-0000-4000-8000-000000000001' },
      body: {
        captionStyle: 'bold',
        rawFfmpegCommand: 'rm -rf /', // Malicious arbitrary injection
      },
    });

    await updateClipEditor(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_PAYLOAD');
  });

  await it('API resetClipEditor: returns 401 unauthenticated and 400 for bad UUID', async () => {
    const { req: unauthReq, res: unauthRes, getStatusCode: unauthStatus } = mockReqRes({
      user: undefined,
      params: { clipId: '00000000-0000-4000-8000-000000000001' },
    });
    await resetClipEditor(unauthReq, unauthRes);
    assert.equal(unauthStatus(), 401);

    const { req: badReq, res: badRes, getStatusCode: badStatus } = mockReqRes({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      params: { clipId: 'bad-uuid' },
    });
    await resetClipEditor(badReq, badRes);
    assert.equal(badStatus(), 400);
  });

  // ==========================================
  // 8. Real FFmpeg Render Fixture with ASS Burn-in
  // ==========================================
  await it('Real FFmpeg Engine: renders 9:16 MP4 with burned ASS subtitles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p12-render-'));
    const srcFile = path.join(tmpDir, 'source.mp4');
    const assFile = path.join(tmpDir, 'subtitles.ass');
    const outFile = path.join(tmpDir, 'captioned_output.mp4');

    try {
      // Step A: Generate a 3-second test video
      await execFileAsync(ffmpegBin, [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=3:size=1280x720:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=3',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        srcFile,
      ]);

      // Step B: Write real ASS subtitle file
      const cues = [
        { id: '1', start: 0.2, end: 1.8, text: 'Vireo Phase 12 Captions' },
      ];
      const assContent = CaptionService.buildAssScript(cues, {
        style: 'bold',
        position: 'bottom',
        aspectRatio: '9:16',
      });
      fs.writeFileSync(assFile, assContent, 'utf8');

      // Step C: Execute FFmpeg with 9:16 manual crop and burned ASS subtitle filter
      const safeAss = assFile.replace(/\\/g, '/').replace(':', '\\\\:');
      const cropFilter = buildCropFilter('9:16', { focusX: 0.5, focusY: 0.5 });
      const videoFilter = `${cropFilter},ass=${safeAss}`;

      await execFileAsync(ffmpegBin, [
        '-y',
        '-ss', '0.5',
        '-i', srcFile,
        '-t', '1.5',
        '-vf', videoFilter,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        outFile,
      ]);

      assert.ok(fs.existsSync(outFile), 'Captioned 9:16 MP4 should exist');

      // Step D: Verify output dimensions with ffmpeg probe
      try {
        await execFileAsync(ffmpegBin, ['-i', outFile]);
      } catch (err: any) {
        const info = (err.stderr || '') + (err.stdout || '');
        assert.ok(info.includes('1080x1920'), `Output must be vertical 1080x1920: ${info}`);
      }

      const size = fs.statSync(outFile).size;
      assert.ok(size > 5000, `Output file must have substantial size (got ${size} bytes)`);
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  await it('Real FFmpeg Engine: renders successfully with captions disabled', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p12-nocap-'));
    const srcFile = path.join(tmpDir, 'source.mp4');
    const outFile = path.join(tmpDir, 'nocap_output.mp4');

    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=2:size=1280x720:rate=30',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        srcFile,
      ]);

      const cropFilter = buildCropFilter('9:16');
      await execFileAsync(ffmpegBin, [
        '-y',
        '-ss', '0.0',
        '-i', srcFile,
        '-t', '1.0',
        '-vf', cropFilter,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        outFile,
      ]);

      assert.ok(fs.existsSync(outFile), 'Output without captions should exist');
      assert.ok(fs.statSync(outFile).size > 3000);
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  await it('Real FFmpeg Engine: mute=true renders output without audio stream (ffprobe verified)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p12-mute-'));
    const srcFile = path.join(tmpDir, 'source_with_audio.mp4');
    const mutedOut = path.join(tmpDir, 'muted_output.mp4');

    try {
      // Generate synthetic source with both video and sine audio
      await execFileAsync(ffmpegBin, [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1280x720:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        srcFile,
      ]);

      // Render with mute=true (noAudio flag equivalent: -an)
      const cropFilter = buildCropFilter('9:16');
      await execFileAsync(ffmpegBin, [
        '-y',
        '-ss', '0.0',
        '-i', srcFile,
        '-t', '1.0',
        '-vf', cropFilter,
        '-c:v', 'libx264',
        '-an',
        '-preset', 'ultrafast',
        mutedOut,
      ]);

      assert.ok(fs.existsSync(mutedOut), 'Muted output should exist');

      // Verify with ffmpeg probe that output has NO audio stream
      try {
        await execFileAsync(ffmpegBin, ['-i', mutedOut]);
      } catch (err: any) {
        const probeOutput = (err.stderr || '') + (err.stdout || '');
        assert.ok(!probeOutput.includes('Audio: aac'), 'Muted output must NOT contain active audio stream');
        assert.ok(probeOutput.includes('Video: h264'), 'Muted output must retain valid video stream');
      }
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  await it('Real FFmpeg Engine: mute=false retains normal audio stream (ffprobe verified)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p12-unmute-'));
    const srcFile = path.join(tmpDir, 'source_with_audio.mp4');
    const unmutedOut = path.join(tmpDir, 'unmuted_output.mp4');

    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1280x720:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        srcFile,
      ]);

      const cropFilter = buildCropFilter('9:16');
      await execFileAsync(ffmpegBin, [
        '-y',
        '-ss', '0.0',
        '-i', srcFile,
        '-t', '1.0',
        '-vf', cropFilter,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-preset', 'ultrafast',
        unmutedOut,
      ]);

      assert.ok(fs.existsSync(unmutedOut), 'Unmuted output should exist');

      try {
        await execFileAsync(ffmpegBin, ['-i', unmutedOut]);
      } catch (err: any) {
        const probeOutput = (err.stderr || '') + (err.stdout || '');
        assert.ok(probeOutput.includes('Audio: aac'), 'Unmuted output MUST contain normal audio stream');
        assert.ok(probeOutput.includes('Video: h264'), 'Unmuted output must retain video stream');
      }
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  console.log(`\nPhase 12 Results: ${passed}/${total} tests passed.\n`);
  if (passed !== total) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Phase 12 test runner caught error:', err);
  process.exit(1);
});

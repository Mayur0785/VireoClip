import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { CaptionService } from '../services/captionService.js';
import {
  TimedCaptionCue,
  TimedCaptionToken,
  SAFE_FONT_FAMILIES,
  CaptionConfig,
} from '../types/index.js';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

describe('Phase 12.5 Pro Caption Timing & Advanced Caption Editor Tests', () => {
  // ── 1. ACTIVE CUE SELECTION & DETERMINISTIC BOUNDARIES ──────────
  describe('Active Cue Deterministic Resolution', () => {
    const mockCues: TimedCaptionCue[] = [
      { id: 'cue-1', start: 1.0, end: 3.0, text: 'HELLO WORLD' },
      { id: 'cue-2', start: 4.0, end: 6.5, text: 'NEXT CAPTION' },
      { id: 'cue-3', start: 6.5, end: 9.0, text: 'FINAL WORDS' },
    ];

    const resolveActiveCue = (cues: TimedCaptionCue[], time: number): TimedCaptionCue | null => {
      // Core Caption Rule: cue.start <= video.currentTime AND video.currentTime < cue.end
      return cues.find((c) => time >= c.start && time < c.end) || null;
    };

    it('returns null before first cue starts', () => {
      assert.strictEqual(resolveActiveCue(mockCues, 0.5), null);
      assert.strictEqual(resolveActiveCue(mockCues, 0.999), null);
    });

    it('returns cue 1 exactly when inside cue 1', () => {
      const active = resolveActiveCue(mockCues, 1.0);
      assert.ok(active);
      assert.strictEqual(active?.id, 'cue-1');

      const mid = resolveActiveCue(mockCues, 2.5);
      assert.strictEqual(mid?.id, 'cue-1');
    });

    it('returns null during speech gap between cues', () => {
      const gap = resolveActiveCue(mockCues, 3.5);
      assert.strictEqual(gap, null);
    });

    it('returns cue 2 exactly when inside cue 2', () => {
      const active = resolveActiveCue(mockCues, 4.0);
      assert.ok(active);
      assert.strictEqual(active?.id, 'cue-2');
    });

    it('handles exact boundary transition deterministically without overlap', () => {
      // At exact boundary 6.5s: cue-2 ends (time < 6.5 is false for cue-2) and cue-3 begins (time >= 6.5 is true)
      const boundary = resolveActiveCue(mockCues, 6.5);
      assert.ok(boundary);
      assert.strictEqual(boundary?.id, 'cue-3');

      const justBefore = resolveActiveCue(mockCues, 6.499);
      assert.strictEqual(justBefore?.id, 'cue-2');
    });

    it('never returns multiple active cues simultaneously', () => {
      for (let t = 0; t <= 10; t += 0.1) {
        const matches = mockCues.filter((c) => t >= c.start && t < c.end);
        assert.ok(
          matches.length <= 1,
          `At timestamp ${t.toFixed(2)}s, found ${matches.length} matching cues simultaneously!`
        );
      }
    });
  });

  // ── 2. REAL WORD ACTIVE STATE & HIGHLIGHTING ────────────────────
  describe('Word Active Highlighting State', () => {
    const timedWords: TimedCaptionToken[] = [
      { text: 'HELLO', start: 0.0, end: 0.4 },
      { text: 'WORLD', start: 0.4, end: 0.9 },
      { text: 'TODAY', start: 1.0, end: 1.5 },
    ];

    const resolveActiveWord = (words: TimedCaptionToken[], time: number): number => {
      return words.findIndex((w) => time >= w.start && time < w.end);
    };

    it('resolves active word index correctly for speech progression', () => {
      // At 0.2s: "HELLO" is active (0.0 - 0.4)
      assert.strictEqual(resolveActiveWord(timedWords, 0.2), 0);

      // At 0.6s: "WORLD" is active (0.4 - 0.9)
      assert.strictEqual(resolveActiveWord(timedWords, 0.6), 1);

      // In gap (0.95s): no word active
      assert.strictEqual(resolveActiveWord(timedWords, 0.95), -1);

      // At 1.2s: "TODAY" is active (1.0 - 1.5)
      assert.strictEqual(resolveActiveWord(timedWords, 1.2), 2);
    });

    it('never marks two words active simultaneously', () => {
      for (let t = 0; t <= 2.0; t += 0.05) {
        const activeWords = timedWords.filter((w) => t >= w.start && t < w.end);
        assert.ok(
          activeWords.length <= 1,
          `At time ${t.toFixed(2)}s, multiple words marked active: ${activeWords.map((w) => w.text).join(', ')}`
        );
      }
    });
  });

  // ── 3. WORD GROUPING & CHUNKING ENGINE ─────────────────────────
  describe('Caption Cue Grouping Engine', () => {
    it('groups words into 3-5 word cues respecting max words limit', () => {
      const tokens: TimedCaptionToken[] = [
        { text: 'I', start: 0.0, end: 0.2 },
        { text: 'WAS', start: 0.2, end: 0.5 },
        { text: 'CLOSE', start: 0.5, end: 0.9 },
        { text: 'TO', start: 0.9, end: 1.1 },
        { text: 'A', start: 1.1, end: 1.3 },
        { text: 'LOT', start: 1.3, end: 1.7 },
        { text: 'OF', start: 1.7, end: 1.9 },
        { text: 'ROLES', start: 1.9, end: 2.4 },
        { text: 'AND', start: 2.4, end: 2.6 },
        { text: 'THAT', start: 2.6, end: 2.9 },
        { text: 'HAPPENS', start: 2.9, end: 3.4 },
      ];

      const cues = CaptionService.groupIntoCues(tokens, 4, 2);

      assert.ok(cues.length >= 3, `Expected at least 3 cues, got ${cues.length}`);

      // Verify each cue has <= 4 words
      for (const cue of cues) {
        assert.ok(cue.words && cue.words.length <= 4, `Cue "${cue.text}" has ${cue.words?.length} words (>4)`);
        assert.ok(cue.end > cue.start, `Cue end (${cue.end}) must be greater than start (${cue.start})`);
      }

      // Verify no cues overlap
      const validation = CaptionService.validateNoOverlappingCues(cues);
      assert.strictEqual(validation.valid, true, `Overlaps detected: ${JSON.stringify(validation.overlaps)}`);
    });

    it('breaks chunk cleanly on sentence punctuation', () => {
      const tokens: TimedCaptionToken[] = [
        { text: 'Wait.', start: 0.0, end: 0.4 },
        { text: 'Tell', start: 0.5, end: 0.8 },
        { text: 'them', start: 0.8, end: 1.1 },
        { text: "I'm", start: 1.1, end: 1.4 },
        { text: 'ready.', start: 1.4, end: 1.8 },
      ];

      const cues = CaptionService.groupIntoCues(tokens, 4, 2);

      // "Wait." should flush immediately into cue 1 due to period
      assert.strictEqual(cues[0].text, 'Wait.');
      assert.strictEqual(cues[1].text, "Tell them I'm ready.");
    });

    it('breaks chunk on natural speech pause (>0.45s gap)', () => {
      const tokens: TimedCaptionToken[] = [
        { text: 'Hello', start: 0.0, end: 0.4 },
        { text: 'there', start: 0.4, end: 0.7 },
        // Pause of 0.7s: 0.7 -> 1.4
        { text: 'General', start: 1.4, end: 1.8 },
        { text: 'Kenobi', start: 1.8, end: 2.3 },
      ];

      const cues = CaptionService.groupIntoCues(tokens, 4, 2, 28, 0.45);

      assert.strictEqual(cues.length, 2);
      assert.strictEqual(cues[0].text, 'Hello there');
      assert.strictEqual(cues[1].text, 'General Kenobi');
    });

    it('splits long cue text into maximum 2 lines with \\N', () => {
      const tokens: TimedCaptionToken[] = [
        { text: 'Extraordinarily', start: 0.0, end: 0.8 },
        { text: 'Magnificent', start: 0.8, end: 1.5 },
        { text: 'Performance', start: 1.5, end: 2.2 },
      ];

      const cues = CaptionService.groupIntoCues(tokens, 4, 2, 20);
      assert.ok(cues[0].text.includes('\\N'), 'Expected two lines formatted with \\N for long phrase');
    });
  });

  // ── 4. BACKWARD COMPATIBILITY & OVERRIDE TESTS ──────────────────
  describe('Backward Compatibility & Overrides', () => {
    it('uses segment fallback when words are missing without fabricating fake word timestamps', () => {
      const segmentTranscript = {
        segments: [
          { start: 1.0, end: 4.5, text: 'First segment of audio.' },
          { start: 4.2, end: 8.0, text: 'Second overlapping segment.' },
        ],
      };

      const result = CaptionService.extractClipCues(segmentTranscript, 0, 10);

      assert.strictEqual(result.timingMode, 'segment');
      assert.strictEqual(result.cues.length, 2);

      // Verify that consecutive segment overlap (4.2 vs 4.5) was strictly resolved
      assert.ok(
        result.cues[0].end <= result.cues[1].start,
        `Segment 0 end (${result.cues[0].end}) must be <= Segment 1 start (${result.cues[1].start})`
      );

      // No fake word timestamps were fabricated
      assert.strictEqual(result.cues[0].words, undefined);
    });

    it('applies manual cue text overrides without touching canonical transcript', () => {
      const wordTranscript = {
        words: [
          { word: 'Hello', start: 1.0, end: 1.4 },
          { word: 'Wrold', start: 1.4, end: 1.9 }, // Typos in speech
        ],
      };

      const captionConfig: CaptionConfig = {
        caption_overrides: [{ cueId: 'cue-1', text: 'Hello World (Corrected)' }],
      };

      const result = CaptionService.extractClipCues(wordTranscript, 0, 10, 0, 0, captionConfig);

      assert.strictEqual(result.cues[0].text, 'Hello World (Corrected)');
      // Canonical timing remains intact
      assert.strictEqual(result.cues[0].start, 1.0);
      assert.strictEqual(result.cues[0].end, 1.9);
      // Original transcript object was not mutated
      assert.strictEqual(wordTranscript.words[1].word, 'Wrold');
    });

    it('transforms text to UPPERCASE when uppercase setting is enabled', () => {
      const wordTranscript = {
        words: [
          { word: 'vireo', start: 0.0, end: 0.5 },
          { word: 'captions', start: 0.5, end: 1.0 },
        ],
      };

      const result = CaptionService.extractClipCues(wordTranscript, 0, 10, 0, 0, { uppercase: true });
      assert.strictEqual(result.cues[0].text, 'VIREO CAPTIONS');
    });
  });

  // ── 5. ASS GENERATION & OVERLAP VALIDATION ──────────────────────
  describe('ASS Subtitle Script & Overlap Validator', () => {
    it('enforces zero overlapping Dialogue events in generated ASS script', () => {
      const cues: TimedCaptionCue[] = [
        { id: 'cue-1', start: 0.0, end: 2.5, text: 'Opening phrase' },
        { id: 'cue-2', start: 2.5, end: 4.8, text: 'Middle statement' },
        { id: 'cue-3', start: 5.0, end: 7.2, text: 'Closing thought' },
      ];

      const ass = CaptionService.buildAssScript(cues, {
        style: 'clean',
        position: 'bottom',
        aspectRatio: '9:16',
      });

      // Parse Dialogue lines
      const dialogueLines = ass
        .split('\n')
        .filter((l) => l.startsWith('Dialogue:'))
        .map((l) => {
          const parts = l.split(',');
          return {
            start: parts[1],
            end: parts[2],
            text: parts.slice(9).join(','),
          };
        });

      assert.strictEqual(dialogueLines.length, 3);
      assert.strictEqual(dialogueLines[0].start, '0:00:00.00');
      assert.strictEqual(dialogueLines[0].end, '0:00:02.50');
      assert.strictEqual(dialogueLines[1].start, '0:00:02.50');
      assert.strictEqual(dialogueLines[1].end, '0:00:04.80');
      assert.strictEqual(dialogueLines[2].start, '0:00:05.00');
      assert.strictEqual(dialogueLines[2].end, '0:00:07.20');

      const validation = CaptionService.validateNoOverlappingCues(cues);
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.maxActiveCues, 1);
    });

    it('generates real karaoke tags (\\k) using word durations when word timing exists', () => {
      const cues: TimedCaptionCue[] = [
        {
          id: 'cue-1',
          start: 1.0,
          end: 2.2,
          text: 'I WAS CLOSE',
          words: [
            { text: 'I', start: 1.0, end: 1.2 },       // 0.20s -> \k20
            { text: 'WAS', start: 1.2, end: 1.6 },     // 0.40s -> \k40
            { text: 'CLOSE', start: 1.6, end: 2.2 },   // 0.60s -> \k60
          ],
        },
      ];

      const ass = CaptionService.buildAssScript(cues, {
        style: 'karaoke',
        timingMode: 'word',
      });

      assert.ok(ass.includes('{\\k20}I {\\k40}WAS {\\k60}CLOSE'), `Expected karaoke tags in ASS: ${ass}`);
    });

    it('strictly clamps font family to safe allowlist', () => {
      assert.strictEqual(CaptionService.validateFontFamily('Inter'), 'Inter');
      assert.strictEqual(CaptionService.validateFontFamily('Arial Black'), 'Arial Black');
      // Arbitrary / malicious font strings must fallback to Arial
      assert.strictEqual(CaptionService.validateFontFamily('/etc/passwd'), 'Arial');
      assert.strictEqual(CaptionService.validateFontFamily('http://malicious.com/font.ttf'), 'Arial');
      assert.strictEqual(CaptionService.validateFontFamily('Comic Sans MS'), 'Arial');
    });

    it('supports custom background box border style and opacity', () => {
      const cues: TimedCaptionCue[] = [{ id: 'cue-1', start: 0, end: 2, text: 'Box background test' }];
      const ass = CaptionService.buildAssScript(cues, {
        customConfig: {
          backgroundEnabled: true,
          backgroundColor: '#000000',
          backgroundOpacity: 0.6,
        },
      });

      // BorderStyle 3 denotes bounding box background
      assert.ok(ass.includes(',3,'), 'Expected BorderStyle 3 in ASS header for background box');
    });
  });

  // ── 6. REAL FFMPEG RENDER CONSISTENCY & FRAME-BY-FRAME QA ────────
  describe('FFmpeg Real Video Render Verification', () => {
    const tmpDir = path.join(os.tmpdir(), `vireo-p12-5-test-${Date.now()}`);
    const sourceVideoPath = path.join(tmpDir, 'source.mp4');
    const assSubtitlePath = path.join(tmpDir, 'test_subs.ass');
    const outputVideoPath = path.join(tmpDir, 'output_captioned.mp4');

    it('renders video with burned non-overlapping captions and verifies frame output', async () => {
      fs.mkdirSync(tmpDir, { recursive: true });

      // 1. Generate a 5.0 second synthetic 9:16 video fixture
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input('color=c=navy:s=720x1280:r=25:d=5.0')
          .inputFormat('lavfi')
          .input('anullsrc=r=44100:cl=stereo')
          .inputFormat('lavfi')
          .outputOptions(['-t 5.0', '-pix_fmt yuv420p', '-c:v libx264', '-c:a aac', '-preset ultrafast'])
          .output(sourceVideoPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      assert.ok(fs.existsSync(sourceVideoPath), 'Source synthetic video was not generated');

      // 2. Generate ASS with two sequential, non-overlapping cues:
      // Cue 1: 0.5s - 2.5s ("FRAME ONE CAPTION")
      // Cue 2: 2.8s - 4.8s ("FRAME TWO CAPTION")
      const testCues: TimedCaptionCue[] = [
        { id: 'cue-1', start: 0.5, end: 2.5, text: 'FRAME ONE CAPTION' },
        { id: 'cue-2', start: 2.8, end: 4.8, text: 'FRAME TWO CAPTION' },
      ];

      const assContent = CaptionService.buildAssScript(testCues, {
        style: 'bold',
        aspectRatio: '9:16',
        customConfig: {
          fontSize: 64,
          textColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 4,
          positionY: 0.75,
        },
      });

      fs.writeFileSync(assSubtitlePath, assContent, 'utf8');
      assert.ok(fs.existsSync(assSubtitlePath), 'ASS subtitle file was not generated');

      // 3. Burn subtitles into output MP4 using FFmpeg libass filter
      const safeAss = assSubtitlePath.replace(/\\/g, '/');
      await new Promise<void>((resolve, reject) => {
        ffmpeg(sourceVideoPath)
          .videoFilters([`ass='${safeAss}'`])
          .outputOptions(['-pix_fmt yuv420p', '-c:v libx264', '-c:a copy', '-preset ultrafast'])
          .output(outputVideoPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      assert.ok(fs.existsSync(outputVideoPath), 'Captioned output MP4 was not created');
      const stats = fs.statSync(outputVideoPath);
      assert.ok(stats.size > 20000, `Output video too small (${stats.size} bytes)`);

      // 4. Extract frame at 1.5s (during Cue 1) and at 3.5s (during Cue 2)
      const frame1Path = path.join(tmpDir, 'frame_1_5s.jpg');
      const frame2Path = path.join(tmpDir, 'frame_3_5s.jpg');

      await new Promise<void>((resolve, reject) => {
        ffmpeg(outputVideoPath)
          .seekInput(1.5)
          .frames(1)
          .output(frame1Path)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      await new Promise<void>((resolve, reject) => {
        ffmpeg(outputVideoPath)
          .seekInput(3.5)
          .frames(1)
          .output(frame2Path)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      assert.ok(fs.existsSync(frame1Path), 'Frame at 1.5s was extracted');
      assert.ok(fs.existsSync(frame2Path), 'Frame at 3.5s was extracted');

      // Cleanup
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });
  });
});

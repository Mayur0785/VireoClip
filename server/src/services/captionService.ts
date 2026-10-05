import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import {
  ClipRecord,
  CaptionStyle,
  CaptionPosition,
  CaptionTimingMode,
  CaptionConfig,
  TimedCaptionCue,
  TimedCaptionToken,
  TranscriptSegment,
  ClipAspectRatio,
  SAFE_FONT_FAMILIES,
  SafeFontFamily,
} from '../types/index.js';

export interface GenerateCaptionsOptions {
  clip: ClipRecord;
  targetAspectRatio?: ClipAspectRatio;
  outputPath?: string; // Optional path to write .ass file
}

export interface CaptionGenerationResult {
  timingMode: CaptionTimingMode;
  cues: TimedCaptionCue[];
  assContent: string;
  assFilePath?: string;
}

export interface OverlapValidationResult {
  valid: boolean;
  overlaps: Array<{
    cue1Id: string;
    cue2Id: string;
    cue1End: number;
    cue2Start: number;
    overlapMs: number;
  }>;
  maxActiveCues: number;
}

export class CaptionService {
  /**
   * Safe font family validator strictly enforcing allowlist
   */
  public static validateFontFamily(font?: string): SafeFontFamily {
    if (!font || typeof font !== 'string') return 'Arial';
    const clean = font.trim();
    if ((SAFE_FONT_FAMILIES as readonly string[]).includes(clean)) {
      return clean as SafeFontFamily;
    }
    return 'Arial';
  }

  /**
   * Sanitizes text for safe inclusion inside ASS subtitle dialogues.
   * Strips/escapes curly braces `{}` which denote ASS override tags,
   * normalizes backslashes, and formats line breaks into `\N`.
   */
  public static sanitizeAssText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[{}]/g, '') // Strip ASS override command delimiters
      .replace(/\\/g, '/')  // Normalize backslashes
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Converts a standard hex color `#RRGGBB` into ASS BGR format `&H[Alpha]BBGGRR&`.
   * Alpha: 0 (00 = fully opaque) to 255 (FF = fully transparent).
   */
  public static hexToAssColor(hex?: string, defaultHex = '#FFFFFF', alpha = 0): string {
    const clean = (hex || '').trim();
    const hexPattern = /^#?([0-9a-fA-F]{6})$/;
    const match = clean.match(hexPattern);

    const safeAlpha = Math.min(255, Math.max(0, Math.round(alpha)));
    const alphaHex = safeAlpha.toString(16).padStart(2, '0').toUpperCase();

    if (!match) {
      return this.hexToAssColor(defaultHex, '#FFFFFF', alpha);
    }

    const value = match[1];
    const r = value.substring(0, 2).toUpperCase();
    const g = value.substring(2, 4).toUpperCase();
    const b = value.substring(4, 6).toUpperCase();

    // ASS format: &H[Alpha][Blue][Green][Red]&
    return `&H${alphaHex}${b}${g}${r}&`;
  }

  /**
   * Validates a hex color string
   */
  public static isValidHexColor(hex?: string): boolean {
    if (!hex || typeof hex !== 'string') return false;
    return /^#?([0-9a-fA-F]{6})$/.test(hex.trim());
  }

  /**
   * Formats seconds into ASS timestamp string: `H:MM:SS.CC` (Centiseconds)
   */
  public static formatAssTime(seconds: number): string {
    const clamped = Math.max(0, seconds);
    const totalCs = Math.round(clamped * 100);
    const h = Math.floor(totalCs / 360000);
    const m = Math.floor((totalCs % 360000) / 6000);
    const s = Math.floor((totalCs % 6000) / 100);
    const cs = totalCs % 100;

    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    const csStr = String(cs).padStart(2, '0');

    return `${h}:${mStr}:${sStr}.${csStr}`;
  }

  /**
   * Normalizes video resolution for ASS PlayRes coordinates based on aspect ratio
   */
  public static getPlayRes(aspectRatio: ClipAspectRatio = '9:16'): { x: number; y: number } {
    switch (aspectRatio) {
      case '9:16':
        return { x: 1080, y: 1920 };
      case '1:1':
        return { x: 1080, y: 1080 };
      case '16:9':
        return { x: 1920, y: 1080 };
      default:
        return { x: 1080, y: 1920 };
    }
  }

  /**
   * Resolves ASS Style Alignment code and vertical margin
   */
  public static getPositionConfig(
    position: CaptionPosition = 'bottom',
    aspectRatio: ClipAspectRatio = '9:16'
  ): { alignment: number; marginV: number } {
    const isPortrait = aspectRatio === '9:16';

    switch (position) {
      case 'top':
        return {
          alignment: 8, // Top Center
          marginV: isPortrait ? 180 : 60,
        };
      case 'center':
        return {
          alignment: 5, // Middle Center
          marginV: 0,
        };
      case 'bottom':
      default:
        return {
          alignment: 2, // Bottom Center
          marginV: isPortrait ? 220 : 80,
        };
    }
  }

  /**
   * Enforces strict monotonic non-overlapping timing on consecutive caption cues.
   * At any timestamp, normally only ONE caption cue will be active.
   */
  public static enforceZeroOverlap(cues: TimedCaptionCue[]): TimedCaptionCue[] {
    if (!cues || cues.length <= 1) return cues || [];

    // Sort cues by start timestamp ascending
    const sorted = [...cues].sort((a, b) => a.start - b.start);

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // If current cue ends after next cue starts, clamp current.end
      if (current.end > next.start) {
        const clampedEnd = Math.max(current.start + 0.05, Number(next.start.toFixed(3)));
        current.end = clampedEnd;

        // Also clamp the last word's end if words are present
        if (Array.isArray(current.words) && current.words.length > 0) {
          const lastWord = current.words[current.words.length - 1];
          if (lastWord.end > clampedEnd) {
            lastWord.end = clampedEnd;
          }
        }
      }
    }

    return sorted;
  }

  /**
   * Validates that no two unrelated cues overlap in time.
   */
  public static validateNoOverlappingCues(
    cues: TimedCaptionCue[],
    toleranceMs = 50
  ): OverlapValidationResult {
    const overlaps: OverlapValidationResult['overlaps'] = [];
    if (!cues || cues.length <= 1) {
      return { valid: true, overlaps: [], maxActiveCues: cues?.length ? 1 : 0 };
    }

    const sorted = [...cues].sort((a, b) => a.start - b.start);
    let maxSimultaneous = 1;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      const diffSec = current.end - next.start;
      const overlapMs = Math.round(diffSec * 1000);

      if (overlapMs > toleranceMs) {
        overlaps.push({
          cue1Id: current.id,
          cue2Id: next.id,
          cue1End: current.end,
          cue2Start: next.start,
          overlapMs,
        });
      }
    }

    // Check peak active cues across time sample points
    const checkPoints = new Set<number>();
    for (const c of sorted) {
      checkPoints.add(c.start);
      checkPoints.add(c.start + 0.02);
      checkPoints.add(c.end - 0.02);
      checkPoints.add(c.end);
    }

    for (const t of checkPoints) {
      const activeCount = sorted.filter((c) => t >= c.start && t < c.end).length;
      if (activeCount > maxSimultaneous) {
        maxSimultaneous = activeCount;
      }
    }

    return {
      valid: overlaps.length === 0 && maxSimultaneous <= 1,
      overlaps,
      maxActiveCues: maxSimultaneous,
    };
  }

  /**
   * Groups timed words into short, human-friendly caption cues (default 3–5 words).
   * Natural break triggers:
   * - Max words per cue reached (default 4)
   * - Meaningful speech pause (>0.45s gap)
   * - Punctuation on previous token (comma, period, question mark, etc.)
   * - Max line width / max lines reached
   * - Cue duration limit (max ~3.2s)
   */
  public static groupIntoCues(
    tokens: TimedCaptionToken[],
    maxWords = 4,
    maxLines = 2,
    maxCharsPerLine = 28,
    pauseBreak = 0.45
  ): TimedCaptionCue[] {
    if (!tokens || tokens.length === 0) return [];

    const cues: TimedCaptionCue[] = [];
    let currentWords: TimedCaptionToken[] = [];
    const safeMaxWords = Math.min(6, Math.max(2, maxWords));
    const totalMaxChars = maxCharsPerLine * maxLines;

    const flush = () => {
      if (currentWords.length === 0) return;
      const start = currentWords[0].start;
      const end = currentWords[currentWords.length - 1].end;
      const rawText = currentWords.map((t) => t.text).join(' ');

      // Split into 2 lines if exceeds single line character threshold
      let formattedText = rawText;
      if (maxLines > 1 && rawText.length > maxCharsPerLine && currentWords.length >= 2) {
        const midIndex = Math.ceil(currentWords.length / 2);
        const line1 = currentWords.slice(0, midIndex).map((t) => t.text).join(' ');
        const line2 = currentWords.slice(midIndex).map((t) => t.text).join(' ');
        formattedText = `${line1}\\N${line2}`;
      }

      if (end > start) {
        const wordsCopy = currentWords.map((w) => ({ ...w }));
        cues.push({
          id: `cue-${cues.length + 1}`,
          start: Number(start.toFixed(3)),
          end: Number(end.toFixed(3)),
          text: formattedText,
          words: wordsCopy,
          tokens: wordsCopy, // backward-compatibility alias
        });
      }
      currentWords = [];
    };

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const prevTok = currentWords[currentWords.length - 1];

      // Check timing gap (>pauseBreak second pause indicates natural pause in speech)
      const hasPause = prevTok && tok.start - prevTok.end > pauseBreak;

      // Check punctuation at end of previous word
      const prevHasPunctuation = prevTok && /[.!?,;:]$/.test(prevTok.text);

      // Check word count
      const wouldExceedWords = currentWords.length >= safeMaxWords;

      // Check character count
      const currentText = currentWords.map((t) => t.text).join(' ');
      const wouldExceedChars = (currentText + ' ' + tok.text).length > totalMaxChars;

      // Check duration limit (avoid cues lasting longer than 3.2 seconds)
      const wouldExceedDuration =
        currentWords.length > 0 && tok.end - currentWords[0].start > 3.2;

      if (
        currentWords.length > 0 &&
        (hasPause || prevHasPunctuation || wouldExceedWords || wouldExceedChars || wouldExceedDuration)
      ) {
        flush();
      }

      currentWords.push(tok);
    }

    flush();
    return this.enforceZeroOverlap(cues);
  }

  /**
   * Extracts transcript tokens/segments and converts them to clip-local coordinates.
   * Backward compatible:
   * - If real word timestamps exist: uses real word timing & grouping.
   * - If only segments exist: uses segment-level captions without fabricating fake word timestamps.
   */
  public static extractClipCues(
    transcript: { segments?: any[]; words?: any[] },
    clipStart: number,
    clipEnd: number,
    trimStartOffset = 0,
    trimEndOffset = 0,
    captionConfig?: CaptionConfig
  ): { timingMode: CaptionTimingMode; cues: TimedCaptionCue[] } {
    const effectiveStart = Number((clipStart + trimStartOffset).toFixed(3));
    const effectiveEnd = Number((clipEnd - trimEndOffset).toFixed(3));
    const effectiveDuration = Number((effectiveEnd - effectiveStart).toFixed(3));

    if (effectiveDuration <= 0) {
      return { timingMode: 'segment', cues: [] };
    }

    const maxWords = captionConfig?.maxWordsPerCue || 4;
    const maxLines = captionConfig?.maxLines || 2;
    const isUppercase = Boolean(captionConfig?.uppercase);

    // 1. Check if word-level timestamps are present
    const rawWords =
      Array.isArray(transcript.words) && transcript.words.length > 0
        ? transcript.words
        : Array.isArray(transcript.segments)
        ? transcript.segments.flatMap((s) => (Array.isArray(s?.words) ? s.words : []))
        : [];

    if (rawWords.length > 0) {
      // WORD-LEVEL TIMING MODE
      const candidateTokens: TimedCaptionToken[] = [];

      for (const w of rawWords) {
        const wStart = Number(w.start);
        const wEnd = Number(w.end);
        let wText = String(w.word || w.text || '').trim();

        if (isNaN(wStart) || isNaN(wEnd) || !wText) continue;

        // Check if word overlaps effective clip bounds
        if (wEnd > effectiveStart && wStart < effectiveEnd) {
          const localStart = Math.max(0, Number((wStart - effectiveStart).toFixed(3)));
          const localEnd = Math.min(effectiveDuration, Number((wEnd - effectiveStart).toFixed(3)));

          if (localEnd > localStart) {
            if (isUppercase) {
              wText = wText.toUpperCase();
            }
            candidateTokens.push({
              text: wText,
              start: localStart,
              end: localEnd,
            });
          }
        }
      }

      if (candidateTokens.length > 0) {
        let cues = this.groupIntoCues(candidateTokens, maxWords, maxLines);

        // Apply manual text overrides if any
        cues = this.applyOverrides(cues, captionConfig?.caption_overrides);

        return {
          timingMode: 'word',
          cues,
        };
      }
    }

    // 2. SEGMENT-LEVEL FALLBACK MODE (Never manufacture fake word timestamps)
    const rawSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
    const cues: TimedCaptionCue[] = [];

    for (const seg of rawSegments) {
      const segStart = Number(seg.start);
      const segEnd = Number(seg.end);
      let segText = String(seg.text || '').trim();

      if (isNaN(segStart) || isNaN(segEnd) || !segText) continue;

      // Check overlap
      if (segEnd > effectiveStart && segStart < effectiveEnd) {
        const localStart = Math.max(0, Number((segStart - effectiveStart).toFixed(3)));
        const localEnd = Math.min(effectiveDuration, Number((segEnd - effectiveStart).toFixed(3)));
        const segDuration = localEnd - localStart;

        if (segDuration > 0) {
          if (isUppercase) {
            segText = segText.toUpperCase();
          }

          // Format clean 2-line break if long
          const words = segText.split(/\s+/).filter(Boolean);
          let displayText = segText;
          if (words.length > 7 && maxLines > 1) {
            const midpoint = Math.ceil(words.length / 2);
            displayText = `${words.slice(0, midpoint).join(' ')}\\N${words.slice(midpoint).join(' ')}`;
          }

          cues.push({
            id: `cue-${cues.length + 1}`,
            start: localStart,
            end: localEnd,
            text: displayText,
          });
        }
      }
    }

    // Guarantee non-overlapping consecutive segment cues
    let processedCues = this.enforceZeroOverlap(cues);

    // Apply manual text overrides if any
    processedCues = this.applyOverrides(processedCues, captionConfig?.caption_overrides);

    return {
      timingMode: 'segment',
      cues: processedCues,
    };
  }

  /**
   * Applies manual text corrections without mutating canonical transcript
   */
  private static applyOverrides(
    cues: TimedCaptionCue[],
    overrides?: Array<{ cueId: string; text: string }>
  ): TimedCaptionCue[] {
    if (!overrides || overrides.length === 0) return cues;

    const overrideMap = new Map<string, string>();
    for (const o of overrides) {
      if (o.cueId && typeof o.text === 'string') {
        overrideMap.set(o.cueId, o.text.trim());
      }
    }

    return cues.map((cue) => {
      if (overrideMap.has(cue.id)) {
        return {
          ...cue,
          text: overrideMap.get(cue.id)!,
        };
      }
      return cue;
    });
  }

  /**
   * Builds the complete ASS script content for FFmpeg burning.
   * Guarantees that at any timestamp normally exactly ONE caption event is visible.
   */
  public static buildAssScript(
    cues: TimedCaptionCue[],
    options: {
      style?: CaptionStyle;
      position?: CaptionPosition;
      aspectRatio?: ClipAspectRatio;
      customConfig?: CaptionConfig;
      timingMode?: CaptionTimingMode;
    }
  ): string {
    const {
      style = 'clean',
      position = 'bottom',
      aspectRatio = '9:16',
      customConfig = {},
      timingMode = 'segment',
    } = options;

    const playRes = this.getPlayRes(aspectRatio);
    const posConfig = this.getPositionConfig(position, aspectRatio);

    // 1. Typography & Font validation
    const rawFont = customConfig.fontFamily;
    const fontName = this.validateFontFamily(rawFont);

    // Safe font size clamping (32 to 110)
    let defaultFontSize = 64;
    switch (style) {
      case 'bold':
        defaultFontSize = 76;
        break;
      case 'minimal':
        defaultFontSize = 48;
        break;
      case 'podcast':
        defaultFontSize = 66;
        break;
      case 'highlight':
        defaultFontSize = 72;
        break;
      case 'karaoke':
        defaultFontSize = 70;
        break;
      case 'clean':
      default:
        defaultFontSize = 64;
        break;
    }

    const rawSize = customConfig.fontSize || defaultFontSize;
    const fontSize = Math.min(110, Math.max(32, Math.round(rawSize)));

    // Font weight (400 - 900)
    const fontWeight = customConfig.fontWeight ?? (style === 'bold' || style === 'highlight' || style === 'karaoke' ? 800 : 700);
    const bold = fontWeight >= 700 ? 1 : 0;

    // 2. Colors & Stroke
    const textColorHex = customConfig.textColor || customConfig.primaryColor || '#FFFFFF';
    const activeColorHex =
      customConfig.activeWordColor ||
      customConfig.highlightColor ||
      (style === 'highlight' ? '#10B981' : style === 'podcast' ? '#F59E0B' : '#FF6B35');
    const strokeColorHex = customConfig.strokeColor || customConfig.outlineColor || '#000000';

    let primaryColour = this.hexToAssColor(textColorHex, '#FFFFFF', 0);
    let secondaryColour = this.hexToAssColor(activeColorHex, '#FF6B35', 0);
    let outlineColour = this.hexToAssColor(strokeColorHex, '#000000', 0);

    // Stroke width (0 to 8)
    const rawStroke =
      customConfig.strokeWidth ??
      customConfig.outlineWidth ??
      (style === 'bold' ? 5.5 : style === 'minimal' ? 1.5 : 4.0);
    const outline = Math.min(8, Math.max(0, Number(rawStroke.toFixed(1))));

    // Shadow (0 to 5)
    const isShadowEnabled = customConfig.shadowEnabled !== false;
    let shadow = 0;
    if (isShadowEnabled) {
      const rawShadow = customConfig.shadow ?? (style === 'minimal' ? 0 : 1.8);
      shadow = Math.min(5, Math.max(0, Number(rawShadow.toFixed(1))));
    }

    // Background box vs Outline
    let borderStyle = 1; // 1 = Outline + Drop Shadow
    let backColour = '&H80000000&'; // Default semi-transparent shadow

    if (customConfig.backgroundEnabled) {
      borderStyle = 3; // 3 = Opaque/Translucent Bounding Box
      const bgOpacity = Math.min(1, Math.max(0, customConfig.backgroundOpacity ?? 0.55));
      const bgAlpha = Math.round((1 - bgOpacity) * 255);
      backColour = this.hexToAssColor(customConfig.backgroundColor || '#000000', '#000000', bgAlpha);
    } else {
      const shadowOpacity = Math.min(1, Math.max(0, customConfig.shadowOpacity ?? 0.45));
      const shadowAlpha = Math.round((1 - shadowOpacity) * 255);
      backColour = this.hexToAssColor('#000000', '#000000', shadowAlpha);
    }

    // 3. Placement & Alignment
    let alignment = posConfig.alignment;
    if (customConfig.textAlign === 'left') {
      alignment = alignment === 8 ? 7 : alignment === 5 ? 4 : 1;
    } else if (customConfig.textAlign === 'right') {
      alignment = alignment === 8 ? 9 : alignment === 5 ? 6 : 3;
    }

    // Fine vertical position (positionY: 0.0 to 1.0)
    let marginV = posConfig.marginV;
    if (customConfig.positionY !== undefined) {
      const posY = Math.min(0.92, Math.max(0.08, Number(customConfig.positionY)));
      marginV = Math.round(playRes.y * (1 - posY));
    }

    // 4. Animation tags
    const animation = customConfig.animation || 'none';
    let animationTag = '';
    if (animation === 'fade') {
      animationTag = '{\\fad(90,90)}';
    } else if (animation === 'pop') {
      animationTag = '{\\t(0,70,\\fscx110\\fscy110)\\t(70,140,\\fscx100\\fscy100)}';
    }

    // Enforce strict zero overlap across cues
    const cleanCues = this.enforceZeroOverlap(cues);

    // 5. Format Dialogue Events (exactly one dialogue event per cue)
    const events: string[] = [];

    for (const cue of cleanCues) {
      const startStr = this.formatAssTime(cue.start);
      const endStr = this.formatAssTime(cue.end);
      let dialogueText = '';

      if (style === 'karaoke' && timingMode === 'word' && Array.isArray(cue.words) && cue.words.length > 0) {
        // True Karaoke: use real word durations with ASS {\k<duration_cs>}
        const parts: string[] = [];
        for (const tok of cue.words) {
          const durationCs = Math.max(1, Math.round((tok.end - tok.start) * 100));
          const safeWord = this.sanitizeAssText(tok.text);
          parts.push(`{\\k${durationCs}}${safeWord}`);
        }
        dialogueText = `${animationTag}${parts.join(' ')}`;
      } else if (style === 'highlight' || style === 'podcast') {
        // Highlight first word with activeWordColor
        const words = cue.text.split(' ');
        if (words.length > 1) {
          const highlightWord = this.sanitizeAssText(words[0]);
          const rest = this.sanitizeAssText(words.slice(1).join(' '));
          dialogueText = `${animationTag}{\\c${secondaryColour}}${highlightWord}{\\c${primaryColour}} ${rest}`;
        } else {
          dialogueText = `${animationTag}${this.sanitizeAssText(cue.text)}`;
        }
      } else {
        dialogueText = `${animationTag}${this.sanitizeAssText(cue.text)}`;
      }

      if (dialogueText.trim()) {
        events.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${dialogueText}`);
      }
    }

    const script = [
      '[Script Info]',
      'Title: Vireo Auto Captions',
      'ScriptType: v4.00+',
      `PlayResX: ${playRes.x}`,
      `PlayResY: ${playRes.y}`,
      'ScaledBorderAndShadow: yes',
      'WrapStyle: 0',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      `Style: Default,${fontName},${fontSize},${primaryColour},${secondaryColour},${outlineColour},${backColour},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},60,60,${marginV},1`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
      '',
    ].join('\n');

    return script;
  }

  /**
   * Main service function: fetches transcript, computes clip cues, writes ASS file if path provided
   */
  public static async generateCaptionsForClip(
    options: GenerateCaptionsOptions
  ): Promise<CaptionGenerationResult> {
    const { clip, targetAspectRatio = clip.aspect_ratio || '9:16', outputPath } = options;

    if (!isMongoConfigured) {
      return { timingMode: 'segment', cues: [], assContent: '' };
    }

    // Load transcript for this project
    const { data: transcript, error: transErr } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .eq('user_id', clip.user_id)
      .maybeSingle();

    if (transErr || !transcript) {
      logger.warn(`No transcript found for clip ${clip.id}, rendering without burned captions.`);
      return { timingMode: 'segment', cues: [], assContent: '' };
    }

    const trimStart = Number(clip.trim_start_offset || 0);
    const trimEnd = Number(clip.trim_end_offset || 0);

    const mergedConfig: CaptionConfig = {
      ...(clip.caption_config || {}),
      caption_overrides: clip.caption_config?.caption_overrides || (clip as any).caption_overrides || [],
    };

    const { timingMode, cues } = this.extractClipCues(
      transcript,
      clip.start_seconds,
      clip.end_seconds,
      trimStart,
      trimEnd,
      mergedConfig
    );

    const assContent = this.buildAssScript(cues, {
      style: (clip.caption_style as CaptionStyle) || 'clean',
      position: (clip.caption_position as CaptionPosition) || 'bottom',
      aspectRatio: targetAspectRatio,
      customConfig: mergedConfig,
      timingMode,
    });

    let assFilePath: string | undefined;
    if (outputPath) {
      fs.writeFileSync(outputPath, assContent, 'utf8');
      assFilePath = outputPath;
    }

    return {
      timingMode,
      cues,
      assContent,
      assFilePath,
    };
  }
}

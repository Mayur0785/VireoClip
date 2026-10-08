import crypto from 'node:crypto';
import {
  TimedCaptionCue,
  TranslatedSegment,
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  SafeEditorFont,
} from '../../types/index.js';
import { LanguageModel } from './languageModel.js';

/**
 * Phase 21: Caption Localization, Timing Alignment & Subtitle Export Service
 * Converts translated segments into formatted caption cues, handles line-breaking,
 * font selection, and exports to industry-standard SRT and WebVTT formats.
 */
export class CaptionLocalizationService {
  /**
   * Generates TimedCaptionCues from translated segments.
   * If word-level timing is unavailable, derives bounded timing from segment duration.
   */
  public static generateLocalizedCues(
    segments: TranslatedSegment[],
    langCode: string
  ): TimedCaptionCue[] {
    const cues: TimedCaptionCue[] = [];

    for (const seg of segments) {
      const text = (seg.translated_text || seg.source_text).trim();
      if (!text) continue;

      const duration = Math.max(0.2, seg.end_time - seg.start_time);
      const lines = LanguageModel.breakCaptionLines(text, langCode, 36);

      if (lines.length === 1) {
        cues.push({
          id: crypto.randomUUID(),
          start: Math.round(seg.start_time * 1000) / 1000,
          end: Math.round(seg.end_time * 1000) / 1000,
          text: lines[0],
        });
      } else {
        // Distribute segment duration among multiple lines proportionally to line length
        const totalChars = lines.reduce((acc, l) => acc + l.length, 0);
        let cursor = seg.start_time;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineFraction = totalChars > 0 ? line.length / totalChars : 1 / lines.length;
          const lineDur = duration * lineFraction;
          const lineEnd = i === lines.length - 1 ? seg.end_time : cursor + lineDur;

          cues.push({
            id: crypto.randomUUID(),
            start: Math.round(cursor * 1000) / 1000,
            end: Math.round(lineEnd * 1000) / 1000,
            text: line,
          });

          cursor = lineEnd;
        }
      }
    }

    return cues;
  }

  /**
   * Formats seconds into SRT timestamp format: HH:MM:SS,mmm
   */
  public static formatSrtTimestamp(seconds: number): string {
    const s = Math.max(0, seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const millis = Math.floor((s % 1) * 1000);

    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(millis, 3)}`;
  }

  /**
   * Formats seconds into WebVTT timestamp format: HH:MM:SS.mmm
   */
  public static formatVttTimestamp(seconds: number): string {
    const srt = this.formatSrtTimestamp(seconds);
    return srt.replace(',', '.');
  }

  /**
   * Generates standard SubRip Subtitle (.srt) string from cues.
   */
  public static generateSRT(cues: TimedCaptionCue[]): string {
    const blocks: string[] = [];

    cues.forEach((cue, index) => {
      const idx = index + 1;
      const startStr = this.formatSrtTimestamp(cue.start);
      const endStr = this.formatSrtTimestamp(cue.end);
      blocks.push(`${idx}\n${startStr} --> ${endStr}\n${cue.text}\n`);
    });

    return blocks.join('\n');
  }

  /**
   * Generates WebVTT (.vtt) string from cues.
   */
  public static generateVTT(cues: TimedCaptionCue[]): string {
    const lines: string[] = ['WEBVTT\n'];

    cues.forEach((cue) => {
      const startStr = this.formatVttTimestamp(cue.start);
      const endStr = this.formatVttTimestamp(cue.end);
      lines.push(`${startStr} --> ${endStr}\n${cue.text}\n`);
    });

    return lines.join('\n');
  }

  /**
   * Injects or updates a localized caption track into an EditorProject.
   * Preserves all video and audio tracks intact.
   */
  public static injectLocalizedCaptionTrack(
    project: EditorProject,
    cues: TimedCaptionCue[],
    langCode: string
  ): EditorProject {
    const langDef = LanguageModel.getLanguageDefinition(langCode);
    const langName = langDef ? langDef.name : langCode.toUpperCase();
    const safeFont = (langDef?.safe_fonts[0] || 'Arial') as SafeEditorFont;

    const trackName = `Captions (${langName})`;

    // Filter out existing caption track for this language if updating
    const remainingTracks = project.tracks.filter(
      (t) => !(t.type === 'TEXT' && t.name.toLowerCase() === trackName.toLowerCase())
    );

    const trackId = crypto.randomUUID();
    const newItems: EditorTrackItem[] = cues.map((cue) => ({
      id: crypto.randomUUID(),
      track_id: trackId,
      type: 'TEXT',
      timeline_start: cue.start,
      timeline_end: cue.end,
      source_start: 0,
      source_end: cue.end - cue.start,
      transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
      speed: { speed: 1, pitch_preserved: true },
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: 10,
      text: {
        text: cue.text,
        font_family: safeFont,
        font_size: 48,
        font_weight: 'bold',
        italic: false,
        alignment: 'center',
        color: '#FFFFFF',
      },
    }));

    const captionTrack: EditorTrack = {
      id: trackId,
      type: 'TEXT',
      name: trackName,
      locked: false,
      muted: false,
      hidden: false,
      items: newItems,
    };

    return {
      ...project,
      tracks: [...remainingTracks, captionTrack],
      updated_at: new Date().toISOString(),
    };
  }
}

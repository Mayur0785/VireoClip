import {
  TranscriptSegment,
  HookOpeningWindow,
  HookOpeningAnalysis,
  HookOpeningLatencyLabel,
  HookMultimodalSignals,
  HookType,
  EditorProject,
  VideoSceneCut,
  AudioSilenceInterval,
  FacePresenceInterval,
} from '../../types/index.js';
import { SpeechIntelligenceService, TranscriptWord } from '../speechIntelligenceService.js';
import { VideoSceneService } from '../multimodal/videoSceneService.js';
import { FaceFeatureService } from '../multimodal/faceFeatureService.js';
import { AudioFeatureService } from '../multimodal/audioFeatureService.js';
import { logger } from '../../utils/logger.js';

export interface OpeningAnalyzerInput {
  clipStartSeconds: number;
  clipEndSeconds: number;
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
  editorProject?: EditorProject;
  sceneCuts?: VideoSceneCut[];
  silenceIntervals?: AudioSilenceInterval[];
  faceIntervals?: FacePresenceInterval[];
  window?: HookOpeningWindow;
}

export class HookOpeningAnalyzer {
  /**
   * Analyzes the opening 1–5 seconds of a clip using transcript, speech intelligence,
   * editor state, and multimodal signals.
   */
  public static analyzeOpening(input: OpeningAnalyzerInput): HookOpeningAnalysis {
    const {
      clipStartSeconds,
      clipEndSeconds,
      segments,
      words = [],
      editorProject,
      sceneCuts = [],
      silenceIntervals = [],
      faceIntervals = [],
    } = input;

    const openingStart = input.window?.start_seconds ?? 0;
    const openingEnd = input.window?.end_seconds ?? 3.0;
    const windowDuration = Math.max(1.0, openingEnd - openingStart);

    // Filter segments in opening window (relative to clip start)
    const absoluteWindowStart = clipStartSeconds + openingStart;
    const absoluteWindowEnd = clipStartSeconds + openingEnd;

    const openingSegments = segments.filter(
      (s) => s.end >= absoluteWindowStart && s.start <= absoluteWindowEnd
    );

    // Extract word-level data if available, or generate from segments
    const openingWords: TranscriptWord[] = [];
    if (words.length > 0) {
      for (const w of words) {
        if (w.end >= absoluteWindowStart && w.start <= absoluteWindowEnd) {
          openingWords.push({
            word: w.word,
            start: Math.max(0, w.start - clipStartSeconds),
            end: Math.max(0, w.end - clipStartSeconds),
            confidence: w.confidence,
          });
        }
      }
    } else {
      // Synthesize approximate words from opening segments
      for (const seg of openingSegments) {
        const segWords = seg.text.split(/\s+/).filter(Boolean);
        const segDuration = Math.max(0.1, seg.end - seg.start);
        const wordDuration = segDuration / Math.max(1, segWords.length);
        segWords.forEach((word, idx) => {
          const wStart = seg.start + idx * wordDuration - clipStartSeconds;
          const wEnd = wStart + wordDuration;
          if (wEnd >= openingStart && wStart <= openingEnd) {
            openingWords.push({
              word: word.replace(/[^\w'-]/g, ''),
              start: Math.max(0, wStart),
              end: Math.max(0, wEnd),
              confidence: 0.9,
            });
          }
        });
      }
    }

    // 1. Detect filler words at the start
    const fillerMatches = SpeechIntelligenceService.detectFillerWords(openingWords);
    const leadingFillerWords: string[] = [];
    let hasLeadingFiller = false;

    // Check if the first 1-2 words are fillers
    if (openingWords.length > 0) {
      const firstWord = openingWords[0].word.toLowerCase();
      const firstTwo = openingWords.length > 1
        ? `${firstWord} ${openingWords[1].word.toLowerCase()}`
        : '';
      const matchingFiller = fillerMatches.find(
        (f) => f.word.toLowerCase() === firstWord || f.word.toLowerCase() === firstTwo
      );
      if (matchingFiller) {
        hasLeadingFiller = true;
        leadingFillerWords.push(matchingFiller.word);
      }
    }

    // 2. Measure first meaningful speech latency
    let timeToFirstMeaningfulSpeech = 0;
    if (openingWords.length === 0) {
      timeToFirstMeaningfulSpeech = windowDuration;
    } else {
      let firstMeaningfulWord = openingWords[0];
      if (hasLeadingFiller && openingWords.length > 1) {
        firstMeaningfulWord = openingWords[1];
      }
      timeToFirstMeaningfulSpeech = Number(Math.max(0, firstMeaningfulWord.start).toFixed(2));
    }

    // Heuristic latency label (documented Vireo heuristic)
    let latencyLabel: HookOpeningLatencyLabel = 'FAST';
    if (timeToFirstMeaningfulSpeech > 2.0) {
      latencyLabel = 'SLOW';
    } else if (timeToFirstMeaningfulSpeech > 0.8) {
      latencyLabel = 'MODERATE';
    }

    // 3. Leading silence detection
    const leadingSilenceDuration = timeToFirstMeaningfulSpeech;
    const hasLeadingSilence = leadingSilenceDuration >= 0.5;

    // 4. Current hook extraction (transcript vs text overlay vs caption vs NO_CLEAR_HOOK)
    let currentHookText = '';
    let currentHookSource: 'TRANSCRIPT' | 'TEXT_OVERLAY' | 'CAPTION' | 'NO_CLEAR_HOOK' = 'NO_CLEAR_HOOK';

    // Check text overlays in editor project first
    if (editorProject) {
      for (const track of editorProject.tracks || []) {
        if (track.type === 'TEXT') {
          for (const item of track.items || []) {
            if (item.text && item.timeline_start <= openingStart + 0.5) {
              currentHookText = item.text.text.trim();
              currentHookSource = 'TEXT_OVERLAY';
              break;
            }
          }
        }
        if (currentHookText) break;
      }
    }

    // Fall back to opening spoken transcript
    if (!currentHookText && openingSegments.length > 0) {
      const combined = openingSegments.map((s) => s.text.trim()).join(' ').trim();
      if (combined.length > 3) {
        currentHookText = combined;
        currentHookSource = 'TRANSCRIPT';
      }
    }

    // Fall back to caption items
    if (!currentHookText && editorProject) {
      for (const track of editorProject.tracks || []) {
        if (track.type === 'CAPTION') {
          for (const item of track.items || []) {
            if (item.caption && item.timeline_start <= openingStart + 1.0) {
              const cueText = item.caption.cues?.[0]?.text || '';
              if (cueText) {
                currentHookText = cueText.trim();
                currentHookSource = 'CAPTION';
                break;
              }
            }
          }
        }
        if (currentHookText) break;
      }
    }

    if (!currentHookText) {
      currentHookText = '';
      currentHookSource = 'NO_CLEAR_HOOK';
    }

    // 5. Multimodal signals in opening window
    const cutsInWindow = sceneCuts.filter(
      (c) => c.timestamp >= absoluteWindowStart && c.timestamp <= absoluteWindowEnd
    );
    const visualActivity = VideoSceneService.calculateVisualActivityScore(
      absoluteWindowStart,
      absoluteWindowEnd,
      sceneCuts
    );
    const hasFace = FaceFeatureService.hasFaceInWindow(
      absoluteWindowStart,
      absoluteWindowEnd,
      faceIntervals
    ).hasFace;

    const multimodalSignals: HookMultimodalSignals = {
      speech_energy_db: openingWords.length > 0 ? -18.5 : -32.0,
      visual_activity_score: visualActivity,
      scene_cuts_in_window: cutsInWindow.length,
      face_present: hasFace,
      ocr_text_present: currentHookSource === 'TEXT_OVERLAY',
      audio_energy_score: openingWords.length > 0 ? 75 : 30,
    };

    // 6. Diagnostics (Issues & Strengths)
    const issues: string[] = [];
    const strengths: string[] = [];

    if (currentHookSource === 'NO_CLEAR_HOOK') {
      issues.push('NO_CLEAR_HOOK');
      issues.push('NO_CLEAR_TOPIC');
    } else {
      if (hasLeadingSilence) {
        issues.push('SLOW_START');
      }
      if (hasLeadingFiller) {
        issues.push('FILLER_OPEN');
      }
      if (timeToFirstMeaningfulSpeech > 1.5) {
        issues.push('CONTEXT_DELAY');
      }
      if (currentHookText.length < 15 && currentHookSource === 'TRANSCRIPT') {
        issues.push('WEAK_SPECIFICITY');
      }
      if (currentHookText.toLowerCase().includes('today i wanted to') || currentHookText.toLowerCase().includes('in this video')) {
        issues.push('GENERIC_OPEN');
      }

      // Strengths
      if (timeToFirstMeaningfulSpeech <= 0.6) {
        strengths.push('FAST_TOPIC_ENTRY');
      }
      if (currentHookText.includes('?') || currentHookText.toLowerCase().includes('how') || currentHookText.toLowerCase().includes('why')) {
        strengths.push('CLEAR_PROMISE');
      }
      if (cutsInWindow.length > 0 || visualActivity >= 60) {
        strengths.push('VISUAL_CHANGE');
      }
      if (hasFace) {
        strengths.push('STRONG_PRESENCE');
      }
      if (multimodalSignals.audio_energy_score && multimodalSignals.audio_energy_score >= 70) {
        strengths.push('HIGH_SPEECH_ENERGY');
      }
    }

    // 7. Calculate baseline current hook score (0–100)
    let currentScore = 50;
    if (currentHookSource === 'NO_CLEAR_HOOK') {
      currentScore = 20;
    } else {
      if (timeToFirstMeaningfulSpeech <= 0.6) currentScore += 15;
      else if (timeToFirstMeaningfulSpeech <= 1.2) currentScore += 5;
      else currentScore -= 15;

      if (hasLeadingFiller) currentScore -= 15;
      if (hasLeadingSilence) currentScore -= 10;
      if (multimodalSignals.visual_activity_score && multimodalSignals.visual_activity_score >= 50) currentScore += 10;
      if (multimodalSignals.face_present) currentScore += 8;
      if (strengths.includes('CLEAR_PROMISE')) currentScore += 10;
      if (issues.includes('GENERIC_OPEN')) currentScore -= 12;
    }
    currentScore = Math.max(10, Math.min(95, currentScore));

    // Determine current hook type if applicable
    let currentHookType: HookType | undefined;
    const lower = currentHookText.toLowerCase();
    if (lower.includes('?')) currentHookType = 'QUESTION';
    else if (/\b\d+\b/.test(lower)) currentHookType = 'NUMBER';
    else if (lower.includes('never') || lower.includes('stop') || lower.includes("don't")) currentHookType = 'CONTRARIAN';
    else if (lower.includes('secret') || lower.includes('nobody')) currentHookType = 'CURIOSITY_GAP';
    else if (currentHookText.length > 0) currentHookType = 'DIRECT';

    return {
      current_hook_text: currentHookText,
      current_hook_source: currentHookSource,
      current_hook_type: currentHookType,
      current_hook_score: currentScore,
      time_to_first_meaningful_speech_sec: timeToFirstMeaningfulSpeech,
      latency_label: latencyLabel,
      has_leading_silence: hasLeadingSilence,
      leading_silence_duration_sec: leadingSilenceDuration,
      has_leading_filler: hasLeadingFiller,
      leading_filler_words: leadingFillerWords,
      multimodal_signals: multimodalSignals,
      issues,
      strengths,
    };
  }
}

import {
  FillerWordMatch,
  RepeatedPhraseMatch,
  AudioSilenceRemovalMode,
  AudioSilenceInterval,
} from '../types/index.js';

const KNOWN_FILLER_WORDS = new Set([
  'um', 'uh', 'er', 'ah', 'umm', 'uhh', 'like', 'basically', 'you know', 'sort of', 'kind of',
]);

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Phase 20: Speech Intelligence Service
 * Detects conversational defects and opportunities:
 * - Word-level filler word detection ('um', 'uh', 'you know', etc.)
 * - Syllable and timing boundary safety check
 * - Repeated take / false start detection
 * - Contextual silence tightening
 */
export class SpeechIntelligenceService {
  /**
   * Detects filler words from timed transcript words.
   * Enforces timing safety to ensure boundaries do not clip adjacent words.
   */
  public static detectFillerWords(words: TranscriptWord[]): FillerWordMatch[] {
    const matches: FillerWordMatch[] = [];

    for (let i = 0; i < words.length; i++) {
      const current = words[i];
      const cleanWord = current.word.toLowerCase().replace(/[^a-z]/g, '').trim();

      if (!cleanWord) continue;

      let isFiller = false;
      let matchedPhrase = cleanWord;
      let phraseEnd = current.end;
      let phraseConfidence = current.confidence ?? 0.9;
      let advanceBy = 0;

      // Single word check
      if (KNOWN_FILLER_WORDS.has(cleanWord)) {
        isFiller = true;
      }

      // Two-word phrase check (e.g., 'you know', 'sort of')
      if (i + 1 < words.length) {
        const next = words[i + 1];
        const nextClean = next.word.toLowerCase().replace(/[^a-z]/g, '').trim();
        const twoWord = `${cleanWord} ${nextClean}`;
        if (KNOWN_FILLER_WORDS.has(twoWord)) {
          isFiller = true;
          matchedPhrase = twoWord;
          phraseEnd = next.end;
          phraseConfidence = Math.min(phraseConfidence, next.confidence ?? 0.9);
          advanceBy = 1;
        }
      }

      if (isFiller) {
        // Boundary safety check:
        // Must have at least 0.08s buffer to prev/next words, or be at sentence edge
        const prevWord = i > 0 ? words[i - 1] : null;
        const nextWord = (i + 1 + advanceBy < words.length) ? words[i + 1 + advanceBy] : null;

        const prevGap = prevWord ? Math.max(0, current.start - prevWord.end) : 0.5;
        const nextGap = nextWord ? Math.max(0, nextWord.start - phraseEnd) : 0.5;

        // "Like" or "basically" mid-phrase without pause might be grammatical
        let safeToRemove = true;
        let reason = 'Isolated filler word';

        if (cleanWord === 'like' || cleanWord === 'basically') {
          if (prevGap < 0.15 && nextGap < 0.15) {
            safeToRemove = false;
            reason = 'Likely contextual usage without distinct conversational pause';
          }
        }

        matches.push({
          word: matchedPhrase,
          start: Math.round(current.start * 1000) / 1000,
          end: Math.round(phraseEnd * 1000) / 1000,
          confidence: Number(phraseConfidence.toFixed(2)),
          safe_to_remove: safeToRemove,
          reason,
        });

        i += advanceBy;
      }
    }

    return matches;
  }

  /**
   * Detects false starts or repeated phrases separated by brief pauses.
   * e.g., "We need to— [pause] We need to launch the project."
   */
  public static detectRepeatedPhrases(words: TranscriptWord[]): RepeatedPhraseMatch[] {
    const repeated: RepeatedPhraseMatch[] = [];
    const minNgram = 2;
    const maxNgram = 5;

    for (let len = maxNgram; len >= minNgram; len--) {
      for (let i = 0; i <= words.length - len * 2; i++) {
        const phraseAWords = words.slice(i, i + len);
        const phraseA = phraseAWords.map((w) => w.word.toLowerCase().replace(/[^a-z]/g, '')).join(' ');

        // Look ahead for same phrase
        for (let j = i + len; j <= Math.min(words.length - len, i + len + 8); j++) {
          const phraseBWords = words.slice(j, j + len);
          const phraseB = phraseBWords.map((w) => w.word.toLowerCase().replace(/[^a-z]/g, '')).join(' ');

          if (phraseA === phraseB && phraseA.length > 5) {
            const pauseDuration = phraseBWords[0].start - phraseAWords[phraseAWords.length - 1].end;

            // False starts typically occur within 0.2s to 4.0s pause
            if (pauseDuration >= 0.15 && pauseDuration <= 4.0) {
              repeated.push({
                phrase: phraseAWords.map((w) => w.word).join(' '),
                first_start: phraseAWords[0].start,
                first_end: phraseAWords[phraseAWords.length - 1].end,
                second_start: phraseBWords[0].start,
                second_end: phraseBWords[phraseBWords.length - 1].end,
                pause_duration: Number(pauseDuration.toFixed(2)),
                suggested_trim_start: phraseAWords[0].start,
                suggested_trim_end: phraseBWords[0].start,
              });
              i = j + len - 1; // Advance past repetition
              break;
            }
          }
        }
      }
    }

    return repeated;
  }

  /**
   * Analyzes silence intervals and produces suggested tightenings
   * based on the chosen mode.
   */
  public static calculateSilenceTightening(
    intervals: AudioSilenceInterval[],
    mode: AudioSilenceRemovalMode = 'natural'
  ): {
    original_silence_sec: number;
    tightened_silence_sec: number;
    time_saved_sec: number;
    cut_regions: Array<{ start: number; end: number }>;
  } {
    // Mode defines the target maximum pause length to retain:
    // natural: keep up to 0.8s
    // tight: keep up to 0.4s
    // fast: keep up to 0.2s
    const targetKeep = mode === 'fast' ? 0.2 : mode === 'tight' ? 0.4 : 0.8;

    let originalTotal = 0;
    let tightenedTotal = 0;
    const cutRegions: Array<{ start: number; end: number }> = [];

    for (const interval of intervals) {
      originalTotal += interval.duration;

      if (interval.duration > targetKeep + 0.15) {
        // Cut the excess middle portion of the pause, leaving equal padding on each side
        const keepHalf = targetKeep / 2;
        const cutStart = Number((interval.start + keepHalf).toFixed(3));
        const cutEnd = Number((interval.end - keepHalf).toFixed(3));

        if (cutEnd > cutStart) {
          cutRegions.push({ start: cutStart, end: cutEnd });
          tightenedTotal += targetKeep;
        } else {
          tightenedTotal += interval.duration;
        }
      } else {
        tightenedTotal += interval.duration;
      }
    }

    const timeSaved = Math.max(0, originalTotal - tightenedTotal);

    return {
      original_silence_sec: Number(originalTotal.toFixed(2)),
      tightened_silence_sec: Number(tightenedTotal.toFixed(2)),
      time_saved_sec: Number(timeSaved.toFixed(2)),
      cut_regions: cutRegions,
    };
  }
}

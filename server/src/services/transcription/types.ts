export interface NormalizedTranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface NormalizedTranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: NormalizedTranscriptWord[];
}

export interface NormalizedTranscriptionResult {
  text: string;
  language: string;
  durationSeconds: number | null;
  segments: NormalizedTranscriptSegment[];
  words: NormalizedTranscriptWord[];
}

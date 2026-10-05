import { OpenRouterTranscriptionProvider } from './transcription/openRouterTranscriptionProvider.js';
import { NormalizedTranscriptionResult } from './transcription/types.js';
import { TranscriptSegment, TranscriptWord } from '../types/index.js';

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number | null;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
}

/**
 * Backward-compatible helper for transcribing audio with OpenRouter.
 * Delegates to OpenRouterTranscriptionProvider.
 */
export async function transcribeAudioWithOpenRouter(
  audioBuffer: Buffer,
  fileName: string = 'audio.mp3',
  mimeType: string = 'audio/mp3'
): Promise<TranscriptionResult> {
  const provider = new OpenRouterTranscriptionProvider();
  const result: NormalizedTranscriptionResult = await provider.transcribeAudio(
    audioBuffer,
    fileName,
    mimeType
  );

  return {
    text: result.text,
    language: result.language,
    duration: result.durationSeconds,
    segments: result.segments,
    words: result.words || [],
  };
}

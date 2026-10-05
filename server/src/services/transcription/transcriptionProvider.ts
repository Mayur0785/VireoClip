import { NormalizedTranscriptionResult } from './types.js';

export interface TranscriptionProvider {
  readonly name: string;

  transcribeAudio(
    audioBuffer: Buffer,
    fileName?: string,
    mimeType?: string
  ): Promise<NormalizedTranscriptionResult>;
}

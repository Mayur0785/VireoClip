import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { TranscriptionProvider } from './transcriptionProvider.js';
import {
  NormalizedTranscriptionResult,
  NormalizedTranscriptSegment,
  NormalizedTranscriptWord,
} from './types.js';
import { normalizeTranscriptionError } from './errorNormalizer.js';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB Groq limit
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

export class GroqTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'groq';

  async transcribeAudio(
    audioBuffer: Buffer,
    fileName: string = 'audio.mp3',
    mimeType: string = 'audio/mp3'
  ): Promise<NormalizedTranscriptionResult> {
    const apiKey = config.groqApiKey?.trim();

    if (!apiKey) {
      const errorMsg = 'GROQ_API_KEY is not configured on the server. Please add GROQ_API_KEY to your server environment.';
      logger.error(`[Groq] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Transcription rejected: provided audio buffer is empty.');
    }

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      const sizeMb = (audioBuffer.length / (1024 * 1024)).toFixed(1);
      throw normalizeTranscriptionError(
        new Error(`Audio size (${sizeMb} MB) exceeds transcription provider limit of 25 MB. Please provide a shorter clip.`),
        { status: 413, provider: 'Groq' }
      );
    }

    logger.info(
      `[Groq] Submitting ${fileName} (${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB) to Groq Speech-to-Text (${GROQ_MODEL})...`
    );

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, fileName);
    formData.append('model', GROQ_MODEL);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Groq transcription timed out after ${config.transcriptionTimeoutMs / 1000}s.`));
    }, config.transcriptionTimeoutMs);

    let response: Response;
    try {
      response = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      const isTimeout = fetchErr?.name === 'AbortError' || fetchErr?.message?.toLowerCase().includes('timeout');
      throw normalizeTranscriptionError(fetchErr, {
        status: isTimeout ? 408 : undefined,
        provider: 'Groq',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedMsg = '';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          parsedMsg = parsed.error.message;
        }
      } catch {
        parsedMsg = errText;
      }

      throw normalizeTranscriptionError(new Error(parsedMsg), {
        status: response.status,
        provider: 'Groq',
        rawError: errText,
      });
    }

    let result: any;
    try {
      result = await response.json();
    } catch (parseErr: any) {
      throw normalizeTranscriptionError(parseErr, {
        provider: 'Groq',
        rawError: 'Failed to parse JSON response',
      });
    }

    const text = (result?.text || '').trim();
    if (!text) {
      throw normalizeTranscriptionError(
        new Error('Transcription returned no speech. Ensure the video has audible speech.'),
        { provider: 'Groq' }
      );
    }

    const rawSegments = Array.isArray(result?.segments) ? result.segments : [];
    const segments: NormalizedTranscriptSegment[] = rawSegments
      .map((seg: any) => ({
        start: Number(seg.start ?? 0),
        end: Number(seg.end ?? 0),
        text: String(seg.text ?? '').trim(),
      }))
      .filter((seg: NormalizedTranscriptSegment) => seg.text.length > 0 || seg.end > seg.start);

    // Extract real word timestamps if returned by provider
    const rawWords = Array.isArray(result?.words)
      ? result.words
      : rawSegments.flatMap((s: any) => (Array.isArray(s?.words) ? s.words : []));

    const words: NormalizedTranscriptWord[] = rawWords
      .map((w: any) => ({
        word: String(w.word || w.text || '').trim(),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
      }))
      .filter((w: NormalizedTranscriptWord) => w.word.length > 0 && w.end >= w.start);

    const durationSeconds = typeof result?.duration === 'number' ? result.duration : null;
    const language = typeof result?.language === 'string' ? result.language : 'en';

    logger.info(
      `[Groq] Successfully transcribed audio: ${segments.length} segments, ${words.length} words, duration: ${durationSeconds}s, language: ${language}`
    );

    return {
      text,
      language,
      durationSeconds,
      segments,
      words,
    };
  }
}

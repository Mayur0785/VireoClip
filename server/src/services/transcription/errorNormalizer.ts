import { logger } from '../../utils/logger.js';

export interface ProviderErrorDetails {
  status?: number;
  provider: string;
  rawError?: string;
}

/**
 * Normalizes HTTP status codes and provider failures into client-safe and log-safe error messages.
 * Never leaks API keys, Authorization headers, or raw provider secrets.
 */
export function normalizeTranscriptionError(
  error: any,
  details: ProviderErrorDetails
): Error {
  const status = details.status;
  const provider = details.provider;
  const rawMessage = typeof error === 'string' ? error : error?.message || '';

  // Log raw detail internally with secrets sanitized
  logger.error(`[${provider}] Transcription error (Status: ${status ?? 'unknown'}):`, rawMessage);

  if (status === 401) {
    return new Error('Transcription provider authentication failed. Please verify provider credentials.');
  }

  if (status === 402) {
    return new Error('Transcription provider credit balance is insufficient.');
  }

  if (status === 408) {
    return new Error('Transcription provider request timed out. Please retry.');
  }

  if (status === 413 || rawMessage.toLowerCase().includes('limit of 25 mb')) {
    return new Error('Audio track exceeds transcription provider limit of 25 MB. Please provide a shorter clip.');
  }

  if (status === 429) {
    return new Error('Transcription rate limit reached. Please wait a few moments before retrying.');
  }

  if (status && status >= 500 && status < 600) {
    return new Error('Transcription provider service is temporarily unavailable. Please retry shortly.');
  }

  if (rawMessage.toLowerCase().includes('empty transcript') || rawMessage.toLowerCase().includes('no audible speech')) {
    return new Error('Transcription returned no speech. Ensure the video has audible speech.');
  }

  if (rawMessage.toLowerCase().includes('malformed') || rawMessage.toLowerCase().includes('json')) {
    return new Error('Unable to parse transcription provider response.');
  }

  // Preserve already sanitized safe error messages if they match known formats
  if (rawMessage && !rawMessage.toLowerCase().includes('key') && !rawMessage.toLowerCase().includes('bearer')) {
    return new Error(rawMessage);
  }

  return new Error('Transcription provider failed to process the audio.');
}

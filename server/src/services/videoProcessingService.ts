import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { downloadObjectToFile } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { extractAudioFromVideo } from './audioExtractionService.js';
import { getTranscriptionProvider } from './transcription/transcriptionProviderFactory.js';
import { TranscriptRecord } from '../types/index.js';
import { UsageService } from './usageService.js';

// In-memory set to guard against duplicate concurrent processing runs for the same project
const activeProcessingSet = new Set<string>();

export interface ProcessProjectResult {
  status: 'transcribed' | 'failed';
  transcript?: TranscriptRecord;
  error?: string;
}

/**
 * Checks if a project is currently being processed in memory
 */
export function isProjectProcessingActive(projectId: string): boolean {
  return activeProcessingSet.has(projectId);
}

/**
 * Executes the complete video processing and transcription pipeline:
 * 1. Concurrency guard (locks projectId)
 * 2. Updates project video_status -> 'processing'
 * 3. Streams video from private Cloudflare R2 storage
 * 4. Extracts audio track using FFmpeg into temporary MP3 (with process timeout)
 * 5. Updates project video_status -> 'transcribing'
 * 6. Sends extracted audio to provider-agnostic Speech-to-Text API (Groq / OpenRouter)
 * 7. Upserts transcript into MongoDB
 * 8. Updates project video_status -> 'transcribed'
 * 9. Settles usage reservation on success, or releases on failure
 * 10. Cleans up temporary audio files reliably
 */
export async function processProjectVideo(
  projectId: string,
  userId: string,
  sourceUrl: string,
  processingAttemptId?: string
): Promise<ProcessProjectResult> {
  if (!isMongoConfigured) {
    throw new Error('MongoDB is not configured on the server.');
  }

  if (activeProcessingSet.has(projectId)) {
    throw new Error('Project processing is already in progress.');
  }

  activeProcessingSet.add(projectId);
  let cleanupAudio: (() => void) | null = null;
  let downloadedVideoPath: string | null = null;

  try {
    // 1. Update status to 'processing'
    logger.info(`Starting video processing for project ${projectId}`, { projectId, userId });
    await dataRepository
      .from('projects')
      .update({ video_status: 'processing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 2. Stream private R2 object to a unique local temp file before FFmpeg.
    const storagePath = sourceUrl;
    const originalFileName = storagePath.split('/').pop() || 'video.mp4';
    const videoPath = path.join(os.tmpdir(), `vireo-source-${crypto.randomUUID()}${path.extname(originalFileName) || '.mp4'}`);
    downloadedVideoPath = videoPath;
    await downloadObjectToFile('source', storagePath, videoPath);

    // 3. Extract audio via FFmpeg without buffering the video in Node memory.
    const extractedAudio = await extractAudioFromVideo(videoPath, originalFileName);
    cleanupAudio = extractedAudio.cleanup;

    // 4. Update status to 'transcribing'
    await dataRepository
      .from('projects')
      .update({ video_status: 'transcribing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 5. Transcribe audio with configured provider (Groq default / OpenRouter)
    const provider = getTranscriptionProvider();
    logger.info(`Using transcription provider: ${provider.name}`, { projectId, provider: provider.name });
    const transcription = await provider.transcribeAudio(
      extractedAudio.audioBuffer,
      `${projectId}.mp3`,
      'audio/mp3'
    );

    // 6. Store transcript in MongoDB (upsert to avoid duplicates)
    const transcriptPayload: any = {
      project_id: projectId,
      user_id: userId,
      transcript_text: transcription.text,
      language: transcription.language,
      duration_seconds: transcription.durationSeconds,
      segments: transcription.segments,
      updated_at: new Date().toISOString(),
    };

    if (Array.isArray(transcription.words) && transcription.words.length > 0) {
      transcriptPayload.words = transcription.words;
    }

    logger.info(`Storing transcript for project ${projectId} into 'transcripts' table...`, {
      projectId,
      charCount: transcription.text.length,
      segmentCount: transcription.segments?.length || 0,
      wordCount: transcription.words?.length || 0,
    });

    let { data: savedTranscript, error: saveError } = await dataRepository
      .from('transcripts')
      .upsert(transcriptPayload, { onConflict: 'project_id' })
      .select()
      .single();

    if (saveError) {
      logger.error('Failed to save transcript to MongoDB', {
        projectId,
        error: saveError.message,
      });
      throw new Error(`Failed to save transcript: ${saveError.message}`);
    }

    // 7. Update project status to 'transcribed'
    await dataRepository
      .from('projects')
      .update({ video_status: 'transcribed' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 8. Settle usage reservation atomically using measured audio duration
    if (processingAttemptId) {
      await UsageService.settleReservation(
        processingAttemptId,
        transcription.durationSeconds || 0,
        {
          provider: provider.name,
          language: transcription.language,
          segment_count: transcription.segments?.length || 0,
        }
      );
    }

    logger.info(`Project ${projectId} successfully transcribed via ${provider.name}!`, { projectId, provider: provider.name });

    return {
      status: 'transcribed',
      transcript: savedTranscript as TranscriptRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Video processing failed for project ${projectId}`, {
      projectId,
      userId,
      error: message,
    });

    // Safely release the usage quota reservation so failed jobs never consume quota
    if (processingAttemptId) {
      await UsageService.releaseReservation(processingAttemptId, message || 'Processing failed');
    }

    // Mark project status as 'failed' in database
    try {
      await dataRepository
        .from('projects')
        .update({ video_status: 'failed' })
        .eq('id', projectId)
        .eq('user_id', userId);
    } catch (updateErr) {
      logger.error('Failed to set video_status to failed', {
        projectId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }

    return {
      status: 'failed',
      error: message || 'Video processing failed.',
    };
  } finally {
    if (cleanupAudio) {
      try {
        cleanupAudio();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (downloadedVideoPath) await fs.rm(downloadedVideoPath, { force: true }).catch(() => undefined);
    activeProcessingSet.delete(projectId);
  }
}

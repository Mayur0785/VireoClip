import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// Configure fluent-ffmpeg to use ffmpeg-static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
  logger.info(`Configured FFmpeg static binary at: ${ffmpegStatic}`);
} else {
  logger.warn('ffmpegStatic path not resolved; relying on system PATH for ffmpeg.');
}

export interface ExtractedAudioResult {
  audioBuffer: Buffer;
  audioPath: string;
  format: 'mp3';
  cleanup: () => void;
}

/**
 * Extracts an MP3 audio track from a video buffer using FFmpeg with explicit timeout protection.
 * Writes temporary files into the OS temp directory, runs extraction,
 * reads the audio buffer, and cleans up the temporary video file.
 * The cleanup function is returned to clean up the temporary audio file when finished.
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer | string,
  originalFileName: string
): Promise<ExtractedAudioResult> {
  if (!videoBuffer || videoBuffer.length === 0) {
    throw new Error('Video buffer is empty.');
  }

  const tempDir = os.tmpdir();
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ext = path.extname(originalFileName) || '.mp4';
  const tempVideoPath = typeof videoBuffer === 'string' ? videoBuffer : path.join(tempDir, `vireo_in_${uniqueId}${ext}`);
  const tempAudioPath = path.join(tempDir, `vireo_out_${uniqueId}.mp3`);

  const sourceSize = typeof videoBuffer === 'string' ? (await fs.promises.stat(videoBuffer)).size : videoBuffer.length;
  if (typeof videoBuffer !== 'string') {
    logger.info(`Writing video buffer (${(sourceSize / (1024 * 1024)).toFixed(2)} MB) to temporary file: ${tempVideoPath}`);
    await fs.promises.writeFile(tempVideoPath, videoBuffer);
  }

  const cleanup = () => {
    try {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to remove temp video: ${msg}`);
    }
    try {
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to remove temp audio: ${msg}`);
    }
  };

  try {
    logger.info(`Extracting audio with FFmpeg: ${tempVideoPath} -> ${tempAudioPath}`);

    await new Promise<void>((resolve, reject) => {
      let killed = false;
      const ffmpegCommand = ffmpeg(tempVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(128)
        .audioChannels(1) // Mono for speech recognition efficiency
        .audioFrequency(16000) // 16kHz optimal for Whisper speech-to-text
        .format('mp3');

      // Enforce timeout (H5)
      const timeoutId = setTimeout(() => {
        killed = true;
        logger.error(`FFmpeg process timed out after ${config.ffmpegTimeoutMs}ms. Killing process...`);
        try {
          ffmpegCommand.kill('SIGKILL');
        } catch {
          // Process may have already exited
        }
        reject(new Error(`FFmpeg audio extraction timed out after ${config.ffmpegTimeoutMs / 1000}s.`));
      }, config.ffmpegTimeoutMs);

      ffmpegCommand
        .on('start', (cmdLine) => {
          logger.info(`FFmpeg process started: ${cmdLine}`);
        })
        .on('error', (err) => {
          clearTimeout(timeoutId);
          if (killed) return;
          logger.error(`FFmpeg processing error: ${err.message}`);
          reject(new Error(`FFmpeg audio extraction failed: ${err.message}`));
        })
        .on('end', () => {
          clearTimeout(timeoutId);
          if (killed) return;
          logger.info('FFmpeg processing finished successfully.');
          resolve();
        })
        .save(tempAudioPath);
    });

    if (!fs.existsSync(tempAudioPath)) {
      throw new Error('Extracted audio file does not exist after FFmpeg completion.');
    }

    const audioSize = (await fs.promises.stat(tempAudioPath)).size;
    if (audioSize > 25 * 1024 * 1024) {
      throw new Error('Extracted audio exceeds the transcription provider limit of 25 MB. Please provide a shorter video.');
    }
    const audioBuffer = await fs.promises.readFile(tempAudioPath);
    if (audioBuffer.length === 0) {
      throw new Error('Extracted audio file is empty (0 bytes).');
    }

    // Clean up input video immediately to save disk space
    try {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
    } catch {
      // Ignore
    }

    logger.info(
      `Audio extracted: ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB (reduced from ${(sourceSize / (1024 * 1024)).toFixed(2)} MB video)`
    );

    return {
      audioBuffer,
      audioPath: tempAudioPath,
      format: 'mp3',
      cleanup,
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}

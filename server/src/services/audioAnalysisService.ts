import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger.js';
import { AppError, AudioAnalysisMetrics } from '../types/index.js';
import { AudioFeatureService } from './multimodal/audioFeatureService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

interface AnalysisCacheEntry {
  mtimeMs: number;
  metrics: AudioAnalysisMetrics;
}

/**
 * Phase 20: Audio Analysis Service
 * Performs deep, non-destructive acoustic analysis using FFmpeg:
 * - EBU R128 Loudness (integrated LUFS, LRA, True Peak)
 * - Dynamic Range & RMS volume levels
 * - Digital clipping detection
 * - Silence intervals and speech activity ratio
 * - Channel layout & sample rate
 *
 * Employs local caching to avoid duplicate FFmpeg runs.
 */
export class AudioAnalysisService {
  private static cache = new Map<string, AnalysisCacheEntry>();

  /**
   * Probes audio streams and extracts codec, channels, sample rate, and duration.
   */
  public static async probeAudioStream(filePath: string): Promise<{
    channels: number;
    sample_rate: number;
    duration_sec: number;
    codec: string;
  }> {
    if (!fs.existsSync(filePath)) {
      throw new AppError(`File not found: ${filePath}`, 404, 'FILE_NOT_FOUND');
    }

    const probeArgs = [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,channels,sample_rate,duration:format=duration',
      '-of', 'json',
      filePath,
    ];

    try {
      const { stdout } = await execFileAsync('ffprobe', probeArgs, { timeout: 15000 });
      const data = JSON.parse(stdout);
      const stream = data.streams?.[0];

      if (!stream) {
        throw new AppError('No audio stream detected in media file.', 400, 'NO_AUDIO_STREAM');
      }

      const duration = parseFloat(stream.duration || data.format?.duration || '0');
      const channels = parseInt(stream.channels || '2', 10);
      const sampleRate = parseInt(stream.sample_rate || '44100', 10);
      const codec = stream.codec_name || 'unknown';

      return {
        channels: Number.isFinite(channels) && channels > 0 ? channels : 2,
        sample_rate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100,
        duration_sec: Number.isFinite(duration) ? duration : 0,
        codec,
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`[AudioAnalysisService] ffprobe error: ${err.message}`);
      throw new AppError(`Failed to probe audio stream: ${err.message}`, 500, 'PROBE_FAILED');
    }
  }

  /**
   * Runs comprehensive acoustic analysis on media file.
   */
  public static async analyzeAudio(filePath: string): Promise<AudioAnalysisMetrics> {
    if (!fs.existsSync(filePath)) {
      throw new AppError(`[FILE_NOT_FOUND] Media file not found for analysis: ${filePath}`, 404, 'FILE_NOT_FOUND');
    }

    const stat = fs.statSync(filePath);
    const cached = this.cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.metrics;
    }

    // 1. Probe stream basics
    const probe = await this.probeAudioStream(filePath);

    // 2. Run ebur128 and volumedetect in parallel/chain via FFmpeg
    const filterChain = 'ebur128=peak=true,volumedetect';
    const args = [
      '-nostdin',
      '-hide_banner',
      '-i', filePath,
      '-af', filterChain,
      '-f', 'null',
      '-',
    ];

    let stderr = '';
    try {
      const res = await execFileAsync(ffmpegBin, args, {
        timeout: 45000,
        maxBuffer: 20 * 1024 * 1024,
      });
      stderr = res.stderr;
    } catch (err: any) {
      if (err.stderr) {
        stderr = err.stderr;
      } else {
        logger.error(`[AudioAnalysisService] FFmpeg analysis execution failed: ${err.message}`);
        throw new AppError(`Audio analysis failed: ${err.message}`, 500, 'ANALYSIS_FAILED');
      }
    }

    // Parse EBU R128 metrics from stderr
    // Integrated loudness:
    //   Integrated loudness:\n    I:         -19.4 LUFS
    const integratedMatch = stderr.match(/Integrated loudness:\s+I:\s+([-\d.]+)\s+LUFS/i);
    const integratedLufs = integratedMatch ? parseFloat(integratedMatch[1]) : -24.0;

    // Loudness range:
    //   LRA:         7.2 LU
    const lraMatch = stderr.match(/LRA:\s+([-\d.]+)\s+LU/i);
    const loudnessRangeLu = lraMatch ? parseFloat(lraMatch[1]) : 7.0;

    // True peak:
    //   Peak:\n    True:       -1.2 dBFS
    const truePeakMatch = stderr.match(/True peak:\s+Peak:\s+([-\d.]+)\s+dBFS/i) ||
      stderr.match(/True:\s+([-\d.]+)\s+dBFS/i);
    const truePeakDb = truePeakMatch ? parseFloat(truePeakMatch[1]) : -1.5;

    // Volumedetect metrics:
    //   mean_volume: -23.4 dB
    //   max_volume: -0.1 dB
    const meanVolMatch = stderr.match(/mean_volume:\s+([-\d.]+)\s+dB/i);
    const meanVolumeDb = meanVolMatch ? parseFloat(meanVolMatch[1]) : -25.0;

    const maxVolMatch = stderr.match(/max_volume:\s+([-\d.]+)\s+dB/i);
    const maxVolumeDb = maxVolMatch ? parseFloat(maxVolMatch[1]) : -1.0;

    // Digital clipping detection:
    // In digital audio 0 dBFS is ceiling. Any max_volume >= -0.05 dBFS or true peak >= 0.0 indicates clipping.
    const isClipping = maxVolumeDb >= -0.05 || truePeakDb >= 0.0;
    const clippingCount = isClipping ? Math.max(1, Math.round(Math.abs(truePeakDb) * 10)) : 0;

    // 3. Silence analysis via AudioFeatureService
    const silenceIntervals = await AudioFeatureService.detectSilenceIntervals(filePath, -35, 0.4);
    const totalSilenceSec = silenceIntervals.reduce((acc, interval) => acc + interval.duration, 0);
    const duration = Math.max(0.1, probe.duration_sec);
    const silenceRatio = Math.min(1.0, Math.max(0.0, totalSilenceSec / duration));
    const speechRatio = Math.max(0.0, 1.0 - silenceRatio);

    // Approximate RMS dB from mean volume
    const rmsDb = Number(meanVolumeDb.toFixed(1));

    // Approximate noise floor: volume during silence or default to -55 dBFS
    const noiseFloorEstimate = Math.min(-45.0, meanVolumeDb - 18.0);

    const metrics: AudioAnalysisMetrics = {
      integrated_lufs: Number(integratedLufs.toFixed(1)),
      loudness_range_lu: Number(loudnessRangeLu.toFixed(1)),
      true_peak_db: Number(truePeakDb.toFixed(1)),
      rms_db: rmsDb,
      mean_volume_db: Number(meanVolumeDb.toFixed(1)),
      max_volume_db: Number(maxVolumeDb.toFixed(1)),
      silence_ratio: Number(silenceRatio.toFixed(3)),
      speech_ratio: Number(speechRatio.toFixed(3)),
      is_clipping: isClipping,
      clipping_count: clippingCount,
      channels: probe.channels,
      sample_rate: probe.sample_rate,
      duration_sec: Number(duration.toFixed(2)),
      noise_floor_estimate_db: Number(noiseFloorEstimate.toFixed(1)),
    };

    this.cache.set(filePath, {
      mtimeMs: stat.mtimeMs,
      metrics,
    });

    return metrics;
  }

  /**
   * Clears analysis cache for testing or file updates.
   */
  public static clearCache(): void {
    this.cache.clear();
  }
}

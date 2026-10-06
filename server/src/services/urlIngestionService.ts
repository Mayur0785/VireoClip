import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { UrlValidator } from '../utils/urlValidator.js';
import { uploadFile, sourceObjectKey } from './objectStorageService.js';
import { dataRepository } from '../db/repositories/dataRepository.js';

const execFileAsync = promisify(execFile);

export interface IngestUrlOptions {
  userId: string;
  projectId?: string;
  url: string;
  title?: string;
  notes?: string;
}

export interface IngestUrlResult {
  projectId: string;
  title: string;
  sourceUrl: string;
  fileSize: number;
  durationSeconds: number;
  mimeType: string;
  sourceType: 'url';
}

export interface VideoStreamProbe {
  hasVideo: boolean;
  hasAudio: boolean;
  durationSeconds: number;
  width?: number;
  height?: number;
  codec?: string;
  formatName?: string;
}

export class UrlIngestionService {
  /**
   * Probes video metadata (duration, streams, codecs) using ffmpeg CLI.
   */
  public static async probeVideoFile(filePath: string): Promise<VideoStreamProbe> {
    const ffmpegPath = (ffmpegStatic as unknown as string) || 'ffmpeg';

    try {
      // Execute ffmpeg -i <file> and inspect stderr output
      const { stderr } = await execFileAsync(ffmpegPath, ['-i', filePath], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      }).catch((err) => {
        // ffmpeg exits with code 1 when no output file is given, but stderr contains the full stream info
        return { stderr: err.stderr || err.stdout || '' };
      });

      const output = String(stderr || '');

      // Parse duration: Duration: 00:00:06.02, start: ...
      const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
      let durationSeconds = 0;
      if (durationMatch) {
        const hours = parseFloat(durationMatch[1]);
        const minutes = parseFloat(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        durationSeconds = hours * 3600 + minutes * 60 + seconds;
      }

      const hasVideo = /Stream #\d+:\d+.*Video:/i.test(output);
      const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(output);

      // Extract resolution if video stream present (e.g., 720x1280 or 1920x1080)
      const resMatch = output.match(/Stream #\d+:\d+.*Video:.*,\s*(\d{2,5})x(\d{2,5})/i);
      const width = resMatch ? parseInt(resMatch[1], 10) : undefined;
      const height = resMatch ? parseInt(resMatch[2], 10) : undefined;

      return {
        hasVideo,
        hasAudio,
        durationSeconds: Number(durationSeconds.toFixed(2)),
        width,
        height,
      };
    } catch (err: any) {
      logger.error('Failed to probe video file with ffmpeg', { error: err.message, filePath });
      throw new AppError('Could not verify media streams in the downloaded file.', 400, 'INVALID_MEDIA');
    }
  }

  /**
   * Downloads a video from a validated URL with redirect verification, byte limit tracking, and timeout.
   */
  public static async downloadToTempFile(
    initialUrl: string,
    maxBytes: number = config.maxVideoBytes,
    timeoutMs: number = 60000
  ): Promise<{ tempFilePath: string; totalBytes: number; contentType: string }> {
    const tempDir = os.tmpdir();
    const tempFileName = `vireo-ingest-${Date.now()}-${crypto.randomUUID()}.tmp`;
    const tempFilePath = path.join(tempDir, tempFileName);

    let currentUrl = initialUrl;
    let redirectCount = 0;
    const maxRedirects = 5;

    let response: Response | null = null;

    // Follow redirects manually to validate SSRF on every hop
    while (redirectCount <= maxRedirects) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'VireoClip/1.0 (Media Ingestion; +https://vireoclip.ai)',
            Accept: 'video/*,*/*;q=0.8',
          },
        });
      } catch (fetchErr: any) {
        clearTimeout(timer);
        if (fetchErr.name === 'AbortError') {
          throw new AppError('Video download timed out. Please verify the URL host or choose a smaller file.', 408, 'DOWNLOAD_TIMEOUT');
        }
        throw new AppError(`Failed to connect to video host: ${fetchErr.message}`, 502, 'HOST_CONNECTION_FAILED');
      } finally {
        clearTimeout(timer);
      }

      // Check for redirect (301, 302, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new AppError('Redirect response was missing Location header.', 502, 'REDIRECT_FAILED');
        }

        const nextUrl = new URL(location, currentUrl).toString();
        // Re-validate target URL for SSRF before following
        await UrlValidator.validateVideoUrl(nextUrl);

        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      const status = response?.status || 502;
      throw new AppError(`Remote server returned HTTP ${status} when fetching video.`, 502, 'REMOTE_FETCH_FAILED');
    }

    // Check declared Content-Length
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredBytes = parseInt(contentLengthHeader, 10);
      if (!isNaN(declaredBytes) && declaredBytes > maxBytes) {
        throw new AppError(
          `Video exceeds maximum allowed file size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
          400,
          'FILE_SIZE_EXCEEDED'
        );
      }
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';

    // Stream to disk and strictly track downloaded byte count
    const body = response.body;
    if (!body) {
      throw new AppError('Empty response body from remote server.', 502, 'EMPTY_RESPONSE');
    }

    const fileStream = fs.createWriteStream(tempFilePath, { flags: 'wx' });
    let bytesWritten = 0;

    try {
      const reader = body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesWritten += value.length;
        if (bytesWritten > maxBytes) {
          throw new AppError(
            `Downloaded video exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
            400,
            'FILE_SIZE_EXCEEDED'
          );
        }

        fileStream.write(Buffer.from(value));
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on('error', reject);
      });

      return {
        tempFilePath,
        totalBytes: bytesWritten,
        contentType,
      };
    } catch (streamErr: any) {
      fileStream.destroy();
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {
        // cleanup ignore
      }
      throw streamErr;
    }
  }

  /**
   * Resolves the path to the Python executable capable of running yt-dlp.
   */
  public static getPythonPath(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }
    const candidates = [
      path.resolve(process.cwd(), 'python_embed/python.exe'),
      path.resolve(process.cwd(), 'server/python_embed/python.exe'),
      path.resolve(process.cwd(), '../server/python_embed/python.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/Scripts/python.exe'),
      path.resolve(process.cwd(), 'python/.venv/Scripts/python.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/bin/python'),
      path.resolve(process.cwd(), 'python/.venv/bin/python'),
      'python3',
      'python',
    ];

    for (const c of candidates) {
      if ((c.includes('/') || c.includes('\\')) && fs.existsSync(c)) {
        return c;
      }
    }
    return 'python3';
  }

  /**
   * Fetches metadata for a public YouTube video using yt-dlp.
   */
  public static async fetchYouTubeMetadata(
    url: string,
    timeoutMs = 25000
  ): Promise<{ title?: string; duration?: number; videoId?: string }> {
    const pythonBin = this.getPythonPath();
    const args = ['-m', 'yt_dlp', '--dump-json', '--no-warnings', '--no-call-home', url];

    try {
      const { stdout } = await execFileAsync(pythonBin, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      const info = JSON.parse(stdout);
      return {
        title: typeof info.title === 'string' ? info.title.trim() : undefined,
        duration: typeof info.duration === 'number' ? info.duration : undefined,
        videoId: typeof info.id === 'string' ? info.id : undefined,
      };
    } catch (err: any) {
      const stderr = String(err.stderr || '');
      logger.warn('yt-dlp metadata probe warning', { error: err.message, stderr });

      if (stderr.includes('Private video') || stderr.includes('Sign in if you') || stderr.includes('this video is private')) {
        throw new AppError('This YouTube video is private and cannot be imported.', 400, 'YOUTUBE_PRIVATE_VIDEO');
      }
      if (stderr.includes('Video unavailable') || stderr.includes('This video is unavailable') || stderr.includes('has been removed')) {
        throw new AppError('This YouTube video is unavailable or has been removed.', 400, 'YOUTUBE_VIDEO_UNAVAILABLE');
      }
      if (stderr.includes('Sign in') || stderr.includes('age-restricted') || stderr.includes('confirm your age')) {
        throw new AppError('This YouTube video has access or age restrictions and cannot be imported.', 400, 'YOUTUBE_ACCESS_RESTRICTED');
      }

      // If metadata probe fails for non-fatal reasons, return empty object so download step can try
      return {};
    }
  }

  /**
   * Downloads a public YouTube video to a bounded local temporary MP4 file using yt-dlp and FFmpeg.
   */
  public static async downloadYouTubeToTempFile(
    url: string,
    maxBytes: number = config.maxVideoBytes,
    timeoutMs: number = 120000
  ): Promise<{ tempFilePath: string; totalBytes: number; contentType: string; title?: string }> {
    const tempDir = os.tmpdir();
    const uniqueId = `yt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const outTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`);
    const expectedMp4 = path.join(tempDir, `${uniqueId}.mp4`);

    const pythonBin = this.getPythonPath();
    const ffmpegPath = (ffmpegStatic as unknown as string) || 'ffmpeg';
    const ffmpegDir = path.dirname(ffmpegPath);

    // Format selection: select standard MP4 up to 1080p, merging best audio
    const formatSpec = 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best[height<=1080]/best';

    const args = [
      '-m', 'yt_dlp',
      '--no-warnings',
      '--no-call-home',
      '--ffmpeg-location', ffmpegDir,
      '-f', formatSpec,
      '--merge-output-format', 'mp4',
      '--max-filesize', `${Math.round(maxBytes / (1024 * 1024))}M`,
      '-o', outTemplate,
      url,
    ];

    logger.info(`Starting YouTube download via yt-dlp: ${url} (maxBytes: ${maxBytes})`);

    try {
      await execFileAsync(pythonBin, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (dlErr: any) {
      // Find and delete any incomplete fragments
      try {
        const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(uniqueId));
        for (const f of files) {
          fs.unlinkSync(path.join(tempDir, f));
        }
      } catch {}

      const stderr = String(dlErr.stderr || '');
      logger.error('yt-dlp download failed', { error: dlErr.message, stderr });

      if (dlErr.killed || dlErr.code === 'ETIMEDOUT' || dlErr.signal === 'SIGTERM') {
        throw new AppError('YouTube download timed out. The video took too long to download.', 408, 'YOUTUBE_TIMEOUT');
      }
      if (stderr.includes('File is larger than max-filesize') || stderr.includes('max-filesize')) {
        throw new AppError(`YouTube video exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`, 400, 'YOUTUBE_FILE_TOO_LARGE');
      }
      if (stderr.includes('Private video') || stderr.includes('this video is private')) {
        throw new AppError('This YouTube video is private and cannot be imported.', 400, 'YOUTUBE_PRIVATE_VIDEO');
      }
      if (stderr.includes('Video unavailable') || stderr.includes('This video is unavailable')) {
        throw new AppError('This YouTube video is unavailable.', 400, 'YOUTUBE_VIDEO_UNAVAILABLE');
      }
      if (stderr.includes('Sign in') || stderr.includes('age-restricted')) {
        throw new AppError('This YouTube video has access or age restrictions and cannot be imported.', 400, 'YOUTUBE_ACCESS_RESTRICTED');
      }

      throw new AppError('Could not download this YouTube video. Please verify that the video is publicly accessible.', 400, 'YOUTUBE_DOWNLOAD_FAILED');
    }

    // Identify final merged output file
    let finalPath = expectedMp4;
    if (!fs.existsSync(finalPath)) {
      // Check if yt-dlp left .mkv or other extension
      const matches = fs.readdirSync(tempDir).filter((f) => f.startsWith(uniqueId));
      if (matches.length > 0) {
        finalPath = path.join(tempDir, matches[0]);
      } else {
        throw new AppError('Downloaded YouTube video file was not generated.', 500, 'YOUTUBE_DOWNLOAD_FAILED');
      }
    }

    const stats = fs.statSync(finalPath);
    if (stats.size === 0) {
      try { fs.unlinkSync(finalPath); } catch {}
      throw new AppError('Downloaded YouTube video file is empty.', 500, 'YOUTUBE_DOWNLOAD_FAILED');
    }

    if (stats.size > maxBytes) {
      try { fs.unlinkSync(finalPath); } catch {}
      throw new AppError(`Downloaded YouTube video exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`, 400, 'YOUTUBE_FILE_TOO_LARGE');
    }

    return {
      tempFilePath: finalPath,
      totalBytes: stats.size,
      contentType: 'video/mp4',
    };
  }

  /**
   * High-level workflow orchestrating URL validation, temporary download, FFmpeg probe,
   * R2 upload, and project database persistence.
   */
  public static async ingestUrlToProject(options: IngestUrlOptions): Promise<IngestUrlResult> {
    const { userId, url, title, notes } = options;
    const projectId = options.projectId || crypto.randomUUID();

    // 1. Server-side URL & SSRF Validation
    const validated = await UrlValidator.validateVideoUrl(url);

    let tempFile: string | null = null;
    let ytMetaTitle: string | undefined = undefined;

    try {
      let download: { tempFilePath: string; totalBytes: number; contentType: string };

      if (validated.provider === 'youtube') {
        // YouTube Ingestion Path via yt-dlp
        logger.info(`Starting YouTube video ingestion: ${validated.normalizedUrl} (ID: ${validated.youtubeVideoId}) for project ${projectId}`);
        
        // Optional quick metadata pre-fetch for title & duration bounds
        const meta: { title?: string; duration?: number; videoId?: string } = await this.fetchYouTubeMetadata(validated.normalizedUrl).catch(() => ({}));
        if (meta.title) ytMetaTitle = meta.title;
        if (meta.duration && meta.duration > 7200) {
          throw new AppError('Video duration exceeds the maximum allowed limit of 2 hours.', 400, 'YOUTUBE_DURATION_TOO_LONG');
        }

        download = await this.downloadYouTubeToTempFile(validated.normalizedUrl);
      } else {
        // Direct Public Media URL Path
        logger.info(`Starting secure download for URL: ${validated.hostname} for project ${projectId}`);
        download = await this.downloadToTempFile(validated.normalizedUrl);
      }

      tempFile = download.tempFilePath;

      // 3. Probe video file with FFmpeg to verify streams and duration
      logger.info(`Probing downloaded video for project ${projectId} (${download.totalBytes} bytes)`);
      const probe = await this.probeVideoFile(tempFile);

      if (!probe.hasVideo) {
        throw new AppError('The downloaded file does not contain a valid video stream.', 400, 'NO_VIDEO_STREAM');
      }

      // Max duration check: 2 hours (7200s)
      if (probe.durationSeconds > 7200) {
        throw new AppError('Video duration exceeds the maximum allowed limit of 2 hours.', 400, 'DURATION_EXCEEDED');
      }

      // 4. Upload verified source to Cloudflare R2
      const filename = validated.inferredFilename.endsWith('.mp4')
        ? validated.inferredFilename
        : `${validated.inferredFilename}.mp4`;
      const key = sourceObjectKey(userId, projectId, filename);
      const mime = download.contentType.includes('video') ? download.contentType : 'video/mp4';

      logger.info(`Uploading ingested video to Cloudflare R2: ${key}`);
      await uploadFile('source', key, tempFile, download.totalBytes, mime);

      // 5. Create Project Record in MongoDB in 'uploaded' state so it can be processed immediately
      const projectTitle = title?.trim() || ytMetaTitle || validated.inferredFilename.replace(/\.[^.]+$/, '') || 'Ingested Video';
      const projectRecord: any = {
        id: projectId,
        user_id: userId,
        title: projectTitle.slice(0, 255),
        source_type: 'url',
        source_url: key,
        source_object_key: key,
        file_size: download.totalBytes,
        mime_type: mime,
        video_status: 'uploaded',
        notes: String(notes || '').trim().slice(0, 2000),
      };

      if (validated.provider === 'youtube') {
        projectRecord.metadata = {
          source_provider: 'youtube',
          youtube_video_id: validated.youtubeVideoId,
          original_url: validated.normalizedUrl,
          ingested_at: new Date().toISOString(),
          original_title: ytMetaTitle,
        };
      }

      const { data: createdProject, error: dbErr } = await dataRepository
        .from('projects')
        .insert(projectRecord)
        .select()
        .single();

      if (dbErr) {
        logger.error('Failed to create project record in MongoDB after URL ingestion', { error: dbErr.message });
        throw new AppError('Failed to save project record in database.', 500, 'DB_ERROR');
      }

      return {
        projectId,
        title: projectTitle,
        sourceUrl: key,
        fileSize: download.totalBytes,
        durationSeconds: probe.durationSeconds,
        mimeType: mime,
        sourceType: 'url',
      };
    } finally {
      // 6. Guarantee temp file cleanup
      if (tempFile) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            logger.info(`Cleaned up temp ingest file: ${tempFile}`);
          }
        } catch (cleanupErr: any) {
          logger.warn(`Failed to cleanup temp file ${tempFile}: ${cleanupErr.message}`);
        }
      }
    }
  }
}

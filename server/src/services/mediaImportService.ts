import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { UrlValidator } from '../utils/urlValidator.js';
import { AppError, MediaAssetRecord, MediaType } from '../types/index.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { MediaAssetService } from './mediaAssetService.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
const ffprobeBin = 'ffprobe';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface ImportMediaDTO {
  url: string;
  provider?: string;
  provider_asset_id?: string;
  title?: string;
  license_type?: string;
  license_source?: string;
  source_page_url?: string;
  attribution?: Record<string, any>;
  project_id?: string;
}

export class MediaImportService {
  /**
   * Safely imports a remote stock/user asset into the local media library.
   * Full SSRF protection, redirect verification, MIME validation, and ffmpeg probing.
   */
  public static async importRemoteMedia(
    userId: string,
    dto: ImportMediaDTO
  ): Promise<MediaAssetRecord> {
    if (!dto.url || typeof dto.url !== 'string') {
      throw new AppError('A valid URL is required for media import.', 400, 'INVALID_URL');
    }

    const provider = dto.provider || 'external';
    const providerAssetId = dto.provider_asset_id || null;

    // 1. Check deduplication: avoid re-downloading same asset for this user
    if (providerAssetId) {
      const { data: existing } = await dataRepository
        .from('media_assets')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('provider_asset_id', providerAssetId)
        .maybeSingle();

      if (existing) {
        logger.info(`[MediaImportService] Dedup hit: asset already imported (${existing.id})`);
        return existing as MediaAssetRecord;
      }
    }

    // 2. SSRF Check on initial URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(dto.url);
    } catch {
      throw new AppError('Malformed media URL.', 400, 'INVALID_URL');
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      throw new AppError('Only HTTP and HTTPS URLs are allowed.', 400, 'INVALID_PROTOCOL');
    }

    await UrlValidator.checkSsrf(targetUrl.hostname);

    // 3. Fetch with safe redirect handling & size cap
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-import-'));
    const downloadPath = path.join(tmpDir, 'downloaded_asset');

    try {
      let currentUrl = targetUrl.toString();
      let redirectsCount = 0;
      let finalRes: Response | null = null;

      while (redirectsCount < 4) {
        const parsed = new URL(currentUrl);
        await UrlValidator.checkSsrf(parsed.hostname);

        const res = await fetch(currentUrl, {
          redirect: 'manual',
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'Vireo-Media-Importer/1.0' },
        });

        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) throw new AppError('Redirect missing location header.', 400, 'INVALID_REDIRECT');
          currentUrl = new URL(loc, currentUrl).toString();
          redirectsCount++;
          continue;
        }

        if (!res.ok) {
          throw new AppError(`Remote provider returned error status: ${res.status}`, 400, 'REMOTE_FETCH_FAILED');
        }

        finalRes = res;
        break;
      }

      if (!finalRes) {
        throw new AppError('Too many redirects encountered while importing media.', 400, 'TOO_MANY_REDIRECTS');
      }

      // 4. Validate MIME Type
      const rawContentType = (finalRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(rawContentType)) {
        throw new AppError(`Unsupported media content type: ${rawContentType}`, 400, 'INVALID_MIME_TYPE');
      }

      const isVideo = rawContentType.startsWith('video/');
      const mediaType: MediaType = isVideo ? 'VIDEO' : 'IMAGE';

      // 5. Stream and enforce size limit
      const contentLengthHeader = finalRes.headers.get('content-length');
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_IMPORT_BYTES) {
        throw new AppError('Asset exceeds maximum allowed file size (100MB).', 400, 'FILE_TOO_LARGE');
      }

      const fileStream = fs.createWriteStream(downloadPath);
      let downloadedBytes = 0;

      if (!finalRes.body) {
        throw new AppError('Empty response body received from provider.', 400, 'EMPTY_RESPONSE');
      }

      const reader = finalRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          downloadedBytes += value.length;
          if (downloadedBytes > MAX_IMPORT_BYTES) {
            fileStream.destroy();
            throw new AppError('Asset exceeds maximum allowed file size (100MB).', 400, 'FILE_TOO_LARGE');
          }
          fileStream.write(value);
        }
      }
      fileStream.end();

      // Wait for stream to finish writing
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', () => resolve());
        fileStream.on('error', reject);
      });

      // 6. Probe media using FFprobe to ensure valid stream & dimensions
      const probeArgs = [
        '-v', 'error',
        '-show_entries', 'stream=width,height,duration,r_frame_rate,codec_name:format=duration',
        '-of', 'json',
        downloadPath,
      ];

      const { stdout: probeOut } = await execFileAsync(ffprobeBin, probeArgs, { timeout: 10000 });
      const probeData = JSON.parse(probeOut);

      const stream = probeData.streams?.[0];
      if (!stream) {
        throw new AppError('Failed to decode media file: no valid streams found.', 400, 'INVALID_MEDIA_STREAM');
      }

      const width = parseInt(stream.width, 10) || 1080;
      const height = parseInt(stream.height, 10) || 1920;
      const duration = isVideo
        ? parseFloat(stream.duration || probeData.format?.duration || '0')
        : 0;

      const aspectRatio = height > width ? '9:16' : width > height ? '16:9' : '1:1';

      // 7. Generate thumbnail and proxy
      const thumbFilename = `thumb_${crypto.randomUUID()}.jpg`;
      const thumbLocalPath = path.join(tmpDir, thumbFilename);

      if (isVideo) {
        const snapTime = Math.min(1.0, Math.max(0.1, duration * 0.2));
        await execFileAsync(
          ffmpegBin,
          ['-y', '-ss', snapTime.toFixed(3), '-i', downloadPath, '-vframes', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '2', thumbLocalPath],
          { timeout: 10000 }
        );
      } else {
        await execFileAsync(
          ffmpegBin,
          ['-y', '-i', downloadPath, '-vf', "scale='min(480,iw)':-2", '-q:v', '2', thumbLocalPath],
          { timeout: 10000 }
        );
      }

      // Persist permanently in user media directory or storage
      const permanentStoreDir = path.join(process.cwd(), 'scratch', 'media', userId);
      fs.mkdirSync(permanentStoreDir, { recursive: true });

      const assetExt = isVideo ? '.mp4' : '.jpg';
      const permanentMediaName = `asset_${crypto.randomUUID()}${assetExt}`;
      const permanentMediaPath = path.join(permanentStoreDir, permanentMediaName);
      fs.copyFileSync(downloadPath, permanentMediaPath);

      let finalThumbPath: string | null = null;
      if (fs.existsSync(thumbLocalPath)) {
        const permThumbPath = path.join(permanentStoreDir, thumbFilename);
        fs.copyFileSync(thumbLocalPath, permThumbPath);
        finalThumbPath = permThumbPath;
      }

      // 8. Create media asset record
      const assetRecord = await MediaAssetService.createAsset(userId, {
        project_id: dto.project_id || null,
        source_type: 'STOCK',
        media_type: mediaType,
        provider,
        provider_asset_id: providerAssetId,
        storage_path: permanentMediaPath,
        external_preview_url: dto.url,
        thumbnail_path: finalThumbPath,
        proxy_path: permanentMediaPath,
        title: dto.title || `Imported ${provider} ${mediaType.toLowerCase()}`,
        description: `Imported via ${provider}`,
        duration,
        width,
        height,
        aspect_ratio: aspectRatio as any,
        license_type: dto.license_type || 'Stock License',
        license_source: dto.license_source || provider,
        source_page_url: dto.source_page_url || dto.url,
        attribution: typeof dto.attribution === 'string' ? dto.attribution : dto.attribution ? JSON.stringify(dto.attribution) : null,
        tags: ['imported', provider, mediaType.toLowerCase()],
      });

      logger.info(`[MediaImportService] Successfully imported media asset ${assetRecord.id} (${downloadedBytes} bytes)`);
      return assetRecord;
    } finally {
      // Cleanup temporary working directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

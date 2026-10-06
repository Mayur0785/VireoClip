import fs from 'node:fs';
import { AppError } from '../../../types/index.js';
import {
  SocialPublishingProvider,
  PlatformPublishCapabilities,
  PublishExecutionRequest,
  PublishExecutionResult,
} from '../types.js';

/**
 * YouTube Publishing Provider
 * Uses official YouTube Data API v3 resumable upload flow:
 * https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 * Upload endpoint: https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
 */
export class YouTubePublishingProvider implements SocialPublishingProvider {
  readonly platform = 'youtube' as const;

  getCapabilities(): PlatformPublishCapabilities {
    return {
      supportsVideo: true,
      supportsTextOnly: false,
      maxTitleLength: 100,
      maxDescriptionLength: 5000,
      maxVideoDurationSeconds: 43200, // 12 hours for verified accounts
      maxVideoSizeBytes: 256 * 1024 * 1024 * 1024, // 256GB
      supportedMediaFormats: ['mp4', 'mov', 'webm'],
      supportsScheduling: true,
      notes: 'Requires Google Cloud YouTube Data API v3 and youtube.upload scope.',
    };
  }

  validatePublishRequest(payload: any, hasMedia: boolean): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!hasMedia) {
      errors.push('YouTube publishing requires a rendered video clip.');
    }
    const title = payload.title?.trim();
    if (!title) {
      errors.push('YouTube video title is required.');
    } else if (title.length > 100) {
      errors.push(`YouTube title cannot exceed 100 characters (currently ${title.length}).`);
    }
    if (payload.description && payload.description.length > 5000) {
      errors.push(`YouTube description cannot exceed 5000 characters (currently ${payload.description.length}).`);
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(request: PublishExecutionRequest): Promise<PublishExecutionResult> {
    const { accessToken, payload, mediaFilePath } = request;

    if (!mediaFilePath || !fs.existsSync(mediaFilePath)) {
      throw new AppError('Media file not found for YouTube upload.', 400, 'MEDIA_FILE_NOT_FOUND');
    }

    const stat = fs.statSync(mediaFilePath);
    const videoTitle = payload.title || 'VireoClip Video';
    const videoDescription = payload.description || payload.caption || '';
    const privacy = payload.privacy || 'private'; // Default safe privacy

    const metadataBody = {
      snippet: {
        title: videoTitle,
        description: videoDescription,
        tags: payload.tags || payload.hashtags || [],
        categoryId: '22', // People & Blogs default
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
      },
    };

    // Step 1: Initialize resumable upload session
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(stat.size),
        },
        body: JSON.stringify(metadataBody),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      let errJson: any;
      try { errJson = JSON.parse(errText); } catch { /* ignore */ }
      const message = errJson?.error?.message || `YouTube resumable init failed (${initRes.status})`;
      throw new AppError(message, initRes.status >= 500 ? 502 : 400, 'YOUTUBE_UPLOAD_INIT_FAILED');
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new AppError('YouTube did not return a resumable upload location header.', 502, 'YOUTUBE_LOCATION_MISSING');
    }

    // Step 2: Stream media file to the resumable location
    const fileStream = fs.createReadStream(mediaFilePath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(stat.size),
      },
      // Note: Node 18+ / 20+ fetch supports ReadableStream or Buffer
      body: fs.readFileSync(mediaFilePath),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new AppError(`YouTube video upload failed: ${errText}`, 502, 'YOUTUBE_UPLOAD_FAILED');
    }

    const uploadData = await uploadRes.json() as any;
    const videoId = uploadData.id;
    if (!videoId) {
      throw new AppError('YouTube upload completed but video ID was not returned.', 502, 'YOUTUBE_ID_MISSING');
    }

    return {
      providerPostId: videoId,
      providerPostUrl: `https://www.youtube.com/watch?v=${videoId}`,
      metadata: {
        youtubeVideoId: videoId,
        privacy,
        uploadStatus: uploadData.status?.uploadStatus,
      },
    };
  }

  isRetryableError(error: any): boolean {
    if (error?.statusCode >= 500 || error?.status >= 500) return true;
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('econnreset') || msg.includes('rate limit');
  }

  normalizePublishError(error: any): { code: string; message: string; retryable: boolean } {
    const isRetryable = this.isRetryableError(error);
    const message = error instanceof Error ? error.message : 'Unknown YouTube error';
    return {
      code: error?.code || 'YOUTUBE_PUBLISH_FAILED',
      message,
      retryable: isRetryable,
    };
  }
}

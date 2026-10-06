import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getMongoDb } from '../db/mongoClient.js';
import {
  AppError,
  SocialPlatform,
  PublishedPostRecord,
  PublishJobRecord,
  PublishPayload,
  PublishPreviewResult,
  SocialAccountConnectionRecord,
  ClipRecord,
} from '../types/index.js';
import { socialPublishingRegistry } from './publishing/socialPublishingRegistry.js';
import { socialProviderRegistry } from './social/socialProviderRegistry.js';
import { decryptToken, encryptToken } from '../utils/tokenEncryption.js';
import { signObjectGet, downloadObjectToFile, headObject } from './objectStorageService.js';
import { logger } from '../utils/logger.js';

const MAX_RETRY_ATTEMPTS = 3;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes stale lock recovery

export interface CreatePublishRequestDTO {
  userId: string;
  projectId: string;
  clipId?: string | null;
  contentOutputId?: string | null;
  socialConnectionId: string;
  payload: PublishPayload;
  publishType: 'now' | 'scheduled';
  scheduledFor?: string | null; // ISO string
  timezone?: string | null;
}

export class PublishingService {
  /**
   * Deterministic request fingerprint for duplicate & replay protection
   */
  generateFingerprint(
    userId: string,
    connectionId: string,
    clipId: string | null | undefined,
    payload: PublishPayload,
    scheduledFor?: string | null
  ): string {
    const canonical = [
      userId,
      connectionId,
      clipId || 'no_clip',
      payload.title || '',
      payload.caption || '',
      payload.description || '',
      scheduledFor || 'immediate',
    ].join('::');

    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Preview a publish payload without calling provider APIs
   */
  async previewPublish(
    userId: string,
    connectionId: string,
    clipId: string | null | undefined,
    payload: PublishPayload
  ): Promise<PublishPreviewResult> {
    const db = await getMongoDb();
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: connectionId,
      user_id: userId,
    });

    if (!conn) {
      throw new AppError('Connected social account not found or access denied.', 404, 'CONNECTION_NOT_FOUND');
    }

    const provider = socialPublishingRegistry.getProvider(conn.provider);
    const capabilities = provider.getCapabilities();

    let clip: ClipRecord | null = null;
    let mediaMetadata: any = undefined;

    if (clipId) {
      clip = await db.collection<ClipRecord>('clips').findOne({ id: clipId, user_id: userId });
      if (!clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }
      mediaMetadata = {
        clip_id: clip.id,
        duration_seconds: clip.duration_seconds,
        aspect_ratio: clip.aspect_ratio,
        render_status: clip.render_status,
      };
    }

    const hasMedia = Boolean(clip && clip.render_status === 'ready' && clip.output_storage_path);
    const validation = provider.validatePublishRequest(payload, hasMedia);

    const warnings: string[] = [];
    if (clip && clip.render_status !== 'ready') {
      warnings.push(`Clip is currently in "${clip.render_status}" status. It must be rendered before publishing.`);
    }

    return {
      valid: validation.valid && (clip ? clip.render_status === 'ready' : true),
      provider: conn.provider,
      account_name: conn.provider_account_name,
      account_username: conn.provider_username,
      platform_requirements: {
        max_title_length: capabilities.maxTitleLength,
        max_description_length: capabilities.maxDescriptionLength,
        supported_media_formats: capabilities.supportedMediaFormats,
        max_video_duration_seconds: capabilities.maxVideoDurationSeconds,
        max_video_size_bytes: capabilities.maxVideoSizeBytes,
      },
      normalized_payload: payload,
      media_metadata: mediaMetadata,
      warnings: [...validation.errors, ...warnings],
    };
  }

  /**
   * Create a Publish Now or Scheduled post record with idempotency safeguards
   */
  async createPublishPost(dto: CreatePublishRequestDTO): Promise<{ post: PublishedPostRecord; job?: PublishJobRecord }> {
    const db = await getMongoDb();

    // 1. Verify social connection ownership
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: dto.socialConnectionId,
      user_id: dto.userId,
    });
    if (!conn) {
      throw new AppError('Connected social account not found or access denied.', 404, 'CONNECTION_NOT_FOUND');
    }

    // 2. Verify clip ownership and readiness if provided
    let clip: ClipRecord | null = null;
    if (dto.clipId) {
      clip = await db.collection<ClipRecord>('clips').findOne({ id: dto.clipId, user_id: dto.userId });
      if (!clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }
      if (clip.render_status !== 'ready' || !clip.output_storage_path) {
        throw new AppError(
          `Clip cannot be published because its render_status is "${clip.render_status}". Only ready clips can be published.`,
          400,
          'CLIP_NOT_READY'
        );
      }
    }

    // 3. Provider validation
    const provider = socialPublishingRegistry.getProvider(conn.provider);
    const hasMedia = Boolean(clip);
    const validation = provider.validatePublishRequest(dto.payload, hasMedia);
    if (!validation.valid) {
      throw new AppError(`Publish validation failed: ${validation.errors.join('; ')}`, 400, 'VALIDATION_FAILED');
    }

    // 4. Scheduling time validation
    let scheduledDate: Date | null = null;
    if (dto.publishType === 'scheduled') {
      if (!dto.scheduledFor) {
        throw new AppError('scheduledFor timestamp is required for scheduled posts.', 400, 'INVALID_SCHEDULE_TIME');
      }
      scheduledDate = new Date(dto.scheduledFor);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new AppError('Invalid scheduledFor timestamp format.', 400, 'INVALID_TIMESTAMP');
      }
      const now = new Date();
      if (scheduledDate.getTime() <= now.getTime()) {
        throw new AppError('Scheduled time must be in the future.', 400, 'SCHEDULE_TIME_IN_PAST');
      }
    }

    // 5. Idempotency Check via deterministic fingerprint
    const fingerprint = this.generateFingerprint(
      dto.userId,
      dto.socialConnectionId,
      dto.clipId,
      dto.payload,
      dto.scheduledFor
    );

    const existingPost = await db.collection<PublishedPostRecord>('published_posts').findOne({
      request_fingerprint: fingerprint,
    });

    if (existingPost) {
      if (['publishing', 'published'].includes(existingPost.status)) {
        throw new AppError(
          `Duplicate publish request detected. This post is already ${existingPost.status}.`,
          409,
          'DUPLICATE_PUBLISH_REQUEST'
        );
      }
      // If previous attempt was failed or cancelled, we allow a new attempt by deleting old record
      await db.collection('published_posts').deleteOne({ id: existingPost.id });
      await db.collection('publish_jobs').deleteOne({ published_post_id: existingPost.id });
    }

    const now = new Date();
    const postId = crypto.randomUUID();
    const initialStatus = dto.publishType === 'now' ? 'publishing' : 'scheduled';

    const postRecord: PublishedPostRecord = {
      id: postId,
      user_id: dto.userId,
      project_id: dto.projectId,
      clip_id: dto.clipId || null,
      content_output_id: dto.contentOutputId || null,
      social_connection_id: dto.socialConnectionId,
      provider: conn.provider,
      provider_account_id: conn.provider_account_id,
      provider_post_id: null,
      provider_post_url: null,
      status: initialStatus,
      publish_type: dto.publishType,
      scheduled_for: scheduledDate,
      timezone: dto.timezone || 'UTC',
      published_at: null,
      failed_at: null,
      cancelled_at: null,
      retry_count: 0,
      last_error_code: null,
      last_error_message: null,
      request_fingerprint: fingerprint,
      payload: dto.payload,
      created_at: now,
      updated_at: now,
    };

    await db.collection<PublishedPostRecord>('published_posts').insertOne(postRecord);

    const jobId = crypto.randomUUID();
    const jobRecord: PublishJobRecord = {
      id: jobId,
      user_id: dto.userId,
      published_post_id: postId,
      scheduled_for: scheduledDate || now,
      status: dto.publishType === 'now' ? 'publishing' : 'scheduled',
      attempts: 0,
      locked_at: dto.publishType === 'now' ? now : null,
      started_at: dto.publishType === 'now' ? now : null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };

    await db.collection<PublishJobRecord>('publish_jobs').insertOne(jobRecord);

    logger.info('Publish post created', {
      postId,
      jobId,
      provider: conn.provider,
      publishType: dto.publishType,
      userId: dto.userId,
    });

    // If "Publish Now", kick off asynchronous publishing immediately in background
    if (dto.publishType === 'now') {
      this.executePublishJob(jobId).catch((err) => {
        logger.error('Background publish execution failed', { jobId, err });
      });
    }

    return { post: postRecord, job: jobRecord };
  }

  /**
   * Executes a single publishing job with atomic claiming, token refreshing, and error handling
   */
  async executePublishJob(jobId: string): Promise<void> {
    const db = await getMongoDb();
    const job = await db.collection<PublishJobRecord>('publish_jobs').findOne({ id: jobId });
    if (!job) return;

    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: job.published_post_id });
    if (!post || post.status === 'cancelled') {
      await db.collection('publish_jobs').updateOne({ id: jobId }, { $set: { status: 'cancelled', updated_at: new Date() } });
      return;
    }

    // Step 1: Resolve connection & token
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: post.social_connection_id,
      user_id: post.user_id,
    });

    if (!conn) {
      await this.markJobFailed(jobId, post.id, 'CONNECTION_NOT_FOUND', 'Connected account was deleted or not found.', false);
      return;
    }

    // Step 2: Check & refresh token if expired
    let accessToken: string;
    try {
      const now = new Date();
      if (conn.token_expires_at && conn.token_expires_at.getTime() - now.getTime() < 300000) {
        // Expired or expiring within 5 mins: refresh
        const oauthProvider = socialProviderRegistry.getProvider(conn.provider);
        const rawRefresh = conn.refresh_token ? decryptToken(conn.refresh_token) : decryptToken(conn.access_token);
        const refResult = await oauthProvider.refreshAccessToken(rawRefresh);
        accessToken = refResult.accessToken;

        const updateData: any = {
          access_token: encryptToken(refResult.accessToken),
          token_expires_at: refResult.expiresInSeconds ? new Date(now.getTime() + refResult.expiresInSeconds * 1000) : null,
          updated_at: now,
        };
        if (refResult.refreshToken) {
          updateData.refresh_token = encryptToken(refResult.refreshToken);
        }
        await db.collection('social_account_connections').updateOne({ id: conn.id }, { $set: updateData });
      } else {
        accessToken = decryptToken(conn.access_token);
      }
    } catch (err: any) {
      logger.warn('Token refresh prior to publishing failed', { connectionId: conn.id, err: err?.message });
      await this.markJobFailed(jobId, post.id, 'AUTH_REFRESH_FAILED', `Token refresh failed: ${err?.message}`, false);
      return;
    }

    // Step 3: Prepare media if clip is specified
    let tempFilePath: string | null = null;
    let signedMediaUrl: string | null = null;
    let mediaSize: number = 0;

    if (post.clip_id) {
      const clip = await db.collection<ClipRecord>('clips').findOne({ id: post.clip_id });
      if (!clip || !clip.output_storage_path) {
        await this.markJobFailed(jobId, post.id, 'CLIP_NOT_FOUND', 'Rendered clip output path not found.', false);
        return;
      }

      try {
        const headInfo = await headObject('clips', clip.output_storage_path);
        mediaSize = headInfo.size;

        // Create temporary signed URL for providers that pull via URL (e.g. Meta, TikTok)
        signedMediaUrl = await signObjectGet('clips', clip.output_storage_path, `clip-${clip.id}.mp4`);

        // If provider requires direct byte stream (e.g. YouTube resumable upload), download to secure temp file
        if (post.provider === 'youtube') {
          const tempDir = os.tmpdir();
          tempFilePath = path.join(tempDir, `vireo-upload-${crypto.randomUUID()}.mp4`);
          await downloadObjectToFile('clips', clip.output_storage_path, tempFilePath);
        }
      } catch (err: any) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        await this.markJobFailed(jobId, post.id, 'MEDIA_FETCH_FAILED', `Failed to retrieve media: ${err?.message}`, true);
        return;
      }
    }

    // Step 4: Execute provider publish
    const publishProvider = socialPublishingRegistry.getProvider(post.provider);

    try {
      const pubResult = await publishProvider.publish({
        accessToken,
        payload: post.payload,
        mediaFilePath: tempFilePath || undefined,
        mediaUrl: signedMediaUrl || undefined,
        mediaSize,
      });

      const now = new Date();
      await db.collection<PublishedPostRecord>('published_posts').updateOne(
        { id: post.id },
        {
          $set: {
            status: 'published',
            provider_post_id: pubResult.providerPostId,
            provider_post_url: pubResult.providerPostUrl,
            published_at: now,
            metadata: pubResult.metadata,
            updated_at: now,
          },
        }
      );

      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: 'completed',
            completed_at: now,
            updated_at: now,
          },
        }
      );

      logger.info('Publishing succeeded', {
        postId: post.id,
        provider: post.provider,
        providerPostId: pubResult.providerPostId,
      });
    } catch (err: any) {
      const normErr = publishProvider.normalizePublishError(err);
      await this.markJobFailed(jobId, post.id, normErr.code, normErr.message, normErr.retryable);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
      }
    }
  }

  private async markJobFailed(
    jobId: string,
    postId: string,
    errorCode: string,
    errorMessage: string,
    isRetryable: boolean
  ): Promise<void> {
    const db = await getMongoDb();
    const job = await db.collection<PublishJobRecord>('publish_jobs').findOne({ id: jobId });
    const attempts = (job?.attempts || 0) + 1;
    const now = new Date();

    if (isRetryable && attempts < MAX_RETRY_ATTEMPTS) {
      const backoffSeconds = Math.pow(2, attempts) * 30; // 60s, 120s, 240s
      const nextRetryAt = new Date(now.getTime() + backoffSeconds * 1000);

      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: 'scheduled',
            attempts,
            locked_at: null,
            next_retry_at: nextRetryAt,
            last_error: errorMessage,
            updated_at: now,
          },
        }
      );

      await db.collection<PublishedPostRecord>('published_posts').updateOne(
        { id: postId },
        {
          $set: {
            retry_count: attempts,
            last_error_code: errorCode,
            last_error_message: errorMessage,
            updated_at: now,
          },
        }
      );

      logger.warn('Publishing failed, scheduled for retry', { jobId, attempts, nextRetryAt });
    } else {
      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: 'failed',
            attempts,
            locked_at: null,
            last_error: errorMessage,
            updated_at: now,
          },
        }
      );

      await db.collection<PublishedPostRecord>('published_posts').updateOne(
        { id: postId },
        {
          $set: {
            status: 'failed',
            failed_at: now,
            retry_count: attempts,
            last_error_code: errorCode,
            last_error_message: errorMessage,
            updated_at: now,
          },
        }
      );

      logger.error('Publishing permanently failed', { jobId, errorCode, errorMessage });
    }
  }

  /**
   * Background processor loop: claims scheduled jobs and recovers stale locks
   */
  async processDueJobs(): Promise<number> {
    const db = await getMongoDb();
    const now = new Date();

    // 1. Recover stale locks (jobs stuck in publishing > 5 minutes)
    const staleCutoff = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    await db.collection<PublishJobRecord>('publish_jobs').updateMany(
      {
        status: 'publishing',
        locked_at: { $lt: staleCutoff },
      },
      {
        $set: {
          status: 'scheduled',
          locked_at: null,
          updated_at: now,
        },
      }
    );

    // 2. Atomically claim one due job
    const claimedJob = await db.collection<PublishJobRecord>('publish_jobs').findOneAndUpdate(
      {
        status: 'scheduled',
        scheduled_for: { $lte: now },
        $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }],
      },
      {
        $set: {
          status: 'publishing',
          locked_at: now,
          started_at: now,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!claimedJob) return 0;

    await this.executePublishJob(claimedJob.id);
    return 1;
  }

  /**
   * Cancel a scheduled post before publishing starts
   */
  async cancelScheduledPost(userId: string, postId: string): Promise<void> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: postId });

    if (!post) {
      throw new AppError('Post not found.', 404, 'POST_NOT_FOUND');
    }
    if (post.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }
    if (post.status !== 'scheduled') {
      throw new AppError(`Cannot cancel post with status "${post.status}". Only scheduled posts can be cancelled.`, 400, 'CANNOT_CANCEL');
    }

    const now = new Date();
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      { id: postId },
      { $set: { status: 'cancelled', cancelled_at: now, updated_at: now } }
    );

    await db.collection<PublishJobRecord>('publish_jobs').updateOne(
      { published_post_id: postId },
      { $set: { status: 'cancelled', updated_at: now } }
    );

    logger.info('Scheduled post cancelled successfully', { postId, userId });
  }

  /**
   * Reschedule an existing scheduled post
   */
  async reschedulePost(userId: string, postId: string, newScheduledFor: string, timezone?: string): Promise<void> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: postId });

    if (!post) {
      throw new AppError('Post not found.', 404, 'POST_NOT_FOUND');
    }
    if (post.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }
    if (post.status !== 'scheduled') {
      throw new AppError('Only scheduled posts can be rescheduled.', 400, 'CANNOT_RESCHEDULE');
    }

    const newDate = new Date(newScheduledFor);
    if (Number.isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
      throw new AppError('New schedule time must be a valid future timestamp.', 400, 'INVALID_SCHEDULE_TIME');
    }

    const now = new Date();
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      { id: postId },
      {
        $set: {
          scheduled_for: newDate,
          timezone: timezone || post.timezone,
          updated_at: now,
        },
      }
    );

    await db.collection<PublishJobRecord>('publish_jobs').updateOne(
      { published_post_id: postId },
      {
        $set: {
          scheduled_for: newDate,
          updated_at: now,
        },
      }
    );

    logger.info('Post rescheduled', { postId, newScheduledFor });
  }

  /**
   * Retry a failed post
   */
  async retryFailedPost(userId: string, postId: string): Promise<void> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: postId });

    if (!post) {
      throw new AppError('Post not found.', 404, 'POST_NOT_FOUND');
    }
    if (post.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }
    if (post.status !== 'failed') {
      throw new AppError('Only failed posts can be retried.', 400, 'CANNOT_RETRY');
    }

    const now = new Date();
    await db.collection<PublishedPostRecord>('published_posts').updateOne(
      { id: postId },
      {
        $set: {
          status: 'publishing',
          failed_at: null,
          last_error_code: null,
          last_error_message: null,
          updated_at: now,
        },
      }
    );

    const job = await db.collection<PublishJobRecord>('publish_jobs').findOne({ published_post_id: postId });
    if (job) {
      await db.collection<PublishJobRecord>('publish_jobs').updateOne(
        { id: job.id },
        {
          $set: {
            status: 'publishing',
            locked_at: now,
            started_at: now,
            completed_at: null,
            next_retry_at: null,
            last_error: null,
            updated_at: now,
          },
        }
      );
      this.executePublishJob(job.id).catch((err) => {
        logger.error('Background retry failed', { jobId: job.id, err });
      });
    }
  }

  /**
   * Get user's published posts history with optional status and platform filters
   */
  async getUserPosts(
    userId: string,
    filters?: { status?: string; provider?: string; limit?: number; offset?: number }
  ): Promise<{ posts: PublishedPostRecord[]; total: number }> {
    const db = await getMongoDb();
    const query: any = { user_id: userId };
    if (filters?.status) query.status = filters.status;
    if (filters?.provider) query.provider = filters.provider;

    const limit = Math.min(filters?.limit || 50, 100);
    const offset = filters?.offset || 0;

    const [posts, total] = await Promise.all([
      db
        .collection<PublishedPostRecord>('published_posts')
        .find(query)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      db.collection<PublishedPostRecord>('published_posts').countDocuments(query),
    ]);

    return { posts, total };
  }

  async getPostById(userId: string, postId: string): Promise<PublishedPostRecord> {
    const db = await getMongoDb();
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({
      id: postId,
      user_id: userId,
    });
    if (!post) {
      throw new AppError('Post not found or access denied.', 404, 'POST_NOT_FOUND');
    }
    return post;
  }
}

export const publishingService = new PublishingService();

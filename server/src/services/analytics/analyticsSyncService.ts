import crypto from 'node:crypto';
import { Db } from 'mongodb';
import { getMongoDb } from '../../db/mongoClient.js';
import { socialAnalyticsRegistry } from './socialAnalyticsRegistry.js';
import {
  PublishedPostRecord,
  ContentAnalyticsRecord,
  SocialAccountConnectionRecord,
  SocialPlatform,
  PostMetrics,
  SyncStatus,
  AppError,
} from '../../types/index.js';
import { decryptToken } from '../../utils/tokenEncryption.js';
import { logger } from '../../utils/logger.js';

export class AnalyticsSyncService {
  /**
   * Syncs performance analytics for a single published post.
   */
  public static async syncPostAnalytics(
    userId: string,
    publishedPostId: string
  ): Promise<ContentAnalyticsRecord> {
    const db = await getMongoDb();

    // 1. Fetch published post and verify ownership
    const post = await db.collection<PublishedPostRecord>('published_posts').findOne({
      id: publishedPostId,
      user_id: userId,
    });

    if (!post) {
      throw new AppError('Published post not found or access denied.', 404, 'POST_NOT_FOUND');
    }

    if (post.status !== 'published' || !post.provider_post_id) {
      throw new AppError('Cannot sync analytics for unpublished post.', 400, 'POST_NOT_PUBLISHED');
    }

    // 2. Fetch social connection to retrieve valid OAuth token
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: post.social_connection_id,
      user_id: userId,
    });

    const provider = socialAnalyticsRegistry.getProvider(post.provider as SocialPlatform);
    if (!provider) {
      throw new AppError(`Analytics provider for ${post.provider} is not registered.`, 400, 'UNSUPPORTED_PROVIDER');
    }

    // If connection missing or no access token available
    if (!conn || !conn.access_token) {
      return this.recordSnapshot(db, post, null, 'not_configured', 'Social account connection not found or expired.');
    }

    let decryptedToken: string;
    try {
      decryptedToken = decryptToken(conn.access_token);
    } catch {
      return this.recordSnapshot(db, post, null, 'failed', 'Failed to decrypt access token.');
    }

    // 3. Query provider API
    try {
      const result = await provider.fetchPostAnalytics(post.provider_post_id, decryptedToken);
      return this.recordSnapshot(db, post, result.metrics, 'synced', null, result.rawResponse);
    } catch (err: any) {
      logger.warn(`[AnalyticsSync] Error syncing analytics for post ${publishedPostId}: ${err?.message}`);
      return this.recordSnapshot(db, post, null, 'failed', err?.message || 'Provider API error');
    }
  }

  /**
   * Syncs all due published posts for a user.
   */
  public static async syncUserAnalytics(userId: string): Promise<{ synced: number; failed: number }> {
    const db = await getMongoDb();

    // Find all published posts owned by the user
    const posts = await db.collection<PublishedPostRecord>('published_posts').find({
      user_id: userId,
      status: 'published',
      provider_post_id: { $ne: null },
    }).limit(50).toArray();

    let synced = 0;
    let failed = 0;

    for (const post of posts) {
      try {
        const record = await this.syncPostAnalytics(userId, post.id);
        if (record.sync_status === 'synced') synced++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return { synced, failed };
  }

  /**
   * Helper to persist snapshot in `content_analytics` collection without overwriting historical progression.
   */
  private static async recordSnapshot(
    db: Db,
    post: PublishedPostRecord,
    metrics: PostMetrics | null,
    syncStatus: SyncStatus,
    lastError: string | null = null,
    rawMetadata?: Record<string, any>
  ): Promise<ContentAnalyticsRecord> {
    const now = new Date();

    // Fetch previous snapshot to calculate progression
    const prevSnapshot = await db.collection<ContentAnalyticsRecord>('content_analytics').findOne(
      { published_post_id: post.id },
      { sort: { captured_at: -1 } }
    );

    const safeMetrics: PostMetrics = metrics || prevSnapshot?.metrics || {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      engagement_rate: 0,
    };

    const newSnapshot: ContentAnalyticsRecord = {
      id: crypto.randomUUID(),
      user_id: post.user_id,
      project_id: post.project_id,
      clip_id: post.clip_id || null,
      published_post_id: post.id,
      social_connection_id: post.social_connection_id,
      provider: post.provider,
      provider_post_id: post.provider_post_id!,
      platform: post.provider,
      captured_at: now,
      published_at: post.published_at || post.created_at,
      metrics: safeMetrics,
      previous_metrics: prevSnapshot?.metrics || null,
      sync_status: syncStatus,
      last_error: lastError,
      metadata: rawMetadata,
      created_at: now,
      updated_at: now,
    };

    await db.collection<ContentAnalyticsRecord>('content_analytics').insertOne(newSnapshot);
    return newSnapshot;
  }
}

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { YouTubeAnalyticsProvider } from '../services/analytics/providers/youtubeAnalyticsProvider.js';
import { InstagramAnalyticsProvider } from '../services/analytics/providers/instagramAnalyticsProvider.js';
import { TikTokAnalyticsProvider } from '../services/analytics/providers/tiktokAnalyticsProvider.js';
import { LinkedInAnalyticsProvider } from '../services/analytics/providers/linkedinAnalyticsProvider.js';
import { XAnalyticsProvider } from '../services/analytics/providers/xAnalyticsProvider.js';
import { socialAnalyticsRegistry } from '../services/analytics/socialAnalyticsRegistry.js';
import { AnalyticsQueryService } from '../services/analytics/analyticsQueryService.js';
import { GrowthCoachService, ContentMemoryService } from '../services/analytics/growthCoachService.js';
import { ContentAnalyticsRecord } from '../types/index.js';

describe('Phase 15 — Vireo Analytics & Growth Intelligence Unit Tests', () => {
  after(async () => {
    await closeMongo();
  });

  const testUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();

  it('1. Capability Matrix reports explicit metric support per provider without fabricating capabilities', () => {
    const ytCaps = new YouTubeAnalyticsProvider().getCapabilities();
    assert.strictEqual(ytCaps.platform, 'youtube');
    assert.strictEqual(ytCaps.views, 'SUPPORTED');
    assert.strictEqual(ytCaps.shares, 'NOT_SUPPORTED');
    assert.strictEqual(ytCaps.watchTime, 'NOT_SUPPORTED');

    const igCaps = new InstagramAnalyticsProvider().getCapabilities();
    assert.strictEqual(igCaps.platform, 'instagram');
    assert.strictEqual(igCaps.impressions, 'SUPPORTED');
    assert.strictEqual(igCaps.watchTime, 'NOT_SUPPORTED');

    const registryCaps = socialAnalyticsRegistry.getAllCapabilities();
    assert.ok(registryCaps.youtube);
    assert.ok(registryCaps.instagram);
    assert.ok(registryCaps.tiktok);
    assert.ok(registryCaps.linkedin);
    assert.ok(registryCaps.x);
  });

  it('2. Analytics Overview returns empty state with has_sufficient_data: false for users without data', async () => {
    const emptyUserId = crypto.randomUUID();
    const overview = await AnalyticsQueryService.getOverview(emptyUserId);
    assert.strictEqual(overview.total_views, 0);
    assert.strictEqual(overview.total_engagement, 0);
    assert.strictEqual(overview.has_sufficient_data, false);
    assert.strictEqual(overview.best_performing_clip, null);
  });

  it('3. Persisted snapshots aggregate correctly into Overview, Timeline, and Platform metrics', async () => {
    const db = await getMongoDb();
    const postId1 = crypto.randomUUID();
    const postId2 = crypto.randomUUID();

    const snap1: ContentAnalyticsRecord = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      project_id: testProjectId,
      clip_id: crypto.randomUUID(),
      published_post_id: postId1,
      provider: 'youtube',
      provider_post_id: 'yt_vid_123',
      platform: 'youtube',
      captured_at: new Date(),
      published_at: new Date(),
      metrics: {
        views: 1200,
        likes: 150,
        comments: 20,
        shares: 0,
        saves: 0,
        engagement_rate: 0.1416,
      },
      sync_status: 'synced',
      metadata: { title: 'First YouTube Clip' },
      created_at: new Date(),
      updated_at: new Date(),
    };

    const snap2: ContentAnalyticsRecord = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      project_id: testProjectId,
      clip_id: crypto.randomUUID(),
      published_post_id: postId2,
      provider: 'instagram',
      provider_post_id: 'ig_media_456',
      platform: 'instagram',
      captured_at: new Date(),
      published_at: new Date(),
      metrics: {
        views: 3500,
        likes: 400,
        comments: 50,
        shares: 30,
        saves: 20,
        engagement_rate: 0.1428,
      },
      sync_status: 'synced',
      metadata: { title: 'Viral Instagram Reel' },
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection('content_analytics').insertMany([snap1, snap2]);

    try {
      const overview = await AnalyticsQueryService.getOverview(testUserId);
      assert.strictEqual(overview.total_views, 4700);
      assert.strictEqual(overview.total_engagement, 670); // (150+20) + (400+50+30+20)
      assert.strictEqual(overview.total_published_posts, 2);
      assert.ok(overview.best_performing_clip);
      assert.strictEqual(overview.best_performing_platform, 'instagram');

      const platforms = await AnalyticsQueryService.getPlatformComparison(testUserId);
      assert.strictEqual(platforms.length, 2);
      const yt = platforms.find((p) => p.platform === 'youtube');
      assert.strictEqual(yt?.views, 1200);

      const timeline = await AnalyticsQueryService.getTimeline(testUserId);
      assert.ok(timeline.length > 0);
      assert.strictEqual(timeline[0].views, 4700);
    } finally {
      await db.collection('content_analytics').deleteMany({ user_id: testUserId });
    }
  });

  it('4. Growth Coach offers guidance based on statistical evidence and confidence thresholds', async () => {
    const recs = await GrowthCoachService.getRecommendations(crypto.randomUUID());
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].id, 'rec-start');
    assert.strictEqual(recs[0].confidence, 'low');
  });

  it('5. Content Memory stores evidence-grounded patterns and feeds into future AI generation context', async () => {
    const memUser = crypto.randomUUID();
    const memory = await ContentMemoryService.recordMemory(
      memUser,
      'duration',
      '30-45s',
      'Average 420 interactions across 12 published clips',
      12,
      1.35
    );

    assert.strictEqual(memory.confidence, 'high');
    assert.strictEqual(memory.category, 'duration');
    assert.strictEqual(memory.pattern, '30-45s');

    const aiContext = await ContentMemoryService.getCreatorPerformanceContext(memUser);
    assert.strictEqual(aiContext.has_established_memory, true);
    assert.ok(aiContext.top_duration_ranges.includes('30-45s'));

    const db = await getMongoDb();
    await db.collection('content_memories').deleteMany({ user_id: memUser });
  });
});

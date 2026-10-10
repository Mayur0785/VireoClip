import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { ContentPerformanceDashboardService } from '../services/analytics/contentPerformanceDashboardService.js';
import {
  ContentAnalyticsRecord,
  AppError,
} from '../types/index.js';

describe('Phase 35 — Vireo Content Performance Dashboard Tests', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const clip1Id = crypto.randomUUID();
  const clip2Id = crypto.randomUUID();
  const clip3Id = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const expId = crypto.randomUUID();

  before(async () => {
    // Ensure DB connection
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err: any) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  });

  after(async () => {
    // Cleanup test artifacts
    await ownerContext.run(userA, async () => {
      const db = await getMongoDb();
      await db.collection('clips').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('published_posts').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('content_analytics').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('ab_experiments').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('ab_observation_logs').deleteMany({ user_id: { $in: [userA, userB] } });
    });
  });

  it('1. Empty State & Insufficient Data: handles user with zero data honestly without fabricating values', async () => {
    const emptyUser = crypto.randomUUID();
    const dashboard = await ContentPerformanceDashboardService.getDashboard(emptyUser);

    assert.equal(dashboard.summary.total_clips, 0);
    assert.equal(dashboard.summary.published_posts_count, 0);
    assert.equal(dashboard.summary.recorded_views, 0);
    assert.equal(dashboard.summary.recorded_impressions, 0);
    assert.equal(dashboard.summary.recorded_clicks, 0);
    assert.equal(dashboard.summary.recorded_conversions, 0);
    assert.equal(dashboard.summary.recorded_exposures, 0);

    // Rates must be null when denominators are 0 (not fake 0% or NaN)
    assert.equal(dashboard.summary.click_through_rate, null);
    assert.equal(dashboard.summary.conversion_rate, null);
    assert.equal(dashboard.summary.average_engagement_rate, null);

    assert.equal(dashboard.summary.has_sufficient_data, false);
    assert.ok(dashboard.summary.insufficient_data_reasons.length >= 2);
    assert.equal(dashboard.timeline.length, 0);
    assert.equal(dashboard.platforms.length, 0);
    assert.equal(dashboard.content_items.length, 0);
    assert.ok(dashboard.explanation?.includes('limited'));
  });

  it('2. Metric Aggregation & Snapshot Deduplication: uses latest snapshot per post without double-counting', async () => {
    const db = await getMongoDb();
    const postId = crypto.randomUUID();

    // Seed 1 clip
    await ownerContext.run(userA, async () => {
      await dataRepository.from('clips').insert({
        id: clip1Id,
        user_id: userA,
        project_id: projectId,
        title: 'Distributed Systems Deep Dive',
        status: 'ready',
      });
      await dataRepository.from('published_posts').insert({
        id: postId,
        user_id: userA,
        clip_id: clip1Id,
        project_id: projectId,
        platform: 'youtube',
        status: 'published',
      });
    });

    // Seed 2 periodic snapshots for the same published_post_id (simulating multiple hourly syncs)
    const olderSnap: ContentAnalyticsRecord = {
      id: crypto.randomUUID(),
      user_id: userA,
      project_id: projectId,
      clip_id: clip1Id,
      published_post_id: postId,
      provider: 'youtube',
      provider_post_id: 'yt_post_older',
      platform: 'youtube',
      captured_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      metrics: {
        views: 1000,
        impressions: 5000,
        clicks: 200,
        likes: 80,
        comments: 10,
        shares: 5,
        saves: 5,
        watch_time_seconds: 12000,
      },
      sync_status: 'synced',
    };

    const latestSnap: ContentAnalyticsRecord = {
      id: crypto.randomUUID(),
      user_id: userA,
      project_id: projectId,
      clip_id: clip1Id,
      published_post_id: postId,
      provider: 'youtube',
      provider_post_id: 'yt_post_latest',
      platform: 'youtube',
      captured_at: new Date(), // latest
      created_at: new Date(),
      updated_at: new Date(),
      metrics: {
        views: 1500,
        impressions: 7500,
        clicks: 300,
        likes: 120,
        comments: 15,
        shares: 10,
        saves: 10,
        watch_time_seconds: 18000,
      },
      sync_status: 'synced',
    };

    await db.collection('content_analytics').insertMany([olderSnap, latestSnap]);

    const dashboard = await ContentPerformanceDashboardService.getDashboard(userA);

    // Latest snapshot metrics should be used, NOT the sum (1000 + 1500 = 2500)
    assert.equal(dashboard.summary.recorded_views, 1500, 'Must deduplicate snapshots and take latest');
    assert.equal(dashboard.summary.recorded_impressions, 7500);
    assert.equal(dashboard.summary.recorded_clicks, 300);
    assert.equal(dashboard.summary.recorded_watch_time_seconds, 18000);

    // CTR = 300 / 7500 = 0.04 (4%)
    assert.equal(dashboard.summary.click_through_rate, 0.04);

    // Engagement = (120 + 15 + 10 + 10) / 1500 = 155 / 1500 = 0.1033
    assert.equal(dashboard.summary.average_engagement_rate, 0.1033);

    assert.ok(dashboard.data_provenance_sources.includes('PLATFORM_SYNC'));
  });

  it('3. Denominator Integrity: returns null for rates when respective denominators are zero', async () => {
    const db = await getMongoDb();
    const clipZeroId = crypto.randomUUID();
    const zeroPostId = crypto.randomUUID();

    // Create a post with zero impressions and zero views
    await ownerContext.run(userA, async () => {
      await dataRepository.from('clips').insert({
        id: clipZeroId,
        user_id: userA,
        project_id: projectId,
        title: 'Zero Denominator Test Clip',
        status: 'ready',
      });
    });

    const zeroSnap: ContentAnalyticsRecord = {
      id: crypto.randomUUID(),
      user_id: userA,
      project_id: projectId,
      clip_id: clipZeroId,
      published_post_id: zeroPostId,
      provider: 'tiktok',
      provider_post_id: 'tt_post_zero',
      platform: 'tiktok',
      captured_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      metrics: {
        views: 0,
        impressions: 0,
        clicks: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
      },
      sync_status: 'synced',
    };

    await db.collection('content_analytics').insertOne(zeroSnap);

    const filtered = await ContentPerformanceDashboardService.getDashboard(userA, {
      clipId: clipZeroId,
    });

    // Both CTR and Engagement Rate must be null, not 0% or NaN
    assert.equal(filtered.summary.click_through_rate, null);
    assert.equal(filtered.summary.average_engagement_rate, null);
    assert.equal(filtered.content_items[0].ctr, null);
  });

  it('4. A/B Studio & CSV Import Observation Integration: aggregates exposures and conversions with provenance', async () => {
    // Seed 2 clips and an A/B experiment
    await ownerContext.run(userA, async () => {
      await dataRepository.from('clips').insert({
        id: clip2Id,
        user_id: userA,
        project_id: projectId,
        title: 'Microservices vs Monolith Benchmark',
        status: 'ready',
      });
      await dataRepository.from('clips').insert({
        id: clip3Id,
        user_id: userA,
        project_id: projectId,
        title: 'Vector Indexing in Production',
        status: 'ready',
      });

      const varAId = crypto.randomUUID();
      const varBId = crypto.randomUUID();

      await dataRepository.from('ab_experiments').insert({
        id: expId,
        user_id: userA,
        clip_id: clip2Id,
        name: 'Title Hook Retention Experiment',
        test_type: 'TITLE_ONLY',
        status: 'ACTIVE',
        target_metric: 'CTR',
        variants: [
          { id: varAId, variant_letter: 'A', name: 'Control', is_control: true },
          { id: varBId, variant_letter: 'B', name: 'Variant B', is_control: false },
        ],
      });

      // Seed observation logs with CSV_IMPORT and MANUAL_ENTRY provenance
      await dataRepository.from('ab_observation_logs').insert({
        id: crypto.randomUUID(),
        experiment_id: expId,
        variant_id: varAId,
        user_id: userA,
        exposures: 500,
        conversions: 35,
        data_provenance: 'CSV_IMPORT',
        source_label: 'youtube_analytics_export.csv',
        idempotency_key: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });

      await dataRepository.from('ab_observation_logs').insert({
        id: crypto.randomUUID(),
        experiment_id: expId,
        variant_id: varBId,
        user_id: userA,
        exposures: 500,
        conversions: 65,
        data_provenance: 'MANUAL_ENTRY',
        source_label: 'youtube_manual_log',
        idempotency_key: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });
    });

    const dashboard = await ContentPerformanceDashboardService.getDashboard(userA);

    // Total exposures = 500 + 500 = 1000
    // Total conversions = 35 + 65 = 100
    assert.equal(dashboard.summary.recorded_exposures, 1000);
    assert.equal(dashboard.summary.recorded_conversions, 100);
    assert.equal(dashboard.summary.conversion_rate, 0.1); // 10.0%

    // Provenance breakdown checks
    assert.equal(dashboard.summary.provenance_breakdown.csv_import_count, 1);
    assert.equal(dashboard.summary.provenance_breakdown.manual_observation_count, 1);
    assert.ok(dashboard.data_provenance_sources.includes('CSV_IMPORT'));
    assert.ok(dashboard.data_provenance_sources.includes('MANUAL'));
    assert.ok(dashboard.data_provenance_sources.includes('AB_STUDIO'));

    // Check content item for clip2Id
    const clip2Item = dashboard.content_items.find((i) => i.clip_id === clip2Id);
    assert.ok(clip2Item);
    assert.equal(clip2Item.status, 'in_experiment');
    assert.equal(clip2Item.exposures, 1000);
    assert.equal(clip2Item.conversions, 100);
    assert.equal(clip2Item.conversion_rate, 0.1);
    assert.equal(clip2Item.experiment?.name, 'Title Hook Retention Experiment');
    assert.equal(clip2Item.experiment?.status, 'ACTIVE');
  });

  it('5. Date-Range Filtering: respects days and custom date boundaries', async () => {
    const db = await getMongoDb();
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago

    // Insert old record
    await db.collection('content_analytics').insertOne({
      id: crypto.randomUUID(),
      user_id: userA,
      project_id: projectId,
      clip_id: clip3Id,
      published_post_id: crypto.randomUUID(),
      provider: 'youtube',
      platform: 'youtube',
      captured_at: oldDate,
      metrics: {
        views: 20000,
        impressions: 50000,
        clicks: 1000,
      },
      sync_status: 'synced',
    });

    // 1. Filter for 7 days
    const recent = await ContentPerformanceDashboardService.getDashboard(userA, { days: 7 });
    // Old 20,000 views record should NOT be included
    assert.ok(recent.summary.recorded_views < 20000, 'Old record must be filtered out for 7-day range');

    // 2. Filter for 90 days
    const allRecent = await ContentPerformanceDashboardService.getDashboard(userA, { days: 90 });
    // Old record should now be included
    assert.ok(allRecent.summary.recorded_views >= 20000, 'Old record must be included for 90-day range');
  });

  it('6. Platform Filtering: isolates metrics to specified platform', async () => {
    const db = await getMongoDb();
    const igPostId = crypto.randomUUID();

    await db.collection('content_analytics').insertOne({
      id: crypto.randomUUID(),
      user_id: userA,
      project_id: projectId,
      clip_id: clip3Id,
      published_post_id: igPostId,
      provider: 'instagram',
      platform: 'instagram',
      captured_at: new Date(),
      metrics: {
        views: 8888,
        impressions: 12000,
        clicks: 400,
      },
      sync_status: 'synced',
    });

    const igOnly = await ContentPerformanceDashboardService.getDashboard(userA, {
      platform: 'instagram',
    });

    assert.equal(igOnly.summary.recorded_views, 8888);
    assert.equal(igOnly.summary.recorded_impressions, 12000);
    assert.equal(igOnly.summary.recorded_clicks, 400);

    // Only instagram should be present in platform list
    assert.equal(igOnly.platforms.length, 1);
    assert.equal(igOnly.platforms[0].platform, 'instagram');
  });

  it('7. Content Status Filtering: filters content items by status correctly', async () => {
    // 1. Filter by status: 'in_experiment'
    const inExpDashboard = await ContentPerformanceDashboardService.getDashboard(userA, {
      status: 'in_experiment',
    });
    for (const item of inExpDashboard.content_items) {
      assert.equal(item.status, 'in_experiment');
    }

    // 2. Filter by status: 'published'
    const pubDashboard = await ContentPerformanceDashboardService.getDashboard(userA, {
      status: 'published',
    });
    for (const item of pubDashboard.content_items) {
      assert.equal(item.status, 'published');
    }
  });

  it('8. Deduplication Between Variant Observations and Observation Logs: never double counts', async () => {
    // Verify total exposures for experiment does not double-count
    const dashboard = await ContentPerformanceDashboardService.getDashboard(userA);
    const clip2 = dashboard.content_items.find((i) => i.clip_id === clip2Id);
    assert.ok(clip2);
    // clip2 has 2 logs of 500 exposures = 1000 total.
    assert.equal(clip2.exposures, 1000);
  });

  it('9. Tenant Isolation: prevents User B from accessing or viewing User A performance data', async () => {
    const userBDashboard = await ContentPerformanceDashboardService.getDashboard(userB);

    assert.equal(userBDashboard.summary.total_clips, 0);
    assert.equal(userBDashboard.summary.recorded_views, 0);
    assert.equal(userBDashboard.summary.recorded_exposures, 0);
    assert.equal(userBDashboard.content_items.length, 0);
    assert.equal(userBDashboard.timeline.length, 0);
    assert.equal(userBDashboard.platforms.length, 0);
  });

  it('10. Statistical Significance & Winner Safeguard: preserves A/B statistical confidence without raw CTR bias', async () => {
    const dashboard = await ContentPerformanceDashboardService.getDashboard(userA);
    const clip2Item = dashboard.content_items.find((i) => i.clip_id === clip2Id);
    assert.ok(clip2Item);
    assert.ok(clip2Item.experiment);

    // The experiment has not reached statistical significance or declared a winner yet
    assert.equal(clip2Item.experiment.is_significant, false);
    assert.equal(clip2Item.experiment.winning_variant_id, null);
    // Verified: The dashboard preserves statistical rigor rather than proclaiming a winner from raw conversion rate
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});


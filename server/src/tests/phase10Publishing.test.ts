import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { publishingService } from '../services/publishingService.js';
import { socialPublishingRegistry } from '../services/publishing/socialPublishingRegistry.js';
import { encryptToken } from '../utils/tokenEncryption.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { PublishedPostRecord, PublishJobRecord } from '../types/index.js';

describe('Phase 10 — Publishing & Scheduling Deterministic Tests', () => {
  const testUserId = 'a4d30f59-432e-48ac-a870-c455d351e210';
  const otherUserId = 'b5e41f60-543f-49bd-b981-d566e462f360';
  const testProjectId = '73e3ddfc-739f-499a-8fca-c057424ca84f';

  let testConnectionId: string;
  let testReadyClipId: string;
  let testDraftClipId: string;

  before(async () => {
    const db = await getMongoDb();
    testConnectionId = crypto.randomUUID();
    testReadyClipId = crypto.randomUUID();
    testDraftClipId = crypto.randomUUID();

    // Social connection
    await db.collection('social_account_connections').insertOne({
      id: testConnectionId,
      user_id: testUserId,
      provider: 'youtube',
      provider_account_id: 'yt_test_acc_123',
      provider_account_name: 'Test Channel',
      access_token: encryptToken('ya29.sample_token'),
      scopes: ['youtube.upload'],
      status: 'connected',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Ready clip
    await db.collection('clips').insertOne({
      id: testReadyClipId,
      project_id: testProjectId,
      user_id: testUserId,
      start_seconds: 0,
      end_seconds: 30,
      duration_seconds: 30,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'ready',
      source_storage_path: 'source/test.mp4',
      output_storage_path: `users/${testUserId}/projects/${testProjectId}/clips/${testReadyClipId}/render.mp4`,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Draft clip
    await db.collection('clips').insertOne({
      id: testDraftClipId,
      project_id: testProjectId,
      user_id: testUserId,
      start_seconds: 0,
      end_seconds: 30,
      duration_seconds: 30,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'draft',
      source_storage_path: 'source/test.mp4',
      output_storage_path: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  after(async () => {
    const db = await getMongoDb();
    if (testConnectionId) {
      await db.collection('social_account_connections').deleteOne({ id: testConnectionId });
    }
    if (testReadyClipId) {
      await db.collection('clips').deleteOne({ id: testReadyClipId });
    }
    if (testDraftClipId) {
      await db.collection('clips').deleteOne({ id: testDraftClipId });
    }
    await db.collection('published_posts').deleteMany({ user_id: testUserId });
    await db.collection('publish_jobs').deleteMany({ user_id: testUserId });
    await closeMongo();
  });

  describe('1. Platform Capabilities & Validation Engine', () => {
    it('has all 5 required publishing providers registered', () => {
      assert.equal(socialPublishingRegistry.hasProvider('youtube'), true);
      assert.equal(socialPublishingRegistry.hasProvider('instagram'), true);
      assert.equal(socialPublishingRegistry.hasProvider('tiktok'), true);
      assert.equal(socialPublishingRegistry.hasProvider('linkedin'), true);
      assert.equal(socialPublishingRegistry.hasProvider('x'), true);
    });

    it('validates YouTube requirements: rejects video with missing title or without clip', () => {
      const yt = socialPublishingRegistry.getProvider('youtube');
      const withoutClip = yt.validatePublishRequest({ title: 'Test Video' }, false);
      assert.equal(withoutClip.valid, false);
      assert.ok(withoutClip.errors.some((e) => e.includes('rendered video clip')));

      const withoutTitle = yt.validatePublishRequest({ title: '' }, true);
      assert.equal(withoutTitle.valid, false);
      assert.ok(withoutTitle.errors.some((e) => e.includes('title is required')));

      const valid = yt.validatePublishRequest({ title: 'Valid YouTube Title' }, true);
      assert.equal(valid.valid, true);
      assert.equal(valid.errors.length, 0);
    });

    it('validates X (Twitter) character constraints: rejects text exceeding 280 characters', () => {
      const xProvider = socialPublishingRegistry.getProvider('x');
      const tooLong = 'A'.repeat(281);
      const res = xProvider.validatePublishRequest({ caption: tooLong }, false);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('cannot exceed 280 characters')));

      const ok = xProvider.validatePublishRequest({ caption: 'Short valid tweet' }, false);
      assert.equal(ok.valid, true);
    });

    it('validates Instagram requirements: requires media and respects caption length limit', () => {
      const ig = socialPublishingRegistry.getProvider('instagram');
      const noMedia = ig.validatePublishRequest({ caption: 'Valid caption' }, false);
      assert.equal(noMedia.valid, false);

      const withMedia = ig.validatePublishRequest({ caption: 'Valid caption' }, true);
      assert.equal(withMedia.valid, true);
    });
  });

  describe('2. Ownership, Clip Readiness & Idempotency Safeguards', () => {
    it('rejects publishing when connected account does not belong to the user', async () => {
      await assert.rejects(
        async () =>
          publishingService.createPublishPost({
            userId: otherUserId, // Wrong user attempting to use User A's connection
            projectId: testProjectId,
            clipId: testReadyClipId,
            socialConnectionId: testConnectionId,
            payload: { title: 'Test Video' },
            publishType: 'now',
          }),
        /CONNECTION_NOT_FOUND|access denied/i
      );
    });

    it('rejects publishing when clip is not in "ready" render status', async () => {
      await assert.rejects(
        async () =>
          publishingService.createPublishPost({
            userId: testUserId,
            projectId: testProjectId,
            clipId: testDraftClipId, // in 'draft' status
            socialConnectionId: testConnectionId,
            payload: { title: 'Test Video' },
            publishType: 'now',
          }),
        /CLIP_NOT_READY|render_status is "draft"/i
      );
    });

    it('preview endpoint validates payload without writing or publishing', async () => {
      const preview = await publishingService.previewPublish(
        testUserId,
        testConnectionId,
        testReadyClipId,
        { title: 'Test YouTube Title', description: 'Sample description' }
      );

      assert.equal(preview.valid, true);
      assert.equal(preview.provider, 'youtube');
      assert.equal(preview.account_name, 'Test Channel');
      assert.equal(preview.warnings.length, 0);
    });

    it('enforces deterministic fingerprint idempotency: duplicate post creation is blocked', async () => {
      const payload = { title: 'Deterministic Video Title', description: 'First attempt' };

      // First creation should succeed
      const { post: firstPost } = await publishingService.createPublishPost({
        userId: testUserId,
        projectId: testProjectId,
        clipId: testReadyClipId,
        socialConnectionId: testConnectionId,
        payload,
        publishType: 'now',
      });

      assert.ok(firstPost.id);
      assert.equal(firstPost.status, 'publishing');

      // Immediate duplicate request with identical parameters must be rejected
      await assert.rejects(
        async () =>
          publishingService.createPublishPost({
            userId: testUserId,
            projectId: testProjectId,
            clipId: testReadyClipId,
            socialConnectionId: testConnectionId,
            payload,
            publishType: 'now',
          }),
        /DUPLICATE_PUBLISH_REQUEST|already publishing/i
      );
    });
  });

  describe('3. Scheduling Engine, Timezone Normalization & Cancellation', () => {
    it('rejects scheduling dates in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      await assert.rejects(
        async () =>
          publishingService.createPublishPost({
            userId: testUserId,
            projectId: testProjectId,
            clipId: testReadyClipId,
            socialConnectionId: testConnectionId,
            payload: { title: 'Past Schedule Test' },
            publishType: 'scheduled',
            scheduledFor: pastDate,
          }),
        /SCHEDULE_TIME_IN_PAST|must be in the future/i
      );
    });

    it('creates persistent scheduled post and publish_job in MongoDB', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // 24 hours in future

      const { post, job } = await publishingService.createPublishPost({
        userId: testUserId,
        projectId: testProjectId,
        clipId: testReadyClipId,
        socialConnectionId: testConnectionId,
        payload: { title: 'Future Scheduled Video' },
        publishType: 'scheduled',
        scheduledFor: futureDate,
        timezone: 'Asia/Kolkata',
      });

      assert.equal(post.status, 'scheduled');
      assert.equal(post.timezone, 'Asia/Kolkata');
      assert.ok(job);
      assert.equal(job?.status, 'scheduled');

      const db = await getMongoDb();
      const savedPost = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: post.id });
      assert.ok(savedPost);
      assert.equal(savedPost?.status, 'scheduled');

      const savedJob = await db.collection<PublishJobRecord>('publish_jobs').findOne({ published_post_id: post.id });
      assert.ok(savedJob);
      assert.equal(savedJob?.status, 'scheduled');
    });

    it('cancels scheduled post atomically and prevents unauthorized cancellation', async () => {
      const futureDate = new Date(Date.now() + 172800000).toISOString(); // 48h
      const { post } = await publishingService.createPublishPost({
        userId: testUserId,
        projectId: testProjectId,
        clipId: testReadyClipId,
        socialConnectionId: testConnectionId,
        payload: { title: 'Post To Cancel' },
        publishType: 'scheduled',
        scheduledFor: futureDate,
      });

      // User B cannot cancel User A's post
      await assert.rejects(
        async () => publishingService.cancelScheduledPost(otherUserId, post.id),
        /Forbidden|Access denied/i
      );

      // User A cancels their own scheduled post
      await publishingService.cancelScheduledPost(testUserId, post.id);

      const db = await getMongoDb();
      const cancelledPost = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: post.id });
      assert.equal(cancelledPost?.status, 'cancelled');
      assert.ok(cancelledPost?.cancelled_at);

      const cancelledJob = await db.collection<PublishJobRecord>('publish_jobs').findOne({ published_post_id: post.id });
      assert.equal(cancelledJob?.status, 'cancelled');
    });

    it('reschedules a scheduled post with updated future date', async () => {
      const initialDate = new Date(Date.now() + 1000000).toISOString();
      const newFutureDate = new Date(Date.now() + 2000000).toISOString();

      const { post } = await publishingService.createPublishPost({
        userId: testUserId,
        projectId: testProjectId,
        clipId: testReadyClipId,
        socialConnectionId: testConnectionId,
        payload: { title: 'Post To Reschedule' },
        publishType: 'scheduled',
        scheduledFor: initialDate,
      });

      await publishingService.reschedulePost(testUserId, post.id, newFutureDate, 'America/New_York');

      const db = await getMongoDb();
      const updatedPost = await db.collection<PublishedPostRecord>('published_posts').findOne({ id: post.id });
      assert.equal(updatedPost?.timezone, 'America/New_York');
      assert.equal(new Date(updatedPost!.scheduled_for!).toISOString(), new Date(newFutureDate).toISOString());
    });
  });

  describe('4. Background Job Processing & Stale Lock Recovery', () => {
    it('recovers stale locks when a job has been locked for over 5 minutes', async () => {
      const db = await getMongoDb();
      const staleDate = new Date(Date.now() - 6 * 60 * 1000); // 6 mins ago
      const staleJobId = crypto.randomUUID();
      const stalePostId = crypto.randomUUID();

      // Create matching post record so stale recovery test has valid referenced post
      await db.collection('published_posts').insertOne({
        id: stalePostId,
        user_id: testUserId,
        project_id: testProjectId,
        social_connection_id: testConnectionId,
        provider: 'youtube',
        provider_account_id: 'yt_test_acc_123',
        status: 'publishing',
        publish_type: 'scheduled',
        scheduled_for: staleDate,
        retry_count: 0,
        request_fingerprint: 'stale_fp_test',
        payload: { title: 'Stale Post' },
        created_at: staleDate,
        updated_at: staleDate,
      });

      await db.collection('publish_jobs').insertOne({
        id: staleJobId,
        user_id: testUserId,
        published_post_id: stalePostId,
        scheduled_for: new Date(Date.now() + 3600000), // Future scheduled time so processDueJobs only tests lock recovery without claiming
        status: 'publishing',
        attempts: 1,
        locked_at: staleDate,
        started_at: staleDate,
        created_at: staleDate,
        updated_at: staleDate,
      });

      // Run due jobs processor cycle
      await publishingService.processDueJobs();

      const recoveredJob = await db.collection<PublishJobRecord>('publish_jobs').findOne({ id: staleJobId });
      assert.ok(recoveredJob);
      assert.equal(recoveredJob?.status, 'scheduled');
      assert.equal(recoveredJob?.locked_at, null);

      await db.collection('publish_jobs').deleteOne({ id: staleJobId });
      await db.collection('published_posts').deleteOne({ id: stalePostId });
    });
  });
});

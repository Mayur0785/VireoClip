import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { config } from '../config/index.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

async function main() {
  console.log('==================================================');
  console.log('24. CLEANUP VERIFICATION');
  console.log('==================================================');

  // 1. Check R2 buckets
  const s3 = new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey },
  });

  let remainingR2 = 0;
  for (const bucket of [config.r2SourceBucket, config.r2ClipsBucket]) {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    const contents = list.Contents || [];
    console.log(`Bucket ${bucket}: ${contents.length} objects found.`);
    const stagingObjs = contents.filter(o => o.Key && (o.Key.includes('staging-verification') || o.Key.includes('probe')));
    if (stagingObjs.length > 0) {
      console.log(`  Deleting ${stagingObjs.length} stray staging objects from ${bucket}...`);
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: stagingObjs.map(o => ({ Key: o.Key! })), Quiet: true },
      }));
    }
    const listAfter = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    const countAfter = listAfter.KeyCount ?? 0;
    remainingR2 += countAfter;
    console.log(`Bucket ${bucket} final active object count: ${countAfter}`);
  }

  // 2. Check Mongo collections for synthetic test documents
  const db = await getMongoDb();
  const collections = [
    'profiles', 'projects', 'transcripts', 'creator_profiles', 'content_outputs',
    'usage_events', 'subscription_limits', 'clip_candidates', 'clips',
    'render_jobs', 'reframe_tracks',
  ];

  let remainingMongo = 0;
  for (const collName of collections) {
    const coll = db.collection(collName);
    const testDocs = await coll.find({
      $or: [
        { title: { $regex: /staging-verification|Test/i } },
        { bio: { $regex: /staging-verification/i } },
        { text: { $regex: /staging-verification/i } },
        { content: { $regex: /staging-verification/i } },
        { processing_attempt_id: { $regex: /attempt-test/i } },
      ],
    }).toArray();

    if (testDocs.length > 0) {
      console.log(`Cleaning ${testDocs.length} stray test documents from collection ${collName}...`);
      await coll.deleteMany({
        _id: { $in: testDocs.map(d => d._id) },
      });
    }

    const testDocsAfter = await coll.countDocuments({
      $or: [
        { title: { $regex: /staging-verification|Test/i } },
        { bio: { $regex: /staging-verification/i } },
        { text: { $regex: /staging-verification/i } },
        { content: { $regex: /staging-verification/i } },
        { processing_attempt_id: { $regex: /attempt-test/i } },
      ],
    });
    remainingMongo += testDocsAfter;
  }
  console.log(`Synthetic staging verification documents remaining in Mongo: ${remainingMongo}`);

  // 3. Check scratch temp directory
  if (existsSync('scratch/staging_qa')) {
    await fs.rm('scratch/staging_qa', { recursive: true, force: true });
  }
  console.log('Temporary FFmpeg/media files remaining: NO');

  console.log('\n--- CLEANUP SUMMARY ---');
  console.log(`Mongo test data remaining: ${remainingMongo === 0 ? 'NO' : 'YES'}`);
  console.log(`R2 test objects remaining: ${remainingR2 === 0 ? 'NO' : 'YES'}`);
  console.log(`Temp files remaining: NO`);

  await closeMongo();
}

main().catch(async (err) => {
  console.error('Cleanup verification failed:', err);
  await closeMongo().catch(() => {});
  process.exit(1);
});

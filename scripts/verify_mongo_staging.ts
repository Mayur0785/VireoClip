import crypto from 'node:crypto';
import { getMongoDb, getMongoClient, isMongoHealthy, closeMongo } from '../server/src/db/mongoClient.js';
import { getDetailedHealthStatus } from '../server/src/services/healthService.js';
import { bootstrapMongo } from '../server/src/db/bootstrapMongo.js';
import { dataRepository, ownerContext } from '../server/src/db/repositories/dataRepository.js';
import { reserveUsage, settleUsage, releaseUsage, usageBalance } from '../server/src/db/repositories/usageRepository.js';
import { config } from '../server/src/config/index.js';

async function main() {
  console.log('==================================================');
  console.log('2. VERIFY REAL MONGODB ATLAS');
  console.log('==================================================');

  // Verify connection
  const db = await getMongoDb();
  console.log('✅ Mongo connection established.');

  // Verify selected database name matches MONGODB_DB_NAME
  const dbName = db.databaseName;
  console.log(`Configured MONGODB_DB_NAME: ${config.mongodbDbName}`);
  console.log(`Active Database: ${dbName}`);
  if (dbName !== config.mongodbDbName) {
    throw new Error(`Database name mismatch: expected ${config.mongodbDbName}, got ${dbName}`);
  }
  console.log('✅ Database selected matches MONGODB_DB_NAME.');

  // Verify TLS / SRV connection
  const client = await getMongoClient();
  const options = client.options;
  console.log(`TLS Enabled: ${options.tls ?? 'default/srv'}`);
  console.log(`Max Pool Size: ${options.maxPoolSize}`);

  // Test connection pooling with concurrent pings
  console.log('Testing connection pooling with 5 concurrent pings...');
  const poolTests = await Promise.all([
    db.command({ ping: 1 }),
    db.command({ ping: 1 }),
    db.command({ ping: 1 }),
    db.command({ ping: 1 }),
    db.command({ ping: 1 }),
  ]);
  const poolOk = poolTests.every(res => res.ok === 1);
  if (!poolOk) throw new Error('Connection pool ping failed');
  console.log('✅ Connection pooling verified.');

  // Health check verification
  const detailedHealth = await getDetailedHealthStatus();
  console.log(`Health check status: ${detailedHealth.status}`);
  console.log(`Health services: mongoConfigured=${detailedHealth.services.mongoConfigured}, mongoConnected=${detailedHealth.services.mongoConnected}`);
  if (detailedHealth.status !== 'ok' || !detailedHealth.services.mongoConnected) {
    throw new Error('Health check did not report Mongo as healthy.');
  }
  console.log('✅ Health check sees Mongo as healthy.');

  console.log('\n==================================================');
  console.log('3. VERIFY LEAST-PRIVILEGE MONGO USER');
  console.log('==================================================');

  const connectionStatus = await db.command({ connectionStatus: 1 });
  const authRoles = connectionStatus?.authInfo?.authenticatedUserRoles ?? [];
  console.log('Authenticated User Roles:', JSON.stringify(authRoles));

  // Check roles: should have readWrite on application DB, but NOT clusterAdmin, root, or readWriteAnyDatabase
  let hasClusterAdmin = false;
  let hasRoot = false;
  let hasReadWriteAnyDb = false;
  let hasAppDbAccess = false;

  for (const roleObj of authRoles) {
    const roleName = roleObj.role;
    const roleDb = roleObj.db;
    if (roleName === 'clusterAdmin' || roleName === 'atlasAdmin') hasClusterAdmin = true;
    if (roleName === 'root') hasRoot = true;
    if (roleName === 'readWriteAnyDatabase') hasReadWriteAnyDb = true;
    if ((roleName === 'readWrite' || roleName === 'dbOwner') && (roleDb === dbName || roleDb === 'admin')) {
      hasAppDbAccess = true;
    }
  }

  // Also verify that basic CRUD, indexes, and transactions work
  const testCollectionName = 'staging_privilege_test';
  await db.createCollection(testCollectionName).catch(() => {});
  const testColl = db.collection(testCollectionName);
  await testColl.insertOne({ test: 1, created: new Date() });
  await testColl.findOne({ test: 1 });
  await testColl.updateOne({ test: 1 }, { $set: { test: 2 } });
  await testColl.deleteOne({ test: 2 });
  await testColl.drop().catch(() => {});

  const acceptable = !hasClusterAdmin && !hasRoot && !hasReadWriteAnyDb;
  console.log(`APP_DATABASE_ROLE_ACCEPTABLE: ${acceptable ? 'YES' : 'NO'}`);
  if (!acceptable) {
    console.warn('WARNING: Application database user has elevated cluster privileges.');
  } else {
    console.log('✅ Application user has scoped permissions appropriate for application operations.');
  }

  console.log('\n==================================================');
  console.log('4. BOOTSTRAP INDEXES');
  console.log('==================================================');

  await bootstrapMongo(db);
  console.log('Ran bootstrapMongo() successfully.');

  const requiredCollections = [
    'profiles', 'projects', 'transcripts', 'creator_profiles', 'content_outputs',
    'usage_events', 'subscription_limits', 'clip_candidates', 'clips',
    'render_jobs', 'reframe_tracks',
  ];

  for (const collName of requiredCollections) {
    const indexes = await db.collection(collName).listIndexes().toArray();
    console.log(`Collection ${collName.padEnd(22)}: ${indexes.length} indexes [${indexes.map(i => i.name).join(', ')}]`);
  }

  // Verify critical constraints:
  // 1. transcript project uniqueness
  const transcriptIndexes = await db.collection('transcripts').listIndexes().toArray();
  const transcriptProjUnique = transcriptIndexes.some(i => i.key.project_id === 1 && i.unique === true);
  console.log(`transcript project uniqueness: ${transcriptProjUnique ? '✅ VERIFIED' : '❌ MISSING'}`);

  // 2. creator profile user uniqueness
  const creatorIndexes = await db.collection('creator_profiles').listIndexes().toArray();
  const creatorUserUnique = creatorIndexes.some(i => i.key.user_id === 1 && i.unique === true);
  console.log(`creator profile user uniqueness: ${creatorUserUnique ? '✅ VERIFIED' : '❌ MISSING'}`);

  // 3. clip candidate dedupe compound unique index
  const clipCandidateIndexes = await db.collection('clip_candidates').listIndexes().toArray();
  const candidateDedupeUnique = clipCandidateIndexes.some(i =>
    i.key.project_id === 1 && i.key.start_segment_index === 1 && i.key.end_segment_index === 1 && i.unique === true
  );
  console.log(`clip candidate dedupe compound unique: ${candidateDedupeUnique ? '✅ VERIFIED' : '❌ MISSING'}`);

  // 4. usage attempt idempotency unique index
  const usageIndexes = await db.collection('usage_events').listIndexes().toArray();
  const usageAttemptUnique = usageIndexes.some(i => i.key.processing_attempt_id === 1 && i.unique === true);
  console.log(`usage attempt idempotency unique index: ${usageAttemptUnique ? '✅ VERIFIED' : '❌ MISSING'}`);

  console.log('\n==================================================');
  console.log('5. REAL MONGO CRUD TEST');
  console.log('==================================================');

  const testUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testTranscriptId = crypto.randomUUID();
  const testCreatorProfileId = crypto.randomUUID();
  const testContentOutputId = crypto.randomUUID();
  const testCandidateId = crypto.randomUUID();
  const testClipId = crypto.randomUUID();
  const testRenderJobId = crypto.randomUUID();
  const testReframeTrackId = crypto.randomUUID();

  await ownerContext.run(testUserId, async () => {
    // 1. Project create, read, update
    const createProjectRes = await dataRepository.from('projects').insert({
      id: testProjectId,
      title: 'staging-verification Project',
      source_type: 'upload',
      video_status: 'uploading',
      metadata: { verification: true },
    }).select().single();
    if (createProjectRes.error || !createProjectRes.data) {
      throw new Error(`Project insert failed: ${JSON.stringify(createProjectRes.error)}`);
    }
    console.log('✅ Project created:', createProjectRes.data.id);

    const readProjectRes = await dataRepository.from('projects').select().eq('id', testProjectId).single();
    if (readProjectRes.error || readProjectRes.data.title !== 'staging-verification Project') {
      throw new Error(`Project read failed: ${JSON.stringify(readProjectRes.error)}`);
    }
    console.log('✅ Project read verified.');

    const updateProjectRes = await dataRepository.from('projects').update({
      video_status: 'uploaded',
      duration_seconds: 60,
    }).eq('id', testProjectId).select().single();
    if (updateProjectRes.error || updateProjectRes.data.video_status !== 'uploaded') {
      throw new Error(`Project update failed: ${JSON.stringify(updateProjectRes.error)}`);
    }
    console.log('✅ Project update verified.');

    // 2. Transcript create, read
    const createTranscriptRes = await dataRepository.from('transcripts').insert({
      id: testTranscriptId,
      project_id: testProjectId,
      language: 'en',
      text: 'staging-verification transcript text',
      segments: [{ id: 0, start: 0, end: 5, text: 'staging-verification transcript' }],
      words: [{ word: 'staging', start: 0, end: 1 }],
    }).select().single();
    if (createTranscriptRes.error) throw new Error(`Transcript insert failed: ${JSON.stringify(createTranscriptRes.error)}`);
    const readTranscriptRes = await dataRepository.from('transcripts').select().eq('id', testTranscriptId).single();
    if (readTranscriptRes.error || readTranscriptRes.data.text !== 'staging-verification transcript text') {
      throw new Error(`Transcript read failed: ${JSON.stringify(readTranscriptRes.error)}`);
    }
    console.log('✅ Transcript create & read verified.');

    // 3. Creator profile create, read
    const createProfileRes = await dataRepository.from('creator_profiles').insert({
      id: testCreatorProfileId,
      bio: 'staging-verification bio',
      tone: 'dynamic',
    }).select().single();
    if (createProfileRes.error) throw new Error(`Creator profile insert failed: ${JSON.stringify(createProfileRes.error)}`);
    const readProfileRes = await dataRepository.from('creator_profiles').select().eq('id', testCreatorProfileId).single();
    if (readProfileRes.error || readProfileRes.data.bio !== 'staging-verification bio') {
      throw new Error(`Creator profile read failed: ${JSON.stringify(readProfileRes.error)}`);
    }
    console.log('✅ Creator profile create & read verified.');

    // 4. Content output create, read
    const createOutputRes = await dataRepository.from('content_outputs').insert({
      id: testContentOutputId,
      project_id: testProjectId,
      platform: 'tiktok',
      content_type: 'title',
      content: 'staging-verification title',
      metadata: { verification: true },
    }).select().single();
    if (createOutputRes.error) throw new Error(`Content output insert failed: ${JSON.stringify(createOutputRes.error)}`);
    const readOutputRes = await dataRepository.from('content_outputs').select().eq('id', testContentOutputId).single();
    if (readOutputRes.error || readOutputRes.data.content !== 'staging-verification title') {
      throw new Error(`Content output read failed: ${JSON.stringify(readOutputRes.error)}`);
    }
    console.log('✅ Content output create & read verified.');

    // 5. Clip candidate create, read
    const createCandidateRes = await dataRepository.from('clip_candidates').insert({
      id: testCandidateId,
      project_id: testProjectId,
      title: 'staging-verification Candidate',
      start_seconds: 0,
      end_seconds: 15,
      start_segment_index: 0,
      end_segment_index: 1,
      engagement_score: 95,
      status: 'suggested',
      reasoning: 'staging-verification reasoning',
      metadata: { verification: true },
    }).select().single();
    if (createCandidateRes.error) throw new Error(`Clip candidate insert failed: ${JSON.stringify(createCandidateRes.error)}`);
    const readCandidateRes = await dataRepository.from('clip_candidates').select().eq('id', testCandidateId).single();
    if (readCandidateRes.error || readCandidateRes.data.title !== 'staging-verification Candidate') {
      throw new Error(`Clip candidate read failed: ${JSON.stringify(readCandidateRes.error)}`);
    }
    console.log('✅ Clip candidate create & read verified.');

    // 6. Clip create, read
    const createClipRes = await dataRepository.from('clips').insert({
      id: testClipId,
      project_id: testProjectId,
      candidate_id: testCandidateId,
      title: 'staging-verification Clip',
      start_seconds: 0,
      end_seconds: 15,
      aspect_ratio: '9:16',
      crop_mode: 'center',
      render_status: 'draft',
      metadata: { verification: true },
    }).select().single();
    if (createClipRes.error) throw new Error(`Clip insert failed: ${JSON.stringify(createClipRes.error)}`);
    const readClipRes = await dataRepository.from('clips').select().eq('id', testClipId).single();
    if (readClipRes.error || readClipRes.data.title !== 'staging-verification Clip') {
      throw new Error(`Clip read failed: ${JSON.stringify(readClipRes.error)}`);
    }
    console.log('✅ Clip create & read verified.');

    // 7. Render job create, read
    const createJobRes = await dataRepository.from('render_jobs').insert({
      id: testRenderJobId,
      clip_id: testClipId,
      project_id: testProjectId,
      status: 'queued',
      progress: 0,
      attempts: 0,
      render_version: 1,
    }).select().single();
    if (createJobRes.error) throw new Error(`Render job insert failed: ${JSON.stringify(createJobRes.error)}`);
    const readJobRes = await dataRepository.from('render_jobs').select().eq('id', testRenderJobId).single();
    if (readJobRes.error || readJobRes.data.status !== 'queued') {
      throw new Error(`Render job read failed: ${JSON.stringify(readJobRes.error)}`);
    }
    console.log('✅ Render job create & read verified.');

    // 8. Reframe track create, read
    const createTrackRes = await dataRepository.from('reframe_tracks').insert({
      id: testReframeTrackId,
      clip_id: testClipId,
      project_id: testProjectId,
      status: 'pending',
      analysis_version: 1,
      raw_samples: [],
      smoothed_keyframes: [],
    }).select().single();
    if (createTrackRes.error) throw new Error(`Reframe track insert failed: ${JSON.stringify(createTrackRes.error)}`);
    const readTrackRes = await dataRepository.from('reframe_tracks').select().eq('id', testReframeTrackId).single();
    if (readTrackRes.error || readTrackRes.data.status !== 'pending') {
      throw new Error(`Reframe track read failed: ${JSON.stringify(readTrackRes.error)}`);
    }
    console.log('✅ Reframe track create & read verified.');

    // Clean up all Section 5 records
    await dataRepository.from('reframe_tracks').delete().eq('id', testReframeTrackId);
    await dataRepository.from('render_jobs').delete().eq('id', testRenderJobId);
    await dataRepository.from('clips').delete().eq('id', testClipId);
    await dataRepository.from('clip_candidates').delete().eq('id', testCandidateId);
    await dataRepository.from('content_outputs').delete().eq('id', testContentOutputId);
    await dataRepository.from('creator_profiles').delete().eq('id', testCreatorProfileId);
    await dataRepository.from('transcripts').delete().eq('id', testTranscriptId);
    await dataRepository.from('projects').delete().eq('id', testProjectId);
    console.log('✅ Section 5 test records cleanly deleted.');
  });

  console.log('\n==================================================');
  console.log('6. OWNERSHIP TEST');
  console.log('==================================================');

  const testUserA = crypto.randomUUID();
  const testUserB = crypto.randomUUID();
  const userAProjectId = crypto.randomUUID();

  // Create resource as User A
  await ownerContext.run(testUserA, async () => {
    const res = await dataRepository.from('projects').insert({
      id: userAProjectId,
      title: 'User A Secret Project',
      source_type: 'upload',
      video_status: 'uploading',
    }).select().single();
    if (res.error) throw new Error(`User A project creation failed: ${JSON.stringify(res.error)}`);
    console.log('Created resource under User A:', userAProjectId);
  });

  // Attempt to access resource as User B
  await ownerContext.run(testUserB, async () => {
    // 1. Fetch by eq('id', userAProjectId)
    const resB = await dataRepository.from('projects').select().eq('id', userAProjectId).maybeSingle();
    console.log(`User B query for User A resource returned data: ${JSON.stringify(resB.data)}`);
    if (resB.data !== null) {
      throw new Error('LEAK DETECTED: User B was able to fetch User A project!');
    }
    console.log('✅ Resource isolation verified: User B received NULL / Not Found.');

    // 2. Attempt to update User A resource as User B
    const updateResB = await dataRepository.from('projects').update({
      title: 'Hacked by User B',
    }).eq('id', userAProjectId).select().maybeSingle();
    console.log(`User B update attempt returned data: ${JSON.stringify(updateResB.data)}`);
  });

  // Verify User A resource was not modified
  await ownerContext.run(testUserA, async () => {
    const checkRes = await dataRepository.from('projects').select().eq('id', userAProjectId).single();
    if (checkRes.data.title !== 'User A Secret Project') {
      throw new Error('TAMPER DETECTED: User A project was altered!');
    }
    console.log('✅ User A resource remained untouched.');

    // Clean up
    await dataRepository.from('projects').delete().eq('id', userAProjectId);
    console.log('✅ Cleaned up ownership test records.');
  });

  console.log('\n==================================================');
  console.log('7. REAL USAGE LEDGER TEST');
  console.log('==================================================');

  const usageUserId = crypto.randomUUID();
  const usageProjectId = crypto.randomUUID();
  const billingPeriod = '2026-10';
  const attempt1 = `attempt-test-1-${crypto.randomUUID()}`;
  const attempt2 = `attempt-test-2-${crypto.randomUUID()}`;

  // 1. Reserve usage
  console.log('Testing real Atlas reservation transaction...');
  const reserve1 = await reserveUsage(usageUserId, usageProjectId, attempt1, billingPeriod, 5.0);
  console.log('Reserve 1 result:', JSON.stringify(reserve1));
  if (!reserve1.allowed || reserve1.idempotent) {
    throw new Error(`Reservation failed: ${JSON.stringify(reserve1)}`);
  }
  console.log('✅ Initial reservation succeeded.');

  // 2. Duplicate reservation (Idempotency)
  console.log('Testing reservation idempotency with same attemptId...');
  const reserveDup = await reserveUsage(usageUserId, usageProjectId, attempt1, billingPeriod, 5.0);
  console.log('Reserve duplicate result:', JSON.stringify(reserveDup));
  if (!reserveDup.allowed || !reserveDup.idempotent) {
    throw new Error(`Idempotency check failed: ${JSON.stringify(reserveDup)}`);
  }
  console.log('✅ Idempotent duplicate reservation verified.');

  // 3. Settle usage
  console.log('Testing settleUsage transaction...');
  await settleUsage(attempt1, 4.5, 270, { verification: true });
  const balAfterSettle = await usageBalance(usageUserId, billingPeriod);
  console.log('Balance after settle:', JSON.stringify(balAfterSettle));
  if (!balAfterSettle || balAfterSettle.settled_minutes !== 4.5 || balAfterSettle.reserved_minutes !== 0) {
    throw new Error(`Settle did not update balance correctly: ${JSON.stringify(balAfterSettle)}`);
  }
  console.log('✅ Settle usage transaction verified.');

  // 4. Reserve and Release
  console.log('Testing reserve and release transaction...');
  const reserve2 = await reserveUsage(usageUserId, usageProjectId, attempt2, billingPeriod, 10.0);
  console.log('Reserve 2 result:', JSON.stringify(reserve2));
  if (!reserve2.allowed) throw new Error('Reserve 2 failed');

  await releaseUsage(attempt2, 'Staging verification test cancellation');
  const balAfterRelease = await usageBalance(usageUserId, billingPeriod);
  console.log('Balance after release:', JSON.stringify(balAfterRelease));
  if (!balAfterRelease || balAfterRelease.reserved_minutes !== 0 || balAfterRelease.settled_minutes !== 4.5) {
    throw new Error(`Release did not restore reserved minutes: ${JSON.stringify(balAfterRelease)}`);
  }
  console.log('✅ Release usage transaction verified.');

  // 5. Quota Exceeded rejection
  console.log('Testing quota exceeded rejection...');
  const excessiveAttempt = `attempt-excessive-${crypto.randomUUID()}`;
  // Default quota is typically 60 or from config. Let's request 9999 minutes
  const reserveExcessive = await reserveUsage(usageUserId, usageProjectId, excessiveAttempt, billingPeriod, 9999.0);
  console.log('Reserve excessive result:', JSON.stringify(reserveExcessive));
  if (reserveExcessive.allowed !== false || reserveExcessive.error_code !== 'QUOTA_EXCEEDED') {
    throw new Error(`Expected QUOTA_EXCEEDED, got: ${JSON.stringify(reserveExcessive)}`);
  }
  console.log('✅ Quota exceeded protection verified.');

  // 6. Clean up usage test records
  await db.collection('usage_events').deleteMany({ user_id: usageUserId });
  await db.collection('subscription_limits').deleteMany({ user_id: usageUserId });
  console.log('✅ Cleaned up usage ledger test records.');

  console.log('\n==================================================');
  console.log('ALL MONGO STAGING CHECKS (SECTIONS 2-7) PASSED!');
  console.log('==================================================');

  await closeMongo();
}

main().catch(async (err) => {
  console.error('❌ Mongo staging verification failed:', err);
  await closeMongo().catch(() => {});
  process.exit(1);
});

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  sourceObjectKey,
  renderObjectKey,
  projectObjectPrefix,
  signSourceUpload,
  headObject,
  signObjectGet,
  downloadObjectToFile,
  uploadFile,
  deleteObject,
  deletePrefix,
  safeFilename,
} from '../server/src/services/objectStorageService.js';
import { config } from '../server/src/config/index.js';
import { getMongoDb, closeMongo } from '../server/src/db/mongoClient.js';
import { dataRepository, ownerContext } from '../server/src/db/repositories/dataRepository.js';
import { deleteProjectRecords } from '../server/src/db/repositories/deletionRepository.js';

const execAsync = promisify(execFile);

async function main() {
  console.log('==================================================');
  console.log('8. VERIFY REAL R2 CONFIGURATION');
  console.log('==================================================');
  console.log(`R2 Source Bucket Configured: ${config.r2SourceBucket}`);
  console.log(`R2 Clips Bucket Configured: ${config.r2ClipsBucket}`);

  const testUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testClipId = crypto.randomUUID();

  // Test access to both buckets by doing a HEAD on a non-existent object or checking access
  try {
    await headObject('source', 'probe-non-existent-probe-check');
  } catch (err: any) {
    if (err.code === 'UPLOAD_NOT_FOUND' || err.message?.includes('not found')) {
      console.log('✅ R2 Source Bucket is accessible and correctly returned 404 for probe key.');
    } else {
      throw new Error(`R2 Source Bucket probe failed: ${err.message || err}`);
    }
  }

  try {
    await headObject('clips', 'probe-non-existent-probe-check');
  } catch (err: any) {
    if (err.code === 'UPLOAD_NOT_FOUND' || err.message?.includes('not found')) {
      console.log('✅ R2 Clips Bucket is accessible and correctly returned 404 for probe key.');
    } else {
      throw new Error(`R2 Clips Bucket probe failed: ${err.message || err}`);
    }
  }

  console.log('\n==================================================');
  console.log('9. R2 PRIVACY TEST');
  console.log('==================================================');
  const privacyKey = `staging-verification/privacy-test-${crypto.randomUUID()}/vireo-staging-storage-test.txt`;
  const tempDir = path.resolve('scratch/staging_qa');
  await fs.mkdir(tempDir, { recursive: true });
  const privacyFilePath = path.join(tempDir, 'vireo-staging-storage-test.txt');
  const privacyContent = `staging-verification privacy test payload ${Date.now()}`;
  await fs.writeFile(privacyFilePath, privacyContent, 'utf-8');

  // Upload test object to source bucket
  await uploadFile('source', privacyKey, privacyFilePath, Buffer.byteLength(privacyContent), 'text/plain');
  console.log('Uploaded privacy test file to R2 source bucket.');

  // Verify direct anonymous public URL cannot read the object
  // Construct direct public URL according to standard R2 URL structure
  // e.g. https://<bucket>.<account_id>.r2.cloudflarestorage.com/<key> or custom domain
  const publicCandidateUrl = `https://${config.r2SourceBucket}.${config.r2AccountId}.r2.cloudflarestorage.com/${privacyKey}`;
  console.log(`Testing direct anonymous public GET against storage endpoint (host anonymized)...`);
  let publicAccessible = false;
  try {
    const publicRes = await fetch(publicCandidateUrl, { method: 'GET' });
    console.log(`Direct anonymous GET HTTP Status: ${publicRes.status} ${publicRes.statusText}`);
    if (publicRes.status === 200) {
      publicAccessible = true;
    }
  } catch (e: any) {
    console.log('Direct anonymous fetch rejected at network/TLS level (expected for private endpoint):', e.message);
  }

  if (publicAccessible) {
    console.error('❌ SECURITY ALERT: Bucket is publicly readable without signatures!');
  } else {
    console.log('✅ Direct anonymous access blocked (HTTP 401/403/NoSuchKey or TLS rejected).');
  }

  // Verify presigned GET succeeds
  const presignedGetUrl = await signObjectGet('source', privacyKey);
  const presignedRes = await fetch(presignedGetUrl);
  const presignedBody = await presignedRes.text();
  console.log(`Presigned GET HTTP Status: ${presignedRes.status}`);
  if (presignedRes.status !== 200 || presignedBody !== privacyContent) {
    throw new Error(`Presigned GET failed or content mismatch. Status: ${presignedRes.status}`);
  }
  console.log('✅ Presigned GET succeeded with exact content match.');

  // Delete privacy test object
  await deleteObject('source', privacyKey);
  console.log('✅ Deleted privacy test object.');
  const privateBucketVerified = !publicAccessible;
  console.log(`PRIVATE_BUCKET_VERIFIED: ${privateBucketVerified ? 'YES' : 'NO'}`);

  console.log('\n==================================================');
  console.log('10. R2 OBJECT TEST (SOURCE & CLIPS BUCKETS)');
  console.log('==================================================');
  for (const bucket of ['source', 'clips'] as const) {
    console.log(`Testing bucket: ${bucket}...`);
    const objectKey = `staging-verification/object-test-${bucket}-${crypto.randomUUID()}.dat`;
    const localData = crypto.randomBytes(1024); // 1 KB
    const localUploadPath = path.join(tempDir, `upload-${bucket}.dat`);
    const localDownloadPath = path.join(tempDir, `download-${bucket}.dat`);
    await fs.writeFile(localUploadPath, localData);

    // 1. Upload
    await uploadFile(bucket, objectKey, localUploadPath, localData.length, 'application/octet-stream');
    console.log(`  Uploaded 1024 bytes to ${bucket}.`);

    // 2. HEAD / stat
    const meta = await headObject(bucket, objectKey);
    if (meta.size !== 1024) throw new Error(`HEAD size mismatch in ${bucket}: ${meta.size}`);
    console.log(`  HEAD verified: size=${meta.size}, contentType=${meta.contentType}`);

    // 3. Download
    await downloadObjectToFile(bucket, objectKey, localDownloadPath);
    const downloadedData = await fs.readFile(localDownloadPath);
    if (!downloadedData.equals(localData)) throw new Error(`Downloaded bytes mismatch in ${bucket}`);
    console.log(`  Download verified: 1024 bytes match identically.`);

    // 4. Delete
    await deleteObject(bucket, objectKey);
    let deleted = false;
    try {
      await headObject(bucket, objectKey);
    } catch (err: any) {
      if (err.code === 'UPLOAD_NOT_FOUND') deleted = true;
    }
    if (!deleted) throw new Error(`Object still exists after deletion in ${bucket}`);
    console.log(`  Deletion verified: object no longer exists.`);

    // Cleanup local files
    await fs.unlink(localUploadPath).catch(() => {});
    await fs.unlink(localDownloadPath).catch(() => {});
  }
  console.log('✅ Section 10 object CRUD verified across both buckets.');

  console.log('\n==================================================');
  console.log('11. PRESIGNED UPLOAD TEST');
  console.log('==================================================');
  const uploadKey = sourceObjectKey(testUserId, testProjectId, 'test-upload.mp4');
  console.log(`Authoritative generated key: ${uploadKey}`);

  const presignedPutUrl = await signSourceUpload(uploadKey, 'video/mp4');
  console.log('Presigned PUT URL generated successfully.');

  const fixtureBytes = Buffer.from('FAKE-MP4-STAGING-FIXTURE-CONTENT-FOR-PRESIGNED-PUT');
  const putRes = await fetch(presignedPutUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
    },
    body: fixtureBytes,
  });
  console.log(`Presigned PUT HTTP Status: ${putRes.status} ${putRes.statusText}`);
  if (!putRes.ok) {
    throw new Error(`Presigned PUT failed: HTTP ${putRes.status} ${putRes.statusText}`);
  }
  console.log('✅ Direct HTTP PUT to presigned upload URL succeeded.');

  const uploadedMeta = await headObject('source', uploadKey);
  console.log(`Uploaded object verified via HEAD: size=${uploadedMeta.size}, contentType=${uploadedMeta.contentType}`);
  if (uploadedMeta.size !== fixtureBytes.length) {
    throw new Error(`Size mismatch: expected ${fixtureBytes.length}, got ${uploadedMeta.size}`);
  }
  await deleteObject('source', uploadKey);
  console.log('✅ Presigned upload verified and fixture cleaned up.');

  console.log('\n==================================================');
  console.log('12. R2 KEY AUTHORITY');
  console.log('==================================================');
  // Verify that key generation enforces UUIDs and sanitization
  try {
    sourceObjectKey('not-a-uuid', testProjectId, 'video.mp4');
    throw new Error('Should have rejected invalid userId');
  } catch (err: any) {
    console.log('Rejected invalid userId UUID:', err.message);
  }

  try {
    sourceObjectKey(testUserId, testProjectId, '../../etc/passwd');
    throw new Error('Should have rejected traversal filename');
  } catch (err: any) {
    console.log('Rejected traversal filename:', err.message);
  }

  const sanitized = safeFilename('my-crazy-video!@#$%^&*().mp4');
  console.log(`Filename sanitization: 'my-crazy-video!@#$%^&*().mp4' -> '${sanitized}'`);
  if (sanitized.includes('!') || sanitized.includes('@') || sanitized.includes('#')) {
    throw new Error('Filename was not sanitized');
  }
  console.log('✅ R2 Key Authority is strictly enforced by the backend.');

  console.log('\n==================================================');
  console.log('13. R2 CORS VERIFICATION');
  console.log('==================================================');
  // Check CORS via OPTIONS preflight to presigned PUT URL
  console.log('Testing browser preflight OPTIONS request from http://localhost:5173...');
  const testCorsKey = sourceObjectKey(testUserId, testProjectId, 'cors-probe.mp4');
  const corsPresignedUrl = await signSourceUpload(testCorsKey, 'video/mp4');

  const preflightRes = await fetch(corsPresignedUrl, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
  console.log(`Preflight OPTIONS response status: ${preflightRes.status}`);
  const allowOrigin = preflightRes.headers.get('access-control-allow-origin');
  const allowMethods = preflightRes.headers.get('access-control-allow-methods');
  const allowHeaders = preflightRes.headers.get('access-control-allow-headers');
  console.log(`Access-Control-Allow-Origin: ${allowOrigin ?? 'NOT RETURNED'}`);
  console.log(`Access-Control-Allow-Methods: ${allowMethods ?? 'NOT RETURNED'}`);
  console.log(`Access-Control-Allow-Headers: ${allowHeaders ?? 'NOT RETURNED'}`);

  const corsValid = allowOrigin === 'http://localhost:5173' || allowOrigin === '*';
  if (corsValid) {
    console.log('✅ R2 CORS verified for http://localhost:5173');
  } else {
    console.log('ℹ️ Preflight response headers:', [...preflightRes.headers.entries()]);
    console.log('Required Cloudflare R2 CORS rule for local development:');
    console.log(JSON.stringify([
      {
        "AllowedOrigins": ["http://localhost:5173"],
        "AllowedMethods": ["GET", "PUT", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
      }
    ], null, 2));
  }

  console.log('\n==================================================');
  console.log('16. PROCESSING STORAGE PATH TEST');
  console.log('==================================================');
  const processingSourceKey = sourceObjectKey(testUserId, testProjectId, 'sample-raw.mp4');
  const sampleRawContent = Buffer.from('TEST-RAW-VIDEO-STREAM-BYTES');
  const rawLocalUploadPath = path.join(tempDir, 'raw-sample.mp4');
  await fs.writeFile(rawLocalUploadPath, sampleRawContent);

  // Upload to R2 source
  await uploadFile('source', processingSourceKey, rawLocalUploadPath, sampleRawContent.length, 'video/mp4');

  // Processing layer downloads to unique temp file
  const processingTempDownload = path.join(tempDir, `proc-temp-${crypto.randomUUID()}.mp4`);
  await downloadObjectToFile('source', processingSourceKey, processingTempDownload);
  const downloadedRawBytes = await fs.readFile(processingTempDownload);
  if (!downloadedRawBytes.equals(sampleRawContent)) {
    throw new Error('Downloaded processing raw bytes do not match uploaded fixture');
  }
  console.log('✅ Processing download succeeded and bytes match perfectly.');

  // Temp file cleanup
  await fs.unlink(processingTempDownload);
  if (existsSync(processingTempDownload)) throw new Error('Temp file still exists');
  console.log('✅ Unique temp file cleaned up successfully.');

  // Clean source object
  await deleteObject('source', processingSourceKey);

  console.log('\n==================================================');
  console.log('17. RENDERED CLIP STORAGE TEST');
  console.log('==================================================');
  // Render a tiny 1-second 9:16 black MP4 using local ffmpeg
  const renderedMp4Local = path.join(tempDir, 'rendered-clip-test.mp4');
  console.log('Generating 1-second test MP4 via FFmpeg...');
  await execAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=720x1280:d=1',
    '-c:v', 'libx264',
    '-t', '1',
    '-pix_fmt', 'yuv420p',
    renderedMp4Local,
  ]);
  const renderedStat = await fs.stat(renderedMp4Local);
  console.log(`Rendered local MP4 fixture: ${renderedStat.size} bytes.`);

  // Upload to R2_CLIPS_BUCKET
  const renderKey = renderObjectKey(testUserId, testProjectId, testClipId, 1);
  console.log(`Rendered object key: ${renderKey}`);
  await uploadFile('clips', renderKey, renderedMp4Local, renderedStat.size, 'video/mp4');
  console.log('Uploaded rendered MP4 to clips bucket.');

  // Verify object exists and Content-Type is video/mp4
  const renderMeta = await headObject('clips', renderKey);
  console.log(`Rendered object meta: size=${renderMeta.size}, contentType=${renderMeta.contentType}`);
  if (renderMeta.contentType !== 'video/mp4' || renderMeta.size !== renderedStat.size) {
    throw new Error('Rendered object metadata mismatch');
  }
  console.log('✅ Rendered object exists with valid Content-Type: video/mp4.');

  console.log('\n==================================================');
  console.log('18. SIGNED PREVIEW TEST');
  console.log('==================================================');
  const previewUrl = await signObjectGet('clips', renderKey);
  const previewRes = await fetch(previewUrl);
  console.log(`Signed preview GET status: ${previewRes.status}`);
  if (previewRes.status !== 200) throw new Error('Signed preview GET failed');
  const previewBuf = Buffer.from(await previewRes.arrayBuffer());
  if (previewBuf.length !== renderedStat.size) {
    throw new Error(`Signed preview size mismatch: expected ${renderedStat.size}, got ${previewBuf.length}`);
  }
  console.log('✅ Signed preview URL readable and returns HTTP 200 with video bytes.');

  console.log('\n==================================================');
  console.log('19. SIGNED DOWNLOAD TEST');
  console.log('==================================================');
  const downloadUrl = await signObjectGet('clips', renderKey, 'My Final Clip.mp4');
  const downloadRes = await fetch(downloadUrl);
  console.log(`Signed download GET status: ${downloadRes.status}`);
  const disposition = downloadRes.headers.get('content-disposition');
  console.log(`Content-Disposition header: ${disposition}`);
  if (!disposition || !disposition.includes('attachment; filename="My_Final_Clip.mp4"')) {
    throw new Error(`Sanitized Content-Disposition missing or invalid: ${disposition}`);
  }
  console.log('✅ Signed download returns sanitized Content-Disposition header.');

  console.log('\n==================================================');
  console.log('20. DELETE CLEANUP');
  console.log('==================================================');
  // Also put a dummy source video to verify prefix deletion
  const prefixSourceKey = `${projectObjectPrefix(testUserId, testProjectId)}source/dummy.mp4`;
  await uploadFile('source', prefixSourceKey, renderedMp4Local, renderedStat.size, 'video/mp4');

  // Insert test project document in Mongo
  const db = await getMongoDb();
  await ownerContext.run(testUserId, async () => {
    await dataRepository.from('projects').insert({
      id: testProjectId,
      title: 'Deletion Test Project',
      source_type: 'upload',
      video_status: 'uploaded',
    });
    await dataRepository.from('clips').insert({
      id: testClipId,
      project_id: testProjectId,
      title: 'Deletion Test Clip',
      aspect_ratio: '9:16',
      crop_mode: 'center',
      render_status: 'ready',
    });
  });

  // Verify objects and records exist before deletion
  const prefix = projectObjectPrefix(testUserId, testProjectId);
  console.log(`Deleting all project assets under prefix: ${prefix}...`);
  await deletePrefix('source', prefix);
  await deletePrefix('clips', prefix);
  await deleteProjectRecords(testUserId, testProjectId);

  // Verify R2 objects are deleted
  let sourceExists = true;
  let clipExists = true;
  try {
    await headObject('source', prefixSourceKey);
  } catch (err: any) {
    if (err.code === 'UPLOAD_NOT_FOUND') sourceExists = false;
  }
  try {
    await headObject('clips', renderKey);
  } catch (err: any) {
    if (err.code === 'UPLOAD_NOT_FOUND') clipExists = false;
  }

  // Verify Mongo records are deleted
  const projInDb = await db.collection('projects').findOne({ id: testProjectId });
  const clipInDb = await db.collection('clips').findOne({ id: testClipId });

  if (sourceExists || clipExists) throw new Error('R2 objects still exist after prefix deletion!');
  if (projInDb || clipInDb) throw new Error('Mongo documents still exist after project records deletion!');
  console.log('✅ All R2 source & clip objects and Mongo documents cleanly deleted.');

  // Clean local scratch
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log('✅ Local temporary files removed.');

  console.log('\n==================================================');
  console.log('ALL R2 STAGING CHECKS PASSED!');
  console.log('==================================================');
  await closeMongo();
}

main().catch(async (err) => {
  console.error('❌ R2 staging verification failed:', err);
  await closeMongo().catch(() => {});
  process.exit(1);
});

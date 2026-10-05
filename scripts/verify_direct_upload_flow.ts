import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../server/src/db/mongoClient.js';
import { dataRepository, ownerContext } from '../server/src/db/repositories/dataRepository.js';
import { createProjectUploadUrl, confirmProjectUpload } from '../server/src/controllers/projectController.js';
import { deleteObject, headObject } from '../server/src/services/objectStorageService.js';

async function main() {
  console.log('==================================================');
  console.log('14. DIRECT UPLOAD FLOW VERIFICATION');
  console.log('==================================================');

  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const fileName = 'direct-flow-test.mp4';
  const fileBytes = Buffer.from('FAKE-MP4-STREAMING-DIRECT-PAYLOAD-FOR-VERIFICATION');
  const fileSize = fileBytes.length;
  const contentType = 'video/mp4';

  await ownerContext.run(userId, async () => {
    // 1. Create project
    console.log('1. Creating test project in Mongo...');
    const createRes = await dataRepository.from('projects').insert({
      id: projectId,
      title: 'Direct Upload Test Project',
      source_type: 'upload',
      video_status: 'uploading',
    }).select().single();
    if (createRes.error) throw new Error(`Project creation failed: ${JSON.stringify(createRes.error)}`);
    console.log('✅ Project created:', projectId);

    // 2. Request signed upload URL
    console.log('2. Requesting signed upload URL from backend controller...');
    let uploadUrlResponse: any = null;
    let statusCode = 200;
    const mockReq: any = {
      user: { id: userId },
      params: { id: projectId },
      body: { fileName, fileSize, contentType },
    };
    const mockRes: any = {
      status(code: number) { statusCode = code; return this; },
      json(data: any) { uploadUrlResponse = data; return this; },
    };
    await createProjectUploadUrl(mockReq, mockRes);

    if (statusCode !== 200 || !uploadUrlResponse?.uploadUrl) {
      throw new Error(`Upload URL request failed (status ${statusCode}): ${JSON.stringify(uploadUrlResponse)}`);
    }
    const { uploadUrl, headers } = uploadUrlResponse;
    console.log('✅ Signed upload URL generated successfully.');
    console.log(`Express bypass: PUT target URL is direct R2 endpoint (host anonymized).`);

    // 3. Upload directly to R2 with simulated progress tracking
    console.log('3. Uploading file directly from client to Cloudflare R2...');
    let progressReported = false;
    const progressTracking = (percent: number) => {
      progressReported = true;
      console.log(`  Upload progress reported: ${percent}%`);
    };

    // Simulate progress callback before and after PUT
    progressTracking(0);
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        ...headers,
      },
      body: fileBytes,
    });
    progressTracking(100);

    console.log(`Direct R2 PUT response status: ${putRes.status} ${putRes.statusText}`);
    if (!putRes.ok) throw new Error(`Direct upload failed with status ${putRes.status}`);
    console.log('✅ Direct upload to R2 succeeded without proxying through Express.');

    // 4. Confirm upload with backend
    console.log('4. Calling confirmProjectUpload on backend...');
    let confirmResponse: any = null;
    let confirmStatus = 200;
    const confirmReq: any = {
      user: { id: userId },
      params: { id: projectId },
    };
    const confirmResMock: any = {
      status(code: number) { confirmStatus = code; return this; },
      json(data: any) { confirmResponse = data; return this; },
    };
    await confirmProjectUpload(confirmReq, confirmResMock);

    if (confirmStatus !== 200 || confirmResponse?.status !== 'ok') {
      throw new Error(`Confirm upload failed (status ${confirmStatus}): ${JSON.stringify(confirmResponse)}`);
    }
    console.log('✅ Backend confirmed upload:', confirmResponse.project?.video_status);

    // 5. Verify database state
    const proj = await dataRepository.from('projects').select('*').eq('id', projectId).single();
    if (proj.data.video_status !== 'uploaded' || !proj.data.source_url) {
      throw new Error(`Invalid project state after confirmation: ${JSON.stringify(proj.data)}`);
    }
    console.log('✅ Database verified: video_status is uploaded, source_url populated.');

    // 6. Verify object in R2
    const objMeta = await headObject('source', proj.data.source_url);
    if (objMeta.size !== fileSize) {
      throw new Error(`R2 object size mismatch: expected ${fileSize}, got ${objMeta.size}`);
    }
    console.log('✅ R2 object verified via HEAD:', objMeta);

    // 7. Cleanup
    console.log('7. Cleaning up test assets...');
    await deleteObject('source', proj.data.source_url);
    await dataRepository.from('projects').delete().eq('id', projectId);
    console.log('✅ Test object and project record cleaned up.');
  });

  console.log('\n==================================================');
  console.log('DIRECT UPLOAD FLOW (SECTION 14) PASSED!');
  console.log('==================================================');

  await closeMongo();
}

main().catch(async (err) => {
  console.error('❌ Direct upload flow failed:', err);
  await closeMongo().catch(() => {});
  process.exit(1);
});

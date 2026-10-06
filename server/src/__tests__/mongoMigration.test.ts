import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { MongoClient } from 'mongodb';

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No free port.');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test('Mongo repositories, ownership, indexes, and quota concurrency', { timeout: 45_000 }, async (t) => {
  if (spawnSync('mongod', ['--version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('mongod is unavailable in this environment');
    return;
  }
  const port = await freePort();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vireo-mongo-test-'));
  const mongo = spawn('mongod', ['--dbpath', dir, '--port', String(port), '--bind_ip', '127.0.0.1',
    '--replSet', 'vireo_test_rs', '--quiet', '--logpath', path.join(dir, 'mongod.log')], { stdio: 'ignore' });
  t.after(async () => {
    await new Promise<void>((resolve) => {
      mongo.once('exit', () => resolve());
      mongo.kill('SIGTERM');
      setTimeout(() => {
        try { mongo.kill('SIGKILL'); } catch {}
        resolve();
      }, 3000);
    });
    // Retry rm on Windows in case files take a moment to unlock
    for (let i = 0; i < 10; i++) {
      try {
        await rm(dir, { recursive: true, force: true });
        break;
      } catch (err: any) {
        if (err.code === 'EBUSY' && i < 9) {
          await new Promise((r) => setTimeout(r, 200));
        } else {
          // If still busy, suppress error in temp cleanup so test status reflects assertion results
          break;
        }
      }
    }
  });

  const directUri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
  let admin: MongoClient | undefined;
  for (let i = 0; i < 40; i++) {
    try { admin = await new MongoClient(directUri, { serverSelectionTimeoutMS: 500 }).connect(); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  assert.ok(admin, 'mongod must be available for migration tests');
  t.after(async () => { await admin?.close(); });
  await admin.db('admin').command({ replSetInitiate: {} });
  for (let i = 0; i < 40; i++) {
    try {
      const status = await admin.db('admin').command({ hello: 1 });
      if (status.isWritablePrimary) break;
    } catch { /* election in progress */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/?replicaSet=vireo_test_rs`;
  process.env.MONGODB_DB_NAME = `vireo_test_${Date.now()}`;
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  const sourceObjects = new Map<string, { body: Buffer; contentType: string }>();
  const r2Mock = http.createServer(async (request, response) => {
    const key = new URL(request.url || '/', 'http://localhost').pathname;
    if (request.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      sourceObjects.set(key, { body: Buffer.concat(chunks), contentType: String(request.headers['content-type'] || '') });
      response.statusCode = 200; response.end(); return;
    }
    if (request.method === 'HEAD') {
      const object = sourceObjects.get(key);
      if (!object) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Content-Length', String(object.body.length));
      response.setHeader('Content-Type', object.contentType);
      response.end(); return;
    }
    response.statusCode = 404; response.end();
  });
  await new Promise<void>((resolve) => r2Mock.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>((resolve) => r2Mock.close(() => resolve())); });
  const r2Address = r2Mock.address();
  assert.ok(r2Address && typeof r2Address !== 'string');
  process.env.R2_ENDPOINT = `http://127.0.0.1:${r2Address.port}`;
  const { bootstrapMongo } = await import('../db/bootstrapMongo.js');
  const { getMongoDb, closeMongo } = await import('../db/mongoClient.js');
  const { ownerContext, dataRepository } = await import('../db/repositories/dataRepository.js');
  const { reserveUsage, settleUsage, releaseUsage, cleanupUsage, usageBalance } =
    await import('../db/repositories/usageRepository.js');
  const { sourceObjectKey, renderObjectKey, safeFilename, signSourceUpload, signObjectGet } =
    await import('../services/objectStorageService.js');
  const { createProjectUploadUrl, confirmProjectUpload } = await import('../controllers/projectController.js');
  const { deleteClipRecords, deleteProjectRecords } = await import('../db/repositories/deletionRepository.js');
  const { ClipRenderService } = await import('../services/clipRenderService.js');
  const { createClipWithJob } = await import('../db/repositories/clipRepository.js');
  const { replaceContentOutputs } = await import('../db/repositories/contentOutputRepository.js');
  const { replaceSuggestedCandidates } = await import('../db/repositories/clipCandidateRepository.js');
  const { claimProjectProcessing } = await import('../db/repositories/projectRepository.js');
  t.after(async () => { await closeMongo(); });
  await bootstrapMongo();

  const user = '11111111-1111-4111-a111-111111111111';
  const stranger = '22222222-2222-4222-a222-222222222222';
  const projectId = '33333333-3333-4333-a333-333333333333';
  const clipId = '44444444-4444-4444-a444-444444444444';
  let candidateId = '';
  let uploadGrant: { uploadUrl: string; headers: Record<string, string> } | undefined;

  await ownerContext.run(user, async () => {
    const created = await dataRepository.from('projects').insert({ id: projectId, title: 'Test', video_status: 'uploading' }).select().single();
    assert.equal(created.error, null);
    assert.equal(created.data.user_id, user);
    const changed = await dataRepository.from('projects').update({ title: 'Updated' }).eq('id', projectId).select().single();
    assert.equal(changed.data.title, 'Updated');
    const transcript = await dataRepository.from('transcripts').upsert({ project_id: projectId, transcript_text: 'hello' },
      { onConflict: 'project_id' }).select().single();
    assert.equal(transcript.data.project_id, projectId);
    const profile = await dataRepository.from('creator_profiles').upsert({ niche: 'Education' },
      { onConflict: 'user_id' }).select().single();
    assert.equal(profile.data.niche, 'Education');
    const candidate = await dataRepository.from('clip_candidates').insert({ project_id: projectId,
      start_segment_index: 0, end_segment_index: 2, engagement_score: 80 }).select().single();
    assert.equal(candidate.error, null);
    candidateId = candidate.data.id;
    const clip = await dataRepository.from('clips').insert({ id: clipId, project_id: projectId,
      candidate_id: candidate.data.id, render_status: 'queued' }).select().single();
    assert.equal(clip.data.id, clipId);
    const job = await dataRepository.from('render_jobs').insert({ clip_id: clipId, status: 'queued' }).select().single();
    assert.equal(job.data.clip_id, clipId);
    const track = await dataRepository.from('reframe_tracks').upsert({ clip_id: clipId, project_id: projectId,
      analysis_version: 1, status: 'ready' }, { onConflict: 'clip_id, analysis_version' }).select().single();
    assert.equal(track.data.status, 'ready');
    const output = await dataRepository.from('content_outputs').insert({ project_id: projectId,
      platform: 'tiktok', content_type: 'caption', content: 'A clip' }).select().single();
    assert.equal(output.data.platform, 'tiktok');
    const deleted = await dataRepository.from('content_outputs').delete().eq('id', output.data.id);
    assert.equal(deleted.error, null);
  });
  const contentRows = await replaceContentOutputs(user, projectId, [{ platform: 'tiktok',
    content_type: 'caption', content: 'A tested caption', position: 0 }], 'tiktok');
  assert.equal(contentRows.length, 1);
  await assert.rejects(replaceContentOutputs(user, projectId, [{ platform: 'youtube',
    content_type: 'caption', content: 'wrong target', position: 0 }], 'tiktok'));
  assert.equal(await (await getMongoDb()).collection('content_outputs').countDocuments({ project_id: projectId }), 1);
  await ownerContext.run(user, async () => {
    await dataRepository.from('clip_candidates').update({ status: 'selected' }).eq('id', candidateId);
  });
  const replacedCandidates = await replaceSuggestedCandidates(user, projectId, [
    { start_segment_index: 0, end_segment_index: 2, engagement_score: 90 },
    { start_segment_index: 3, end_segment_index: 5, engagement_score: 70 },
  ]);
  assert.equal(replacedCandidates.length, 2);
  assert.equal(replacedCandidates.filter((candidate) => candidate.status === 'selected').length, 1);
  await assert.rejects(replaceSuggestedCandidates(user, projectId, [
    { start_segment_index: -1, end_segment_index: 8, engagement_score: 50 },
  ]));
  assert.equal(await (await getMongoDb()).collection('clip_candidates').countDocuments({ project_id: projectId }), 2);

  await ownerContext.run(stranger, async () => {
    const read = await dataRepository.from('projects').select('*').eq('id', projectId).maybeSingle();
    assert.equal(read.data, null);
    const update = await dataRepository.from('projects').update({ title: 'stolen' }).eq('id', projectId).select().maybeSingle();
    assert.equal(update.data, null);
    const response = { code: 200, body: {} as any, status(value: number) { this.code = value; return this; },
      json(value: any) { this.body = value; return this; } };
    await createProjectUploadUrl({ user: { id: stranger }, params: { id: projectId },
      body: { fileName: 'video.mp4', fileSize: 100, contentType: 'video/mp4' } } as any, response as any);
    assert.equal(response.code, 404);
    await assert.rejects(ClipRenderService.getSignedPreviewUrl(clipId, stranger), /Clip not found/i);
  });
  await ownerContext.run(user, async () => {
    const own = await dataRepository.from('projects').select('*').eq('id', projectId).single();
    assert.equal(own.data.title, 'Updated');
    const response = { code: 200, body: {} as any, status(value: number) { this.code = value; return this; },
      json(value: any) { this.body = value; return this; } };
    await createProjectUploadUrl({ user: { id: user }, params: { id: projectId },
      body: { fileName: 'video.mp4', fileSize: 100, contentType: 'video/mp4' } } as any, response as any);
    assert.equal(response.code, 200);
    assert.match(response.body.uploadUrl, /X-Amz-Signature=/);
    uploadGrant = response.body;
    response.code = 200;
    await createProjectUploadUrl({ user: { id: user }, params: { id: projectId },
      body: { fileName: 'video.mp4', fileSize: 3 * 1024 ** 3, contentType: 'video/mp4' } } as any, response as any);
    assert.equal(response.code, 400);
  });
  assert.ok(uploadGrant);
  const confirmationResponse = { code: 200, body: {} as any, status(value: number) { this.code = value; return this; },
    json(value: any) { this.body = value; return this; } };
  await fetch(uploadGrant.uploadUrl, { method: 'PUT', headers: uploadGrant.headers, body: Buffer.alloc(10) });
  await ownerContext.run(user, async () => confirmProjectUpload({ user: { id: user }, params: { id: projectId } } as any,
    confirmationResponse as any));
  assert.equal(confirmationResponse.code, 400);
  await fetch(uploadGrant.uploadUrl, { method: 'PUT', headers: uploadGrant.headers, body: Buffer.alloc(100) });
  confirmationResponse.code = 200;
  await ownerContext.run(user, async () => confirmProjectUpload({ user: { id: user }, params: { id: projectId } } as any,
    confirmationResponse as any));
  assert.equal(confirmationResponse.code, 200);
  assert.equal(confirmationResponse.body.project.video_status, 'uploaded');
  const beforeClaim = await (await getMongoDb()).collection('projects').findOne({ id: projectId });
  assert.ok(beforeClaim?.updated_at);
  const claims = await Promise.all([0, 1].map(() => claimProjectProcessing(user, projectId,
    'uploaded', beforeClaim.updated_at)));
  assert.equal(claims.filter(Boolean).length, 1);
  await ownerContext.run(user, async () => { await dataRepository.from('projects').update({ video_status: 'uploaded' }).eq('id', projectId); });
  await ownerContext.run(user, async () => {
    await dataRepository.from('clip_candidates').update({ start_seconds: 0, end_seconds: 20 }).eq('id', candidateId);
    const pair = await createClipWithJob(projectId, candidateId, user, '9:16', 'center');
    assert.equal(pair.clip.candidate_id, candidateId);
    assert.equal(pair.renderJob.clip_id, pair.clip.id);
    assert.equal(await (await getMongoDb()).collection('render_jobs').countDocuments({ clip_id: pair.clip.id }), 1);
    await assert.rejects(createClipWithJob(projectId, candidateId, stranger, '9:16', 'center'), /Project not found/i);
  });

  const period = '2026-10';
  const attempts = Array.from({ length: 4 }, (_, i) => `attempt-${i}`);
  const results = await Promise.all(attempts.map((id) => reserveUsage(user, projectId, id, period, 5)));
  assert.equal(results.filter((result) => result.allowed).length, 3);
  const allowedAttempts = attempts.filter((_, index) => results[index].allowed);
  const balance = await usageBalance(user, period);
  assert.equal(balance?.reserved_minutes, 15);
  assert.equal((await reserveUsage(user, projectId, allowedAttempts[0], period, 5)).idempotent, true);
  await settleUsage(allowedAttempts[0], 4, 240, {});
  await releaseUsage(allowedAttempts[1], 'cancelled');
  const after = await usageBalance(user, period);
  assert.equal(after?.settled_minutes, 4);
  assert.equal(after?.reserved_minutes, 5);
  const db = await getMongoDb();
  await db.collection('usage_events').updateOne({ processing_attempt_id: allowedAttempts[2] },
    { $set: { created_at: new Date(Date.now() - 60 * 60_000) } });
  assert.equal(await cleanupUsage(30), 1);
  assert.equal((await usageBalance(user, period))?.reserved_minutes, 0);

  assert.throws(() => safeFilename('../bad.mp4'));
  const key = sourceObjectKey(user, projectId, 'hello world.mp4');
  assert.match(key, /^users\/11111111-1111-4111-a111-111111111111\/projects\/33333333-3333-4333-a333-333333333333\/source\//);
  assert.match(renderObjectKey(user, projectId, clipId, 2), /\/v2\/render\.mp4$/);
  const uploadUrl = await signSourceUpload(key, 'video/mp4');
  assert.match(uploadUrl, /X-Amz-Signature=/);
  const previewUrl = await signObjectGet('clips', renderObjectKey(user, projectId, clipId, 2));
  assert.match(previewUrl, /X-Amz-Signature=/);

  await deleteClipRecords(user, clipId);
  assert.equal(await db.collection('clips').countDocuments({ id: clipId }), 0);
  assert.equal(await db.collection('render_jobs').countDocuments({ clip_id: clipId }), 0);
  assert.equal(await db.collection('reframe_tracks').countDocuments({ clip_id: clipId }), 0);
  await deleteProjectRecords(user, projectId);
  assert.equal(await db.collection('projects').countDocuments({ id: projectId }), 0);
  assert.equal(await db.collection('transcripts').countDocuments({ project_id: projectId }), 0);
});

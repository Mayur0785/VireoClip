import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('R2 adapter streams private files and deletes objects by key or prefix', async (t) => {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const key = decodeURIComponent(url.pathname.slice(1));
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (req.method === 'PUT') {
      objects.set(key, { body, type: String(req.headers['content-type'] || 'application/octet-stream') });
      res.statusCode = 200; res.end(); return;
    }
    if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') || '';
      const bucket = key.split('/')[0];
      const keys = [...objects.keys()].filter((item) => item.startsWith(`${bucket}/${prefix}`));
      res.setHeader('Content-Type', 'application/xml');
      res.end(`<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((item) =>
        `<Contents><Key>${item.slice(bucket.length + 1)}</Key></Contents>`).join('')}</ListBucketResult>`);
      return;
    }
    if (req.method === 'POST' && url.searchParams.has('delete')) {
      for (const match of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g)) objects.delete(`${key.replace(/\/$/, '')}/${match[1]}`);
      res.setHeader('Content-Type', 'application/xml');
      res.end('<DeleteResult/>'); return;
    }
    if (req.method === 'HEAD' || req.method === 'GET') {
      const object = objects.get(key);
      if (!object) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Length', String(object.body.length));
      res.setHeader('Content-Type', object.type);
      if (req.method === 'HEAD') res.end(); else res.end(object.body);
      return;
    }
    res.statusCode = 405; res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  process.env.R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.R2_SOURCE_BUCKET = 'source-test';
  process.env.R2_CLIPS_BUCKET = 'clips-test';
  const storage = await import('../services/objectStorageService.js');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vireo-r2-test-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  const input = path.join(dir, 'source.mp4');
  const output = path.join(dir, 'download.mp4');
  await writeFile(input, Buffer.from('video bytes'));
  const key = 'users/test/projects/test/source/example.mp4';
  await storage.uploadFile('source', key, input, 11, 'video/mp4');
  assert.deepEqual(await storage.headObject('source', key), { size: 11, contentType: 'video/mp4' });
  await storage.downloadObjectToFile('source', key, output);
  assert.equal((await readFile(output)).toString(), 'video bytes');
  const preview = await storage.signObjectGet('source', key);
  assert.match(preview, /X-Amz-Signature=/);
  await storage.deleteObject('source', key);
  await assert.rejects(storage.headObject('source', key), /not found/i);

  await storage.uploadFile('clips', 'users/test/projects/test/clips/1/v1/render.mp4', input, 11, 'video/mp4');
  await storage.uploadFile('clips', 'users/test/projects/test/clips/1/v2/render.mp4', input, 11, 'video/mp4');
  await storage.deletePrefix('clips', 'users/test/projects/test/clips/1/');
  assert.equal([...objects.keys()].filter((item) => item.startsWith('clips-test/')).length, 0);
});

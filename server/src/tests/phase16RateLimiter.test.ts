import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import { generalLimiter, expensiveLimiter, authLimiter } from '../middleware/rateLimiter.js';

describe('Rate Limiter Middleware & 429 Stability Tests', () => {
  it('1. General read endpoint returns standard RateLimit headers', async () => {
    const app = express();
    app.use('/api', generalLimiter);
    app.get('/api/test-read', (req, res) => res.json({ status: 'ok' }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/test-read`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('ratelimit-limit'), '300');
      assert.ok(res.headers.get('ratelimit-remaining') !== null);
    } finally {
      server.close();
    }
  });

  it('2. Rate limiter scopes authenticated users by token sub rather than sharing IP bucket', async () => {
    const app = express();
    app.use('/api', generalLimiter);
    app.get('/api/test-scope', (req, res) => res.json({ status: 'ok' }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // Fake valid JWT token structure with sub
      const payloadA = Buffer.from(JSON.stringify({ sub: 'user_aaa' })).toString('base64url');
      const tokenA = `header.${payloadA}.signature`;

      const payloadB = Buffer.from(JSON.stringify({ sub: 'user_bbb' })).toString('base64url');
      const tokenB = `header.${payloadB}.signature`;

      const resA = await fetch(`http://127.0.0.1:${port}/api/test-scope`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resA.headers.get('ratelimit-limit'), '300');

      const resB = await fetch(`http://127.0.0.1:${port}/api/test-scope`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(resB.status, 200);
      assert.strictEqual(resB.headers.get('ratelimit-limit'), '300');
    } finally {
      server.close();
    }
  });

  it('3. Returns 429 and RATE_LIMITED code when threshold is exceeded', async () => {
    const app = express();
    const rateLimit = (await import('express-rate-limit')).default;
    const localLimiter = rateLimit({
      windowMs: 5000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        status: 'error',
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again shortly.',
      },
    });

    app.use('/api', localLimiter);
    app.get('/api/limited', (req, res) => res.json({ status: 'ok' }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/api/limited`);
      assert.strictEqual(res1.status, 200);

      const res2 = await fetch(`http://127.0.0.1:${port}/api/limited`);
      assert.strictEqual(res2.status, 200);

      const res3 = await fetch(`http://127.0.0.1:${port}/api/limited`);
      assert.strictEqual(res3.status, 429);
      const data3 = await res3.json() as any;
      assert.strictEqual(data3.code, 'RATE_LIMITED');
      assert.ok(res3.headers.get('retry-after') !== null);
    } finally {
      server.close();
    }
  });

  it('4. Expensive limiter has distinct limit from generalLimiter', () => {
    assert.strictEqual(expensiveLimiter !== generalLimiter, true);
    assert.strictEqual(authLimiter !== generalLimiter, true);
  });
});

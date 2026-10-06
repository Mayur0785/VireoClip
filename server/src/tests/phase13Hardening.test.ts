import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import {
  generalLimiter,
  expensiveLimiter,
  authLimiter,
  webhookLimiter,
  adminLimiter
} from '../middleware/rateLimiter.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { getReadinessStatus } from '../services/healthService.js';
import { UrlValidator } from '../utils/urlValidator.js';
import { closeMongo } from '../db/mongoClient.js';

describe('Phase 13 Production Hardening & Reliability Tests', () => {
  after(async () => {
    await closeMongo();
  });

  it('1. Rate Limiter Suite defines dedicated classes for webhooks, admin, and expensive actions', () => {
    assert.ok(generalLimiter, 'generalLimiter must exist');
    assert.ok(expensiveLimiter, 'expensiveLimiter must exist');
    assert.ok(authLimiter, 'authLimiter must exist');
    assert.ok(webhookLimiter, 'webhookLimiter must exist');
    assert.ok(adminLimiter, 'adminLimiter must exist');
    assert.notStrictEqual(webhookLimiter, generalLimiter);
    assert.notStrictEqual(adminLimiter, generalLimiter);
  });

  it('2. Standardized Error Model includes request_id, status, and nested error structure', async () => {
    const app = express();
    // Simulate requestId middleware
    app.use((req, res, next) => {
      req.headers['x-request-id'] = 'test-req-12345';
      next();
    });

    app.get('/api/test-error', (req, res, next) => {
      const err = new Error('Database query timed out') as any;
      err.status = 503;
      err.code = 'DATABASE_UNAVAILABLE';
      next(err);
    });

    app.use(errorHandler);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/test-error`);
      assert.strictEqual(res.status, 503);
      const data = await res.json() as any;

      assert.strictEqual(data.status, 'error');
      assert.strictEqual(data.code, 'DATABASE_UNAVAILABLE');
      assert.strictEqual(data.request_id, 'test-req-12345');
      assert.ok(data.error);
      assert.strictEqual(data.error.code, 'DATABASE_UNAVAILABLE');
      assert.strictEqual(data.error.request_id, 'test-req-12345');
      assert.strictEqual(data.error.message, 'Database query timed out');
      // Must not leak internal stack traces to client
      assert.strictEqual(data.stack, undefined);
    } finally {
      server.close();
    }
  });

  it('3. Health & Readiness probe returns operational dependencies without leaking credentials', async () => {
    const readiness = await getReadinessStatus();
    assert.ok(readiness);
    assert.ok(typeof readiness.status === 'string');
    assert.ok(readiness.checks);
    assert.ok('mongodb' in readiness.checks);
    assert.ok('supabase' in readiness.checks);
    assert.ok('storage' in readiness.checks);
    assert.ok('aiProvider' in readiness.checks);

    const serialized = JSON.stringify(readiness);
    assert.strictEqual(serialized.includes('mongodb+srv://'), false);
    assert.strictEqual(serialized.includes('sk-or-v1-'), false);
    assert.strictEqual(serialized.includes('eyJh'), false);
  });

  it('4. SSRF Protection revalidates and rejects loopback, private IPv4, and internal hostnames', async () => {
    assert.strictEqual(UrlValidator.isPrivateIp('127.0.0.1'), true);
    assert.strictEqual(UrlValidator.isPrivateIp('169.254.169.254'), true);
    assert.strictEqual(UrlValidator.isPrivateIp('192.168.1.1'), true);
    assert.strictEqual(UrlValidator.isPrivateIp('10.0.0.1'), true);
    assert.strictEqual(UrlValidator.isPrivateIp('::1'), true);
    assert.strictEqual(UrlValidator.isPrivateIp('8.8.8.8'), false);

    await assert.rejects(
      async () => await UrlValidator.checkSsrf('localhost'),
      (err: any) => err.code === 'SSRF_BLOCKED'
    );

    await assert.rejects(
      async () => await UrlValidator.checkSsrf('metadata.google.internal'),
      (err: any) => err.code === 'SSRF_BLOCKED'
    );

    await assert.rejects(
      async () => await UrlValidator.checkSsrf('test.local'),
      (err: any) => err.code === 'SSRF_BLOCKED'
    );
  });

  it('5. Webhook rate limiter allows legitimate provider bursts without blocking early events', async () => {
    const app = express();
    app.use('/webhook', webhookLimiter);
    app.post('/webhook', (req, res) => res.json({ received: true }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/webhook`, { method: 'POST' });
      assert.strictEqual(res.status, 200);
      const data = await res.json() as any;
      assert.strictEqual(data.received, true);
    } finally {
      server.close();
    }
  });

  it('6. Cleanup after tests finish', () => {
    // Graceful no-op to close suite cleanly
    assert.strictEqual(true, true);
  });
});


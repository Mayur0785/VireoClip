import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUUID, PROCESSABLE_STATUSES, ACTIVE_PROCESSING_STATUSES, VIDEO_STATUSES } from '../types/index.js';
import { getHealthStatus } from '../services/healthService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { AuthenticatedRequest } from '../types/index.js';
import { Response } from 'express';

// Helper to mock Express req, res, next
function mockReqRes(reqOverrides: Partial<AuthenticatedRequest> = {}) {
  const req = {
    headers: {},
    ip: '127.0.0.1',
    params: {},
    query: {},
    body: {},
    ...reqOverrides,
  } as unknown as AuthenticatedRequest;

  let statusCode = 200;
  let responseData: any = null;
  const responseHeaders: Record<string, string> = {};

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;
      return this;
    },
  } as unknown as Response;

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
    getResponseHeaders: () => responseHeaders,
    isNextCalled: () => nextCalled,
  };
}

describe('Vireo Backend Unit Tests', () => {
  describe('UUID Validation', () => {
    it('accepts valid v4 UUIDs', () => {
      assert.equal(isValidUUID('123e4567-e89b-12d3-a456-426614174000'), true);
      assert.equal(isValidUUID('c9bf9e57-1685-4c89-bafb-ff5af830be8a'), true);
    });

    it('rejects malformed UUIDs and path injection attempts', () => {
      assert.equal(isValidUUID('not-a-uuid'), false);
      assert.equal(isValidUUID('../../../etc/passwd'), false);
      assert.equal(isValidUUID('12345'), false);
      assert.equal(isValidUUID(''), false);
      assert.equal(isValidUUID('c9bf9e57-1685-4c89-bafb-ff5af830be8a/extra'), false);
      assert.equal(isValidUUID("'; DROP TABLE projects; --"), false);
    });
  });

  describe('State Machine Constants', () => {
    it('contains all canonical video statuses in proper order', () => {
      assert.deepEqual(VIDEO_STATUSES, [
        'uploading',
        'uploaded',
        'processing',
        'transcribing',
        'transcribed',
        'generating',
        'completed',
        'failed',
      ]);
    });

    it('defines correct processable states', () => {
      assert.deepEqual(PROCESSABLE_STATUSES, ['uploaded', 'failed']);
    });

    it('defines active processing states', () => {
      assert.deepEqual(ACTIVE_PROCESSING_STATUSES, ['processing', 'transcribing', 'generating']);
    });
  });

  describe('Health Service', () => {
    it('returns healthy status with metadata', () => {
      const health = getHealthStatus();
      assert.equal(health.status, 'ok');
      assert.equal(health.version, '0.1.0');
      assert.ok(typeof health.timestamp === 'string');
      assert.ok(typeof health.uptimeSeconds === 'number');
      assert.ok(typeof health.services === 'object');
    });
  });

  describe('Request ID Middleware', () => {
    it('generates a new UUID when no X-Request-ID header is present', () => {
      const { req, res, next, getResponseHeaders } = mockReqRes();
      requestIdMiddleware(req, res, next);

      assert.ok(req.requestId);
      assert.equal(isValidUUID(req.requestId), true);
      assert.equal(getResponseHeaders()['X-Request-ID'], req.requestId);
    });

    it('preserves valid alphanumeric incoming X-Request-ID', () => {
      const { req, res, next, getResponseHeaders } = mockReqRes({
        headers: { 'x-request-id': 'client-trace-12345' },
      });
      requestIdMiddleware(req, res, next);

      assert.equal(req.requestId, 'client-trace-12345');
      assert.equal(getResponseHeaders()['X-Request-ID'], 'client-trace-12345');
    });

    it('sanitizes unsafe incoming request IDs and generates clean UUID', () => {
      const { req, res, next } = mockReqRes({
        headers: { 'x-request-id': '<script>alert(1)</script>' },
      });
      requestIdMiddleware(req, res, next);

      assert.notEqual(req.requestId, '<script>alert(1)</script>');
      assert.equal(isValidUUID(req.requestId!), true);
    });
  });

  describe('Authentication Middleware (Security Hardening)', () => {
    it('rejects requests missing the Authorization header', async () => {
      const { req, res, next, getStatusCode, getResponseData } = mockReqRes({
        headers: {},
      });
      await requireAuth(req, res, next);

      assert.ok(getStatusCode() === 401 || getStatusCode() === 503);
      const data = getResponseData();
      assert.equal(data.status, 'error');
    });

    it('rejects requests with malformed Authorization header (no Bearer)', async () => {
      const { req, res, next, getStatusCode, getResponseData } = mockReqRes({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      await requireAuth(req, res, next);

      assert.ok(getStatusCode() === 401 || getStatusCode() === 503);
      const data = getResponseData();
      assert.equal(data.status, 'error');
    });

    it('rejects empty bearer token', async () => {
      const { req, res, next, getStatusCode, getResponseData } = mockReqRes({
        headers: { authorization: 'Bearer ' },
      });
      await requireAuth(req, res, next);

      assert.ok(getStatusCode() === 401 || getStatusCode() === 503);
      const data = getResponseData();
      assert.equal(data.status, 'error');
    });

    it('REJECTS demo-token backdoor (Finding C1 verified fixed)', async () => {
      const { req, res, next, getStatusCode, getResponseData, isNextCalled } = mockReqRes({
        headers: { authorization: 'Bearer demo-token' },
      });
      await requireAuth(req, res, next);

      // Must never call next() with demo-user-id
      assert.equal(isNextCalled(), false);
      // Must return an error status code
      assert.ok(getStatusCode() === 401 || getStatusCode() === 503);
      const data = getResponseData();
      assert.equal(data.status, 'error');
      assert.notEqual(req.user?.id, 'demo-user-id');
    });
  });

  describe('Storage Path Isolation Check', () => {
    function isAllowedStoragePath(userId: string, storagePath: string): boolean {
      const normalized = String(storagePath).replace(/^videos\//, '');
      return normalized.startsWith(`${userId}/`);
    }

    it('allows valid storage paths matching the authenticated userId', () => {
      const userId = '11111111-2222-3333-4444-555555555555';
      const path = `${userId}/project-abc/video.mp4`;
      assert.equal(isAllowedStoragePath(userId, path), true);
      assert.equal(isAllowedStoragePath(userId, `videos/${path}`), true);
    });

    it('blocks storage path traversal attempts and cross-user paths', () => {
      const userId = '11111111-2222-3333-4444-555555555555';
      const victimId = '99999999-8888-7777-6666-555555555555';

      // Attacker trying to write into victim's folder
      assert.equal(isAllowedStoragePath(userId, `${victimId}/secret.mp4`), false);

      // Path traversal attempts
      assert.equal(isAllowedStoragePath(userId, `../${victimId}/secret.mp4`), false);
      assert.equal(isAllowedStoragePath(userId, `/${victimId}/secret.mp4`), false);
      assert.equal(isAllowedStoragePath(userId, 'root-file.mp4'), false);
    });
  });
});

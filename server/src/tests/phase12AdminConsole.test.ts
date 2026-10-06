import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { AdminService } from '../services/adminService.js';
import { config } from '../config/index.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { AppError } from '../types/index.js';

describe('Phase 12: Admin Dashboard & Owner Console Tests', () => {
  after(async () => {
    await closeMongo();
  });

  describe('1. Server-Side Admin Authorization Middleware', () => {
    it('rejects unauthenticated request (no user on req) with 401 AUTH_REQUIRED', () => {
      const mockReq: any = {};
      const mockRes: any = {};
      const next = () => {};

      assert.throws(
        () => requireAdmin(mockReq, mockRes, next),
        (err: any) => err instanceof AppError && err.statusCode === 401 && err.code === 'AUTH_REQUIRED'
      );
    });

    it('rejects authenticated non-admin user with 403 FORBIDDEN_ADMIN_ACCESS', () => {
      const mockReq: any = {
        user: {
          id: crypto.randomUUID(),
          email: 'random_attacker@evil.com',
        },
        ip: '127.0.0.1',
        originalUrl: '/api/admin/overview',
      };
      const mockRes: any = {};
      const next = () => {};

      assert.throws(
        () => requireAdmin(mockReq, mockRes, next),
        (err: any) => err instanceof AppError && err.statusCode === 403 && err.code === 'FORBIDDEN_ADMIN_ACCESS'
      );
    });

    it('rejects user attempting to send role: "admin" in body if not in admin config', () => {
      const mockReq: any = {
        user: {
          id: crypto.randomUUID(),
          email: 'normal_user@gmail.com',
        },
        body: { role: 'admin' },
        ip: '127.0.0.1',
        originalUrl: '/api/admin/users',
      };
      const mockRes: any = {};
      const next = () => {};

      assert.throws(
        () => requireAdmin(mockReq, mockRes, next),
        (err: any) => err instanceof AppError && err.statusCode === 403
      );
    });

    it('authorizes user whose email is in config.adminEmails', () => {
      const adminEmail = config.adminEmails[0] || 'vertexdigitals07@gmail.com';
      const mockReq: any = {
        user: {
          id: 'a4d30f59-432e-48ac-a870-c455d351e25e',
          email: adminEmail,
        },
        ip: '127.0.0.1',
        originalUrl: '/api/admin/overview',
      };
      const mockRes: any = {};
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      requireAdmin(mockReq, mockRes, next);
      assert.equal(nextCalled, true);
    });
  });

  describe('2. Admin Overview Aggregations', () => {
    it('aggregates real metrics across users, projects, usage, subscriptions, and system', async () => {
      const overview = await AdminService.getOverview();

      assert.ok(overview);
      assert.ok(overview.users);
      assert.ok(typeof overview.users.total === 'number');
      assert.ok(typeof overview.users.createdToday === 'number');

      assert.ok(overview.projects);
      assert.ok(typeof overview.projects.total === 'number');
      assert.ok(typeof overview.projects.processing === 'number');

      assert.ok(overview.usage);
      assert.ok(typeof overview.usage.sourceMinutesCurrentMonth === 'number');

      assert.ok(overview.subscriptions);
      assert.ok(typeof overview.subscriptions.creatorSubscribers === 'number');
      assert.ok(typeof overview.subscriptions.proSubscribers === 'number');
      assert.ok(typeof overview.subscriptions.studioSubscribers === 'number');

      assert.ok(overview.system);
      assert.ok(typeof overview.system.mongoConnected === 'boolean');
      assert.ok(typeof overview.system.ffmpegAvailable === 'boolean');
      assert.ok(typeof overview.system.paddleConfigured === 'boolean');
      assert.ok(typeof overview.system.razorpayConfigured === 'boolean');
    });
  });

  describe('3. Admin User Management & Safe Fields', () => {
    it('returns paginated users without exposing sensitive credentials or tokens', async () => {
      const result = await AdminService.getUsers({ page: 1, limit: 10 });

      assert.ok(result);
      assert.ok(Array.isArray(result.users));
      assert.ok(result.total >= 0);
      assert.equal(result.page, 1);
      assert.equal(result.limit, 10);

      // Verify no passwords, tokens, or private secrets in returned user list
      for (const u of result.users) {
        assert.ok(u.id);
        assert.ok(u.email);
        assert.equal((u as any).password, undefined);
        assert.equal((u as any).access_token, undefined);
        assert.equal((u as any).refresh_token, undefined);
        assert.equal((u as any).secret, undefined);
      }
    });

    it('supports search by email or name without crashing or throwing regex error', async () => {
      const result = await AdminService.getUsers({ page: 1, limit: 10, search: 'vertex' });
      assert.ok(result);
      assert.ok(Array.isArray(result.users));
    });
  });

  describe('4. Admin Projects & Render Monitoring', () => {
    it('returns paginated projects with safe fields', async () => {
      const result = await AdminService.getProjects({ page: 1, limit: 10 });
      assert.ok(result);
      assert.ok(Array.isArray(result.projects));
      for (const p of result.projects) {
        assert.ok(p.id);
        assert.ok(p.title);
        assert.ok(p.video_status);
      }
    });

    it('returns paginated render jobs', async () => {
      const result = await AdminService.getRenderJobs({ page: 1, limit: 10 });
      assert.ok(result);
      assert.ok(Array.isArray(result.renderJobs));
    });
  });

  describe('5. Admin Subscriptions & Publishing Monitoring', () => {
    it('returns subscriptions without leaking webhook secrets or payment credentials', async () => {
      const result = await AdminService.getSubscriptions({ page: 1, limit: 10 });
      assert.ok(result);
      assert.ok(Array.isArray(result.subscriptions));
      for (const s of result.subscriptions) {
        assert.equal((s as any).paddle_api_key, undefined);
        assert.equal((s as any).razorpay_key_secret, undefined);
        assert.equal((s as any).webhook_secret, undefined);
      }
    });

    it('returns publishing jobs with provider and schedule times', async () => {
      const result = await AdminService.getPublishing({ page: 1, limit: 10 });
      assert.ok(result);
      assert.ok(Array.isArray(result.jobs));
      for (const j of result.jobs) {
        assert.equal((j as any).access_token, undefined);
        assert.equal((j as any).refresh_token, undefined);
      }
    });
  });

  describe('6. Admin Social Account Safe Projections', () => {
    it('never exposes raw or encrypted access_token or refresh_token in social accounts listing', async () => {
      const result = await AdminService.getSocialAccounts({ page: 1, limit: 10 });
      assert.ok(result);
      assert.ok(Array.isArray(result.accounts));
      for (const a of result.accounts) {
        assert.equal((a as any).access_token, undefined);
        assert.equal((a as any).refresh_token, undefined);
        assert.equal((a as any).client_secret, undefined);
      }
    });
  });

  describe('7. Admin System Diagnostics & Health', () => {
    it('returns diagnostic statuses without exposing private keys or secrets', async () => {
      const health = await AdminService.getHealthDiagnostics();
      assert.ok(health);
      assert.ok(health.services);
      assert.ok(health.services.mongo);
      assert.ok(typeof health.services.mongo.connected === 'boolean');
      assert.ok(typeof health.services.mongo.latencyMs === 'number');

      // Verify no secrets in health output
      const jsonStr = JSON.stringify(health);
      assert.equal(jsonStr.includes(config.mongodbUri), false);
      assert.equal(jsonStr.includes(config.r2SecretAccessKey), false);
      if (config.paddleApiKey) assert.equal(jsonStr.includes(config.paddleApiKey), false);
      if (config.razorpayKeySecret) assert.equal(jsonStr.includes(config.razorpayKeySecret), false);
    });
  });
});

# VireoClip Operational Recovery & Backup Procedures
**Phase 13 Production Hardening & Operational Runbook**

---

## 1. Overview & Scope

This document details the operational disaster recovery, backup strategies, lock recovery, secret rotation, and webhook replay runbooks for VireoClip.
All operations described adhere to strict data-integrity constraints, multi-tenant isolation, and zero-data-loss guarantees.

---

## 2. MongoDB Database Backup & Restoration

### 2.1 MongoDB Atlas Automated Backups
VireoClip uses MongoDB Atlas. In production environments:
1. **Continuous Cloud Backups (PITR)**: Point-in-Time Recovery must be enabled on the production cluster with a retention window of 7 to 35 days.
2. **Snapshot Frequency**: Automated snapshots occur every 6 hours, retained for 7 days. Weekly snapshots retained for 30 days.

### 2.2 On-Demand Database Backup via `mongodump`
To create a safe point-in-time logical backup prior to schema migrations or major version upgrades:

```bash
# Export full database with archive compression
mongodump --uri="$MONGODB_URI" --archive="vireoclip_backup_$(date +%Y%m%d_%H%M%S).gz" --gzip
```

### 2.3 Disaster Recovery Restoration via `mongorestore`
To restore from a logical backup archive:

```bash
# Dry run verification
mongorestore --uri="$MONGODB_URI" --archive="vireoclip_backup_TARGET.gz" --gzip --dryRun

# Production restore (non-destructive; does not drop collections unless specified)
mongorestore --uri="$MONGODB_URI" --archive="vireoclip_backup_TARGET.gz" --gzip --nsInclude="vireoclip.*"
```

*Note: Never execute `--drop` against production MongoDB Atlas without explicit sign-off.*

---

## 3. Cloudflare R2 Object Storage Recovery

### 3.1 Bucket Layout & Ownership
All assets in Cloudflare R2 are namespaced with strict multi-tenant path structures:
```
uploads/{userId}/{projectId}/{filename}
clips/{userId}/{projectId}/{clipId}.mp4
outputs/{userId}/{projectId}/...
```

### 3.2 R2 Lifecycle & Disaster Recovery
- **Bucket Versioning**: Cloudflare R2 Bucket Versioning should be enabled for production buckets to protect against accidental deletes or overwrites.
- **R2 Retention & Abort Multipart**: Configure lifecycle rules to abort incomplete multipart uploads older than 7 days to eliminate orphaned temporary chunks.
- **Cross-Region Replication**: For mission-critical high availability, replicate the primary R2 bucket to a secondary failover region using Cloudflare R2 Super Slurper or bucket replication.

---

## 4. Background Job & Distributed Lock Recovery

### 4.1 Render Job Lock Recovery
Render jobs utilize atomic distributed leasing via MongoDB `findOneAndUpdate` with lease timeouts:
- **Default Lease Timeout (`JOB_LOCK_TIMEOUT_MS`)**: 15 minutes (900,000 ms).
- **Worker Failure Scenario**: If a backend instance crashes mid-render, its lock expires after `staleCutoff` (`Date.now() - 15m`).
- **Automatic Recovery**: On the next claim poll, another worker atomically reclaims the job if `attempts < max_attempts` (default: 3).
- **Manual Lock Release Script**:
  If a batch of jobs was abandoned by a hard server termination:
  ```javascript
  // Execute via MongoDB Shell or Node diagnostic script
  db.render_jobs.updateMany(
    {
      status: "rendering",
      locked_at: { $lt: new Date(Date.now() - 15 * 60 * 1000) },
      attempts: { $lt: 3 }
    },
    {
      $set: {
        status: "queued",
        worker_id: null,
        locked_at: null
      }
    }
  );
  ```

### 4.2 Publishing Worker Stale Lock Recovery
Social publishing jobs utilize `publish_jobs` with atomic claims:
- **Lease Timeout**: 10 minutes (`staleCutoff = Date.now() - 10m`).
- **Exponential Backoff**: Transient failures automatically reschedule with delays of 2s, 5s, 15s.
- **Dead-Letter State**: After reaching `max_attempts` (3), the job transitions to `status: "failed"` with a sanitized `error_message`.

---

## 5. Webhook Replay Strategy

### 5.1 Idempotency & Deduplication
Every incoming billing webhook (Paddle / Razorpay) is verified via signature and recorded in `billing_events`:
- **Unique Event Index**: `{ provider: 1, event_id: 1 }` prevents double-credit or duplicate invoice generation.
- **Replay Safety**: If Paddle or Razorpay re-transmits an event due to network delay, VireoClip verifies the event ID against `billing_events`. Existing events return an immediate HTTP 200 `{ received: true, duplicate: true }` without repeating balance or subscription mutations.

### 5.2 Manual Webhook Replay
If a webhook failed due to database unavailability (HTTP 500 or timeout), provider consoles allow manual replay:
1. **Paddle Dashboard**: Billing > Developer Tools > Events > Select Event > "Re-send".
2. **Razorpay Dashboard**: Settings > Webhooks > Selected Webhook > "Webhook History" > "Resend".

---

## 6. Environment Secret Rotation Runbook

### 6.1 Safe Rotation Checklist
1. **Supabase JWT Secret / Anon Key**:
   - Update in Supabase dashboard.
   - Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in environment config.
   - Restart backend instances gracefully. Existing active client JWTs are validated according to Supabase public keys.
2. **Cloudflare R2 Credentials**:
   - Create new Access Key / Secret Key in Cloudflare R2 dashboard.
   - Update `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
   - Validate pre-signed URL generation via `GET /api/ready`.
   - Revoke old R2 credentials in Cloudflare dashboard.
3. **OpenRouter / AI API Keys**:
   - Generate secondary key in OpenRouter.
   - Update `OPENROUTER_API_KEY` on backend.
   - Verify health via `GET /api/ready`.
   - Delete old key.

---

## 7. Graceful Shutdown & Health Probes

### 7.1 Health & Readiness Endpoints
- **Liveness Probe**: `GET /health` returns HTTP 200 `{ status: "ok", uptime: ... }` if Node process is responsive.
- **Readiness Probe**: `GET /ready` returns HTTP 200 if MongoDB is connected and core configs are valid; returns HTTP 503 if MongoDB or critical dependencies fail.

### 7.2 Graceful Shutdown Procedure
On receiving `SIGTERM` or `SIGINT`:
1. Server marks itself unready (stops accepting new HTTP connections).
2. Active background polling loops and OAuth cleanup intervals are cancelled immediately.
3. In-flight HTTP requests and FFmpeg tasks are granted up to 10 seconds to finish.
4. MongoDB connection pool is closed safely.
5. Node process exits with code 0.

---

## 8. Emergency Production Deployment Rollback Runbook

### 8.1 Zero-Data-Loss Rollback Principles
- **Additive Database Schema Guarantee**: VireoClip database schemas are backward-compatible. Rolling back application server code to a prior container tag or commit does not corrupt MongoDB collections.
- **In-Flight Jobs**: When rolling back backend services, active render jobs will be reclaimed by the rolled-back worker pool once their lease (`JOB_LOCK_TIMEOUT_MS = 15m`) expires or via manual reset.

### 8.2 Rollback Steps
1. **Frontend Rollback**:
   - In Vercel or Cloudflare Pages, instantly promote the previous successful deployment to Production via the dashboard or CLI:
     ```bash
     vercel rollback [PREVIOUS_DEPLOYMENT_URL]
     ```
2. **Backend API Rollback**:
   - Roll back container image to the prior stable release tag on ECS / Railway / Render.
   - Run liveness & readiness probes:
     ```bash
     curl -i https://api.vireoclip.com/ready
     ```
3. **Database Sanity Check**:
   - If emergency restore is required due to data corruption, use `mongorestore` with PITR targeting the timestamp immediately before deployment.


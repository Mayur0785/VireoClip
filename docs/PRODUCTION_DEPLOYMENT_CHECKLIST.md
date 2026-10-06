# VireoClip Production Deployment Checklist
**Phase 14 Deployment & Operational Readiness Runbook**

---

## 1. Pre-Deployment Verification

- [ ] All 187 backend unit, regression, and security tests pass locally (`npm test`).
- [ ] Backend TypeScript compiler passes with 0 errors (`server/npx tsc --noEmit`).
- [ ] Frontend TypeScript compiler passes with 0 errors (`npx tsc --noEmit`).
- [ ] Frontend production build compiles without bundle warnings (`npm run build`).
- [ ] Secret audit verifies that zero service secrets or credentials are leaked in client bundles or telemetry.
- [ ] Parked Clip Download issue is preserved and unmodified.

---

## 2. Infrastructure & Service Configuration

### 2.1 Database (MongoDB Atlas)
- [ ] Production MongoDB Atlas cluster provisioned (v7.0+ recommended).
- [ ] Point-in-Time Recovery (PITR) continuous cloud backup enabled.
- [ ] Network Access / IP Access List configured for backend hosts (or AWS VPC Peering).
- [ ] Application DB user created with least privilege (readWrite on `vireoclip_prod`).
- [ ] All compound and unique indexes verified via `bootstrapMongo()`.

### 2.2 Authentication (Supabase)
- [ ] Production Supabase project provisioned.
- [ ] Site URL and Redirect URLs configured for production frontend domain (`https://app.vireoclip.com`).
- [ ] Email provider / SMTP configured (e.g. Resend, SendGrid) for user invitations and verification.
- [ ] JWT secret and anon keys securely recorded.

### 2.3 Object Storage (Cloudflare R2)
- [ ] Production R2 buckets created: `vireoclip-source-prod` and `vireoclip-clips-prod`.
- [ ] Buckets configured as **Private** (no public bucket access).
- [ ] CORS policy applied to R2 buckets allowing `PUT`, `GET`, `HEAD` from production frontend origin with `Content-Type` and `ETag` headers.
- [ ] Lifecycle rule added to automatically abort incomplete multipart uploads after 7 days.

### 2.4 AI Services
- [ ] OpenRouter production account funded and API key generated.
- [ ] Groq production API key generated (if using Groq for accelerated Whisper transcription).

### 2.5 Payment Gateways (Paddle / Razorpay)
- [ ] **Paddle**:
  - [ ] Switch `PADDLE_ENV` to `production`.
  - [ ] Production Price IDs generated and mapped in environment variables.
  - [ ] Webhook endpoint configured: `https://api.vireoclip.com/api/billing/webhooks/paddle`.
  - [ ] Webhook secret configured in backend environment.
- [ ] **Razorpay**:
  - [ ] Live Key ID and Key Secret generated from Razorpay Dashboard.
  - [ ] Live subscription plans created and mapped in environment variables.
  - [ ] Webhook endpoint configured: `https://api.vireoclip.com/api/billing/webhooks/razorpay`.
  - [ ] Webhook secret configured in backend environment.

### 2.6 Social OAuth Providers
- [ ] **Google Cloud / YouTube**: OAuth consent screen published; redirect URI set to `https://api.vireoclip.com/api/social/youtube/callback`.
- [ ] **Meta / Instagram**: App in Live mode; redirect URI set to `https://api.vireoclip.com/api/social/instagram/callback`.
- [ ] **TikTok**: Developer app approved for Login Kit; redirect URI set to `https://api.vireoclip.com/api/social/tiktok/callback`.
- [ ] **LinkedIn**: Products enabled; redirect URI set to `https://api.vireoclip.com/api/social/linkedin/callback`.
- [ ] **X (Twitter)**: App configured with OAuth 2.0 PKCE; redirect URI set to `https://api.vireoclip.com/api/social/x/callback`.

---

## 3. Environment Variables Sanity Check

```bash
# Verify backend environment before launching:
npx tsx scripts/production_readiness_check.ts
```

- [ ] `NODE_ENV=production`
- [ ] `CORS_ALLOWED_ORIGINS` contains exact production domains (no `*`).
- [ ] `SOCIAL_TOKEN_ENCRYPTION_KEY` is a strong 32-byte production key.
- [ ] No `VITE_*` variable contains a secret or private API key.

---

## 4. Post-Deployment Smoke Tests

1. [ ] **Health & Liveness**:
   - `curl -f -s https://api.vireoclip.com/health` returns HTTP 200.
2. [ ] **Readiness Probe**:
   - `curl -f -s https://api.vireoclip.com/ready` returns HTTP 200 with all checks `true`.
3. [ ] **Authentication Flow**:
   - Register a new account or log in via Supabase Auth.
   - Verify JWT Bearer token is accepted by backend `/api/billing/usage`.
4. [ ] **Project Creation & Upload**:
   - Create a project and obtain presigned upload URL.
   - Upload small test video to Cloudflare R2 and confirm upload.
5. [ ] **AI Processing**:
   - Ingest audio, extract transcription, and generate AI platform outputs.
6. [ ] **Clip Generation & Rendering**:
   - Generate clip candidate and trigger render job.
   - Verify render job progresses (`downloading` -> `rendering` -> `uploading` -> `completed`).
7. [ ] **Media Playback**:
   - Retrieve signed GET URL and verify video plays back cleanly in browser.
8. [ ] **Admin Console**:
   - Owner email logs in and views live cluster telemetry on `/admin`.

---

## 5. Rollback Runbook

If a critical blocker is detected post-deployment:

1. **Routing Rollback**:
   - Revert DNS or CDN traffic router to the previous stable release commit or deploy hash.
2. **Backend Rollback**:
   - Roll back container image to the previous tagged production release.
3. **Database Safeguard**:
   - Because schema migrations and repository access are strictly additive, rolling back the API server code does not require dropping MongoDB collections.
   - If an emergency logical restore is required, follow [`docs/OPERATIONAL_RECOVERY.md`](OPERATIONAL_RECOVERY.md) using `mongorestore`.

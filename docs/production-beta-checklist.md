# Vireo Production Beta Checklist & Staging Deployment Guide

This document defines the complete operational checklist, staging deployment setup, environment specifications, domain topology, and verification procedures for **Vireo Beta**.

---

## 1. Environment Architecture & Separation

Vireo enforces a strict separation across local, staging, and production environments:

| Environment | Frontend (Vercel) | Backend (Render) | Database (MongoDB Atlas) | Storage (Cloudflare R2) | Auth (Supabase) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local** | `http://localhost:5173` | `http://localhost:5000` | `vireo_dev` / `vireo_staging` | `vireo-source-videos`, `vireo-rendered-clips` | Dev Project |
| **Staging** | `https://staging.yourdomain.com` (or Vercel preview) | `https://vireo-api-staging.onrender.com` | `vireo_staging` | `vireo-source-videos-staging`, `vireo-rendered-clips-staging` | Staging Project |
| **Production** | `https://yourdomain.com` | `https://api.yourdomain.com` | `vireo_production` | `vireo-source-videos`, `vireo-rendered-clips` | Production Project |

> [!IMPORTANT]
> - Never mix staging and production databases.
> - Never commit `.env` or `.env.local` files to source control.
> - Frontend builds MUST NEVER include backend secrets (checked via bundle analysis).

---

## 2. Environment Variables Specification

### Frontend (Client-side exposed via Vite bundle)
Only variables prefixed with `VITE_` are exposed to the browser:
- `VITE_API_URL`: Backend API base URL (e.g. `https://api.yourdomain.com/api` or `https://vireo-api-staging.onrender.com/api`).
- `VITE_SUPABASE_URL`: Supabase project URL (used for Auth ONLY).
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase public anon key.
- `VITE_SMART_REFRAME_ENABLED`: Set to `false` for staging/production beta.

### Backend (Server-Side Only on Render)
Never expose these variables to the frontend or git:
- `PORT`: Automatically assigned by Render (or `10000` default).
- `NODE_ENV`: `production` or `staging`.
- `CORS_ORIGIN`: Allowed frontend origin (e.g. `https://yourdomain.com` or `https://staging.yourdomain.com`).
- `APP_URL`: Canonical application web address.
- `MONGODB_URI`: MongoDB Atlas connection string (least-privilege user).
- `MONGODB_DB_NAME`: Database name (`vireo_staging` or `vireo_production`).
- `R2_ACCOUNT_ID`: Cloudflare account identifier.
- `R2_ACCESS_KEY_ID`: Cloudflare R2 API token access key.
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 API token secret key.
- `R2_ENDPOINT`: R2 S3-compatible API endpoint (`https://<account_id>.r2.cloudflarestorage.com`).
- `R2_SOURCE_BUCKET`: Source video bucket name.
- `R2_CLIPS_BUCKET`: Rendered clips bucket name.
- `SUPABASE_URL`: Supabase URL for server token verification.
- `SUPABASE_SECRET_KEY`: Supabase `service_role` secret key for backend auth verification.
- `OPENROUTER_API_KEY`: API key for OpenRouter AI text & transcription.
- `GROQ_API_KEY`: API key for Groq Whisper transcription.
- `TRANSCRIPTION_PROVIDER`: `groq` or `openrouter`.
- `SMART_REFRAME_ENABLED`: Default `false`.

---

## 3. Render Staging Setup Instructions (Backend)

1. **Create Web Service**:
   - **Service Type**: Web Service (Node.js runtime).
   - **Repository**: Connect GitHub repository (`feature/integrate-remote-backend` or `main`).
   - **Root Directory**: `server` (or repository root if building with prefix).
   - **Build Command**: `npm install && npm run build` (or `npm install --prefix server && npm run build --prefix server`).
   - **Start Command**: `npm run start` (which runs `node dist/index.js`).
   - **Environment**: Node.js `>= 20.19.0`.
   - **Plan**: Starter or Standard (recommended: 1 GB+ RAM for video/audio extraction).

2. **Network & Health**:
   - **Health Check Path**: `/api/health`
   - **Port**: Render automatically provisions `PORT`; the server listens on `0.0.0.0:${process.env.PORT}`.

3. **FFmpeg & Runtime Dependencies**:
   - The application bundles `ffmpeg-static` in `server/package.json`. On standard Linux x86_64 nodes, `ffmpeg-static` automatically supplies the static binary without custom system packages.
   - For native system packages, standard Ubuntu/Debian build packs can optionally install `ffmpeg`.

4. **Smart Reframe Strategy in Beta**:
   - Smart Reframe is **disabled by default** (`SMART_REFRAME_ENABLED=false`).
   - All Phase 13 computer vision code remains intact.
   - When disabled, no Python runtime or OpenCV binary is required, ensuring maximum deployment stability and fast container builds.
   - If enabled later, use Render Docker environment with `python3` and `opencv-python-headless`.

---

## 4. Vercel Staging Setup Instructions (Frontend)

1. **Import Project**:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (workspace root)
   - **Build Command**: `npm run build:frontend`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

2. **Environment Variables**:
   Configure in Project Settings -> Environment Variables:
   - `VITE_API_URL`: `https://<render-service-name>.onrender.com/api`
   - `VITE_SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: `<anon-key>`
   - `VITE_SMART_REFRAME_ENABLED`: `false`

3. **Rewrites / Routing**:
   - Ensure SPA routing fallback is active (`/index.html` for all paths).

---

## 5. Domain & DNS Layout (Future Plan)

When connecting production domain (e.g. on Namecheap or Cloudflare DNS):

```
yourdomain.com        →  CNAME / A record to Vercel (Frontend Apex)
www.yourdomain.com    →  CNAME to Vercel (Redirect to apex or serve frontend)
api.yourdomain.com    →  CNAME to Render Web Service (Backend API)
```

> [!NOTE]
> DNS records should NOT be modified until Staging smoke tests pass completely.

---

## 6. Cloudflare R2 CORS Configuration

Apply the following CORS rule to both `vireo-source-videos` and `vireo-rendered-clips` buckets:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://vireo-staging.vercel.app",
      "https://yourdomain.com",
      "https://www.yourdomain.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

### Preflight Verification:
- Preflight `OPTIONS` request with `Origin: http://localhost:5173` and `Access-Control-Request-Method: PUT` must return HTTP `204 No Content` or `200 OK` with matching `Access-Control-Allow-Origin`.

---

## 7. Operational Readiness Checklist

### A. Database (MongoDB Atlas)
- [x] Dedicated database name (`vireo_staging` / `vireo_production`).
- [x] Application user configured with least-privilege credentials.
- [x] Idempotent index initialization via `bootstrapMongo()` on server startup.
- [x] Zero drop collection logic in application runtime.
- [x] Connection pooling (`maxPoolSize: 20`) with retry-safe reconnects.
- [x] Graceful shutdown closes client pool on `SIGTERM` / `SIGINT`.

### B. Object Storage (Cloudflare R2)
- [x] Buckets are private (public anonymous access disabled).
- [x] CORS policy configured for frontend origins (`GET`, `PUT`, `HEAD`, `ETag`).
- [x] Key derivation enforced authoritatively:
  - Source: `users/{userId}/projects/{projectId}/source/{uuid}-{filename}`
  - Clips: `users/{userId}/projects/{projectId}/clips/{clipId}/v{version}/render.mp4`
- [x] Presigned PUT URLs expire in 15 minutes.
- [x] Presigned GET preview/download URLs expire in 5 minutes.
- [x] Never persist signed URLs in MongoDB.
- [x] Cascade deletion removes both R2 objects and MongoDB documents.

### C. Authentication (Supabase Auth)
- [x] Auth only (email/password, OAuth, magic links, session restoration).
- [x] Zero calls to `supabase.from()`, `supabase.rpc()`, or `supabase.storage()` in runtime business logic.
- [x] Expired token returns 401 `AUTH_EXPIRED` / `AUTH_REQUIRED`.

### D. Security & Multi-tenancy
- [x] Every database repository call scoped to authenticated `user_id` via `AsyncLocalStorage` (`ownerContext`).
- [x] Cross-tenant access returns 404 (does not leak resource existence).
- [x] File validation: strictly allowlisted MIME types, up to 2 GiB direct upload.
- [x] Filename path traversal prevention (`safeFilename`).
- [x] Express body limit capped at 1 MB (direct R2 PUT bypasses Express memory).
- [x] Helmet security headers active.

### E. Rate Limiting & Quotas
- [x] Global rate limiter: 100 req/min per IP.
- [x] Expensive rate limiter: 10 req/min per IP on processing, transcription, Clip Finder, rendering, content generation.
- [x] Monthly quota ledger enforces limits per UTC billing period.

### F. Error Handling & Logging
- [x] Safe UX errors for all operations:
  - `UPLOAD_FAILED`, `PROCESSING_FAILED`, `TRANSCRIPTION_FAILED`, `AI_PROVIDER_FAILED`, `QUOTA_EXCEEDED`, `RENDER_FAILED`, `STORAGE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`.
- [x] Zero credential leaks in logs or client error payloads (no Mongo URIs, R2 keys, or AI tokens).
- [x] Structured JSON logging in production with `requestId`, `userId`, `projectId`.

### G. Job Execution & Temp File Cleanup
- [x] Every processing/rendering job operates in an isolated temporary directory with a unique UUID.
- [x] Guaranteed cleanup in `finally` blocks on both success and failure.
- [x] Documented process restart limitation (jobs execute in-process for Beta; worker queue planned for scale).

### H. Feature Flags
- [x] `SMART_REFRAME_ENABLED=false` by default. Smart UI shows "Coming soon in beta".
- [x] Phase 13 Smart Reframe code preserved intact.
- [x] Paste Video URL disabled with "Coming soon" state; backend rejects non-upload sources (`UNSUPPORTED_SOURCE`).

---

## 8. Staging Smoke Test Plan

Execute after pushing to Staging:
1. **Health Check**: `GET /api/health` returns status `ok`, `mongoConnected: true`, `storageConfigured: true`.
2. **Signup/Login**: Register a new staging test user via Supabase Auth.
3. **Upload**: Create project, direct upload small MP4 to R2, verify progress bar, confirm upload.
4. **Processing & Transcription**: Trigger processing, verify audio extraction and transcript generation.
5. **AI Clip Finder**: Generate clip candidates, select candidate.
6. **Clip Editor**: Open clip editor, adjust caption style, verify preview.
7. **Render**: Render 9:16 clip, verify status transitions to `ready`, test signed preview and download.
8. **Content Kit**: Generate platform drafts (YouTube, LinkedIn, TikTok, etc.), verify clipboard copy.
9. **Deletion**: Delete project, verify all R2 objects and Mongo records are removed.

---

## 9. Rollback Strategy

1. **Frontend (Vercel)**:
   - Use Vercel Dashboard -> Deployments -> Instant Rollback to previous deployment.
2. **Backend (Render)**:
   - Rollback to previous commit or previous successful build in Render dashboard.
3. **Database (Atlas)**:
   - MongoDB Atlas automated continuous cloud backups (point-in-time recovery).
   - Application schema is additive; no destructive migrations exist.

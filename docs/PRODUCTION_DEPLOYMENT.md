# VireoClip Production Deployment Architecture & Specification
**Phase 14 Production Deployment Architecture Runbook**

---

## 1. System Architecture Overview

VireoClip is built as a hardened, multi-tenant AI video editing and social distribution SaaS. The system strictly separates concerns across frontend presentation, stateless API orchestration, distributed asynchronous processing workers, and isolated cloud data stores.

```
┌────────────────────────────────────────────────────────┐
│                   Vercel / Cloudflare                  │
│       Vite + React Single-Page Application (SPA)       │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / JWT Bearer
                            ▼
┌────────────────────────────────────────────────────────┐
│               Node.js Express API Server               │
│        (Helmet, Trust Proxy, Strict CORS, Limiter)     │
└───────────┬────────────────┬─────────────────┬─────────┘
            │                │                 │
            ▼                ▼                 ▼
 ┌──────────────────┐ ┌─────────────┐ ┌──────────────────┐
 │  MongoDB Atlas   │ │  Supabase   │ │  Cloudflare R2   │
 │ Application Data │ │  Auth / JWT │ │ Object Storage   │
 └──────────────────┘ └─────────────┘ └──────────────────┘
            ▲                ▲                 ▲
            │                │                 │
┌───────────┴────────────────┴─────────────────┴─────────┐
│              Background Processing Engine              │
│       (Render Workers, Publishing, Maintenance)        │
│       • Atomic DB Leases       • FFmpeg Subprocesses   │
│       • Stale Lock Recovery    • Exponential Backoff   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure & Service Inventory

| Component | Technology / Service | Production Deployment Model |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, TailwindCSS | Static CDN (Vercel, Cloudflare Pages, AWS CloudFront) |
| **Backend API** | Node.js (>=20.19.0), Express, TypeScript | Containerized App Engine / Railway / AWS ECS / Render |
| **Database** | MongoDB Atlas (v7.0+) | Replica Set / Multi-Region with PITR enabled |
| **Authentication** | Supabase Auth | Server-side JWT validation via `@supabase/supabase-js` |
| **Object Storage** | Cloudflare R2 | Private S3-compatible buckets for source & clips |
| **Media Processing** | FFmpeg (CLI via `ffmpeg-static`) | Isolated child processes with strict resource timeouts |
| **AI Text Engine** | OpenRouter (`gpt-4o-mini`, etc.) | REST API via HTTPS |
| **Audio Transcription** | Groq (`whisper-large-v3-turbo`) / OpenRouter | REST API via HTTPS |
| **Payment Gateways** | Paddle Billing & Razorpay Subscriptions | Webhook handlers with cryptographic signature verification |
| **Social Distribution** | YouTube, Meta/Instagram, TikTok, LinkedIn, X | OAuth 2.0 with AES-256-GCM encrypted tokens at rest |

---

## 3. Environment Variable Classification

### 3.1 Core Required (Must be configured for application boot)
- `NODE_ENV`: `production`
- `PORT`: Server binding port (e.g. `5000` or assigned by platform `$PORT`)
- `CORS_ALLOWED_ORIGINS`: Comma-separated frontend origins (e.g. `https://vireoclip.com,https://app.vireoclip.com`)
- `APP_URL`: Production web application root URL (e.g. `https://app.vireoclip.com`)
- `MONGODB_URI`: Production MongoDB Atlas connection URI with authenticated app user
- `MONGODB_DB_NAME`: Production database name (`vireoclip_prod`)
- `SUPABASE_URL`: Supabase project URL (`https://xyz.supabase.co`)
- `SUPABASE_SECRET_KEY`: Supabase service-role secret key (Server-only)
- `R2_ACCOUNT_ID`: Cloudflare account ID
- `R2_ACCESS_KEY_ID`: Cloudflare R2 bucket-scoped access key
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 bucket-scoped secret key
- `R2_SOURCE_BUCKET`: Private source video bucket name (`vireoclip-source-prod`)
- `R2_CLIPS_BUCKET`: Private rendered clips bucket name (`vireoclip-clips-prod`)
- `OPENROUTER_API_KEY`: OpenRouter API key for LLM generation
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: 32-byte hexadecimal or base64 key for AES-256-GCM token storage

### 3.2 Optional Provider Integrations
- `GROQ_API_KEY`: High-speed Whisper transcription key (falls back to OpenRouter if absent)
- `PADDLE_ENV`: `production` (default: `sandbox`)
- `PADDLE_API_KEY`: Paddle API key
- `PADDLE_WEBHOOK_SECRET`: Paddle webhook signing secret
- `RAZORPAY_KEY_ID`: Razorpay live key ID
- `RAZORPAY_KEY_SECRET`: Razorpay live secret
- `RAZORPAY_WEBHOOK_SECRET`: Razorpay webhook signature secret
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: YouTube publishing OAuth
- `META_CLIENT_ID` / `META_CLIENT_SECRET`: Instagram publishing OAuth
- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`: TikTok publishing OAuth
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`: LinkedIn publishing OAuth
- `X_CLIENT_ID` / `X_CLIENT_SECRET`: X (Twitter) publishing OAuth

### 3.3 Frontend Client Configuration (`VITE_*`)
*Only safe public variables may be prefixed with `VITE_`:*
- `VITE_SUPABASE_URL`: Public Supabase API URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Public Supabase anon key
- `VITE_API_URL`: Backend API endpoint (e.g. `https://api.vireoclip.com/api`)
- `VITE_PADDLE_CLIENT_TOKEN`: Paddle frontend checkout client token (if using Paddle inline)
- `VITE_RAZORPAY_KEY_ID`: Razorpay public Key ID (if using Razorpay standard checkout)

---

## 4. Background Processing & Distributed Lease Model

VireoClip executes long-running jobs through atomic database claims with lease expirations:

1. **Clip Rendering Worker**:
   - Model: Atomic `findOneAndUpdate` on `render_jobs` matching `{ status: 'queued' }` or `{ status: 'processing', locked_at: { $lt: staleCutoff } }`.
   - Lease Duration: 15 minutes (`RENDER_LOCK_TIMEOUT_MS = 900,000 ms`).
   - Retries: Exponential backoff with up to 3 attempts.
2. **Social Publishing Worker**:
   - Model: Periodic claim loop (every 15s) executing atomic lease on `publish_jobs`.
   - Lease Duration: 5 minutes (`LOCK_TIMEOUT_MS = 300,000 ms`).
   - Idempotency: `request_fingerprint` ensures identical posts cannot be published twice.
3. **Scheduled Maintenance**:
   - Usage Reservation Cleanup: Releases expired quota holds older than 30 minutes every 10 minutes.
   - OAuth State Cleanup: Deletes expired or consumed OAuth states every 15 minutes.

---

## 5. Security & Isolation Controls

1. **SSRF Safeguards**: All URL ingestions revalidate hostnames against DNS, blocking IPv4 loopbacks, private RFC1918 subnets, RFC3927 link-local, IPv6 loopbacks, and internal metadata endpoints.
2. **FFmpeg Process Hardening**: Executed strictly via `execFile` argument arrays with explicit execution timeouts and guaranteed temporary directory purge in `finally` blocks.
3. **Storage Privacy**: Cloudflare R2 buckets are completely private. All uploads and downloads use time-bounded presigned URLs (PUT: 15m, GET: 5m). Keys are strictly namespaced under `users/{userId}/...`.
4. **Token Encryption**: Social account OAuth access and refresh tokens are stored encrypted via authenticated AES-256-GCM. Tokens are never returned to clients or logged in server telemetry.

---

## 6. Health & Readiness Verification

- **Liveness Probe**: `GET /health` returns HTTP 200 `{ status: "ok" }` to indicate process liveness.
- **Readiness Probe**: `GET /ready` returns HTTP 200 `{ status: "ready", checks: { mongodb: true, supabase: true, storage: true, aiProvider: true } }` only when all core dependencies are healthy. Returns HTTP 503 if any core dependency fails.

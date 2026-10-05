# Vireo production architecture (migration target)

This repository is configured for a Vercel React/Vite frontend and a Render Node/Express API. Application records live in MongoDB Atlas, and private source/rendered video objects live in Cloudflare R2. Supabase remains the identity provider only. OpenRouter and the configured transcription provider run from the backend. FFmpeg and Python/OpenCV run on the Render instance for the initial beta.

## Data flow

1. The browser signs in with Supabase Auth. It sends the bearer token to Express.
2. Express verifies the token with Supabase Auth. The verified `user.id` scopes every application collection query through the owner repository. MongoDB stores no passwords or second auth users.
3. The browser creates a project through Express, requests a short lived R2 PUT URL, uploads directly to the private source bucket with XHR byte progress, and asks Express to confirm. Express performs `HeadObject` and checks size and MIME type before setting `video_status=uploaded`.
4. Processing streams the source object into a unique temporary file. FFmpeg extracts audio. The transcription provider returns segments/words; MongoDB stores the transcript. The MongoDB quota ledger reserves, settles, or releases minutes using transactions.
5. Clip Finder uses the transcript and saves candidates to MongoDB. Rendering streams source video from R2 into a temporary file, runs FFmpeg with captions and optional Smart Reframe, streams the rendered MP4 to the private clips bucket, and saves its object key in MongoDB.
6. Preview and download URLs are short lived R2 signed GET URLs issued only after an owner scoped clip/project lookup. Deleting a project or clip removes R2 objects and related MongoDB documents.

The legacy API field `source_url` now contains a private R2 object key for compatibility; it is not a public URL. `output_storage_path` likewise contains a private R2 key. Neither field is a signed URL.

## Configuration and isolation

See the root and server `.env.example` files. Backend only variables are `MONGODB_URI`, `MONGODB_DB_NAME`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_SOURCE_BUCKET`, `R2_CLIPS_BUCKET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, and `GROQ_API_KEY`. Frontend variables are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`. Never use a `VITE_` prefix for MongoDB, R2, or server secrets.

Use a separate Atlas database, database user, Supabase Auth project, and two R2 buckets for development versus production. The Atlas app user needs only the application database's read/write and startup collection/index creation permissions. If indexes are provisioned separately, remove index creation permission from the runtime identity after bootstrap. Restrict Atlas network access to Render egress where practical. Use R2 credentials scoped to Object Read & Write for the two private buckets; leave public bucket access disabled.

`bootstrapMongo` creates validators and indexes idempotently during API startup. MongoDB Atlas supports the transactions required by the quota ledger. Existing `supabase/migrations` are historical and remain in the repository. The scripts labeled `LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC` are historical diagnostics and are not part of production startup. No data migration runs automatically; a new production database may start empty. Existing Supabase Auth users can sign in and receive new MongoDB profiles on first request.

## R2 CORS

Apply this CORS policy to the **private source bucket**, replacing the production example origin with the real Vercel domain. Add only intentionally used preview origins. The private clips bucket needs GET/HEAD CORS when previews are fetched from browser JavaScript.

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://your-vireo-domain.example"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

If Vercel preview deployments need uploads, add only the preview origins you intend to support. Avoid a wildcard production origin. The browser PUT must use the exact `Content-Type` supplied in the upload grant. See [R2 CORS guidance](https://developers.cloudflare.com/r2/buckets/cors/) and [R2 S3 API guidance](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

## Beta limits and deployment checks

The first uploader uses a single signed PUT and accepts up to 2 GiB. Cloudflare documents a 5 GiB single PUT ceiling; multipart upload is the next step for unreliable connections or larger files. The storage interface already separates key generation, signed upload, streaming, and deletion so multipart creation/sign part/complete/abort can be added without changing ownership rules. [R2 limits](https://developers.cloudflare.com/r2/platform/limits/).

The browser may upload a 2 GiB source without Express buffering it, but transcription providers still enforce their own extracted-audio size and duration limits. A large file can upload successfully and later fail during transcription; the usage reservation is released on pipeline failure.

Processing and rendering run inside the API process and use Render's temporary filesystem. Provision enough temporary disk for the source file, render output, audio, and concurrent jobs. Render restarts can interrupt active work; a durable queue and separate worker are later improvements. FFmpeg is supplied by `ffmpeg-static`; Smart Reframe also requires Python and OpenCV in the Render image. Production defaults to `SMART_REFRAME_ENABLED=false`; turn it on only after the image and resource limits are verified.

Before staging, configure Atlas/R2/Supabase Auth credentials, CORS, Render disk and runtime dependencies, and the Vercel API URL. Check `/api/health` for Mongo connectivity. Exercise one real upload, process, render, preview, download, and delete against **staging** credentials. No deployment or production service mutation is part of this repository migration.

-- ========================================================
-- Vireo - Supabase PostgreSQL Migration
-- Phase 11: Actual Clip Rendering Engine (Selected AI Moment -> Real MP4 Clip)
-- ========================================================

-- 1. Create public.clips table
CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.clip_candidates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Precise timestamp cuts
  start_seconds NUMERIC(10, 3) NOT NULL,
  end_seconds NUMERIC(10, 3) NOT NULL,
  duration_seconds NUMERIC(10, 3) NOT NULL,

  -- Formatting and framing
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  crop_mode TEXT NOT NULL DEFAULT 'center',

  -- Rendering lifecycle: draft | queued | rendering | uploading | ready | failed
  render_status TEXT NOT NULL DEFAULT 'draft',

  -- Storage paths
  source_storage_path TEXT NOT NULL,
  output_storage_path TEXT,

  -- Error audit
  render_error_code TEXT,
  render_error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Constraints
  CONSTRAINT chk_clip_start_seconds CHECK (start_seconds >= 0),
  CONSTRAINT chk_clip_end_seconds CHECK (end_seconds > start_seconds),
  CONSTRAINT chk_clip_duration_seconds CHECK (duration_seconds > 0),
  CONSTRAINT chk_clip_aspect_ratio CHECK (aspect_ratio IN ('9:16', '1:1', '16:9')),
  CONSTRAINT chk_clip_crop_mode CHECK (crop_mode IN ('center', 'manual')),
  CONSTRAINT chk_clip_render_status CHECK (render_status IN ('draft', 'queued', 'rendering', 'uploading', 'ready', 'failed'))
);

-- Indexes for clips
CREATE INDEX IF NOT EXISTS idx_clips_project_id ON public.clips(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON public.clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_candidate_id ON public.clips(candidate_id);
CREATE INDEX IF NOT EXISTS idx_clips_render_status ON public.clips(render_status);

-- 2. Create public.render_jobs table
CREATE TABLE IF NOT EXISTS public.render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,

  error_code TEXT,
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT chk_render_job_status CHECK (status IN ('queued', 'processing', 'uploading', 'completed', 'failed')),
  CONSTRAINT chk_render_job_progress CHECK (progress >= 0 AND progress <= 100)
);

-- Indexes for render_jobs
CREATE INDEX IF NOT EXISTS idx_render_jobs_clip_id ON public.render_jobs(clip_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_user_id ON public.render_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON public.render_jobs(status);

-- 3. Row Level Security (RLS)
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

-- Clips RLS policies:
-- Users can view their own clips
DROP POLICY IF EXISTS "Users can view own clips" ON public.clips;
CREATE POLICY "Users can view own clips"
  ON public.clips
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own clips
DROP POLICY IF EXISTS "Users can delete own clips" ON public.clips;
CREATE POLICY "Users can delete own clips"
  ON public.clips
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full control for backend rendering operations
DROP POLICY IF EXISTS "Service role full access on clips" ON public.clips;
CREATE POLICY "Service role full access on clips"
  ON public.clips
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Render jobs RLS policies:
-- Users can view their own render jobs
DROP POLICY IF EXISTS "Users can view own render jobs" ON public.render_jobs;
CREATE POLICY "Users can view own render jobs"
  ON public.render_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full control for render worker updates
DROP POLICY IF EXISTS "Service role full access on render jobs" ON public.render_jobs;
CREATE POLICY "Service role full access on render jobs"
  ON public.render_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Create private storage bucket 'clips' if not present
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clips',
  'clips',
  false,
  104857600, -- 100 MB max clip size
  ARRAY['video/mp4']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['video/mp4']::text[];

-- Storage RLS: Authenticated users can read their own rendered clips (scoped by {user_id}/ prefix)
DROP POLICY IF EXISTS "Users can view own rendered clips" ON storage.objects;
CREATE POLICY "Users can view own rendered clips"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can upload/manage rendered clips
DROP POLICY IF EXISTS "Service role full access on clips bucket" ON storage.objects;
CREATE POLICY "Service role full access on clips bucket"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'clips')
  WITH CHECK (bucket_id = 'clips');

-- 5. Least-Privilege Table Grants
REVOKE ALL ON public.clips FROM anon, public;
REVOKE ALL ON public.render_jobs FROM anon, public;

GRANT SELECT, DELETE ON public.clips TO authenticated;
GRANT SELECT ON public.render_jobs TO authenticated;

GRANT ALL ON public.clips TO service_role;
GRANT ALL ON public.render_jobs TO service_role;

-- Ensure clip_candidates table has proper grants
GRANT SELECT, UPDATE, DELETE ON public.clip_candidates TO authenticated;
GRANT ALL ON public.clip_candidates TO service_role;


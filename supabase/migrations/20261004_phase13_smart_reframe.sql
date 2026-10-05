-- ========================================================
-- Vireo - Supabase PostgreSQL Migration
-- Phase 13: Smart Auto-Reframe + Face Tracking
-- (Face Detection, Track Association, Dynamic Crop Trajectory)
-- ========================================================

-- 1. Create public.reframe_tracks table
CREATE TABLE IF NOT EXISTS public.reframe_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  clip_id UUID NOT NULL
    REFERENCES public.clips(id) ON DELETE CASCADE,

  project_id UUID NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzing', 'ready', 'failed')),

  analysis_version INTEGER NOT NULL DEFAULT 1,

  sample_interval_ms INTEGER NOT NULL DEFAULT 250,

  source_width INTEGER,
  source_height INTEGER,

  detected_face_count INTEGER NOT NULL DEFAULT 0,
  dominant_track_id TEXT,

  raw_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  smoothed_keyframes JSONB NOT NULL DEFAULT '[]'::jsonb,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  error_code TEXT,
  error_message TEXT,

  -- Trim/aspect context at time of analysis (for staleness detection)
  analyzed_trim_start NUMERIC(10, 3) NOT NULL DEFAULT 0,
  analyzed_trim_end NUMERIC(10, 3) NOT NULL DEFAULT 0,
  analyzed_aspect_ratio TEXT NOT NULL DEFAULT '9:16',

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_reframe_tracks_clip_id
  ON public.reframe_tracks(clip_id);

CREATE INDEX IF NOT EXISTS idx_reframe_tracks_project_id
  ON public.reframe_tracks(project_id);

CREATE INDEX IF NOT EXISTS idx_reframe_tracks_user_id
  ON public.reframe_tracks(user_id);

CREATE INDEX IF NOT EXISTS idx_reframe_tracks_status
  ON public.reframe_tracks(status);

-- Unique constraint: one active/latest analysis per clip (per version)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reframe_tracks_clip_version
  ON public.reframe_tracks(clip_id, analysis_version);

-- 3. Enable RLS
ALTER TABLE public.reframe_tracks ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Authenticated users can SELECT their own reframe tracks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'reframe_tracks_select_own'
  ) THEN
    CREATE POLICY reframe_tracks_select_own ON public.reframe_tracks
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role has full access (insert/update/delete for backend operations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'reframe_tracks_service_all'
  ) THEN
    CREATE POLICY reframe_tracks_service_all ON public.reframe_tracks
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 5. Table grants for anon, authenticated, and service_role
GRANT ALL ON TABLE public.reframe_tracks TO anon, authenticated, service_role;

-- 6. Extend public.clips crop_config to support smart mode
-- (crop_config is already JSONB — no schema change needed, just documentation)
-- Expected crop_config shapes:
-- Center: { "focusX": 0.5, "focusY": 0.5 }
-- Manual: { "focusX": 0.45, "focusY": 0.55 }
-- Smart:  { "mode": "smart", "trackId": "<uuid>", "strength": 1.0, "focusX": 0.5, "focusY": 0.5 }


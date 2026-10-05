-- ========================================================
-- Vireo - Supabase PostgreSQL Migration
-- Phase 10: AI Auto Clip Finder (Clipping-First Product Foundation)
-- ========================================================

-- 1. Create clip_candidates table
CREATE TABLE IF NOT EXISTS public.clip_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Segment-index grounding in transcript
  start_segment_index INTEGER NOT NULL CHECK (start_segment_index >= 0),
  end_segment_index INTEGER NOT NULL,
  CONSTRAINT chk_clip_candidate_segment_order CHECK (end_segment_index >= start_segment_index),

  -- Derived actual timestamps from transcript segments
  start_seconds NUMERIC(10, 3) NOT NULL CHECK (start_seconds >= 0),
  end_seconds NUMERIC(10, 3) NOT NULL,
  duration_seconds NUMERIC(10, 3) NOT NULL CHECK (duration_seconds > 0),
  CONSTRAINT chk_clip_candidate_seconds_order CHECK (end_seconds > start_seconds),

  -- Content and metadata
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',

  category TEXT NOT NULL DEFAULT 'general',

  -- Deterministic hybrid engagement score (0–100)
  engagement_score INTEGER NOT NULL CHECK (engagement_score >= 0 AND engagement_score <= 100),

  -- Lifecycle status: suggested | selected | dismissed
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'selected', 'dismissed')),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Prevent obvious exact duplicate candidates for the same project
  CONSTRAINT uq_clip_candidate_project_segments UNIQUE (project_id, start_segment_index, end_segment_index)
);

-- 2. Indexes for efficient lookup, ordering, and user filtering
CREATE INDEX IF NOT EXISTS idx_clip_candidates_project_id
  ON public.clip_candidates(project_id);

CREATE INDEX IF NOT EXISTS idx_clip_candidates_user_id
  ON public.clip_candidates(user_id);

CREATE INDEX IF NOT EXISTS idx_clip_candidates_project_score
  ON public.clip_candidates(project_id, engagement_score DESC);

CREATE INDEX IF NOT EXISTS idx_clip_candidates_user_created
  ON public.clip_candidates(user_id, created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.clip_candidates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view only their own clip candidates
CREATE POLICY "Users can view their own clip candidates"
  ON public.clip_candidates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow authenticated users to update only their own clip candidates (e.g. status transition)
CREATE POLICY "Users can update their own clip candidates"
  ON public.clip_candidates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own clip candidates if needed
CREATE POLICY "Users can delete their own clip candidates"
  ON public.clip_candidates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access (used by server backend to insert/replace candidates)
CREATE POLICY "Service role full access on clip candidates"
  ON public.clip_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Table grants for authenticated and service_role
REVOKE ALL ON public.clip_candidates FROM anon, public;
GRANT SELECT, UPDATE, DELETE ON public.clip_candidates TO authenticated;
GRANT ALL ON public.clip_candidates TO service_role;


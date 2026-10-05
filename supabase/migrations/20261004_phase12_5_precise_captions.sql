-- ========================================================
-- Vireo - Supabase PostgreSQL Migration
-- Phase 12.5: Pro Caption Timing + Advanced Caption Editor
-- (Word-Level Timestamps & Caption Cue Overrides)
-- ========================================================

-- 1. Add words JSONB column to public.transcripts for word-level timestamps
ALTER TABLE public.transcripts
  ADD COLUMN IF NOT EXISTS words JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Add caption_overrides JSONB column to public.clips for manual cue corrections
ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS caption_overrides JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Comments explaining the columns
COMMENT ON COLUMN public.transcripts.words IS 'Array of word-level timestamp objects: [{"word": string, "start": number, "end": number}]';
COMMENT ON COLUMN public.clips.caption_overrides IS 'Array of manual cue text corrections: [{"cueId": string, "text": string}] without mutating canonical transcripts';

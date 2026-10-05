-- ========================================================
-- Vireo - Supabase PostgreSQL Migration
-- Phase 12: Caption Engine + Focused Clip Editor
-- (Grounded Captions, Trim, Manual Framing, Text Overlays, Rerendering)
-- ========================================================

-- 1. Extend public.clips with safe structured editor configuration
ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS trim_start_offset NUMERIC(10, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trim_end_offset NUMERIC(10, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS caption_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS caption_style TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS caption_position TEXT NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS caption_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crop_config JSONB NOT NULL DEFAULT '{"focusX": 0.5, "focusY": 0.5}'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS volume NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editor_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS render_version INTEGER NOT NULL DEFAULT 1;

-- 2. Add validation constraints on editable ranges
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clips_trim_non_negative'
  ) THEN
    ALTER TABLE public.clips
      ADD CONSTRAINT chk_clips_trim_non_negative
      CHECK (trim_start_offset >= 0 AND trim_end_offset >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clips_volume_range'
  ) THEN
    ALTER TABLE public.clips
      ADD CONSTRAINT chk_clips_volume_range
      CHECK (volume >= 0 AND volume <= 2.0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clips_caption_style'
  ) THEN
    ALTER TABLE public.clips
      ADD CONSTRAINT chk_clips_caption_style
      CHECK (caption_style IN ('clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clips_caption_position'
  ) THEN
    ALTER TABLE public.clips
      ADD CONSTRAINT chk_clips_caption_position
      CHECK (caption_position IN ('top', 'center', 'bottom'));
  END IF;
END $$;

-- 3. Index for querying active editor versions
CREATE INDEX IF NOT EXISTS idx_clips_user_editor_version
  ON public.clips(user_id, editor_version);

-- 4. RLS policies already present on public.clips cover all newly added columns.
-- Authenticated users can SELECT, UPDATE, DELETE their own clips (auth.uid() = user_id).
-- Service role has full access.

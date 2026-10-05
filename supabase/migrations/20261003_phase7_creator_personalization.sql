-- ========================================================
-- Phase 7: Creator Personalization Schema Extension
-- ========================================================

-- Safely add new creator personalization and brand preference columns to creator_profiles
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS custom_tone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS website_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS newsletter_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS podcast_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube_cta TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_cta TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS linkedin_cta TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS twitter_cta TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tiktok_cta TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred_hook_style TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand_rules TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS forbidden_phrases TEXT DEFAULT '';

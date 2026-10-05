-- ========================================================
-- VIREO DATABASE MIGRATION 001: SECURITY AND HARDENING
-- Applied to align backend constraints, storage limits, and privileges
-- ========================================================

-- 1. Align projects video_status default to 'uploading'
ALTER TABLE public.projects 
  ALTER COLUMN video_status SET DEFAULT 'uploading';

-- 2. Update storage bucket 'videos' size limit to 50 MB (52428800 bytes)
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'videos';

-- If bucket doesn't exist yet, insert with 50 MB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  false,
  52428800,
  ARRAY[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska',
    'video/avi',
    'video/mkv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

-- 3. Revoke excessive table permissions from anon role
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER 
  ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Ensure authenticated and service_role retain full CRUD privileges
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;

-- ========================================================
-- AI Video Content Generator - Supabase PostgreSQL Schema
-- Phase 9: Usage Tracking, Idempotent Usage Ledger & Concurrency-Safe Monthly Quota
-- ========================================================

-- 1. Create usage_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usage_status') THEN
    CREATE TYPE public.usage_status AS ENUM ('reserved', 'settled', 'released');
  END IF;
END $$;

-- 2. Create user_subscription_limits table (plan tier and monthly quota overrides)
CREATE TABLE IF NOT EXISTS public.user_subscription_limits (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  monthly_minutes_limit NUMERIC(8, 2) NOT NULL DEFAULT 15.00 CHECK (monthly_minutes_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Create usage_events table (immutable append-only usage ledger)
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Explicit UTC billing period: 'YYYY-MM'
  billing_period TEXT NOT NULL CHECK (billing_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  
  -- Lifecycle status: 'reserved' -> 'settled' | 'released'
  status public.usage_status NOT NULL DEFAULT 'reserved',
  
  -- Minutes accounting:
  -- reserved_minutes: hold placed during pre-flight check
  -- actual_minutes: finalized consumption upon success (NULL if released/failed)
  reserved_minutes NUMERIC(8, 2) NOT NULL CHECK (reserved_minutes >= 0),
  actual_minutes NUMERIC(8, 2) CHECK (actual_minutes IS NULL OR actual_minutes >= 0),
  
  -- Audio/Video duration in seconds for high-precision audit
  duration_seconds NUMERIC(10, 2) DEFAULT 0,

  -- Idempotent attempt tracking: one attempt ID per invocation
  processing_attempt_id UUID NOT NULL UNIQUE,
  
  -- Metadata & failure audit
  failure_reason TEXT DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps (strictly in UTC)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  settled_at TIMESTAMPTZ DEFAULT NULL
);

-- Performance & aggregation indexes
CREATE INDEX IF NOT EXISTS idx_usage_events_user_period_status 
  ON public.usage_events(user_id, billing_period, status);

CREATE INDEX IF NOT EXISTS idx_usage_events_project_id 
  ON public.usage_events(project_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_attempt_id 
  ON public.usage_events(processing_attempt_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_reserved_created 
  ON public.usage_events(status, created_at) WHERE status = 'reserved';

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_subscription_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Authenticated users can ONLY SELECT their own rows
DROP POLICY IF EXISTS "Users can view their own subscription limits" ON public.user_subscription_limits;
CREATE POLICY "Users can view their own subscription limits"
  ON public.user_subscription_limits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own usage events" ON public.usage_events;
CREATE POLICY "Users can view their own usage events"
  ON public.usage_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Least-Privilege Table Grants:
-- Authenticated users: SELECT only (enforced by RLS)
-- Service Role: Full access (used by server backend for privileged metering)
-- Anon: No access
REVOKE ALL ON public.usage_events FROM anon, public;
REVOKE ALL ON public.user_subscription_limits FROM anon, public;

GRANT SELECT ON public.usage_events TO authenticated;
GRANT SELECT ON public.user_subscription_limits TO authenticated;

GRANT ALL ON public.usage_events TO service_role;
GRANT ALL ON public.user_subscription_limits TO service_role;

-- ========================================================
-- 5. Orphan Reservation Cleanup Function
-- Auto-releases reservations older than 30 minutes
-- Security: SECURITY DEFINER, SET search_path = public, pg_temp
-- Executable by service_role only
-- ========================================================
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_reservations(p_older_than_minutes INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.usage_events
  SET status = 'released',
      failure_reason = 'Timed out (orphaned reservation exceeded ' || p_older_than_minutes || ' minutes)',
      settled_at = timezone('utc', now())
  WHERE status = 'reserved'
    AND created_at < (timezone('utc', now()) - (p_older_than_minutes || ' minutes')::INTERVAL);
    
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ========================================================
-- 6. Atomic Usage Reservation RPC
-- With user row-level locking (FOR UPDATE) & attempt idempotency
-- Security: SECURITY DEFINER, SET search_path = public, pg_temp
-- Executable by service_role only
-- ========================================================
CREATE OR REPLACE FUNCTION public.reserve_usage_quota(
  p_user_id UUID,
  p_project_id UUID,
  p_attempt_id UUID,
  p_estimated_minutes NUMERIC,
  p_default_monthly_quota NUMERIC DEFAULT 15.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_billing_period TEXT;
  v_monthly_limit NUMERIC;
  v_committed_minutes NUMERIC;
  v_reserved_minutes NUMERIC;
  v_total_allocated NUMERIC;
  v_remaining_minutes NUMERIC;
  v_event_id UUID;
  v_existing_event RECORD;
BEGIN
  -- Compute current UTC billing period: 'YYYY-MM'
  v_billing_period := to_char(timezone('utc', now()), 'YYYY-MM');

  -- Concurrency Guard: Lock the user's profile row to serialize quota reservations
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  -- 1. Idempotency Check: check if this processing_attempt_id was already processed
  SELECT id, status, billing_period, reserved_minutes, actual_minutes
  INTO v_existing_event
  FROM public.usage_events
  WHERE processing_attempt_id = p_attempt_id;

  IF FOUND THEN
    -- If already reserved, return idempotent success with current state
    IF v_existing_event.status = 'reserved' THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'idempotent', true,
        'usage_event_id', v_existing_event.id,
        'processing_attempt_id', p_attempt_id,
        'status', 'reserved',
        'billing_period', v_existing_event.billing_period,
        'reserved_minutes', v_existing_event.reserved_minutes
      );
    ELSE
      -- Already reached terminal state (settled or released)
      RETURN jsonb_build_object(
        'allowed', false,
        'idempotent', true,
        'error_code', 'ATTEMPT_ALREADY_TERMINATED',
        'usage_event_id', v_existing_event.id,
        'processing_attempt_id', p_attempt_id,
        'status', v_existing_event.status
      );
    END IF;
  END IF;

  -- Clean up any orphaned reservations for this user before computing balance
  PERFORM public.cleanup_orphaned_reservations(30);

  -- 2. Determine effective user limit (from DB override or system default parameter)
  SELECT monthly_minutes_limit
  INTO v_monthly_limit
  FROM public.user_subscription_limits
  WHERE user_id = p_user_id;

  IF v_monthly_limit IS NULL THEN
    v_monthly_limit := p_default_monthly_quota;
  END IF;

  -- 3. Calculate total allocated usage in current UTC billing period:
  -- settled actual minutes + active reservations
  SELECT
    COALESCE(SUM(CASE WHEN status = 'settled' THEN actual_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'reserved' THEN reserved_minutes ELSE 0 END), 0)
  INTO v_committed_minutes, v_reserved_minutes
  FROM public.usage_events
  WHERE user_id = p_user_id
    AND billing_period = v_billing_period
    AND status IN ('settled', 'reserved');

  v_total_allocated := v_committed_minutes + v_reserved_minutes;
  v_remaining_minutes := GREATEST(0, v_monthly_limit - v_total_allocated);

  -- 4. Strict Quota Enforcement
  IF (v_total_allocated + p_estimated_minutes) > v_monthly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error_code', 'QUOTA_EXCEEDED',
      'billing_period', v_billing_period,
      'limit_minutes', v_monthly_limit,
      'allocated_minutes', v_total_allocated,
      'settled_minutes', v_committed_minutes,
      'reserved_minutes', v_reserved_minutes,
      'remaining_minutes', v_remaining_minutes,
      'requested_minutes', p_estimated_minutes
    );
  END IF;

  -- 5. Insert new reservation into append-only ledger
  INSERT INTO public.usage_events (
    user_id,
    project_id,
    billing_period,
    status,
    reserved_minutes,
    actual_minutes,
    processing_attempt_id,
    created_at
  ) VALUES (
    p_user_id,
    p_project_id,
    v_billing_period,
    'reserved',
    p_estimated_minutes,
    NULL,
    p_attempt_id,
    timezone('utc', now())
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'idempotent', false,
    'usage_event_id', v_event_id,
    'processing_attempt_id', p_attempt_id,
    'billing_period', v_billing_period,
    'limit_minutes', v_monthly_limit,
    'allocated_minutes', v_total_allocated + p_estimated_minutes,
    'remaining_minutes', v_remaining_minutes - p_estimated_minutes
  );
END;
$$;

-- ========================================================
-- 7. Settlement Function: Finalize Reservation on Success
-- Immutable update to the reserved row; no updates after settlement
-- Security: SECURITY DEFINER, SET search_path = public, pg_temp
-- Executable by service_role only
-- ========================================================
CREATE OR REPLACE FUNCTION public.settle_usage_reservation(
  p_attempt_id UUID,
  p_actual_minutes NUMERIC,
  p_duration_seconds NUMERIC DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  UPDATE public.usage_events
  SET status = 'settled',
      actual_minutes = p_actual_minutes,
      duration_seconds = p_duration_seconds,
      metadata = metadata || p_metadata,
      settled_at = timezone('utc', now())
  WHERE processing_attempt_id = p_attempt_id
    AND status = 'reserved'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active reservation found to settle');
  END IF;

  RETURN jsonb_build_object('success', true, 'usage_event_id', v_updated_id, 'status', 'settled');
END;
$$;

-- ========================================================
-- 8. Release Function: Cancel Reservation on Pipeline Failure
-- Security: SECURITY DEFINER, SET search_path = public, pg_temp
-- Executable by service_role only
-- ========================================================
CREATE OR REPLACE FUNCTION public.release_usage_reservation(
  p_attempt_id UUID,
  p_failure_reason TEXT DEFAULT 'Processing failed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  UPDATE public.usage_events
  SET status = 'released',
      actual_minutes = NULL,
      failure_reason = p_failure_reason,
      settled_at = timezone('utc', now())
  WHERE processing_attempt_id = p_attempt_id
    AND status = 'reserved'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active reservation found to release');
  END IF;

  RETURN jsonb_build_object('success', true, 'usage_event_id', v_updated_id, 'status', 'released');
END;
$$;

-- ========================================================
-- 9. Least-Privilege Routine Permissions
-- Revoke PUBLIC/anon access on sensitive state-mutating RPCs.
-- Grant EXECUTE exclusively to service_role (used by server backend).
-- ========================================================
REVOKE EXECUTE ON FUNCTION public.reserve_usage_quota(UUID, UUID, UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_usage_reservation(UUID, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_usage_reservation(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_reservations(INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_usage_quota(UUID, UUID, UUID, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_usage_reservation(UUID, NUMERIC, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_usage_reservation(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_reservations(INT) TO service_role;

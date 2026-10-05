// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== VERIFYING LIVE SUPABASE PHASE 9 EXACT OBJECTS ===');
  console.log('Supabase URL:', config.supabaseUrl);
  console.log('Service Key configured:', Boolean(config.supabaseSecretKey));

  // 0. Inspect OpenAPI schema to see what tables and RPCs PostgREST currently recognizes
  console.log('\n--- 0. Inspecting PostgREST Schema Cache ---');
  try {
    const res = await fetch(config.supabaseUrl + '/rest/v1/', {
      headers: {
        apikey: config.supabaseSecretKey,
        Authorization: 'Bearer ' + config.supabaseSecretKey
      }
    });
    const schema = await res.json();
    const tables = Object.keys(schema.definitions || {});
    console.log('Tables in schema cache:', tables);
    const rpcs = Object.keys(schema.paths || {}).filter(p => p.startsWith('/rpc/'));
    console.log('RPCs in schema cache:', rpcs);
  } catch (err: any) {
    console.log('Failed to fetch OpenAPI schema:', err.message);
  }

  // 1. Check public.usage_events
  const { data: ueData, error: ueErr } = await supabaseAuthClient
    .from('usage_events')
    .select('id, user_id, project_id, billing_period, status, reserved_minutes, actual_minutes, duration_seconds, processing_attempt_id, failure_reason, metadata, created_at, settled_at')
    .limit(1);

  if (ueErr) {
    console.log('usage_events check FAILED:', ueErr.code, ueErr.message);
  } else {
    console.log('✅ usage_events table exists and query succeeded. Row count sample:', ueData?.length);
  }

  // 2. Check public.user_subscription_limits
  console.log('\n--- 2. Checking public.user_subscription_limits ---');
  const { data: uslData, error: uslErr } = await supabaseAuthClient
    .from('user_subscription_limits')
    .select('user_id, plan_tier, monthly_minutes_limit, created_at, updated_at')
    .limit(1);

  if (uslErr) {
    console.log('user_subscription_limits check FAILED:', uslErr.code, uslErr.message);
  } else {
    console.log('✅ user_subscription_limits table exists and query succeeded. Row count sample:', uslData?.length);
  }

  // Find a valid user and project to test with (read-only or test UUIDs)
  const { data: projects } = await supabaseAuthClient
    .from('projects')
    .select('id, user_id')
    .limit(1);

  const testUserId = projects?.[0]?.user_id || '00000000-0000-0000-0000-000000000000';
  const testProjectId = projects?.[0]?.id || '00000000-0000-0000-0000-000000000000';
  const testAttemptId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  // 3. Check RPC: cleanup_orphaned_reservations(p_older_than_minutes)
  console.log('\n--- 3. Checking cleanup_orphaned_reservations RPC ---');
  const { data: cData, error: cErr } = await supabaseAuthClient.rpc('cleanup_orphaned_reservations', {
    p_older_than_minutes: 30
  });
  if (cErr) {
    console.log('cleanup_orphaned_reservations RPC FAILED:', cErr.code, cErr.message);
  } else {
    console.log('✅ cleanup_orphaned_reservations RPC succeeded. Result:', cData);
  }

  // 4. Check RPC: reserve_usage_quota(p_user_id, p_project_id, p_attempt_id, p_estimated_minutes, p_default_monthly_quota)
  console.log('\n--- 4. Checking reserve_usage_quota RPC ---');
  const { data: rData, error: rErr } = await supabaseAuthClient.rpc('reserve_usage_quota', {
    p_user_id: testUserId,
    p_project_id: testProjectId,
    p_attempt_id: testAttemptId,
    p_estimated_minutes: 0.1,
    p_default_monthly_quota: 15.00
  });
  if (rErr) {
    console.log('reserve_usage_quota RPC FAILED:', rErr.code, rErr.message);
  } else {
    console.log('✅ reserve_usage_quota RPC succeeded. Result:', rData);
  }

  // 5. Check RPC: settle_usage_reservation(p_attempt_id, p_actual_minutes, p_duration_seconds, p_metadata)
  console.log('\n--- 5. Checking settle_usage_reservation RPC ---');
  const { data: sData, error: sErr } = await supabaseAuthClient.rpc('settle_usage_reservation', {
    p_attempt_id: testAttemptId,
    p_actual_minutes: 0.1,
    p_duration_seconds: 6.0,
    p_metadata: { test: true }
  });
  if (sErr) {
    console.log('settle_usage_reservation RPC FAILED:', sErr.code, sErr.message);
  } else {
    console.log('✅ settle_usage_reservation RPC succeeded. Result:', sData);
  }

  // 6. Check RPC: release_usage_reservation(p_attempt_id, p_failure_reason)
  console.log('\n--- 6. Checking release_usage_reservation RPC on active reservation ---');
  const releaseAttemptId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  await supabaseAuthClient.rpc('reserve_usage_quota', {
    p_user_id: testUserId,
    p_project_id: testProjectId,
    p_attempt_id: releaseAttemptId,
    p_estimated_minutes: 0.1,
    p_default_monthly_quota: 15.00
  });

  const { data: relData, error: relErr } = await supabaseAuthClient.rpc('release_usage_reservation', {
    p_attempt_id: releaseAttemptId,
    p_failure_reason: 'Testing release RPC'
  });
  if (relErr) {
    console.log('release_usage_reservation RPC FAILED:', relErr.code, relErr.message);
  } else {
    console.log('✅ release_usage_reservation RPC succeeded. Result:', relData);
  }

  // Clean up any test rows created
  await supabaseAuthClient.from('usage_events').delete().eq('processing_attempt_id', testAttemptId);
  await supabaseAuthClient.from('usage_events').delete().eq('processing_attempt_id', releaseAttemptId);
}

main().catch(console.error);

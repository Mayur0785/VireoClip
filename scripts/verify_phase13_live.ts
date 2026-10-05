import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../server/src/config/index.js';

async function main() {
  console.log('=== SECTION 1: VERIFY LIVE PHASE 13 SCHEMA ===\n');

  // 1. Query with server/service role
  console.log('1. Checking service_role access to public.reframe_tracks...');
  const { data: cols, error: colErr } = await supabaseAuthClient
    .from('reframe_tracks')
    .select(`
      id,
      clip_id,
      project_id,
      user_id,
      status,
      analysis_version,
      sample_interval_ms,
      source_width,
      source_height,
      detected_face_count,
      dominant_track_id,
      raw_samples,
      smoothed_keyframes,
      metadata,
      error_code,
      error_message,
      analyzed_trim_start,
      analyzed_trim_end,
      analyzed_aspect_ratio,
      created_at,
      updated_at
    `)
    .limit(1);

  if (colErr) {
    console.error('❌ FAIL: service_role query error:', colErr.message);
  } else {
    console.log('✅ PASS: service_role has full access to all 21 columns on public.reframe_tracks!');
  }

  // 2. Query with authenticated user
  console.log('\n2. Checking authenticated user access with RLS...');
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'moizsh786786@gmail.com',
  });
  if (linkErr) {
    throw new Error(`Magiclink failed: ${linkErr.message}`);
  }

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties?.hashed_token || '',
    type: 'magiclink',
  });
  if (verifyErr || !verifyData?.session) {
    throw new Error(`Auth verify failed: ${verifyErr?.message}`);
  }

  const userToken = verifyData.session.access_token;
  const authedClient = createClient(config.supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });

  const { data: userTracks, error: userErr } = await authedClient
    .from('reframe_tracks')
    .select('id, clip_id, status, analysis_version');

  if (userErr) {
    console.error('❌ FAIL: Authenticated query error:', userErr.message);
  } else {
    console.log(`✅ PASS: Authenticated user (RLS) can query public.reframe_tracks! Count: ${userTracks?.length || 0}`);
  }
}

main().catch(console.error);

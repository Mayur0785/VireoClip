// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== VERIFYING LIVE SUPABASE DATABASE ===');
  console.log('Supabase URL:', config.supabaseUrl);
  console.log('Is Configured:', Boolean(config.supabaseUrl && config.supabaseSecretKey));

  // 0. Verify core tables
  console.log('\n--- 0. Checking Core Tables ---');
  const { data: profData, error: profErr } = await supabaseAuthClient.from('profiles').select('id').limit(1);
  console.log('profiles table:', profErr ? `❌ ${profErr.message}` : '✅ Exists');

  const { data: prjData, error: prjErr } = await supabaseAuthClient.from('projects').select('id').limit(1);
  console.log('projects table:', prjErr ? `❌ ${prjErr.message}` : '✅ Exists');

  const { data: cpCore, error: cpCoreErr } = await supabaseAuthClient.from('creator_profiles').select('id, user_id').limit(1);
  console.log('creator_profiles base table:', cpCoreErr ? `❌ ${cpCoreErr.message}` : '✅ Exists');

  // 1. Verify creator_profiles fields
  console.log('\n--- 1. Checking creator_profiles fields ---');
  const creatorFields = [
    'custom_tone',
    'website_url',
    'newsletter_url',
    'podcast_url',
    'youtube_cta',
    'instagram_cta',
    'linkedin_cta',
    'twitter_cta',
    'tiktok_cta',
    'preferred_hook_style',
    'brand_rules',
    'forbidden_phrases'
  ];

  const { data: cpData, error: cpErr } = await supabaseAuthClient
    .from('creator_profiles')
    .select(creatorFields.join(','))
    .limit(1);

  if (cpErr) {
    console.error('❌ creator_profiles fields verification FAILED:', cpErr.message);
  } else {
    console.log('✅ creator_profiles contains all 12 requested fields!');
  }

  // 2. Verify usage_events and user_subscription_limits tables
  console.log('\n--- 2. Checking Usage Metering Tables ---');
  const { data: ueData, error: ueErr } = await supabaseAuthClient
    .from('usage_events')
    .select('id, user_id, project_id, processing_attempt_id, billing_period, duration_seconds, status')
    .limit(1);
  if (ueErr) {
    console.error('❌ usage_events table check FAILED:', ueErr.message);
  } else {
    console.log('✅ usage_events table exists with ledger columns!');
  }

  const { data: uslData, error: uslErr } = await supabaseAuthClient
    .from('user_subscription_limits')
    .select('id, user_id, plan_tier, monthly_limit_minutes')
    .limit(1);
  if (uslErr) {
    console.error('❌ user_subscription_limits table check FAILED:', uslErr.message);
  } else {
    console.log('✅ user_subscription_limits table exists!');
  }

  // 3. Verify RPCs
  console.log('\n--- 3. Checking Stored Procedures (RPCs) ---');
  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  
  // reserve_usage_quota
  const { data: r1Data, error: r1Err } = await supabaseAuthClient.rpc('reserve_usage_quota', {
    p_user_id: dummyUuid,
    p_project_id: dummyUuid,
    p_duration_seconds: 60,
    p_billing_period: '2026-10',
    p_processing_attempt_id: dummyUuid
  });
  if (r1Err && r1Err.code === 'PGRST202') {
    console.error('❌ reserve_usage_quota RPC FAILED: Function not found in schema cache');
  } else {
    console.log('✅ reserve_usage_quota RPC exists! Response:', r1Data || r1Err?.message);
  }

  // settle_usage_reservation
  const { data: r2Data, error: r2Err } = await supabaseAuthClient.rpc('settle_usage_reservation', {
    p_reservation_id: dummyUuid,
    p_actual_duration_seconds: 60
  });
  if (r2Err && r2Err.code === 'PGRST202') {
    console.error('❌ settle_usage_reservation RPC FAILED: Function not found in schema cache');
  } else {
    console.log('✅ settle_usage_reservation RPC exists! Response:', r2Data || r2Err?.message);
  }

  // release_usage_reservation
  const { data: r3Data, error: r3Err } = await supabaseAuthClient.rpc('release_usage_reservation', {
    p_reservation_id: dummyUuid
  });
  if (r3Err && r3Err.code === 'PGRST202') {
    console.error('❌ release_usage_reservation RPC FAILED: Function not found in schema cache');
  } else {
    console.log('✅ release_usage_reservation RPC exists! Response:', r3Data || r3Err?.message);
  }

  // cleanup_orphaned_reservations
  const { data: r4Data, error: r4Err } = await supabaseAuthClient.rpc('cleanup_orphaned_reservations');
  if (r4Err && r4Err.code === 'PGRST202') {
    console.error('❌ cleanup_orphaned_reservations RPC FAILED: Function not found in schema cache');
  } else {
    console.log('✅ cleanup_orphaned_reservations RPC exists! Response:', r4Data ?? r4Err?.message);
  }

  // 4. Check Storage bucket 'videos'
  console.log('\n--- 4. Checking Storage Buckets ---');
  const { data: buckets, error: bErr } = await supabaseAuthClient.storage.listBuckets();
  if (bErr) {
    console.error('❌ Storage bucket list FAILED:', bErr.message);
  } else {
    const videoBucket = buckets.find(b => b.name === 'videos' || b.id === 'videos');
    if (!videoBucket) {
      console.error('❌ "videos" bucket not found!');
    } else {
      console.log('✅ "videos" bucket found:');
      console.log('   Public:', videoBucket.public);
      console.log('   File Size Limit:', videoBucket.file_size_limit, 'bytes (' + (videoBucket.file_size_limit ? (videoBucket.file_size_limit / 1024 / 1024) + ' MB' : 'Unlimited') + ')');
      console.log('   Allowed MIME types:', videoBucket.allowed_mime_types);
    }
  }

  // 6. Check Auth Users
  console.log('\n--- 6. Checking Auth Users ---');
  const { data: usersData, error: usersErr } = await supabaseAuthClient.auth.admin.listUsers();
  if (usersErr) {
    console.log('Admin listUsers:', usersErr.message);
  } else {
    console.log(`Found ${usersData.users.length} users in Supabase auth.`);
    for (const u of usersData.users) {
      console.log(`  User: ${u.id} (${u.email || 'no email'})`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

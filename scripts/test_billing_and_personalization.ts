// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== TEST BILLING USAGE & CREATOR PERSONALIZATION ===\n');

  const email = `test_verifier_${Date.now()}@example.com`;
  const password = 'VireoTestPass123!@#';

  console.log(`1. Creating test user: ${email}...`);
  const { data: created, error: createErr } = await supabaseAuthClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    console.error('❌ Failed to create test user:', createErr?.message);
    process.exit(1);
  }
  const testUserId = created.user.id;
  console.log(`✅ Test user created: ${testUserId}`);

  // Also create a profile row for the user in public.profiles if required
  const { error: profErr } = await supabaseAuthClient.from('profiles').upsert({
    id: testUserId,
    email,
    name: 'Test Verifier'
  });
  if (profErr) {
    console.log('Profiles upsert note:', profErr.message);
  }

  // Create second user to test cross-user isolation
  const email2 = `test_attacker_${Date.now()}@example.com`;
  const { data: created2 } = await supabaseAuthClient.auth.admin.createUser({
    email: email2,
    password,
    email_confirm: true,
  });
  const attackerUserId = created2?.user?.id;

  try {
    // Authenticate with anon client
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    const anonClient = createClient(config.supabaseUrl, anonKey);
    const { data: sessionData, error: signErr } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signErr || !sessionData?.session) {
      console.error('❌ Failed to sign in as test user:', signErr?.message);
      return;
    }
    const token = sessionData.session.access_token;
    console.log('✅ Successfully obtained valid JWT session token.');

    // ----------------------------------------------------
    // Section 2: Verify GET /api/billing/usage
    // ----------------------------------------------------
    console.log('\n--- Section 2: Testing GET /api/billing/usage ---');
    const usageRes = await fetch('http://localhost:5000/api/billing/usage', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`GET /api/billing/usage response status: ${usageRes.status}`);
    const usageBody = await usageRes.json();
    console.log('Usage body:', JSON.stringify(usageBody, null, 2));

    const expectedKeys = [
      'billing_period',
      'reset_date',
      'plan_tier',
      'limit_minutes',
      'settled_minutes',
      'reserved_minutes',
      'total_used_minutes',
      'remaining_minutes',
      'is_quota_exceeded'
    ];
    const dataObj = usageBody.data || usageBody;
    const missingKeys = expectedKeys.filter(k => !(k in dataObj));
    if (missingKeys.length > 0) {
      console.log(`❌ Missing keys in billing usage response: ${missingKeys.join(', ')}`);
    } else {
      console.log('✅ All 9 expected billing usage fields present!');
    }

    // ----------------------------------------------------
    // Section 3: Creator Personalization Settings
    // ----------------------------------------------------
    console.log('\n--- Section 3: Testing Creator Personalization Persistence ---');
    const sampleProfile = {
      niche: 'B2B SaaS Growth',
      target_audience: 'Technical Founders',
      language: 'English',
      tone: 'custom',
      custom_tone: 'Authoritative, sharp, data-driven, direct',
      preferred_hook_style: 'Contrarian question with empirical data point',
      brand_rules: 'Never use buzzwords like leverage or synergies. Cite metrics.',
      forbidden_phrases: 'game changer, secret sauce, silver bullet',
      youtube_cta: 'Subscribe to our YouTube channel for weekly teardowns',
      instagram_cta: 'Follow @vireo for daily founder tips',
      linkedin_cta: 'Connect on LinkedIn for deep dive analyses',
      twitter_cta: 'Follow @vireo on X for threads',
      tiktok_cta: 'Follow on TikTok for fast actionable tips'
    };

    // Upsert into creator_profiles via service role
    const { data: cpSave, error: cpSaveErr } = await supabaseAuthClient
      .from('creator_profiles')
      .upsert({
        user_id: testUserId,
        ...sampleProfile
      })
      .select();

    if (cpSaveErr) {
      console.error('❌ creator_profiles upsert failed:', cpSaveErr.message);
    } else {
      console.log('✅ creator_profiles saved successfully:', cpSave);

      // Verify persistence by reloading
      const { data: reloaded, error: reloadErr } = await supabaseAuthClient
        .from('creator_profiles')
        .select('*')
        .eq('user_id', testUserId)
        .single();

      if (reloadErr) {
        console.error('❌ Reloading creator profile failed:', reloadErr.message);
      } else {
        console.log('✅ Reloaded creator profile successfully. Persisted custom_tone:', reloaded.custom_tone, 'tiktok_cta:', reloaded.tiktok_cta);
      }
    }

    // Test cross-user isolation: attacker attempts to read user's creator_profile
    if (attackerUserId) {
      const { data: attackerSession } = await anonClient.auth.signInWithPassword({
        email: email2,
        password,
      });
      const attackerToken = attackerSession?.session?.access_token;
      
      const attackerClient = createClient(config.supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${attackerToken}` } }
      });

      const { data: crossData, error: crossErr } = await attackerClient
        .from('creator_profiles')
        .select('*')
        .eq('user_id', testUserId);

      if (crossData && crossData.length > 0) {
        console.error('❌ CROSS-USER LEAK: Attacker read victim profile!');
      } else {
        console.log('✅ Cross-user isolation PASS: Attacker received empty set / blocked by RLS');
      }
    }

    // ----------------------------------------------------
    // Section 16: Security Regression Checks
    // ----------------------------------------------------
    console.log('\n--- Section 16: Security Regression Checks ---');
    // 1. demo-token
    const demoRes = await fetch('http://localhost:5000/api/projects', {
      headers: { Authorization: 'Bearer demo-token' }
    });
    console.log('demo-token rejected:', demoRes.status === 401 ? '✅ PASS (401)' : `❌ FAIL (${demoRes.status})`);

    // 2. missing auth
    const noAuthRes = await fetch('http://localhost:5000/api/projects');
    console.log('missing auth rejected:', noAuthRes.status === 401 ? '✅ PASS (401)' : `❌ FAIL (${noAuthRes.status})`);

    // 3. invalid token
    const badTokenRes = await fetch('http://localhost:5000/api/projects', {
      headers: { Authorization: 'Bearer invalid.fake.token' }
    });
    console.log('invalid token rejected:', badTokenRes.status === 401 ? '✅ PASS (401)' : `❌ FAIL (${badTokenRes.status})`);

    // 4. invalid UUID
    const badUuidRes = await fetch('http://localhost:5000/api/projects/not-a-uuid', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('invalid UUID rejected:', badUuidRes.status === 400 ? '✅ PASS (400 Invalid project ID)' : `❌ FAIL (${badUuidRes.status})`);

    // 5. cross-user project
    const validNonOwnedUuid = '11111111-2222-4333-8444-555555555555';
    const notFoundRes = await fetch(`http://localhost:5000/api/projects/${validNonOwnedUuid}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('non-owned project blocked:', (notFoundRes.status === 404 || notFoundRes.status === 403) ? `✅ PASS (${notFoundRes.status})` : `❌ FAIL (${notFoundRes.status})`);

  } finally {
    // Cleanup users
    console.log('\nCleaning up test users...');
    if (testUserId) await supabaseAuthClient.auth.admin.deleteUser(testUserId);
    if (attackerUserId) await supabaseAuthClient.auth.admin.deleteUser(attackerUserId);
    console.log('✅ Cleanup complete.');
  }
}

main().catch(err => {
  console.error('Fatal in test script:', err);
  process.exit(1);
});

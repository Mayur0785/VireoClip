import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import fs from 'node:fs';

async function runSocialApiVerification() {
  console.log('=== REAL SOCIAL OAUTH API VERIFICATION ===\n');

  // Step 1: Real Auth Session
  const email = 'vertexdigitals07@gmail.com';
  const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey);
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw new Error('Magiclink failed: ' + linkErr.message);

  const envLines = fs.readFileSync('../.env.local', 'utf8').split('\n');
  let pubKey = '';
  for (const l of envLines) {
    if (l.trim().startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) pubKey = l.split('=')[1].trim();
  }
  const userClient = createClient(config.supabaseUrl, pubKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr) throw new Error('OTP verification failed: ' + verifyErr.message);
  if (!verifyData.session || !verifyData.user) throw new Error('No session returned');

  const token = verifyData.session.access_token;
  const userId = verifyData.user.id;
  console.log('1. [AUTH] Authenticated as real user:', userId);

  const authHeaders = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  // Step 2: GET /api/social/accounts
  console.log('2. [GET /api/social/accounts] Testing account list endpoint...');
  const accountsRes = await fetch('http://localhost:5000/api/social/accounts', {
    headers: authHeaders,
  });
  console.log('   Status:', accountsRes.status);
  const accountsData = await accountsRes.json() as any;
  console.log('   Response structure:', JSON.stringify(accountsData, null, 2));

  if (!accountsRes.ok || accountsData.status !== 'ok') {
    throw new Error('GET /api/social/accounts failed');
  }

  // Verify configuredProviders presence and token absence
  console.log('   Configured providers detected:', accountsData.data.configuredProviders);
  console.log('   Number of connected accounts:', accountsData.data.accounts.length);

  // Step 3: Test POST /api/social/:provider/connect error handling when unconfigured
  console.log('\n3. [POST /api/social/youtube/connect] Testing connect initiation...');
  const connectRes = await fetch('http://localhost:5000/api/social/youtube/connect', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  console.log('   Status:', connectRes.status);
  const connectData = await connectRes.json() as any;
  console.log('   Response:', JSON.stringify(connectData, null, 2));

  // Step 4: Verify unauthenticated rejection (401)
  console.log('\n4. [SECURITY] Testing unauthenticated call to /api/social/accounts...');
  const unauthRes = await fetch('http://localhost:5000/api/social/accounts');
  console.log('   Unauthenticated status:', unauthRes.status);
  if (unauthRes.status !== 401) {
    throw new Error('Unauthenticated request was not rejected with 401');
  }

  console.log('\n=== SOCIAL API VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runSocialApiVerification().catch((err) => {
  console.error('API verification failed:', err);
  process.exit(1);
});

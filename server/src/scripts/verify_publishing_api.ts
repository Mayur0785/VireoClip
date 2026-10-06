import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import fs from 'node:fs';

async function runPublishingApiVerification() {
  console.log('=== REAL PUBLISHING & SCHEDULING API VERIFICATION ===\n');

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

  // Step 2: GET /api/publishing/accounts
  console.log('2. [GET /api/publishing/accounts] Testing publishing accounts list endpoint...');
  const accountsRes = await fetch('http://localhost:5000/api/publishing/accounts', {
    headers: authHeaders,
  });
  console.log('   Status:', accountsRes.status);
  const accountsData = await accountsRes.json() as any;
  console.log('   Response structure:', JSON.stringify(accountsData, null, 2));

  if (!accountsRes.ok || accountsData.status !== 'ok') {
    throw new Error('GET /api/publishing/accounts failed');
  }

  // Step 3: GET /api/publishing/posts
  console.log('\n3. [GET /api/publishing/posts] Testing publishing posts listing...');
  const postsRes = await fetch('http://localhost:5000/api/publishing/posts', {
    headers: authHeaders,
  });
  console.log('   Status:', postsRes.status);
  const postsData = await postsRes.json() as any;
  console.log('   Returned post count:', postsData?.data?.posts?.length ?? 0);
  if (!postsRes.ok || postsData.status !== 'ok') {
    throw new Error('GET /api/publishing/posts failed');
  }

  // Step 4: POST /api/publishing/preview with non-existent connection
  console.log('\n4. [POST /api/publishing/preview] Testing preview validation failure on non-existent connection...');
  const previewRes = await fetch('http://localhost:5000/api/publishing/preview', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      socialConnectionId: 'non-existent-conn',
      payload: {
        title: 'Test Title',
        caption: 'Test Caption',
      },
    }),
  });
  console.log('   Preview status:', previewRes.status);
  const previewData = await previewRes.json() as any;
  console.log('   Preview response:', JSON.stringify(previewData, null, 2));
  if (previewRes.status !== 404) {
    throw new Error('Preview with non-existent connection should return 404');
  }

  // Step 5: Test Unauthenticated Security (401)
  console.log('\n5. [SECURITY] Testing unauthenticated call to /api/publishing/posts...');
  const unauthRes = await fetch('http://localhost:5000/api/publishing/posts');
  console.log('   Unauthenticated status:', unauthRes.status);
  if (unauthRes.status !== 401) {
    throw new Error('Unauthenticated request was not rejected with 401');
  }

  console.log('\n=== REAL PUBLISHING & SCHEDULING API VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runPublishingApiVerification().catch((err) => {
  console.error('API verification failed:', err);
  process.exit(1);
});

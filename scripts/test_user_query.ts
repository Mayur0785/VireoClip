import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { config } from '../server/src/config/index.js';

// Parse .env manually
const envContent = fs.readFileSync('.env', 'utf8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

async function testUserQuery() {
  const anonKey = envVars.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  console.log('Anon key exists:', Boolean(anonKey));

  // Generate magiclink for moizsh786786@gmail.com
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'moizsh786786@gmail.com',
  });
  if (linkErr) {
    console.error('Magiclink failed:', linkErr.message);
    return;
  }

  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties?.hashed_token || '',
    type: 'magiclink',
  });
  if (verifyErr || !verifyData?.session) {
    console.error('Verify failed:', verifyErr?.message);
    return;
  }

  const userToken = verifyData.session.access_token;
  console.log('Got user access token, user ID:', verifyData.user?.id);

  // Client with user token
  const authedClient = createClient(config.supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });

  const { data: queryData, error: queryErr } = await authedClient
    .from('reframe_tracks')
    .select('*')
    .limit(1);

  if (queryErr) {
    console.error('❌ Query error with authenticated user:', queryErr.message, 'Code:', queryErr.code);
  } else {
    console.log('✅ Query SUCCESS with authenticated user! Count:', queryData.length);
  }
}

testUserQuery().catch(console.error);

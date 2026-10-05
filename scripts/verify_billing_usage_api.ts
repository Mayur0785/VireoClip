import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== VERIFYING GET /api/billing/usage ===\n');

  const email = 'moizshaikh381@gmail.com';
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    console.error('Failed to generate link:', linkErr);
    process.exit(1);
  }

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink'
  });

  const token = verifyData?.session?.access_token;
  if (!token) {
    console.error('Failed to obtain token');
    process.exit(1);
  }

  const res = await fetch('http://localhost:5000/api/billing/usage', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  console.log('GET /api/billing/usage HTTP status:', res.status);
  const body = await res.json();
  console.log('Response body:', JSON.stringify(body, null, 2));

  // Check required keys
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

  const usageData = body.usage || body;
  console.log('\nField check:');
  for (const k of expectedKeys) {
    console.log(`- ${k}: ${usageData[k] !== undefined ? '✅ Present (' + usageData[k] + ')' : '❌ Missing'}`);
  }
}

main().catch(console.error);

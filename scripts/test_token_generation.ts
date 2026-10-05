import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const { data, error } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'moizshaikh381@gmail.com'
  });
  if (error || !data.properties?.hashed_token) {
    console.error('Error generating link:', error);
    return;
  }

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink'
  });

  if (verifyErr || !verifyData.session) {
    console.error('verifyOtp error:', verifyErr);
  } else {
    console.log('✅ Obtained valid session for user:', verifyData.user?.id);
    console.log('Token exists:', Boolean(verifyData.session.access_token));
  }
}

main().catch(console.error);

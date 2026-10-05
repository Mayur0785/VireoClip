import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

export const isServerSupabaseConfigured = Boolean(
  config.supabaseUrl &&
  config.supabaseSecretKey &&
  config.supabaseUrl !== 'https://placeholder.supabase.co' &&
  !config.supabaseUrl.includes('your-supabase')
);

// Standard Supabase client using secret key for server-side auth validation
export const supabaseAuthClient = createClient(
  config.supabaseUrl || 'https://placeholder.supabase.co',
  config.supabaseSecretKey || 'placeholder-secret-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

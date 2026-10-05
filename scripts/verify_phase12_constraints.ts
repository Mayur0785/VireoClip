import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== Checking live database constraints and RLS on public.clips ===');

  // Test constraint 1: negative trim should be rejected
  const testClipId = '25eaf0ec-7e34-4602-a8a3-28d961f34ee3';
  const { error: negTrimErr } = await supabaseAuthClient
    .from('clips')
    .update({ trim_start_offset: -1 })
    .eq('id', testClipId);

  console.log('Negative trim update error (expected constraint violation):', negTrimErr?.message);
  const trimConstraintWorks = !!negTrimErr && negTrimErr.message.includes('chk_clips_trim_non_negative');
  console.log('chk_clips_trim_non_negative active:', trimConstraintWorks);

  // Test constraint 2: invalid caption style should be rejected
  const { error: badStyleErr } = await supabaseAuthClient
    .from('clips')
    .update({ caption_style: 'invalid_style_123' })
    .eq('id', testClipId);

  console.log('Invalid caption style error (expected constraint violation):', badStyleErr?.message);
  const styleConstraintWorks = !!badStyleErr && badStyleErr.message.includes('chk_clips_caption_style');
  console.log('chk_clips_caption_style active:', styleConstraintWorks);

  // Test constraint 3: volume out of range (> 2.0)
  const { error: badVolErr } = await supabaseAuthClient
    .from('clips')
    .update({ volume: 3.5 })
    .eq('id', testClipId);

  console.log('Invalid volume error (expected constraint violation):', badVolErr?.message);
  const volConstraintWorks = !!badVolErr && badVolErr.message.includes('chk_clips_volume_range');
  console.log('chk_clips_volume_range active:', volConstraintWorks);

  // Check RLS status via pg_tables/pg_class query if possible or by testing an anon read
  const anonClient = (await import('@supabase/supabase-js')).createClient(
    process.env.VITE_SUPABASE_URL || 'https://xssrqbpxoabqrqtwmfxv.supabase.co',
    process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
  );
  const { data: anonClips, error: anonErr } = await anonClient.from('clips').select('id');
  console.log('Anon select on clips without auth (expected 0 rows due to RLS):', anonClips?.length, 'error:', anonErr?.message);
}

main().catch(console.error);

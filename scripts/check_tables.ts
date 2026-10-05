// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== CHECKING SCHEMA OBJECTS ===');

  const { data: cData, error: cErr } = await supabaseAuthClient.from('clip_candidates').select('id').limit(1);
  console.log('clip_candidates:', cErr ? `${cErr.code} ${cErr.message}` : 'EXISTS & QUERYABLE');

  const { data: clData, error: clErr } = await supabaseAuthClient.from('clips').select('id').limit(1);
  console.log('clips:', clErr ? `${clErr.code} ${clErr.message}` : 'EXISTS & QUERYABLE');

  const { data: rjData, error: rjErr } = await supabaseAuthClient.from('render_jobs').select('id').limit(1);
  console.log('render_jobs:', rjErr ? `${rjErr.code} ${rjErr.message}` : 'EXISTS & QUERYABLE');

  const { data: rfData, error: rfErr } = await supabaseAuthClient.from('reframe_tracks').select('id').limit(1);
  console.log('reframe_tracks:', rfErr ? `${rfErr.code} ${rfErr.message}` : 'EXISTS & QUERYABLE');

  const { data: bData, error: bErr } = await supabaseAuthClient.storage.listBuckets();
  if (bErr) console.log('storage buckets error:', bErr.message);
  else console.log('storage buckets:', bData.map((b: any) => b.name));
}

main().catch(console.error);


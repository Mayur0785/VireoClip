// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== CHECKING PHASE 10 & 11 STATUS ===');
  const { data: candidates, error: cErr } = await supabaseAuthClient.from('clip_candidates').select('id, project_id, title, hook, start_seconds, end_seconds, duration_seconds, engagement_score, status');
  if (cErr) console.log('clip_candidates error:', cErr);
  else console.log(`clip_candidates count: ${candidates?.length}`, candidates);

  const { data: clips, error: clErr } = await supabaseAuthClient.from('clips').select('*');
  if (clErr) console.log('clips error:', clErr);
  else console.log(`clips count: ${clips?.length}`, clips);

  const { data: renderJobs, error: rjErr } = await supabaseAuthClient.from('render_jobs').select('*');
  if (rjErr) console.log('render_jobs error:', rjErr);
  else console.log(`render_jobs count: ${renderJobs?.length}`, renderJobs);
}

main().catch(console.error);

import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== PHASE 12.5 LIVE SCHEMA & DATA VERIFICATION ===\n');

  // 1. Verify transcripts.words
  console.log('1. Checking public.transcripts for `words` column...');
  const { data: transcripts, error: transErr } = await supabaseAuthClient
    .from('transcripts')
    .select('id, project_id, words, segments')
    .limit(5);

  if (transErr) {
    console.error('❌ FAIL: transcripts.words query error:', transErr.message);
  } else {
    console.log('✅ PASS: transcripts.words column exists on live Supabase!');
    console.log(`   Found ${transcripts?.length || 0} transcript records.`);
    if (transcripts && transcripts.length > 0) {
      transcripts.forEach((t, i) => {
        const wordsArr = Array.isArray(t.words) ? t.words : [];
        const segsArr = Array.isArray(t.segments) ? t.segments : [];
        console.log(`   [${i + 1}] Transcript ID: ${t.id}, project: ${t.project_id}, words: ${wordsArr.length}, segments: ${segsArr.length}`);
      });
    }
  }

  // 2. Verify clips.caption_overrides
  console.log('\n2. Checking public.clips for `caption_overrides` column...');
  const { data: clips, error: clipErr } = await supabaseAuthClient
    .from('clips')
    .select('id, project_id, render_status, caption_enabled, caption_style, caption_config, caption_overrides')
    .limit(5);

  if (clipErr) {
    console.error('❌ FAIL: clips.caption_overrides query error:', clipErr.message);
  } else {
    console.log('✅ PASS: clips.caption_overrides column exists on live Supabase!');
    console.log(`   Found ${clips?.length || 0} clips.`);
    if (clips && clips.length > 0) {
      clips.forEach((c, i) => {
        const overrides = Array.isArray(c.caption_overrides) ? c.caption_overrides : [];
        console.log(`   [${i + 1}] Clip ID: ${c.id}, title: "${c.title}", status: ${c.render_status}, overrides count: ${overrides.length}`);
        console.log(`       caption_config:`, JSON.stringify(c.caption_config));
      });
    }
  }
}

main().catch(console.error);

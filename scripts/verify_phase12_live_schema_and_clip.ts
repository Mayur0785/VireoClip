import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('--- Step 1: Checking public.clips schema for Phase 12 fields ---');
  const { data: clips, error: selectErr } = await supabaseAuthClient
    .from('clips')
    .select('id, user_id, project_id, render_status, output_storage_path, trim_start_offset, trim_end_offset, caption_enabled, caption_style, caption_position, caption_config, crop_config, overlay_config, volume, muted, editor_version, render_version')
    .limit(5);

  if (selectErr) {
    console.error('❌ Error selecting Phase 12 fields from clips:', selectErr.message);
  } else {
    console.log('✅ Phase 12 fields exist on public.clips! Found', clips?.length, 'clips.');
    if (clips && clips.length > 0) {
      console.log('First clip sample:', JSON.stringify(clips[0], null, 2));
    }
  }

  console.log('\n--- Step 2: Checking existing project transcripts for timing mode ---');
  const { data: transcripts, error: transErr } = await supabaseAuthClient
    .from('transcripts')
    .select('id, project_id, language, segments')
    .limit(3);

  if (transErr) {
    console.error('❌ Error fetching transcripts:', transErr.message);
  } else {
    console.log('Found', transcripts?.length, 'transcripts.');
    if (transcripts && transcripts.length > 0) {
      const sample = transcripts[0];
      console.log('Transcript ID:', sample.id, 'Project:', sample.project_id);
      const segs = sample.segments;
      console.log('Is segments array?', Array.isArray(segs), 'Count:', segs?.length);
      if (Array.isArray(segs) && segs.length > 0) {
        console.log('First segment sample:', JSON.stringify(segs[0], null, 2));
        const hasWords = !!segs[0].words;
        console.log('Has segment-level word timestamps?', hasWords);
      }
    }
  }
}

main().catch(console.error);

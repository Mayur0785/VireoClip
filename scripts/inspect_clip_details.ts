import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  console.log('=== INSPECTING LIVE CLIPS & TRANSCRIPTS ===\n');

  const { data: clips } = await supabaseAuthClient
    .from('clips')
    .select('*')
    .limit(5);

  for (const clip of clips || []) {
    console.log(`\nClip: ${clip.id}`);
    console.log(`  Project: ${clip.project_id}`);
    console.log(`  Status: ${clip.render_status}`);
    console.log(`  Output Path: ${clip.output_storage_path}`);
    console.log(`  Caption Enabled: ${clip.caption_enabled}`);
    console.log(`  Caption Style: ${clip.caption_style}`);
    console.log(`  Caption Config:`, JSON.stringify(clip.caption_config));
    console.log(`  Caption Overrides:`, JSON.stringify(clip.caption_overrides));
    console.log(`  Start Time: ${clip.start_time}, End Time: ${clip.end_time}`);

    const { data: transcript } = await supabaseAuthClient
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .maybeSingle();

    if (transcript) {
      console.log(`  Transcript ID: ${transcript.id}`);
      console.log(`  Transcript Text: "${transcript.transcript_text?.slice(0, 100)}..."`);
      console.log(`  Words Count: ${Array.isArray(transcript.words) ? transcript.words.length : 0}`);
      console.log(`  Segments Count: ${Array.isArray(transcript.segments) ? transcript.segments.length : 0}`);
      if (Array.isArray(transcript.segments) && transcript.segments.length > 0) {
        console.log(`  First Segment:`, JSON.stringify(transcript.segments[0]));
      }
    } else {
      console.log(`  No transcript found for project ${clip.project_id}`);
    }
  }
}

main().catch(console.error);

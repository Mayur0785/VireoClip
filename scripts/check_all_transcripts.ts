import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  const { data: transcripts, error } = await supabaseAuthClient
    .from('transcripts')
    .select('id, project_id, user_id, duration_seconds, segments');

  if (error) {
    console.error('Error fetching transcripts:', error);
    return;
  }

  console.log(`Found ${transcripts.length} transcripts:`);
  for (const t of transcripts) {
    console.log({
      id: t.id,
      project_id: t.project_id,
      user_id: t.user_id,
      duration_seconds: t.duration_seconds,
      segmentsCount: t.segments?.length,
      sampleSegment: t.segments?.[0],
    });
  }
}

main().catch(console.error);

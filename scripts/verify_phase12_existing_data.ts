// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  const projectId = 'e2cbc90a-4b24-474c-b822-5aec476c31fb';
  const clipId = '25eaf0ec-7e34-4602-a8a3-28d961f34ee3';

  console.log('=== Checking Project, Clip, and Transcript for Phase 11 clip ===');

  // 1. Project
  const { data: project, error: projErr } = await supabaseAuthClient
    .from('projects')
    .select('id, name, status, storage_path, user_id')
    .eq('id', projectId)
    .single();
  console.log('Project:', project, 'error:', projErr?.message);

  // 2. Clip
  const { data: clip, error: clipErr } = await supabaseAuthClient
    .from('clips')
    .select('*')
    .eq('id', clipId)
    .single();
  console.log('Clip:', clip, 'error:', clipErr?.message);

  // 3. Transcript
  const { data: transcript, error: transErr } = await supabaseAuthClient
    .from('transcripts')
    .select('id, project_id, text, segments')
    .eq('project_id', projectId)
    .maybeSingle();
  console.log('Transcript ID:', transcript?.id, 'error:', transErr?.message);
  console.log('Transcript text:', transcript?.text?.slice(0, 150));
  console.log('Transcript segments count:', transcript?.segments?.length);
  if (transcript?.segments?.length) {
    console.log('Segment 0:', transcript.segments[0]);
  }

  // 4. Output Storage check
  const storagePath = clip?.output_storage_path;
  console.log('Output storage path:', storagePath);
  if (storagePath) {
    // Check if in 'clips' or 'videos'
    const isFallback = storagePath.startsWith('clips/');
    const bucket = isFallback ? 'videos' : 'clips';
    const filePath = isFallback ? storagePath.replace(/^clips\//, '') : storagePath;
    const { data: signed, error: signErr } = await supabaseAuthClient.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);
    console.log('Signed preview URL success?', !!signed?.signedUrl, 'error:', signErr?.message);
  }
}

main().catch(console.error);

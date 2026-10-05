import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function inspectProject() {
  console.log('=== INSPECTING PROJECT 12022bbe-b958-4bf5-adce-5c0f39b368be ===\n');

  const { data: project } = await supabaseAuthClient
    .from('projects')
    .select('*')
    .eq('id', '12022bbe-b958-4bf5-adce-5c0f39b368be')
    .single();

  console.log('Project data:');
  console.log(JSON.stringify(project, null, 2));

  const { data: clip } = await supabaseAuthClient
    .from('clips')
    .select('*')
    .eq('id', '90294e88-13c1-463d-bbb3-111420a9274b')
    .single();

  console.log('\nClip data:');
  console.log(JSON.stringify(clip, null, 2));
}

inspectProject().catch(console.error);

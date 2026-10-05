import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  const { data: project } = await supabaseAuthClient
    .from('projects')
    .select('*')
    .eq('id', 'e2cbc90a-4b24-474c-b822-5aec476c31fb')
    .single();

  console.log('Project:', project);

  const { data: transcript, error } = await supabaseAuthClient
    .from('transcripts')
    .select('*')
    .eq('project_id', 'e2cbc90a-4b24-474c-b822-5aec476c31fb')
    .single();

  if (error) {
    console.log('No transcript for e2cb:', error.message);
  } else {
    console.log('Transcript found:', JSON.stringify(transcript, null, 2));
  }
}

main().catch(console.error);

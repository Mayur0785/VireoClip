import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  const { data: projects, error } = await supabaseAuthClient
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return;
  }

  console.log(`Found ${projects.length} projects:`);
  for (const p of projects) {
    console.log(JSON.stringify(p, null, 2));
  }
}

main().catch(console.error);

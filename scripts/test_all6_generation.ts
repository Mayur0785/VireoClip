// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== TESTING REAL ALL-6-PLATFORM CONTENT GENERATION ===\n');

  const email = `test_all6_${Date.now()}@example.com`;
  const password = 'TestAll6Password123!';
  const { data: created } = await supabaseAuthClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  const userId = created!.user!.id;
  await supabaseAuthClient.from('profiles').upsert({ id: userId, email });

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: sessionData } = await userClient.auth.signInWithPassword({ email, password });
  const token = sessionData!.session!.access_token;

  let projectId: string | null = null;

  try {
    const { data: projData } = await supabaseAuthClient
      .from('projects')
      .insert({
        user_id: userId,
        title: 'Deep Work for Solopreneurs',
        source_type: 'upload',
        source_url: 'videos/fake-all6.mp4',
        video_status: 'transcribed',
      })
      .select()
      .single();

    projectId = projData!.id;

    // Insert transcript
    await supabaseAuthClient.from('transcripts').insert({
      project_id: projectId,
      user_id: userId,
      transcript_text: 'Deep work produces 10x the output of distracted multitasking. When building software companies, protect your mornings for code and strategic architecture, and push all meetings to Thursday afternoon.',
      language: 'en',
      duration_seconds: 35,
    });

    // Run content generation for all platforms (no platform param = all platforms)
    console.log('Calling POST /api/projects/:id/generate-content for all 6 platforms...');
    const startTime = Date.now();
    const genRes = await fetch(`http://localhost:5000/api/projects/${projectId}/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        overrideTone: 'Direct and Actionable',
        overrideCTA: 'Subscribe for daily founder playbooks'
      }),
    });

    console.log(`Generation call finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s with HTTP status: ${genRes.status}`);
    const genBody = await genRes.json();
    
    if (genRes.status === 200) {
      console.log(`Total generated outputs: ${genBody.outputs?.length}`);
      
      const platforms = ['youtube', 'instagram', 'shorts', 'linkedin', 'x', 'tiktok'];
      for (const p of platforms) {
        const found = genBody.outputs?.filter((o: any) => o.platform === p);
        if (found && found.length > 0) {
          console.log(`✅ Platform "${p}": PASS (${found.length} output items generated)`);
          console.log(`   Sample [${found[0].content_type}]: ${JSON.stringify(found[0].content).slice(0, 100)}...`);
        } else {
          console.log(`❌ Platform "${p}": FAIL (0 items generated)`);
        }
      }
    } else {
      console.error('Generation error:', genBody);
    }

  } finally {
    if (projectId) {
      await supabaseAuthClient.from('content_outputs').delete().eq('project_id', projectId);
      await supabaseAuthClient.from('transcripts').delete().eq('project_id', projectId);
      await supabaseAuthClient.from('projects').delete().eq('id', projectId);
    }
    await supabaseAuthClient.auth.admin.deleteUser(userId);
    console.log('✅ Cleanup complete.');
  }
}

main().catch(err => {
  console.error('Fatal in all-6 test:', err);
  process.exit(1);
});

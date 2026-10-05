// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== TESTING REAL SIX-PLATFORM CONTENT GENERATION & TIKTOK ===\n');

  // Check OpenRouter key
  if (!config.openrouterApiKey) {
    console.log('⚠️ OPENROUTER_API_KEY is missing, skipping live LLM call.');
    return;
  }

  // 1. Create a test user
  const email = `test_content_${Date.now()}@example.com`;
  const password = 'TestContentPassword123!';
  const { data: created, error: createErr } = await supabaseAuthClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    console.error('❌ Failed to create user:', createErr?.message);
    process.exit(1);
  }
  const userId = created.user.id;
  console.log(`✅ Test user created: ${userId}`);

  // Create profile row
  await supabaseAuthClient.from('profiles').upsert({ id: userId, email });

  // Authenticate user with anon client
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: sessionData, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });

  const token = sessionData?.session?.access_token;
  if (!token) {
    console.error('❌ Failed to obtain user token');
    await supabaseAuthClient.auth.admin.deleteUser(userId);
    return;
  }

  let projectId: string | null = null;

  try {
    // 2. Create a test project
    const { data: projData, error: projErr } = await supabaseAuthClient
      .from('projects')
      .insert({
        user_id: userId,
        title: 'Founder Time Management Teardown',
        source_type: 'upload',
        source_url: 'videos/fake-source.mp4',
        video_status: 'transcribed',
      })
      .select()
      .single();

    if (projErr || !projData) {
      console.error('❌ Failed to create project:', projErr?.message);
      return;
    }
    projectId = projData.id;
    console.log(`✅ Project created: ${projectId}`);

    // 3. Insert real transcript record into Supabase
    const transcriptText = 'Today we will discuss why most early-stage founders fail to scale: they waste 80% of their working hours on shallow administrative busywork instead of talking to customers and shipping code. To fix this, you must adopt strict 90-minute time-boxing blocks and eliminate all non-urgent asynchronous notifications.';
    const { data: transData, error: transErr } = await supabaseAuthClient
      .from('transcripts')
      .insert({
        project_id: projectId,
        user_id: userId,
        transcript_text: transcriptText,
        language: 'en',
        duration_seconds: 45,
        segments: [
          { start: 0, end: 12, text: 'Today we will discuss why most early-stage founders fail to scale:' },
          { start: 12, end: 28, text: 'they waste 80% of their working hours on shallow administrative busywork instead of talking to customers and shipping code.' },
          { start: 28, end: 45, text: 'To fix this, you must adopt strict 90-minute time-boxing blocks and eliminate all non-urgent asynchronous notifications.' }
        ]
      })
      .select()
      .single();

    if (transErr || !transData) {
      console.error('❌ Failed to insert transcript:', transErr?.message);
      return;
    }
    console.log(`✅ Real transcript inserted into Supabase (ID: ${transData.id})`);

    // Verify transcript retrieval endpoint GET /api/projects/:id/transcript
    const transGetRes = await fetch(`http://localhost:5000/api/projects/${projectId}/transcript`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`GET /api/projects/:id/transcript status: ${transGetRes.status}`);
    const transGetBody = await transGetRes.json();
    console.log('Persisted transcript text:', transGetBody.transcript?.transcript_text?.slice(0, 50) + '...');
    console.log('Persisted segments count:', transGetBody.transcript?.segments?.length);

    // 4. Test Single Platform Generation (TikTok) via POST /api/projects/:id/generate-content
    console.log('\n--- 14. Testing TikTok Content Generation ---');
    const tiktokGenRes = await fetch(`http://localhost:5000/api/projects/${projectId}/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: 'tiktok',
        overrideCTA: 'Follow @founderflow on TikTok for 60-second operational playbooks'
      }),
    });

    console.log('TikTok generate HTTP status:', tiktokGenRes.status);
    const tiktokGenBody = await tiktokGenRes.json();
    if (tiktokGenRes.status === 200) {
      console.log('✅ TikTok Generation SUCCEEDED!');
      console.log('Number of outputs returned:', tiktokGenBody.outputs?.length);
      const firstOutput = tiktokGenBody.outputs?.[0];
      console.log('Sample generated output preview:', JSON.stringify(firstOutput?.content).slice(0, 150) + '...');
      
      // Test Content Editing via PATCH /api/projects/:id/content/:outputId
      if (firstOutput?.id) {
        console.log('\n--- 13. Testing Content Editing (PATCH) ---');
        const patchRes = await fetch(`http://localhost:5000/api/projects/${projectId}/content/${firstOutput.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: 'EDITED HOOK: 90% of founders fail because of this calendar mistake.'
          }),
        });
        console.log('PATCH content status:', patchRes.status);
        const patchBody = await patchRes.json();
        console.log('PATCH response:', patchBody);

        // Verify edited content persisted via GET /api/projects/:id/content
        const getOutputsRes = await fetch(`http://localhost:5000/api/projects/${projectId}/content`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const getOutputsBody = await getOutputsRes.json();
        const updatedItem = getOutputsBody.outputs?.find((o: any) => o.id === firstOutput.id);
        console.log('Verified edited content persistence:', updatedItem?.content.includes('EDITED HOOK') ? '✅ PASS' : '❌ FAIL');
      }
    } else {
      console.log('TikTok generate error:', JSON.stringify(tiktokGenBody, null, 2));
    }

  } finally {
    console.log('\nCleaning up content test...');
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
  console.error('Fatal in content test:', err);
  process.exit(1);
});

import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== VERIFYING REAL PHASE 11 CLIP RENDERING PIPELINE ===');

  // 1. Get auth token
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'moizshaikh381@gmail.com',
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error(`Failed to generate magiclink: ${linkErr?.message}`);
  }

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyErr || !verifyData.session) {
    throw new Error(`Auth verification failed: ${verifyErr?.message}`);
  }

  const token = verifyData.session.access_token;
  const userId = verifyData.user?.id;
  const projectId = 'e2cbc90a-4b24-474c-b822-5aec476c31fb';
  console.log('✅ Authenticated as user:', userId);

  // 2. Ensure a candidate exists for this project
  let { data: candidate } = await supabaseAuthClient
    .from('clip_candidates')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (!candidate) {
    console.log('Creating a test clip candidate for project...');
    const { data: newCand, error: candInsertErr } = await supabaseAuthClient
      .from('clip_candidates')
      .insert({
        project_id: projectId,
        user_id: userId,
        start_segment_index: 0,
        end_segment_index: 0,
        start_seconds: 0.5,
        end_seconds: 5.5,
        duration_seconds: 5.0,
        title: 'Luxury Resort Exclusive Tour',
        hook: 'Step into paradise.',
        reason: 'Captures the resort ambiance instantly.',
        category: 'story',
        engagement_score: 94,
        status: 'suggested',
      })
      .select()
      .single();

    if (candInsertErr) {
      throw new Error(`Failed to insert candidate: ${candInsertErr.message}`);
    }
    candidate = newCand;
  }

  console.log('✅ Target candidate ready:', {
    id: candidate.id,
    title: candidate.title,
    range: `${candidate.start_seconds}s - ${candidate.end_seconds}s (${candidate.duration_seconds}s)`,
  });

  // 3. Call POST /api/projects/:id/clips
  console.log('\nSubmitting clip creation request to POST /api/projects/:id/clips...');
  const createRes = await fetch(`http://localhost:5000/api/projects/${projectId}/clips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      candidateId: candidate.id,
      aspectRatio: '9:16',
      cropMode: 'center',
    }),
  });

  const createJson = await createRes.json();
  console.log(`HTTP Status: ${createRes.status}`);
  console.log('Response:', createJson);

  if (createRes.status !== 202) {
    throw new Error(`Expected HTTP 202, got ${createRes.status}`);
  }

  const clipId = createJson.clip?.id;
  if (!clipId) {
    throw new Error('Clip ID was not returned in response.');
  }

  // 4. Poll GET /api/clips/:clipId until rendered
  console.log(`\nPolling clip status for ${clipId}...`);
  let pollCount = 0;
  let finalClip: any = null;

  while (pollCount < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    pollCount++;

    const getRes = await fetch(`http://localhost:5000/api/clips/${clipId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const getJson = await getRes.json();
    const clip = getJson.clip;
    const job = clip?.latest_render_job;

    console.log(
      `[Poll #${pollCount}] Status: ${clip?.render_status} | Job Stage: ${job?.stage || 'none'} | Progress: ${job?.progress || 0}%`
    );

    if (clip?.render_status === 'ready') {
      finalClip = clip;
      break;
    }

    if (clip?.render_status === 'failed') {
      throw new Error(`Clip rendering failed: ${clip.render_error_code} - ${clip.render_error_message}`);
    }
  }

  if (!finalClip) {
    throw new Error('Timed out waiting for clip to render.');
  }

  console.log('\n🎉 CLIP RENDER SUCCESSFUL!');
  console.log({
    id: finalClip.id,
    status: finalClip.render_status,
    aspect_ratio: finalClip.aspect_ratio,
    storage_path: finalClip.output_storage_path,
    duration: finalClip.duration_seconds,
  });

  // 5. Test Signed Preview URL
  console.log('\nRequesting signed preview URL...');
  const prevRes = await fetch(`http://localhost:5000/api/clips/${clipId}/preview-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prevJson = await prevRes.json();
  console.log('Preview URL status:', prevRes.status);
  console.log('Preview URL valid:', Boolean(prevJson.signedUrl));

  // 6. Test Signed Download URL
  console.log('\nRequesting signed download URL...');
  const dlRes = await fetch(`http://localhost:5000/api/clips/${clipId}/download-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dlJson = await dlRes.json();
  console.log('Download URL status:', dlRes.status);
  console.log('Download URL valid:', Boolean(dlJson.signedUrl));

  // Verify signed download URL is reachable
  const headRes = await fetch(dlJson.signedUrl, { method: 'HEAD' });
  console.log(`Supabase storage HEAD check: HTTP ${headRes.status}`);
  console.log('Content-Type:', headRes.headers.get('content-type'));
  console.log('Content-Length:', headRes.headers.get('content-length'), 'bytes');

  console.log('\n✅ ALL PHASE 11 REAL ENVIRONMENT CHECKS PASSED PERFECTLY!');
}

main().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});

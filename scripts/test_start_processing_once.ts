// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== START PROCESSING ONCE & TRACK LIFECYCLE ===\n');

  const projectId = '827036a0-4017-453a-8138-499f7c16b49a';
  const email = 'moizshaikh381@gmail.com';

  // 1. Obtain user token
  console.log('1. Authenticating as project owner:', email);
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    console.error('Failed to generate link:', linkErr);
    process.exit(1);
  }

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink'
  });

  if (verifyErr || !verifyData.session) {
    console.error('Failed to verify OTP:', verifyErr);
    process.exit(1);
  }

  const token = verifyData.session.access_token;
  console.log('✅ Token obtained for user:', verifyData.user?.id);

  // 2. Send exactly ONE POST /api/projects/:id/process
  console.log(`\n2. Sending exactly ONE POST /api/projects/${projectId}/process...`);
  const res = await fetch(`http://localhost:5000/api/projects/${projectId}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ estimated_minutes: 1.0 })
  });

  console.log('HTTP Status:', res.status, res.statusText);
  const bodyText = await res.text();
  console.log('Response body:', bodyText);

  let attemptId: string | null = null;
  try {
    const parsed = JSON.parse(bodyText);
    attemptId = parsed.processingAttemptId;
  } catch (e) {}

  if (res.status !== 202) {
    console.log('Request did not return 202. Inspecting project...');
    const { data: p } = await supabaseAuthClient.from('projects').select('video_status').eq('id', projectId).single();
    console.log('Project status:', p?.video_status);
    return;
  }

  console.log(`\n3. Monitoring pipeline for project ${projectId} (attempt: ${attemptId})...`);
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < 90000) {
    // Check project status
    const { data: proj } = await supabaseAuthClient
      .from('projects')
      .select('id, video_status, updated_at')
      .eq('id', projectId)
      .single();

    const currentStatus = proj?.video_status || 'unknown';
    if (currentStatus !== lastStatus) {
      console.log(`[${new Date().toISOString()}] Project video_status -> ${currentStatus}`);
      lastStatus = currentStatus;
    }

    // Check usage event status
    if (attemptId) {
      const { data: ue } = await supabaseAuthClient
        .from('usage_events')
        .select('id, status, reserved_minutes, actual_minutes, duration_seconds, failure_reason')
        .eq('processing_attempt_id', attemptId)
        .maybeSingle();

      if (ue) {
        // Only log if something interesting happened
        if (currentStatus === 'transcribed' || currentStatus === 'failed') {
          console.log(`Usage Event: status=${ue.status}, actual_minutes=${ue.actual_minutes}, duration_seconds=${ue.duration_seconds}, failure_reason=${ue.failure_reason}`);
        }
      }
    }

    if (currentStatus === 'transcribed' || currentStatus === 'failed') {
      break;
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // Final summary
  console.log('\n--- FINAL STATUS CHECK ---');
  const { data: finalProj } = await supabaseAuthClient
    .from('projects')
    .select('id, video_status, updated_at')
    .eq('id', projectId)
    .single();
  console.log('Final project video_status:', finalProj?.video_status);

  if (attemptId) {
    const { data: finalUe } = await supabaseAuthClient
      .from('usage_events')
      .select('*')
      .eq('processing_attempt_id', attemptId)
      .maybeSingle();
    console.log('Final usage event:', JSON.stringify(finalUe, null, 2));
  }

  const { data: transcript } = await supabaseAuthClient
    .from('transcripts')
    .select('id, project_id, language, duration_seconds, segments, transcript_text')
    .eq('project_id', projectId)
    .maybeSingle();

  if (transcript) {
    console.log('Transcript saved:', {
      id: transcript.id,
      language: transcript.language,
      duration_seconds: transcript.duration_seconds,
      segment_count: transcript.segments?.length,
      text_sample: transcript.transcript_text?.substring(0, 100) + '...'
    });
  } else {
    console.log('Transcript saved: NONE');
  }
}

main().catch(console.error);

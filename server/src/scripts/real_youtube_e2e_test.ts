import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import fs from 'node:fs';

async function runYouTubeSmokeTest() {
  console.log('=== REAL YOUTUBE END-TO-END VERIFICATION WORKFLOW ===\n');

  // Step 1: Real Auth Session
  const email = 'vertexdigitals07@gmail.com';
  const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey);
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw new Error('Magiclink failed: ' + linkErr.message);

  const envLines = fs.readFileSync('../.env.local', 'utf8').split('\n');
  let pubKey = '';
  for (const l of envLines) {
    if (l.trim().startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) pubKey = l.split('=')[1].trim();
  }
  const userClient = createClient(config.supabaseUrl, pubKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr) throw new Error('OTP verification failed: ' + verifyErr.message);

  if (!verifyData.session || !verifyData.user) throw new Error('No session returned');
  const token = verifyData.session.access_token;
  const userId = verifyData.user.id;
  console.log('1. [AUTH] Authenticated as real user:', userId);

  const authHeaders = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  // Step 2: Ingest YouTube URL via POST /api/projects/ingest-url
  // Using public historic first YouTube video: "Me at the zoo" (19 seconds, ~533KB)
  const ytUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  console.log(`2. [INGEST] Calling /api/projects/ingest-url with YouTube URL: ${ytUrl}`);

  const ingestRes = await fetch('http://localhost:5000/api/projects/ingest-url', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      url: ytUrl,
      title: 'YouTube Ingest E2E Test - Me at the zoo',
      notes: 'Testing real Phase 7 YouTube URL ingestion & pipeline'
    })
  });

  const ingestJson = await ingestRes.json() as any;
  if (ingestRes.status !== 201) {
    throw new Error(`Ingest failed (${ingestRes.status}): ${JSON.stringify(ingestJson)}`);
  }

  const project = ingestJson.project;
  const projectId = project.id;
  console.log('   Ingest succeeded!');
  console.log('   Project ID:', projectId);
  console.log('   Title:', project.title);
  console.log('   Source Type:', project.source_type);
  console.log('   Status:', project.video_status);
  console.log('   R2 Key:', project.source_url);
  console.log('   Metadata:', JSON.stringify(project.metadata));

  // Step 3: Trigger real processing pipeline (extract audio -> transcribe)
  console.log('\n3. [PROCESS] Starting processing pipeline for YouTube project...');
  const procRes = await fetch(`http://localhost:5000/api/projects/${projectId}/process`, {
    method: 'POST',
    headers: authHeaders
  });
  const procJson = await procRes.json() as any;
  if (procRes.status !== 200 && procRes.status !== 202) {
    throw new Error(`Start processing failed: ${JSON.stringify(procJson)}`);
  }
  console.log('   Processing initiated successfully.');

  // Step 4: Poll until project reaches transcribed status
  console.log('\n4. [POLL] Awaiting transcription completion...');
  let pollStatus = '';
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pCheck = await fetch(`http://localhost:5000/api/projects/${projectId}`, { headers: authHeaders });
    const pJson = await pCheck.json() as any;
    pollStatus = pJson.project.video_status;
    console.log('   Current project status:', pollStatus);
    if (pollStatus === 'transcribed' || pollStatus === 'failed') break;
  }
  if (pollStatus !== 'transcribed') throw new Error('Project failed to reach transcribed status. Status: ' + pollStatus);
  console.log('   Transcription completed!');

  // Step 5: Verify Transcripts
  console.log('\n5. [TRANSCRIPT] Fetching transcripts...');
  const transRes = await fetch(`http://localhost:5000/api/projects/${projectId}/transcript`, {
    headers: authHeaders
  });
  const transJson = await transRes.json() as any;
  console.log('   Transcript text snippet:', transJson.transcript.transcript_text.slice(0, 100));
  console.log('   Segments count:', transJson.transcript.segments.length);

  // Step 6: Generate AI Content Kit for all 6 platforms
  console.log('\n6. [CONTENT KIT] Generating AI Content Kit for 6 social platforms...');
  const genRes = await fetch(`http://localhost:5000/api/projects/${projectId}/generate-content`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({})
  });
  const genJson = await genRes.json() as any;
  if (genRes.status !== 200) throw new Error('AI content generation failed: ' + JSON.stringify(genJson));
  console.log('   Generated outputs count:', genJson.outputs.length);
  const platforms = [...new Set(genJson.outputs.map((o: any) => o.platform))];
  console.log('   Platforms generated:', platforms.sort().join(', '));

  // Step 7: Analyze Clips (Phase 10)
  console.log('\n7. [AI CLIP FINDER] Analyzing transcript for clip candidates...');
  const analyzeClipsRes = await fetch(`http://localhost:5000/api/projects/${projectId}/analyze-clips`, {
    method: 'POST',
    headers: authHeaders,
  });
  const analyzeClipsJson = await analyzeClipsRes.json() as any;
  const candidates = analyzeClipsJson.candidates || [];
  console.log('   Clip candidates returned:', candidates.length);
  if (!candidates.length) throw new Error('No clip candidates returned');
  const candidate = candidates[0];
  console.log('   Candidate chosen:', candidate.title, 'Duration:', candidate.duration_seconds + 's', 'Range:', candidate.start_seconds + 's -> ' + candidate.end_seconds + 's');

  // Step 8: Create Clip record
  console.log('\n8. [CREATE CLIP] Creating clip record with candidate...');
  const createClipRes = await fetch(`http://localhost:5000/api/projects/${projectId}/clips`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      candidateId: candidate.id,
      aspectRatio: '9:16',
      captionStyle: 'bold',
      captionEnabled: true
    })
  });
  const createClipJson = await createClipRes.json() as any;
  if (createClipRes.status !== 201 && createClipRes.status !== 202) throw new Error('Create clip failed: ' + JSON.stringify(createClipJson));
  const clip = createClipJson.clip;
  console.log('   Clip created with ID:', clip.id, 'Initial status:', clip.render_status);

  // Step 9: Render Clip with Smart AI Auto-Reframe (Phase 6 & 11)
  console.log('\n9. [RENDER CLIP & SMART REFRAME] Polling/triggering real FFmpeg render with Smart Reframe...');
  if (clip.render_status !== 'queued' && clip.render_status !== 'processing') {
    const renderRes = await fetch(`http://localhost:5000/api/clips/${clip.id}/render`, {
      method: 'POST',
      headers: authHeaders
    });
    const renderJson = await renderRes.json() as any;
    console.log('   Render triggered:', renderJson.message || 'Queued');
  }

  let clipStatus = '';
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const cCheck = await fetch(`http://localhost:5000/api/clips/${clip.id}`, { headers: authHeaders });
    const cJson = await cCheck.json() as any;
    clipStatus = cJson.clip.render_status;
    console.log('   Current render status:', clipStatus);
    if (clipStatus === 'ready' || clipStatus === 'completed' || clipStatus === 'failed') {
      if (cJson.clip.reframe_mode) {
        console.log('   Smart Reframe mode applied:', cJson.clip.reframe_mode);
      }
      break;
    }
  }
  if (clipStatus !== 'ready' && clipStatus !== 'completed') throw new Error('Clip rendering failed. Status: ' + clipStatus);
  console.log('   Clip render completed and 9:16 video uploaded to Cloudflare R2!');

  // Step 10: Presigned Playback Verification
  console.log('\n10. [PLAYBACK] Checking pre-signed playback URL from Cloudflare R2...');
  const previewRes = await fetch(`http://localhost:5000/api/clips/${clip.id}/preview-url`, { headers: authHeaders });
  const previewJson = await previewRes.json() as any;
  if (previewRes.status !== 200 || !previewJson.signedUrl) throw new Error('Preview URL failed: ' + JSON.stringify(previewJson));
  console.log('    Signed R2 URL:', new URL(previewJson.signedUrl).hostname);

  const probeMedia = await fetch(previewJson.signedUrl, { method: 'GET', headers: { 'Range': 'bytes=0-1024' } });
  console.log('    R2 Streaming check HTTP status:', probeMedia.status, 'Content-Type:', probeMedia.headers.get('content-type'));
  if (!probeMedia.ok && probeMedia.status !== 206) throw new Error('Signed clip URL probe failed: ' + probeMedia.status);

  console.log('\n========================================================================');
  console.log('🎉 PHASE 7 REAL YOUTUBE PIPELINE E2E FULLY VERIFIED & CONFIRMED WORKING!');
  console.log('========================================================================\n');
}

runYouTubeSmokeTest().then(() => process.exit(0)).catch(e => {
  console.error('\n❌ REAL YOUTUBE SMOKE TEST FAILED:', e);
  process.exit(1);
});

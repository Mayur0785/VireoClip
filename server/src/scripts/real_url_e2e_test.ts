import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import fs from 'node:fs';

async function runUrlE2ETest() {
  console.log('=== REAL URL INGESTION END-TO-END VERIFICATION ===\n');

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
  console.log('1. [AUTH] Authenticated as real test user:', userId);

  const authHeaders = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  // Step 2: First test failure cases:
  console.log('2. [SECURITY] Testing SSRF rejection for localhost...');
  const ssrfRes = await fetch('http://localhost:5000/api/projects/ingest-url', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ url: 'http://localhost:5000/test.mp4' })
  });
  const ssrfJson = await ssrfRes.json() as any;
  console.log('   SSRF response status:', ssrfRes.status, 'code:', ssrfJson.code);
  if (ssrfRes.status !== 400 || ssrfJson.code !== 'SSRF_BLOCKED') {
    throw new Error('Expected SSRF_BLOCKED for localhost');
  }

  console.log('3. [SECURITY] Testing protocol rejection for file://...');
  const protoRes = await fetch('http://localhost:5000/api/projects/ingest-url', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ url: 'file:///etc/passwd' })
  });
  const protoJson = await protoRes.json() as any;
  console.log('   Protocol response status:', protoRes.status, 'code:', protoJson.code);
  if (protoRes.status !== 400 || protoJson.code !== 'UNSUPPORTED_PROTOCOL') {
    throw new Error('Expected UNSUPPORTED_PROTOCOL for file://');
  }

  // Step 3: Now ingest real public video URL:
  // Using public media test video
  const realPublicUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
  console.log('4. [URL INGESTION] Ingesting real public video URL:', realPublicUrl);

  const ingestRes = await fetch('http://localhost:5000/api/projects/ingest-url', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      url: realPublicUrl,
      title: 'Real URL Ingestion Test - For Bigger Blazes',
      notes: 'Testing Phase 5 server-side ingestion and pipeline reuse'
    })
  });
  const ingestJson = await ingestRes.json() as any;
  if (ingestRes.status !== 201) {
    throw new Error('URL Ingestion failed: ' + JSON.stringify(ingestJson));
  }

  const project = ingestJson.project;
  const projectId = project.id;
  console.log('   Ingestion Succeeded! Project ID:', projectId);
  console.log('   Project Status:', project.video_status);
  console.log('   Source Type:', project.source_type);
  console.log('   R2 Source Key:', project.source_url);
  console.log('   File Size:', (project.file_size / (1024 * 1024)).toFixed(2), 'MB');

  // Step 4: Run existing processing pipeline on the newly ingested project
  console.log('5. [PIPELINE] Starting processing pipeline on ingested project...');
  const procRes = await fetch(`http://localhost:5000/api/projects/${projectId}/process`, {
    method: 'POST',
    headers: authHeaders
  });
  const procJson = await procRes.json() as any;
  if (procRes.status !== 200 && procRes.status !== 202) {
    throw new Error('Process failed: ' + JSON.stringify(procJson));
  }
  console.log('   Pipeline initiated:', procJson.message);

  // Poll until transcribed
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
  console.log('5. [PROCESSED] Successfully reached transcribed status!');

  // Step 5: Fetch transcript
  const transRes = await fetch(`http://localhost:5000/api/projects/${projectId}/transcript`, { headers: authHeaders });
  const transJson = await transRes.json() as any;
  console.log('6. [TRANSCRIPT] Characters:', transJson.transcript.transcript_text.length, 'Segments:', transJson.transcript.segments.length);

  // Step 6: Generate AI content kit across all 6 platforms
  console.log('7. [AI CONTENT] Generating content for all 6 social platforms...');
  const genRes = await fetch(`http://localhost:5000/api/projects/${projectId}/generate-content`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({})
  });
  const genJson = await genRes.json() as any;
  if (genRes.status !== 200) throw new Error('AI content generation failed: ' + JSON.stringify(genJson));
  console.log('   Generated outputs count:', genJson.outputs.length);

  // Step 7: Analyze clips
  console.log('8. [CLIP INTELLIGENCE] Analyzing clip candidates from transcript...');
  const clipRes = await fetch(`http://localhost:5000/api/projects/${projectId}/analyze-clips`, {
    method: 'POST',
    headers: authHeaders
  });
  const clipJson = await clipRes.json() as any;
  const candidates = clipJson.candidates || [];
  console.log('   Clip candidates detected:', candidates.length);
  if (!candidates.length) throw new Error('No clip candidates returned');
  const candidate = candidates[0];
  console.log('   Candidate:', candidate.title, 'Score:', candidate.engagement_score, 'Range:', candidate.start_seconds + 's -> ' + candidate.end_seconds + 's');

  // Step 8: Render clip
  console.log('9. [RENDER CLIP] Creating and rendering clip...');
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
  const clip = createClipJson.clip;

  // Poll until rendered
  let clipStatus = '';
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const cCheck = await fetch(`http://localhost:5000/api/clips/${clip.id}`, { headers: authHeaders });
    const cJson = await cCheck.json() as any;
    clipStatus = cJson.clip.render_status;
    console.log('   Current render status:', clipStatus);
    if (clipStatus === 'ready' || clipStatus === 'completed' || clipStatus === 'failed') break;
  }
  if (clipStatus !== 'ready' && clipStatus !== 'completed') throw new Error('Clip rendering failed. Status: ' + clipStatus);
  console.log('9. [RENDER COMPLETED] Rendered vertical clip uploaded to R2!');

  // Step 9: Verify R2 signed playback URL
  const previewRes = await fetch(`http://localhost:5000/api/clips/${clip.id}/preview-url`, { headers: authHeaders });
  const previewJson = await previewRes.json() as any;
  console.log('10. [R2 PLAYBACK] Playback signed URL verified:', new URL(previewJson.signedUrl).hostname);
  const probeMedia = await fetch(previewJson.signedUrl, { method: 'GET', headers: { 'Range': 'bytes=0-1024' } });
  console.log('    R2 HTTP Status:', probeMedia.status, 'Range:', probeMedia.headers.get('content-range'));
  if (probeMedia.status !== 206) throw new Error('Range request failed: ' + probeMedia.status);

  console.log('\n======================================================');
  console.log('✅ PHASE 5 REAL URL INGESTION E2E VERIFIED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runUrlE2ETest().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ URL INGESTION TEST FAILED:', err);
  process.exit(1);
});

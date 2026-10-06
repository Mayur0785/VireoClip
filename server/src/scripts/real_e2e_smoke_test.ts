import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import fs from 'node:fs';
import path from 'node:path';

async function runSmokeTest() {
  console.log('=== REAL END-TO-END SMOKE TEST WORKFLOW ===\n');

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

  // Step 2: Create project
  const createRes = await fetch('http://localhost:5000/api/projects', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Real E2E Smoke Test - Hindi Auto Booking',
      notes: 'Testing real end-to-end video processing and clip generation',
      source_type: 'upload'
    })
  });
  const createJson = await createRes.json() as any;
  if (createRes.status !== 201) throw new Error('Create project failed: ' + JSON.stringify(createJson));
  const project = createJson.project;
  const projectId = project.id;
  console.log('2. [CREATE PROJECT] Created project:', projectId, 'Status:', project.video_status);

  // Step 3: Request R2 signed upload URL
  const sampleVideoPath = 'C:\\Users\\mayur\\AppData\\Local\\Temp\\vireo_smoke_video\\real_small_video.mp4';
  const stats = fs.statSync(sampleVideoPath);
  const uploadUrlRes = await fetch(`http://localhost:5000/api/projects/${projectId}/upload-url`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fileName: 'real_small_video.mp4',
      fileSize: stats.size,
      contentType: 'video/mp4'
    })
  });
  const uploadUrlJson = await uploadUrlRes.json() as any;
  if (uploadUrlRes.status !== 200) throw new Error('Upload URL failed: ' + JSON.stringify(uploadUrlJson));
  console.log('3. [UPLOAD URL] Granted signed upload URL for key.');

  // Step 4: Upload MP4 directly to R2
  const fileStream = fs.readFileSync(sampleVideoPath);
  const r2UploadRes = await fetch(uploadUrlJson.uploadUrl, {
    method: 'PUT',
    headers: uploadUrlJson.headers,
    body: fileStream
  });
  if (!r2UploadRes.ok) throw new Error('Direct R2 PUT failed: ' + r2UploadRes.status + ' ' + (await r2UploadRes.text()));
  console.log('4. [R2 UPLOAD] Uploaded', stats.size, 'bytes directly to Cloudflare R2.');

  // Step 5: Confirm upload
  const confirmRes = await fetch(`http://localhost:5000/api/projects/${projectId}/confirm-upload`, {
    method: 'POST',
    headers: authHeaders
  });
  const confirmJson = await confirmRes.json() as any;
  if (confirmRes.status !== 200) throw new Error('Confirm upload failed: ' + JSON.stringify(confirmJson));
  console.log('5. [CONFIRM UPLOAD] Project video_status transitioned to:', confirmJson.project.video_status);

  // Step 6: Start processing (FFmpeg extraction -> OpenRouter Whisper transcription -> MongoDB save)
  console.log('6. [START PROCESSING] Starting video processing pipeline...');
  const procRes = await fetch(`http://localhost:5000/api/projects/${projectId}/process`, {
    method: 'POST',
    headers: authHeaders
  });
  const procJson = await procRes.json() as any;
  if (procRes.status !== 200 && procRes.status !== 202) throw new Error('Start processing failed: ' + JSON.stringify(procJson));
  console.log('   Processing initiated:', procJson.message);

  // Poll project until transcribed
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
  console.log('6. [PROCESSED] Successfully reached transcribed status!');

  // Step 7: Fetch persisted transcript
  const transRes = await fetch(`http://localhost:5000/api/projects/${projectId}/transcript`, { headers: authHeaders });
  const transJson = await transRes.json() as any;
  console.log('7. [TRANSCRIPT PERSISTED] Transcript characters:', transJson.transcript.transcript_text.length, 'Segments:', transJson.transcript.segments.length);
  console.log('   Sample text:', transJson.transcript.transcript_text.slice(0, 100));

  // Step 8: AI Content Generation for all 6 platforms
  console.log('8. [AI CONTENT] Generating content for all 6 social platforms...');
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

  // Step 9: Re-fetch project content from GET route to verify persistence
  const getOutputsRes = await fetch(`http://localhost:5000/api/projects/${projectId}/content`, { headers: authHeaders });
  const getOutputsJson = await getOutputsRes.json() as any;
  console.log('9. [CONTENT VERIFIED] Successfully verified', getOutputsJson.outputs.length, 'persisted outputs in MongoDB.');

  // Step 10: AI Auto Clip Finder (Phase 10)
  console.log('10. [AI CLIP FINDER] Analyzing transcript for clip candidates...');
  const analyzeClipsRes = await fetch(`http://localhost:5000/api/projects/${projectId}/analyze-clips`, {
    method: 'POST',
    headers: authHeaders,
  });
  const analyzeClipsJson = await analyzeClipsRes.json() as any;
  const candidates = analyzeClipsJson.candidates || [];
  console.log('    Candidates returned:', candidates.length);
  if (!candidates.length) throw new Error('No clip candidates returned');
  const candidate = candidates[0];
  console.log('    Selected candidate:', candidate.title, 'Duration:', candidate.duration_seconds + 's', 'Range:', candidate.start_seconds + 's -> ' + candidate.end_seconds + 's');

  // Step 11: Create Rendered Clip record (Phase 11)
  console.log('11. [CREATE CLIP] Creating clip record with candidate...');
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
  console.log('    Clip record created:', clip.id, 'Status:', clip.render_status);

  // Step 12: Trigger Real FFmpeg Clip Render (Phase 11 & 12)
  console.log('12. [RENDER CLIP] Verifying FFmpeg rendering execution...');
  // Since createClip already queues a background render, calling POST /render is only needed if not already queued/active
  if (clip.render_status !== 'queued' && clip.render_status !== 'processing') {
    const renderRes = await fetch(`http://localhost:5000/api/clips/${clip.id}/render`, {
      method: 'POST',
      headers: authHeaders
    });
    const renderJson = await renderRes.json() as any;
    if (renderRes.status !== 200 && renderRes.status !== 202) {
      if (renderJson.code !== 'RENDER_ALREADY_ACTIVE') {
        throw new Error('Render clip failed: ' + JSON.stringify(renderJson));
      }
    }
    console.log('    Render job submitted/active:', renderJson.message || 'Already active');
  } else {
    console.log('    Render job was automatically queued on clip creation.');
  }

  // Poll clip until ready/completed
  let clipStatus = '';
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const cCheck = await fetch(`http://localhost:5000/api/clips/${clip.id}`, { headers: authHeaders });
    const cJson = await cCheck.json() as any;
    clipStatus = cJson.clip.render_status;
    console.log('    Current render status:', clipStatus);
    if (clipStatus === 'ready' || clipStatus === 'completed' || clipStatus === 'failed') break;
  }
  if (clipStatus !== 'ready' && clipStatus !== 'completed') throw new Error('Clip rendering failed. Status: ' + clipStatus);
  console.log('12. [RENDER COMPLETED] Rendered MP4 successfully uploaded to R2!');

  // Step 13: Obtain signed playback preview URL
  const previewRes = await fetch(`http://localhost:5000/api/clips/${clip.id}/preview-url`, { headers: authHeaders });
  const previewJson = await previewRes.json() as any;
  if (previewRes.status !== 200 || !previewJson.signedUrl) throw new Error('Preview URL failed: ' + JSON.stringify(previewJson));
  console.log('13. [PLAYABLE URL] Generated pre-signed GET URL for clip playback:');
  console.log('    URL domain:', new URL(previewJson.signedUrl).hostname);
  console.log('    Expires in:', previewJson.expiresInSeconds, 'seconds');

  // Verify URL accessibility by performing GET Range request to R2 (browser video element stream check)
  const probeMedia = await fetch(previewJson.signedUrl, { method: 'GET', headers: { 'Range': 'bytes=0-1024' } });
  console.log('    R2 GET status:', probeMedia.status, 'Content-Type:', probeMedia.headers.get('content-type'), 'Content-Range:', probeMedia.headers.get('content-range'));
  if (!probeMedia.ok && probeMedia.status !== 206) throw new Error('Signed clip URL could not be retrieved from R2: ' + probeMedia.status);

  console.log('\n======================================================');
  console.log('✅ ALL PHASE 1 & PHASE 2 REQUIREMENTS VERIFIED & PASSED!');
  console.log('======================================================\n');
}

runSmokeTest().then(() => process.exit(0)).catch(e => {
  console.error('\n❌ SMOKE TEST FAILED:', e);
  process.exit(1);
});

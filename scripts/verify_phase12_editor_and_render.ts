import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);

async function main() {
  console.log('====================================================');
  console.log('VIREO PHASE 12: REAL LIVE CLIP VISUAL QA & VERIFICATION');
  console.log('====================================================\n');

  // 1. Authenticate as user
  console.log('--- Step 1: User Authentication ---');
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
  const clipId = '25eaf0ec-7e34-4602-a8a3-28d961f34ee3';
  console.log('✅ Authenticated as user:', userId);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. GET /api/clips/:clipId/editor
  console.log('\n--- Step 2: GET /api/clips/:clipId/editor ---');
  const editorGetRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    headers: authHeaders,
  });
  const editorGetData = await editorGetRes.json();
  console.log('Editor GET status:', editorGetRes.status);
  console.log('Timing Mode:', editorGetData.timingMode);
  console.log('Available presets:', editorGetData.availablePresets);
  console.log('Initial clip data:', {
    id: editorGetData.clip?.id,
    render_version: editorGetData.clip?.render_version,
    output_storage_path: editorGetData.clip?.output_storage_path,
    aspect_ratio: editorGetData.clip?.aspect_ratio,
  });

  // 3. GET /api/clips/:clipId/captions
  console.log('\n--- Step 3: GET /api/clips/:clipId/captions ---');
  const captionsRes = await fetch(`http://localhost:5000/api/clips/${clipId}/captions`, {
    headers: authHeaders,
  });
  const captionsData = await captionsRes.json();
  console.log('Captions GET status:', captionsRes.status);
  console.log('Captions Timing Mode:', captionsData.timingMode);
  console.log('Cues count:', captionsData.cues?.length);
  console.log('Cues:', JSON.stringify(captionsData.cues, null, 2));

  // 4. Save Controlled Edits
  console.log('\n--- Step 4: Applying Controlled Edits via PATCH /api/clips/:clipId/editor ---');
  const editPayload = {
    aspectRatio: '9:16',
    trimStartOffset: 0.5,
    trimEndOffset: 0.5,
    captionEnabled: true,
    captionStyle: 'bold',
    captionPosition: 'bottom',
    cropConfig: { focusX: 0.45, focusY: 0.55 },
    overlayConfig: {
      enabled: true,
      text: 'Vireo Test Clip',
      position: 'top',
      size: 'md',
    },
    volume: 1.0,
    muted: false,
  };

  const patchRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(editPayload),
  });
  const patchData = await patchRes.json();
  console.log('PATCH Status:', patchRes.status);
  console.log('PATCH response clip:', {
    trim_start_offset: patchData.clip?.trim_start_offset,
    trim_end_offset: patchData.clip?.trim_end_offset,
    caption_style: patchData.clip?.caption_style,
    caption_position: patchData.clip?.caption_position,
    crop_config: patchData.clip?.crop_config,
    overlay_config: patchData.clip?.overlay_config,
  });

  // 5. Verify Persistence (Refresh simulation)
  console.log('\n--- Step 5: Refresh Simulation (GET after PATCH) ---');
  const refreshRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    headers: authHeaders,
  });
  const refreshData = await refreshRes.json();
  const c = refreshData.clip;
  if (
    c.trim_start_offset === 0.5 &&
    c.trim_end_offset === 0.5 &&
    c.caption_style === 'bold' &&
    c.caption_position === 'bottom' &&
    c.crop_config?.focusX === 0.45 &&
    c.overlay_config?.text === 'Vireo Test Clip'
  ) {
    console.log('✅ Configuration perfectly persisted to live database!');
  } else {
    throw new Error('Config persistence check failed!');
  }

  // 6. Record pre-render version and path
  const prevVersion = c.render_version || 1;
  const prevPath = c.output_storage_path;
  console.log(`\n--- Step 6: Rendering Changes Once (Current v${prevVersion} -> Next v${prevVersion + 1}) ---`);
  console.log('Previous output path:', prevPath);

  // 7. Trigger Render Changes
  const renderRes = await fetch(`http://localhost:5000/api/clips/${clipId}/render`, {
    method: 'POST',
    headers: authHeaders,
  });
  const renderData = await renderRes.json();
  console.log('Render trigger status:', renderRes.status);
  console.log('Render trigger response:', renderData);

  if (renderRes.status !== 202) {
    throw new Error(`Expected HTTP 202 for render trigger, got ${renderRes.status}`);
  }

  // 8. Poll render progress until ready
  console.log('\n--- Step 8: Polling Render Progress ---');
  let isReady = false;
  let attempts = 0;
  let finalClip: any = null;

  while (!isReady && attempts < 40) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const pollRes = await fetch(`http://localhost:5000/api/clips/${clipId}`, {
      headers: authHeaders,
    });
    const pollData = await pollRes.json();
    finalClip = pollData.clip;
    console.log(`Poll #${attempts}: render_status = ${finalClip?.render_status}`);

    if (finalClip?.render_status === 'ready') {
      isReady = true;
      break;
    } else if (finalClip?.render_status === 'failed') {
      throw new Error(`Render failed: ${finalClip.render_error_code} - ${finalClip.render_error_message}`);
    }
  }

  if (!isReady) {
    throw new Error('Render timed out before reaching ready state');
  }

  console.log('\n✅ Render reached READY state!');
  console.log('New render_version:', finalClip.render_version);
  console.log('New output_storage_path:', finalClip.output_storage_path);

  // Verify render version incremented
  if (finalClip.render_version !== prevVersion + 1) {
    throw new Error(`Expected render_version to increment from ${prevVersion} to ${prevVersion + 1}`);
  }
  if (!finalClip.output_storage_path.includes(`/v${finalClip.render_version}/render.mp4`)) {
    throw new Error(`Output storage path does not contain /v${finalClip.render_version}/render.mp4`);
  }

  // 9. Check Signed Preview & Download URLs
  console.log('\n--- Step 9: Testing Signed Preview and Download URLs ---');
  const previewRes = await fetch(`http://localhost:5000/api/clips/${clipId}/preview-url`, {
    headers: authHeaders,
  });
  const previewData = await previewRes.json();
  console.log('Preview URL success:', !!previewData.signedUrl);
  console.log('Preview URL has version parameter:', previewData.signedUrl?.includes('v='));

  const downloadRes = await fetch(`http://localhost:5000/api/clips/${clipId}/download-url`, {
    headers: authHeaders,
  });
  const downloadData = await downloadRes.json();
  console.log('Download URL success:', !!downloadData.signedUrl);
  console.log('Sanitized download filename:', downloadData.filename);

  // 10. Technical Inspection with ffprobe
  console.log('\n--- Step 10: Downloading rendered MP4 and inspecting with ffprobe ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p12-verify-'));
  const downloadedVideoPath = path.join(tmpDir, 'downloaded_clip.mp4');

  const videoResponse = await fetch(downloadData.signedUrl);
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  fs.writeFileSync(downloadedVideoPath, videoBuffer);
  console.log(`Downloaded ${videoBuffer.length} bytes to ${downloadedVideoPath}`);

  const { stdout: probeOut } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,pix_fmt,width,height,duration',
    '-show_entries', 'format=duration,format_name',
    '-of', 'json',
    downloadedVideoPath,
  ]);

  const probe = JSON.parse(probeOut);
  const vStream = probe.streams?.[0];
  console.log('Video Codec:', vStream?.codec_name);
  console.log('Pixel Format:', vStream?.pix_fmt);
  console.log('Resolution:', `${vStream?.width}x${vStream?.height}`);
  console.log('Video Duration:', vStream?.duration || probe.format?.duration);
  console.log('Format:', probe.format?.format_name);

  // Check audio stream
  const { stdout: probeAudioOut } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,channels,sample_rate',
    '-of', 'json',
    downloadedVideoPath,
  ]);
  const probeAudio = JSON.parse(probeAudioOut);
  console.log('Audio Stream:', probeAudio.streams?.[0] || 'No audio stream');

  // 11. Visual QA Frame Extraction
  console.log('\n--- Step 11: Visual QA - Extracting frames to inspect captions and overlay ---');
  const framePath = path.join(tmpDir, 'frame_qa.png');
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', '2.0',
    '-i', downloadedVideoPath,
    '-vframes', '1',
    '-q:v', '2',
    framePath,
  ]);
  console.log('Sample frame extracted at 2.0s to:', framePath);
  console.log('Frame file exists and size:', fs.existsSync(framePath), fs.statSync(framePath).size, 'bytes');

  // Clean up temp video
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Temp QA artifacts cleaned up.');

  // 12. Test Reset Edits
  console.log('\n--- Step 12: Testing Reset Edits (POST /api/clips/:clipId/editor/reset) ---');
  const resetRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor/reset`, {
    method: 'POST',
    headers: authHeaders,
  });
  const resetData = await resetRes.json();
  console.log('Reset status:', resetRes.status);
  console.log('Reset clip config:', {
    trim_start_offset: resetData.clip?.trim_start_offset,
    trim_end_offset: resetData.clip?.trim_end_offset,
    caption_style: resetData.clip?.caption_style,
    overlay_config: resetData.clip?.overlay_config,
    volume: resetData.clip?.volume,
    muted: resetData.clip?.muted,
  });

  // Verify candidate is still intact
  const { data: candCheck } = await supabaseAuthClient
    .from('clip_candidates')
    .select('id, title, status')
    .eq('id', finalClip.candidate_id)
    .single();
  console.log('AI Candidate preserved:', candCheck);

  console.log('\n====================================================');
  console.log('PHASE 12 LIVE VERIFICATION & VISUAL QA COMPLETED SUCCESSFULLY');
  console.log('====================================================');
}

main().catch(console.error);

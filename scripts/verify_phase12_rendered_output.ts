// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
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
  console.log('VIREO PHASE 12: TECHNICAL & VISUAL QA OF RENDERED v2 CLIP');
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

  // 2. Fetch Clip details
  console.log('\n--- Step 2: Fetch Clip Details ---');
  const clipRes = await fetch(`http://localhost:5000/api/clips/${clipId}`, {
    headers: authHeaders,
  });
  const { clip } = await clipRes.json();
  console.log('Clip ID:', clip.id);
  console.log('Render Status:', clip.render_status);
  console.log('Render Version:', clip.render_version);
  console.log('Output Storage Path:', clip.output_storage_path);
  console.log('Aspect Ratio:', clip.aspect_ratio);
  console.log('Trim Start Offset:', clip.trim_start_offset);
  console.log('Trim End Offset:', clip.trim_end_offset);
  console.log('Caption Style:', clip.caption_style);
  console.log('Caption Position:', clip.caption_position);
  console.log('Overlay Config:', clip.overlay_config);
  console.log('Crop Config:', clip.crop_config);

  // 3. Signed Preview & Download URLs
  console.log('\n--- Step 3: Signed Preview & Download URLs ---');
  const previewRes = await fetch(`http://localhost:5000/api/clips/${clipId}/preview-url`, {
    headers: authHeaders,
  });
  const previewData = await previewRes.json();
  console.log('Preview URL status:', previewRes.status);
  console.log('Signed Preview URL exists:', !!previewData.signedUrl);
  console.log('Preview URL token included:', previewData.signedUrl?.includes('token='));

  const downloadRes = await fetch(`http://localhost:5000/api/clips/${clipId}/download-url`, {
    headers: authHeaders,
  });
  const downloadData = await downloadRes.json();
  console.log('Download URL status:', downloadRes.status);
  console.log('Signed Download URL exists:', !!downloadData.signedUrl);
  console.log('Sanitized download filename:', downloadData.filename);

  // 4. Download and Inspect with ffprobe
  console.log('\n--- Step 4: Downloading rendered MP4 and inspecting with ffprobe ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p12-v2-qa-'));
  const downloadedVideoPath = path.join(tmpDir, 'downloaded_clip.mp4');

  const videoResponse = await fetch(downloadData.signedUrl);
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  fs.writeFileSync(downloadedVideoPath, videoBuffer);
  console.log(`Downloaded ${videoBuffer.length} bytes to ${downloadedVideoPath}`);

  const { stdout: probeOut } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,pix_fmt,width,height,duration',
    '-show_entries', 'format=duration,format_name,size',
    '-of', 'json',
    downloadedVideoPath,
  ]);

  const probe = JSON.parse(probeOut);
  const vStream = probe.streams?.[0];
  console.log('--- Technical Stream Properties ---');
  console.log('Container Format:', probe.format?.format_name);
  console.log('Video Codec:', vStream?.codec_name);
  console.log('Pixel Format:', vStream?.pix_fmt);
  console.log('Resolution:', `${vStream?.width}x${vStream?.height}`);
  console.log('Duration:', `${vStream?.duration || probe.format?.duration}s`);
  console.log('File Size:', `${probe.format?.size} bytes`);

  // Audio stream
  const { stdout: probeAudioOut } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,channels,sample_rate',
    '-of', 'json',
    downloadedVideoPath,
  ]);
  const probeAudio = JSON.parse(probeAudioOut);
  console.log('Audio Stream:', probeAudio.streams?.[0] || 'No audio stream');

  // 5. Visual QA Frame Extraction
  console.log('\n--- Step 5: Visual QA Frame Extraction ---');
  const frame1Path = path.join(tmpDir, 'frame_1s.png');
  const frame2Path = path.join(tmpDir, 'frame_2s.png');

  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', '1.0',
    '-i', downloadedVideoPath,
    '-vframes', '1',
    '-q:v', '2',
    frame1Path,
  ]);
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', '2.0',
    '-i', downloadedVideoPath,
    '-vframes', '1',
    '-q:v', '2',
    frame2Path,
  ]);

  console.log('Frame at 1.0s:', fs.existsSync(frame1Path), `${fs.statSync(frame1Path).size} bytes`);
  console.log('Frame at 2.0s:', fs.existsSync(frame2Path), `${fs.statSync(frame2Path).size} bytes`);

  // Inspect pixel bounds and aspect ratio
  const { stdout: frameProbe } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    frame1Path,
  ]);
  const fProbe = JSON.parse(frameProbe);
  console.log('Rendered frame dimensions:', `${fProbe.streams[0].width}x${fProbe.streams[0].height}`);

  // 6. Check Storage cleanup (ensure previous v1 is removed, v2 is present)
  console.log('\n--- Step 6: Verifying Versioned Storage & Cleanup ---');
  const { data: v2Obj, error: v2Err } = await supabaseAuthClient.storage
    .from('clips')
    .list(`${userId}/${clip.project_id}/${clipId}/v2`);
  console.log('v2 folder contents:', v2Obj?.map((o) => o.name));

  const { data: v1Obj, error: v1Err } = await supabaseAuthClient.storage
    .from('clips')
    .list(`${userId}/${clip.project_id}/${clipId}`);
  console.log('clip folder items:', v1Obj?.map((o) => o.name));

  // 7. Test Reset Edits
  console.log('\n--- Step 7: Testing Reset Edits (POST /api/clips/:clipId/editor/reset) ---');
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

  // 8. Confirm AI Candidate and Project are completely unaffected
  const { data: candCheck } = await supabaseAuthClient
    .from('clip_candidates')
    .select('id, title, status, start_seconds, end_seconds')
    .eq('id', clip.candidate_id)
    .single();
  console.log('Candidate preserved:', candCheck);

  const { data: projCheck } = await supabaseAuthClient
    .from('projects')
    .select('id, title, video_status')
    .eq('id', clip.project_id)
    .single();
  console.log('Project preserved:', projCheck);

  // Clean up temp
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\n✅ Technical & Visual QA completed cleanly!');
}

main().catch(console.error);

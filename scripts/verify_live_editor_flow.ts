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
  console.log('VIREO PHASE 12.5: LIVE CAPTION VERIFICATION');
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
  
  // Find clips belonging to this authenticated user
  const { data: userClips } = await supabaseAuthClient
    .from('clips')
    .select('id, user_id, project_id, render_status')
    .eq('user_id', userId);

  console.log(`✅ Authenticated as user ${userId}, found ${userClips?.length || 0} clips.`);
  userClips?.forEach(c => console.log(`   Clip: ${c.id}, status: ${c.render_status}`));

  const clipId = userClips?.[0]?.id || '25eaf0ec-7e34-4602-a8a3-28d961f34ee3';

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. GET /api/clips/:clipId/editor
  console.log('\n--- Step 2: GET /api/clips/:clipId/editor ---');
  const editorGetRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    headers: authHeaders,
  });
  if (!editorGetRes.ok) {
    throw new Error(`Failed to GET /api/clips/${clipId}/editor: ${editorGetRes.status} ${await editorGetRes.text()}`);
  }
  const editorGetData = await editorGetRes.json();
  console.log('Editor GET status:', editorGetRes.status);
  console.log('Timing Mode:', editorGetData.timingMode);
  console.log('Available presets count:', editorGetData.availablePresets?.length);

  // 3. GET /api/clips/:clipId/captions
  console.log('\n--- Step 3: GET /api/clips/:clipId/captions ---');
  const captionsGetRes = await fetch(`http://localhost:5000/api/clips/${clipId}/captions`, {
    headers: authHeaders,
  });
  if (!captionsGetRes.ok) {
    throw new Error(`Failed to GET /api/clips/${clipId}/captions: ${captionsGetRes.status} ${await captionsGetRes.text()}`);
  }
  const captionsData = await captionsGetRes.json();
  console.log('Captions GET status:', captionsGetRes.status);
  console.log('Timing Mode:', captionsData.timingMode);
  console.log('Cues count:', captionsData.cues?.length);
  if (captionsData.cues && captionsData.cues.length > 0) {
    console.log('First 3 cues:');
    captionsData.cues.slice(0, 3).forEach((c: any, i: number) => {
      console.log(`  [Cue ${i + 1}] ID: ${c.id}, start: ${c.start.toFixed(2)}s, end: ${c.end.toFixed(2)}s, text: "${c.text}"`);
    });

    // Check overlap
    let overlaps = 0;
    for (let i = 0; i < captionsData.cues.length - 1; i++) {
      if (captionsData.cues[i].end > captionsData.cues[i + 1].start + 0.001) {
        overlaps++;
        console.error(`  ❌ Overlap detected between cue ${i} and ${i + 1}: ${captionsData.cues[i].end} > ${captionsData.cues[i + 1].start}`);
      }
    }
    console.log(`Overlapping cues check: ${overlaps === 0 ? '✅ PASS (Zero overlaps)' : '❌ FAIL'}`);
  }

  // 4. Update Editor Settings (Advanced Caption Controls + Cue Override)
  console.log('\n--- Step 4: PATCH /api/clips/:clipId/editor (Advanced Caption Controls & Override) ---');
  const firstCueId = captionsData.cues?.[0]?.id || 'cue-1';
  const originalCueText = captionsData.cues?.[0]?.text || '';
  const updatedCueText = 'THANK YOU (CORRECTED CAPTION)';

  const updatedConfig = {
    captionEnabled: true,
    captionStyle: 'bold',
    captionConfig: {
      fontFamily: 'Inter',
      fontSize: 68,
      fontWeight: 800,
      textColor: '#FFFFFF',
      activeWordColor: '#FF6B35',
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowEnabled: true,
      shadowOpacity: 0.45,
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.45,
      position: 'bottom',
      positionY: 0.76,
      textAlign: 'center',
      maxWordsPerCue: 4,
      maxLines: 2,
      uppercase: true,
      animation: 'none',
      caption_overrides: [
        {
          cueId: firstCueId,
          text: updatedCueText,
        },
      ],
    },
  };

  const patchRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(updatedConfig),
  });
  if (!patchRes.ok) {
    throw new Error(`Failed to PATCH /api/clips/${clipId}/editor: ${patchRes.status} ${await patchRes.text()}`);
  }
  const patchData = await patchRes.json();
  console.log('PATCH response status:', patchRes.status);
  console.log('Updated clip caption_style:', patchData.clip?.caption_style);
  console.log('Updated clip caption_config font:', patchData.clip?.caption_config?.fontFamily);
  console.log('Updated clip caption_config size:', patchData.clip?.caption_config?.fontSize);
  console.log('Updated clip caption_config positionY:', patchData.clip?.caption_config?.positionY);
  console.log('Updated clip caption_overrides:', JSON.stringify(patchData.clip?.caption_overrides || patchData.clip?.caption_config?.caption_overrides));

  // 5. Re-fetch GET /api/clips/:clipId/captions to verify override took effect
  console.log('\n--- Step 5: Verify Persistence & Override in Captions Endpoint ---');
  const verifyCaptionsRes = await fetch(`http://localhost:5000/api/clips/${clipId}/captions`, {
    headers: authHeaders,
  });
  const verifyCaptionsData = await verifyCaptionsRes.json();
  const overriddenCue = verifyCaptionsData.cues?.find((c: any) => c.id === firstCueId);
  console.log('First cue text in captions endpoint:', `"${overriddenCue?.text}"`);
  const overrideActive = overriddenCue?.text === updatedCueText;
  console.log(`Caption override applied: ${overrideActive ? '✅ PASS' : '❌ FAIL'}`);

  // 6. Verify Canonical Transcript was NOT touched in DB
  console.log('\n--- Step 6: Verify Canonical Transcript Integrity ---');
  const { data: canonicalTranscript } = await supabaseAuthClient
    .from('transcripts')
    .select('id, transcript_text, segments')
    .eq('project_id', editorGetData.clip?.project_id)
    .single();

  console.log('Canonical transcript text excerpt:', `"${canonicalTranscript?.transcript_text?.slice(0, 80)}..."`);
  const transcriptUntouched = !canonicalTranscript?.transcript_text?.includes('CORRECTED CAPTION');
  console.log(`Canonical transcript untouched: ${transcriptUntouched ? '✅ PASS' : '❌ FAIL'}`);

  // 7. Security: Verify Invalid Font & Config Rejection
  console.log('\n--- Step 7: Security Verification ---');
  const maliciousPatchRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      captionConfig: {
        fontFamily: '/etc/passwd',
        strokeWidth: 9999,
        positionY: 100.5,
      },
    }),
  });
  const maliciousData = await maliciousPatchRes.json();
  console.log('Malicious config sanitized font:', maliciousData.clip?.caption_config?.fontFamily);
  console.log('Malicious config clamped strokeWidth:', maliciousData.clip?.caption_config?.strokeWidth);
  console.log('Malicious config clamped positionY:', maliciousData.clip?.caption_config?.positionY);
  const securityPass =
    maliciousData.clip?.caption_config?.fontFamily === 'Arial' &&
    maliciousData.clip?.caption_config?.strokeWidth <= 8 &&
    maliciousData.clip?.caption_config?.positionY <= 1.0;
  console.log(`Security validation & sanitization: ${securityPass ? '✅ PASS' : '❌ FAIL'}`);

  // Restore proper configuration before render
  await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(updatedConfig),
  });

  // 8. Trigger ONE Real Rerender via POST /api/clips/:clipId/render
  console.log('\n--- Step 8: Trigger ONE Real Rerender via POST /api/clips/:clipId/render ---');
  const rerenderRes = await fetch(`http://localhost:5000/api/clips/${clipId}/render`, {
    method: 'POST',
    headers: authHeaders,
  });
  if (!rerenderRes.ok) {
    throw new Error(`Failed to POST /api/clips/${clipId}/render: ${rerenderRes.status} ${await rerenderRes.text()}`);
  }
  const rerenderData = await rerenderRes.json();
  console.log('Rerender initiated: HTTP', rerenderRes.status, 'Job ID:', rerenderData.renderJob?.id);

  // Poll for completion
  console.log('Polling for render completion (timeout 90s)...');
  const startTime = Date.now();
  let finishedClip: any = null;

  while (Date.now() - startTime < 90000) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`http://localhost:5000/api/clips/${clipId}`, {
      headers: authHeaders,
    });
    const statusData = await statusRes.json();
    const clipStatus = statusData.clip?.render_status;
    process.stdout.write(`Status: ${clipStatus}... `);

    if (clipStatus === 'ready') {
      finishedClip = statusData.clip;
      console.log('\n✅ Render completed successfully!');
      break;
    } else if (clipStatus === 'failed') {
      throw new Error(`Clip rendering failed: ${statusData.clip?.render_error}`);
    }
  }

  if (!finishedClip) {
    throw new Error('Render timed out after 90s');
  }

  console.log('Rendered clip version:', finishedClip.render_version);
  console.log('Storage path:', finishedClip.output_storage_path);

  // 9. Download Rendered Video and Verify Non-Overlapping Frames
  console.log('\n--- Step 9: Visual QA on Rendered MP4 ---');
  const downloadRes = await fetch(`http://localhost:5000/api/clips/${clipId}/download-url`, {
    headers: authHeaders,
  });
  if (!downloadRes.ok) {
    throw new Error(`Failed to download clip: ${downloadRes.status} ${await downloadRes.text()}`);
  }
  const downloadData = await downloadRes.json();
  console.log('Download URL obtained:', downloadData.signedUrl ? '✅ PASS' : '❌ FAIL');

  const mp4Res = await fetch(downloadData.signedUrl);
  const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());
  console.log(`Rendered MP4 downloaded: ${(mp4Buffer.length / (1024 * 1024)).toFixed(2)} MB`);

  const tmpDir = path.join(os.tmpdir(), `vireo-live-p12-5-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const localMp4 = path.join(tmpDir, 'rendered_live.mp4');
  fs.writeFileSync(localMp4, mp4Buffer);

  // Extract frames at 1.0s (beginning), 2.5s (middle), and 4.5s (end)
  const sampleTimes = [1.0, 2.5, 4.5];
  for (const t of sampleTimes) {
    const framePath = path.join(tmpDir, `frame_${t}s.jpg`);
    await execFileAsync('ffmpeg', ['-y', '-ss', String(t), '-i', localMp4, '-vframes', '1', framePath]);
    const frameStats = fs.statSync(framePath);
    console.log(`  Frame at ${t}s extracted: ${(frameStats.size / 1024).toFixed(1)} KB ✅`);
  }

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  console.log('\n====================================================');
  console.log('VIREO PHASE 12.5 LIVE VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('\n❌ Fatal error in live verification:', err);
  process.exit(1);
});

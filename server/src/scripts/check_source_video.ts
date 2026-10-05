// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { supabaseAuthClient } from '../utils/supabase.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

async function main() {
  console.log('=== CHECKING CLIP 90294e88-13c1-463d-bbb3-111420a9274b SOURCE VIDEO ===\n');

  const { data: clip, error: clipErr } = await supabaseAuthClient
    .from('clips')
    .select('*')
    .eq('id', '90294e88-13c1-463d-bbb3-111420a9274b')
    .single();

  if (clipErr || !clip) {
    throw new Error(`Clip not found: ${clipErr?.message}`);
  }

  console.log('Clip start:', clip.start_seconds, 'end:', clip.end_seconds, 'duration:', clip.duration_seconds);
  console.log('Source storage path:', clip.source_storage_path);

  // Download signed URL from storage bucket 'videos'
  const { data: signData, error: signErr } = await supabaseAuthClient.storage
    .from('videos')
    .createSignedUrl(clip.source_storage_path, 3600);

  if (signErr || !signData?.signedUrl) {
    throw new Error(`Failed to sign source video URL: ${signErr?.message}`);
  }

  console.log('Signed URL obtained successfully.');

  // Check video streams using ffprobe
  await new Promise<void>((resolve, reject) => {
    ffmpeg.ffprobe(signData.signedUrl, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      console.log('Video dimensions:', `${videoStream?.width}x${videoStream?.height}`);
      console.log('Video codec:', videoStream?.codec_name, 'fps:', videoStream?.r_frame_rate);
      console.log('Audio codec:', audioStream?.codec_name, 'sample rate:', audioStream?.sample_rate);
      console.log('Duration:', metadata.format.duration, 'seconds');
      resolve();
    });
  });
}

main().catch(console.error);

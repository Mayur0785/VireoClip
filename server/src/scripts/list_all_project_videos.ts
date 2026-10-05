// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { supabaseAuthClient } from '../utils/supabase.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

async function main() {
  console.log('=== CHECKING ALL PROJECTS & VIDEO SOURCES ===\n');

  const { data: projects } = await supabaseAuthClient
    .from('projects')
    .select('id, user_id, title, source_url')
    .order('created_at', { ascending: false });

  for (const p of projects || []) {
    if (!p.source_url) continue;
    console.log(`\nProject: ${p.id} ("${p.title?.slice(0, 50)}...")`);
    console.log(`Source URL: ${p.source_url}`);

    try {
      const { data: signData } = await supabaseAuthClient.storage
        .from('videos')
        .createSignedUrl(p.source_url, 3600);

      if (signData?.signedUrl) {
        await new Promise<void>((resolve) => {
          ffmpeg.ffprobe(signData.signedUrl, (err, meta) => {
            if (err) {
              console.log('  ffprobe error:', err.message);
            } else {
              const v = meta.streams.find(s => s.codec_type === 'video');
              const aspect = (v?.width || 1) / (v?.height || 1);
              const isLandscape = aspect > 1.2;
              console.log(`  Dimensions: ${v?.width}x${v?.height} (Aspect ratio: ${aspect.toFixed(2)}, isLandscape: ${isLandscape})`);
              console.log(`  Duration: ${meta.format.duration}s`);
            }
            resolve();
          });
        });
      }
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }
}

main().catch(console.error);

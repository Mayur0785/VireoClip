// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function main() {
  const path = '1993677b-87c5-4865-af48-c21180bc46f2/827036a0-4017-453a-8138-499f7c16b49a/Camera_moves_toward_villa_exterior_202608181700.mp4';
  const { data, error } = await supabaseAuthClient.storage.from('videos').download(path);
  if (error) {
    console.error('Download error:', error);
  } else {
    const arrayBuffer = await data.arrayBuffer();
    console.log(`✅ File downloaded successfully from private storage: ${arrayBuffer.byteLength} bytes`);
  }
}

main().catch(console.error);

import { OpenRouterTranscriptionProvider } from '../server/src/services/transcription/openRouterTranscriptionProvider.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== SECTION 44: PROVIDER WORD TIMESTAMP VERIFICATION ===');
  const tmpAiff = path.join('/tmp', `speech_test_${Date.now()}.aiff`);
  const tmpMp3 = path.join('/tmp', `speech_test_${Date.now()}.mp3`);

  try {
    console.log('1. Generating 1.5s speech audio via mac `say` command...');
    execSync(`/usr/bin/say -o "${tmpAiff}" "Hello world this is a test"`);
    execSync(`ffmpeg -y -i "${tmpAiff}" -ar 16000 -ac 1 -c:a libmp3lame "${tmpMp3}" 2>/dev/null`);

    const audioBuffer = fs.readFileSync(tmpMp3);
    console.log(`2. Audio generated successfully: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

    const provider = new OpenRouterTranscriptionProvider();
    console.log('3. Sending ONE controlled transcription request to OpenRouter with timestamp_granularities: ["word", "segment"]...');

    const result = await provider.transcribeAudio(audioBuffer, 'test_sample.mp3', 'audio/mp3');
    console.log('\n--- OpenRouter Transcription Response Summary ---');
    console.log('Text:', result.text);
    console.log('Language:', result.language);
    console.log('Duration:', result.durationSeconds);
    console.log('Segments count:', result.segments.length);
    console.log('Words count:', result.words.length);

    if (result.words.length > 0) {
      console.log('First 3 words:');
      result.words.slice(0, 3).forEach((w, idx) => {
        console.log(`  [${idx + 1}] "${w.word}" (${w.start}s -> ${w.end}s)`);
      });
      console.log('\nResult: PASS — Real word timestamps returned by provider.');
    } else {
      console.log('\nResult: FAIL / SEGMENTS ONLY — Provider returned segments but 0 word timestamps.');
    }
  } catch (err: any) {
    console.error('Error during controlled transcription verification:', err.message);
  } finally {
    try {
      if (fs.existsSync(tmpAiff)) fs.unlinkSync(tmpAiff);
      if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3);
    } catch {}
  }
}

main();

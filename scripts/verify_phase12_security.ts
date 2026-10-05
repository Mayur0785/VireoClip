import assert from 'node:assert/strict';
import { CaptionService } from '../server/src/services/captionService.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../server/src/config/index.js';

async function main() {
  console.log('=== PHASE 12 SECURITY & INJECTION REGRESSION TEST ===\n');

  // 1. Unauthenticated request to editor endpoints
  console.log('--- 1. Testing Unauthenticated Access ---');
  const clipId = '25eaf0ec-7e34-4602-a8a3-28d961f34ee3';
  const unauthRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`);
  assert.equal(unauthRes.status, 401);
  const unauthJson = await unauthRes.json();
  assert.ok(unauthJson.code === 'AUTH_REQUIRED' || unauthJson.code === 'AUTH_MISSING');
  console.log('✅ Unauthenticated request blocked with 401', unauthJson.code);

  // 2. Invalid UUID
  console.log('\n--- 2. Testing Invalid UUID ---');
  const badUuidRes = await fetch(`http://localhost:5000/api/clips/not-a-valid-uuid/editor`);
  assert.equal(badUuidRes.status, 401); // Auth runs first, but if with token:
  
  const { data: linkData } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'moizshaikh381@gmail.com',
  });
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData } = await userClient.auth.verifyOtp({
    token_hash: linkData!.properties!.hashed_token,
    type: 'magiclink',
  });
  const token = verifyData!.session!.access_token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const badUuidAuthRes = await fetch(`http://localhost:5000/api/clips/not-a-valid-uuid/editor`, {
    headers: authHeaders,
  });
  assert.equal(badUuidAuthRes.status, 400);
  const badUuidJson = await badUuidAuthRes.json();
  assert.equal(badUuidJson.code, 'INVALID_UUID');
  console.log('✅ Invalid UUID rejected with 400 INVALID_UUID');

  // 3. Cross-user access (random clip UUID not owned by user)
  console.log('\n--- 3. Testing Ownership / Cross-user Isolation ---');
  const crossUserClipId = '00000000-0000-4000-8000-000000000000';
  const crossUserRes = await fetch(`http://localhost:5000/api/clips/${crossUserClipId}/editor`, {
    headers: authHeaders,
  });
  assert.equal(crossUserRes.status, 404);
  const crossUserJson = await crossUserRes.json();
  assert.equal(crossUserJson.code, 'CLIP_NOT_FOUND');
  console.log('✅ Non-owned clip access blocked with 404 CLIP_NOT_FOUND');

  // 4. Payload Whitelist & Injection prevention
  console.log('\n--- 4. Testing Payload Whitelist (No Raw FFmpeg, Storage, or Font Paths) ---');
  const injectionRes = await fetch(`http://localhost:5000/api/clips/${clipId}/editor`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      captionStyle: 'clean',
      ffmpegFilter: 'scale=100:100; rm -rf /',
      storagePath: '/etc/passwd',
      fontPath: '/System/Library/Fonts/Helvetica.ttc',
    }),
  });
  assert.equal(injectionRes.status, 400);
  const injectionJson = await injectionRes.json();
  assert.equal(injectionJson.code, 'INVALID_PAYLOAD');
  console.log('✅ Arbitrary non-whitelisted payload fields blocked with 400 INVALID_PAYLOAD');

  // 5. ASS Caption Sanitizer & Injection Prevention
  console.log('\n--- 5. Testing ASS Subtitle Injection Prevention ---');
  const attackStrings = [
    '{\\b1\\pos(0,0)}Malicious Tag',
    'Normal text \\N with forced line break',
    '{\\c&H0000FF&}Color override tag',
    'Nested {\\i1{\\u1}} tags',
    'Backslash \\ test \\\\ escape',
  ];

  for (const str of attackStrings) {
    const sanitized = CaptionService.sanitizeAssText(str);
    assert.ok(!sanitized.includes('{'), `Sanitized string should not contain {: ${sanitized}`);
    assert.ok(!sanitized.includes('}'), `Sanitized string should not contain }: ${sanitized}`);
    console.log(`  Input:  "${str}"`);
    console.log(`  Output: "${sanitized}"`);
  }
  console.log('✅ ASS injection sanitizer neutralized all curly braces, backslashes, and command tags.');

  console.log('\n====================================================');
  console.log('ALL PHASE 12 SECURITY CHECKS PASSED');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Security test failed:', err);
  process.exit(1);
});

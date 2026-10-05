// LEGACY SUPABASE DATABASE/STORAGE DIAGNOSTIC — historical only; do not use for MongoDB/R2 production.
import { config } from '../server/src/config/index.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== TESTING REAL UPLOAD & PRIVATE STORAGE ===\n');

  // 1. Create a test user
  const email = `test_upload_${Date.now()}@example.com`;
  const password = 'TestUploadPassword123!';
  const { data: created, error: createErr } = await supabaseAuthClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    console.error('❌ Failed to create test user for upload:', createErr?.message);
    process.exit(1);
  }

  const userId = created.user.id;
  console.log(`✅ Test user created: ${userId}`);

  // Create profile row
  await supabaseAuthClient.from('profiles').upsert({ id: userId, email });

  // Authenticate user with anon client
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: sessionData, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signErr || !sessionData?.session) {
    console.error('❌ Failed to sign in as user:', signErr?.message);
    await supabaseAuthClient.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  const token = sessionData.session.access_token;
  let testProjectId: string | null = null;
  const storagePath = `${userId}/test-small-video-${Date.now()}.mp4`;

  try {
    // 2. Upload dummy short MP4 buffer to private Storage bucket 'videos'
    console.log(`2. Uploading small MP4 to private 'videos' bucket: ${storagePath}...`);
    // Minimal valid MP4 header/ftyp box
    const dummyMp4Buffer = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // 24 bytes, 'ftyp'
      0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00, // 'mp42'
      0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32, // 'isom', 'mp42'
      0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74  // 8 bytes, 'mdat'
    ]);

    const { data: uploadData, error: uploadErr } = await userClient.storage
      .from('videos')
      .upload(storagePath, dummyMp4Buffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadErr) {
      console.error('❌ Upload to private storage FAILED:', uploadErr.message);
    } else {
      console.log('✅ Upload to private storage SUCCEEDED:', uploadData?.path);
    }

    // 3. Verify video is NOT publicly accessible
    const { data: publicUrlData } = userClient.storage.from('videos').getPublicUrl(storagePath);
    console.log('Public URL generated:', publicUrlData.publicUrl);
    const pubFetch = await fetch(publicUrlData.publicUrl);
    console.log('Direct public access HTTP status:', pubFetch.status);
    if (pubFetch.status === 400 || pubFetch.status === 403 || pubFetch.status === 404) {
      console.log('✅ Storage remains private: Public access is blocked!');
    } else {
      console.log('⚠️ Storage public access returned:', pubFetch.status);
    }

    // 4. Create project row via API
    console.log('\n3. Creating project row via POST /api/projects...');
    const createProjRes = await fetch('http://localhost:5000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Real Verification Small Video Test',
        source_url: `videos/${storagePath}`,
        source_type: 'upload',
      }),
    });

    console.log('Create project HTTP Status:', createProjRes.status);
    const createProjBody = await createProjRes.json();
    console.log('Create project response:', JSON.stringify(createProjBody, null, 2));

    if (createProjRes.status === 201) {
      testProjectId = createProjBody.project?.id || createProjBody.data?.id;
      const statusVal = createProjBody.project?.video_status || createProjBody.data?.video_status;
      console.log(`✅ Project created with uploaded status: ${testProjectId}, video_status: ${statusVal}`);
    }

    // 5. Test duplicate processing guard / processProject
    if (testProjectId) {
      console.log('\n4. Testing POST /api/projects/:id/process (Quota & Processing start)...');
      const processRes = await fetch(`http://localhost:5000/api/projects/${testProjectId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estimated_minutes: 1.0 }),
      });

      console.log('Process project HTTP Status:', processRes.status);
      const processBody = await processRes.json();
      console.log('Process project response:', JSON.stringify(processBody, null, 2));

      // Attempt duplicate processing while state is active
      console.log('\n5. Attempting duplicate processing request...');
      const dupRes = await fetch(`http://localhost:5000/api/projects/${testProjectId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estimated_minutes: 1.0 }),
      });

      console.log('Duplicate process HTTP Status:', dupRes.status);
      const dupBody = await dupRes.json();
      console.log('Duplicate process response:', JSON.stringify(dupBody, null, 2));
    }

    // 6. Test delete cleanup
    if (testProjectId) {
      console.log('\n6. Testing DELETE /api/projects/:id (Delete Cleanup)...');
      const deleteRes = await fetch(`http://localhost:5000/api/projects/${testProjectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Delete project HTTP status:', deleteRes.status);
      const delBody = await deleteRes.json();
      console.log('Delete response:', JSON.stringify(delBody, null, 2));

      // Verify storage file was deleted
      const { data: fileList } = await supabaseAuthClient.storage.from('videos').list(userId);
      const fileStillExists = fileList?.some(f => f.name.includes('test-small-video'));
      console.log('Storage file cleanup:', fileStillExists ? '❌ Still exists' : '✅ Cleaned up from storage (No orphan Storage object)');

      // Verify project row was deleted
      const { data: projCheck } = await supabaseAuthClient.from('projects').select('id').eq('id', testProjectId).maybeSingle();
      console.log('Project row cleanup:', projCheck ? '❌ Still exists' : '✅ Project deleted from database');
    }

  } finally {
    console.log('\nCleaning up test user & storage...');
    await supabaseAuthClient.storage.from('videos').remove([storagePath]);
    if (testProjectId) {
      await supabaseAuthClient.from('projects').delete().eq('id', testProjectId);
    }
    await supabaseAuthClient.auth.admin.deleteUser(userId);
    console.log('✅ Cleanup complete.');
  }
}

main().catch(err => {
  console.error('Fatal in upload test:', err);
  process.exit(1);
});

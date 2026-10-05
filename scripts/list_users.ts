import { supabaseAuthClient } from '../server/src/utils/supabase.js';

async function listAllUsers() {
  const { data: users } = await supabaseAuthClient.auth.admin.listUsers();
  console.log('Registered Users:');
  users.users.forEach(u => {
    console.log(`  User ID: ${u.id}, Email: ${u.email}`);
  });
}

listAllUsers().catch(console.error);

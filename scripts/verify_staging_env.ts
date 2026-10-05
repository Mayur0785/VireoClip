import { config } from '../server/src/config/index.js';

console.log('=== SECTION 1: ENVIRONMENT SAFETY & PRESENCE ===\n');

const checks = [
  { name: 'MONGODB_URI', present: Boolean(config.mongodbUri) },
  { name: 'MONGODB_DB_NAME', present: Boolean(config.mongodbDbName), detail: config.mongodbDbName },
  { name: 'R2_ACCOUNT_ID', present: Boolean(config.r2AccountId) },
  { name: 'R2_ACCESS_KEY_ID', present: Boolean(config.r2AccessKeyId) },
  { name: 'R2_SECRET_ACCESS_KEY', present: Boolean(config.r2SecretAccessKey) },
  { name: 'R2_ENDPOINT', present: Boolean(config.r2Endpoint) },
  { name: 'R2_SOURCE_BUCKET', present: Boolean(config.r2SourceBucket), detail: config.r2SourceBucket },
  { name: 'R2_CLIPS_BUCKET', present: Boolean(config.r2ClipsBucket), detail: config.r2ClipsBucket },
  { name: 'SUPABASE_URL (Auth only)', present: Boolean(config.supabaseUrl) },
  { name: 'SUPABASE_SECRET_KEY (Auth only)', present: Boolean(config.supabaseSecretKey) },
];

for (const c of checks) {
  const status = c.present ? '✅ PRESENT' : '❌ MISSING';
  const detailStr = c.detail ? ` (${c.detail})` : '';
  console.log(`${c.name.padEnd(35)}: ${status}${detailStr}`);
}

const allPresent = checks.every(c => c.present);
console.log(`\nOverall environment readiness: ${allPresent ? '✅ ALL PRESENT' : '❌ SOME MISSING'}`);

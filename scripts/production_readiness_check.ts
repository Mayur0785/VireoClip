import { config } from '../server/src/config/index.js';
import { isMongoConfigured, isMongoHealthy } from '../server/src/db/mongoClient.js';
import { isServerSupabaseConfigured } from '../server/src/utils/supabase.js';

interface CheckItem {
  name: string;
  category: 'CORE REQUIRED' | 'STORAGE' | 'AI' | 'BILLING' | 'OAUTH' | 'SYSTEM';
  status: 'READY' | 'CONFIGURED' | 'OPTIONAL / NOT CONFIGURED' | 'MISSING';
  required: boolean;
}

async function runCheck(): Promise<void> {
  console.log('====================================================');
  console.log('VIREOCLIP PRODUCTION ENVIRONMENT & READINESS AUDIT');
  console.log('====================================================\n');

  const checks: CheckItem[] = [];

  // Core Database
  const mongoHealthy = await isMongoHealthy().catch(() => false);
  checks.push({
    name: 'MongoDB Atlas URI & Database',
    category: 'CORE REQUIRED',
    status: isMongoConfigured && mongoHealthy ? 'READY' : (isMongoConfigured ? 'CONFIGURED' : 'MISSING'),
    required: true,
  });

  // Supabase Auth
  checks.push({
    name: 'Supabase URL & Service Key',
    category: 'CORE REQUIRED',
    status: isServerSupabaseConfigured ? 'READY' : 'MISSING',
    required: true,
  });

  // Cloudflare R2
  const r2Ready = Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey);
  checks.push({
    name: 'Cloudflare R2 Bucket Credentials',
    category: 'STORAGE',
    status: r2Ready ? 'READY' : 'MISSING',
    required: true,
  });

  // OpenRouter
  checks.push({
    name: 'OpenRouter AI API Key',
    category: 'AI',
    status: config.openrouterApiKey ? 'READY' : 'MISSING',
    required: true,
  });

  // Groq (Optional)
  checks.push({
    name: 'Groq Whisper API Key',
    category: 'AI',
    status: config.groqApiKey ? 'CONFIGURED' : 'OPTIONAL / NOT CONFIGURED',
    required: false,
  });

  // Paddle Billing
  const paddleReady = Boolean(config.paddleApiKey && config.paddleWebhookSecret);
  checks.push({
    name: 'Paddle Billing (API & Webhook Secret)',
    category: 'BILLING',
    status: paddleReady ? 'CONFIGURED' : 'OPTIONAL / NOT CONFIGURED',
    required: false,
  });

  // Razorpay Subscriptions
  const razorpayReady = Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);
  checks.push({
    name: 'Razorpay Subscriptions (Keys & Webhook)',
    category: 'BILLING',
    status: razorpayReady ? 'CONFIGURED' : 'OPTIONAL / NOT CONFIGURED',
    required: false,
  });

  // Social OAuth Providers
  const oauthProviders = [
    { name: 'OAuth YouTube (Google)', ready: Boolean(config.googleClientId && config.googleClientSecret) },
    { name: 'OAuth Instagram (Meta)', ready: Boolean(config.metaClientId && config.metaClientSecret) },
    { name: 'OAuth TikTok', ready: Boolean(config.tiktokClientKey && config.tiktokClientSecret) },
    { name: 'OAuth LinkedIn', ready: Boolean(config.linkedinClientId && config.linkedinClientSecret) },
    { name: 'OAuth X (Twitter)', ready: Boolean(config.xClientId && config.xClientSecret) },
  ];

  for (const p of oauthProviders) {
    checks.push({
      name: p.name,
      category: 'OAUTH',
      status: p.ready ? 'CONFIGURED' : 'OPTIONAL / NOT CONFIGURED',
      required: false,
    });
  }

  // Formatting output table
  const colCategory = 15;
  const colName = 40;
  const colStatus = 25;

  console.log(
    'CATEGORY'.padEnd(colCategory) +
    'SERVICE / FEATURE'.padEnd(colName) +
    'STATUS'.padEnd(colStatus)
  );
  console.log('-'.repeat(colCategory + colName + colStatus));

  let missingRequired = false;

  for (const item of checks) {
    console.log(
      item.category.padEnd(colCategory) +
      item.name.padEnd(colName) +
      item.status.padEnd(colStatus)
    );
    if (item.required && (item.status === 'MISSING' || item.status === 'OPTIONAL / NOT CONFIGURED')) {
      missingRequired = true;
    }
  }

  console.log('\n====================================================');
  if (missingRequired) {
    console.error('RESULT: FAILED — Critical core production variables are missing.');
    process.exit(1);
  } else {
    console.log('RESULT: PASSED — Core infrastructure is READY for production deployment.');
    process.exit(0);
  }
}

runCheck().catch((err) => {
  console.error('Readiness check error:', err);
  process.exit(1);
});

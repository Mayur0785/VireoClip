import dotenv from 'dotenv';
import path from 'path';

// Load .env and .env.local from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:5173',
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || '',
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || '',
  r2AccountId: process.env.R2_ACCOUNT_ID || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  r2Endpoint: process.env.R2_ENDPOINT || '',
  r2SourceBucket: process.env.R2_SOURCE_BUCKET || 'vireo-source-videos',
  r2ClipsBucket: process.env.R2_CLIPS_BUCKET || 'vireo-rendered-clips',
  smartReframeEnabled: process.env.SMART_REFRAME_ENABLED === 'true',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterTextModel: process.env.OPENROUTER_TEXT_MODEL || 'openai/gpt-4o-mini',
  transcriptionModel: process.env.TRANSCRIPTION_MODEL || 'openai/whisper-large-v3-turbo',
  groqApiKey: process.env.GROQ_API_KEY || '',
  transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER || 'groq',
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Processing configuration
  processingStaleMinutes: parseInt(process.env.PROCESSING_STALE_MINUTES || '15', 10),
  maxVideoBytes: 2 * 1024 * 1024 * 1024, // Direct R2 PUT; processing still needs local disk capacity
  defaultMonthlyQuotaMinutes: parseInt(process.env.DEFAULT_MONTHLY_QUOTA_MINUTES || '15', 10),
  // Development / Test Account Unlimited Processing Entitlement
  devUnlimitedUserEmail: process.env.DEV_UNLIMITED_USER_EMAIL || 'vertexdigitals07@gmail.com',
  // Timeouts (milliseconds)
  transcriptionTimeoutMs: parseInt(process.env.TRANSCRIPTION_TIMEOUT_MS || '120000', 10),
  contentGenerationTimeoutMs: parseInt(process.env.CONTENT_GENERATION_TIMEOUT_MS || '60000', 10),
  ffmpegTimeoutMs: parseInt(process.env.FFMPEG_TIMEOUT_MS || '180000', 10),
  clipRenderTimeoutMs: parseInt(process.env.CLIP_RENDER_TIMEOUT_MS || '300000', 10),
  // Social OAuth & Encryption (Phase 9)
  socialTokenEncryptionKey: process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || 'default-dev-social-token-encryption-key-32-chars-long!',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/social/youtube/callback',
  metaClientId: process.env.META_CLIENT_ID || '',
  metaClientSecret: process.env.META_CLIENT_SECRET || '',
  metaRedirectUri: process.env.META_REDIRECT_URI || 'http://localhost:5000/api/social/instagram/callback',
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
  tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:5000/api/social/tiktok/callback',
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID || '',
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  linkedinRedirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5000/api/social/linkedin/callback',
  xClientId: process.env.X_CLIENT_ID || '',
  xClientSecret: process.env.X_CLIENT_SECRET || '',
  xRedirectUri: process.env.X_REDIRECT_URI || 'http://localhost:5000/api/social/x/callback',
  // Billing Providers Configuration (Phase 11: Paddle, Razorpay, Stripe)
  billingProviderDefault: (process.env.BILLING_PROVIDER_DEFAULT || 'paddle') as 'paddle' | 'razorpay' | 'stripe',
  
  // Paddle Billing (Sandbox by default)
  paddleEnv: (process.env.PADDLE_ENV || 'sandbox') as 'sandbox' | 'production',
  paddleApiKey: process.env.PADDLE_API_KEY || '',
  paddleClientToken: process.env.PADDLE_CLIENT_TOKEN || process.env.VITE_PADDLE_CLIENT_TOKEN || '',
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET || '',
  paddlePriceCreatorMonthly: process.env.PADDLE_PRICE_CREATOR_MONTHLY || '',
  paddlePriceCreatorYearly: process.env.PADDLE_PRICE_CREATOR_YEARLY || '',
  paddlePriceProMonthly: process.env.PADDLE_PRICE_PRO_MONTHLY || '',
  paddlePriceProYearly: process.env.PADDLE_PRICE_PRO_YEARLY || '',
  paddlePriceStudioMonthly: process.env.PADDLE_PRICE_STUDIO_MONTHLY || '',
  paddlePriceStudioYearly: process.env.PADDLE_PRICE_STUDIO_YEARLY || '',

  // Razorpay Subscriptions (Test mode by default)
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  razorpayPlanCreatorMonthly: process.env.RAZORPAY_PLAN_CREATOR_MONTHLY || '',
  razorpayPlanCreatorYearly: process.env.RAZORPAY_PLAN_CREATOR_YEARLY || '',
  razorpayPlanProMonthly: process.env.RAZORPAY_PLAN_PRO_MONTHLY || '',
  razorpayPlanProYearly: process.env.RAZORPAY_PLAN_PRO_YEARLY || '',
  razorpayPlanStudioMonthly: process.env.RAZORPAY_PLAN_STUDIO_MONTHLY || '',
  razorpayPlanStudioYearly: process.env.RAZORPAY_PLAN_STUDIO_YEARLY || '',

  // Stripe (Preserved for future / multi-provider routing)
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID || '',
  stripeBusinessPriceId: process.env.STRIPE_BUSINESS_PRICE_ID || '',
  stripePortalConfigurationId: process.env.STRIPE_PORTAL_CONFIGURATION_ID || '',

  // Phase 12: Admin / Owner Console Authorization
  adminEmails: (process.env.ADMIN_EMAILS || 'vertexdigitals07@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  adminUserIds: (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
} as const;

/**
 * Validates that all critical environment variables are present.
 * Fails fast in production; warns in development.
 */
export function validateEnvironment(): void {
  const critical: Array<{ name: string; value: string; required: boolean }> = [
    { name: 'SUPABASE_URL', value: config.supabaseUrl, required: true },
    { name: 'SUPABASE_SECRET_KEY', value: config.supabaseSecretKey, required: true },
    { name: 'MONGODB_URI', value: config.mongodbUri, required: true },
    { name: 'MONGODB_DB_NAME', value: config.mongodbDbName, required: true },
    { name: 'R2_ACCOUNT_ID', value: config.r2AccountId, required: true },
    { name: 'R2_ACCESS_KEY_ID', value: config.r2AccessKeyId, required: true },
    { name: 'R2_SECRET_ACCESS_KEY', value: config.r2SecretAccessKey, required: true },
    { name: 'CORS_ORIGIN', value: config.corsOrigin, required: false },
  ];

  const missing = critical.filter((v) => v.required && !v.value);

  if (missing.length > 0) {
    const names = missing.map((v) => v.name).join(', ');
    if (config.isProduction) {
      console.error(`[FATAL] Missing required environment variables: ${names}`);
      process.exit(1);
    } else {
      console.warn(
        `[WARN] Missing environment variables: ${names}. ` +
          'Backend will operate in degraded mode. Add these to .env or .env.local.'
      );
    }
  }

  // Check transcription provider credentials
  const provider = (config.transcriptionProvider || 'groq').toLowerCase().trim();
  if (provider === 'groq' && !config.groqApiKey) {
    console.warn('[WARN] TRANSCRIPTION_PROVIDER is set to "groq" but GROQ_API_KEY is not configured.');
  } else if (provider === 'openrouter' && !config.openrouterApiKey) {
    console.warn('[WARN] TRANSCRIPTION_PROVIDER is set to "openrouter" but OPENROUTER_API_KEY is not configured.');
  }

  // Warn if text generation key is absent
  if (!config.openrouterApiKey) {
    console.warn('[WARN] OPENROUTER_API_KEY is not configured. AI content generation will fail until set.');
  }
}

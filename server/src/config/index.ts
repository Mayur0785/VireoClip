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
  socialTokenEncryptionKey:
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY ||
    (process.env.NODE_ENV === 'production' ? '' : 'default-dev-social-token-encryption-key-32-chars-long!'),
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
 * Validates the SOCIAL_TOKEN_ENCRYPTION_KEY according to cryptographic requirements.
 * AES-256-GCM requires a 32-byte key (256 bits).
 *
 * Supported formats:
 * 1. 64 hexadecimal characters (/^[0-9a-fA-F]{64}$/): Decodes directly to 32 bytes.
 * 2. 0x-prefixed 64 hexadecimal characters (66 chars total): Decodes directly to 32 bytes.
 * 3. Raw secret string: Must contain at least 32 bytes (Buffer.byteLength(key, 'utf8') >= 32).
 *    Note: Character count does NOT equal byte count for multi-byte UTF-8 sequences.
 *
 * Never logs or reveals the secret value itself in error messages.
 */
export function validateSocialTokenEncryptionKey(
  secret?: string,
  _isProduction: boolean = false
): { valid: boolean; error?: string } {
  if (!secret || secret.trim().length === 0) {
    return {
      valid: false,
      error: 'SOCIAL_TOKEN_ENCRYPTION_KEY environment variable is missing or empty.',
    };
  }

  const trimmed = secret.trim();

  // 0x-prefixed hex string (66 characters total)
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const hexPart = trimmed.slice(2);
    if (hexPart.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hexPart)) {
      return {
        valid: false,
        error:
          'SOCIAL_TOKEN_ENCRYPTION_KEY is malformed: 0x-prefixed key must contain exactly 64 hexadecimal characters (32 bytes).',
      };
    }
    return { valid: true };
  }

  // Enforce minimum 32 bytes (256 bits of key material)
  const byteLength = Buffer.byteLength(trimmed, 'utf8');
  if (byteLength < 32) {
    return {
      valid: false,
      error: `SOCIAL_TOKEN_ENCRYPTION_KEY is invalid: key byte length is ${byteLength} bytes. AES-256 requires at least 32 bytes (256 bits) or a 64-character hex string.`,
    };
  }

  return { valid: true };
}

/**
 * Checks whether a given billing provider is enabled.
 * A provider is enabled if:
 * 1. It is not explicitly disabled via <PROVIDER>_ENABLED=false
 * 2. AND either it is explicitly enabled via <PROVIDER>_ENABLED=true,
 *    it is the default provider (BILLING_PROVIDER_DEFAULT),
 *    or its API credentials are configured in the environment.
 */
export function isBillingProviderEnabled(
  provider: 'paddle' | 'razorpay' | 'stripe',
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const providerLower = provider.toLowerCase();

  if (providerLower === 'paddle') {
    if (env.PADDLE_ENABLED === 'false') return false;
    if (env.PADDLE_ENABLED === 'true') return true;
    const defaultProvider = env.BILLING_PROVIDER_DEFAULT || config.billingProviderDefault || 'paddle';
    return defaultProvider === 'paddle' || Boolean(env.PADDLE_API_KEY || config.paddleApiKey);
  }

  if (providerLower === 'razorpay') {
    if (env.RAZORPAY_ENABLED === 'false') return false;
    if (env.RAZORPAY_ENABLED === 'true') return true;
    const defaultProvider = env.BILLING_PROVIDER_DEFAULT || config.billingProviderDefault;
    return defaultProvider === 'razorpay' || Boolean(env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_SECRET || config.razorpayKeyId || config.razorpayKeySecret);
  }

  if (providerLower === 'stripe') {
    if (env.STRIPE_ENABLED === 'false') return false;
    if (env.STRIPE_ENABLED === 'true') return true;
    const defaultProvider = env.BILLING_PROVIDER_DEFAULT || config.billingProviderDefault;
    return defaultProvider === 'stripe' || Boolean(env.STRIPE_SECRET_KEY || config.stripeSecretKey);
  }

  return false;
}

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidateEnvironmentOptions {
  isProduction?: boolean;
  exitOnError?: boolean;
  throwOnError?: boolean;
  env?: NodeJS.ProcessEnv;
}

/**
 * Validates that all critical environment variables are present and secure.
 * - In production: Fails fast on missing or malformed infrastructure, encryption, or billing secrets.
 * - In development: Warns of missing variables while preserving dev workflow.
 */
export function validateEnvironment(options: ValidateEnvironmentOptions = {}): EnvironmentValidationResult {
  const env = options.env || process.env;
  const isProd =
    options.isProduction ??
    (env.NODE_ENV === 'production' || config.isProduction);

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Critical Base Infrastructure Variables
  const critical: Array<{ name: string; value: string; required: boolean }> = [
    { name: 'SUPABASE_URL', value: env.SUPABASE_URL || config.supabaseUrl, required: true },
    { name: 'SUPABASE_SECRET_KEY', value: env.SUPABASE_SECRET_KEY || config.supabaseSecretKey, required: true },
    { name: 'MONGODB_URI', value: env.MONGODB_URI || config.mongodbUri, required: true },
    { name: 'MONGODB_DB_NAME', value: env.MONGODB_DB_NAME || config.mongodbDbName, required: true },
    { name: 'R2_ACCOUNT_ID', value: env.R2_ACCOUNT_ID || config.r2AccountId, required: true },
    { name: 'R2_ACCESS_KEY_ID', value: env.R2_ACCESS_KEY_ID || config.r2AccessKeyId, required: true },
    { name: 'R2_SECRET_ACCESS_KEY', value: env.R2_SECRET_ACCESS_KEY || config.r2SecretAccessKey, required: true },
    { name: 'CORS_ORIGIN', value: env.CORS_ORIGIN || config.corsOrigin, required: false },
  ];

  for (const item of critical) {
    if (item.required && !item.value) {
      errors.push(`Missing required environment variable: ${item.name}`);
    }
  }

  // 2. Social Token Encryption Key (Task 1)
  const encryptionKey =
    env.SOCIAL_TOKEN_ENCRYPTION_KEY ??
    (isProd ? config.socialTokenEncryptionKey : (config.socialTokenEncryptionKey || 'default-dev-social-token-encryption-key-32-chars-long!'));

  if (isProd) {
    if (!encryptionKey || encryptionKey.trim().length === 0) {
      errors.push(
        'Missing required environment variable: SOCIAL_TOKEN_ENCRYPTION_KEY. A 32-byte (or 64-hex) key is required in production.'
      );
    } else {
      const keyValidation = validateSocialTokenEncryptionKey(encryptionKey, true);
      if (!keyValidation.valid && keyValidation.error) {
        errors.push(keyValidation.error);
      }
    }
  } else {
    // Non-production warning
    if (!encryptionKey) {
      warnings.push(
        'SOCIAL_TOKEN_ENCRYPTION_KEY is not configured; using dev fallback key. Do NOT use this fallback in production.'
      );
    } else {
      const keyValidation = validateSocialTokenEncryptionKey(encryptionKey, false);
      if (!keyValidation.valid && keyValidation.error) {
        warnings.push(`SOCIAL_TOKEN_ENCRYPTION_KEY warning: ${keyValidation.error}`);
      }
    }
  }

  // 3. Billing Webhook Secrets (Task 2)
  if (isBillingProviderEnabled('paddle', env)) {
    const paddleSecret = env.PADDLE_WEBHOOK_SECRET || config.paddleWebhookSecret;
    if (!paddleSecret || paddleSecret.trim().length === 0) {
      if (isProd) {
        errors.push(
          'Missing required environment variable for enabled billing provider: PADDLE_WEBHOOK_SECRET. Required for Paddle webhook signature verification.'
        );
      } else {
        warnings.push(
          'PADDLE_WEBHOOK_SECRET is not configured for enabled Paddle provider. Webhook signature verification will fail.'
        );
      }
    }
  }

  if (isBillingProviderEnabled('razorpay', env)) {
    const razorpaySecret = env.RAZORPAY_WEBHOOK_SECRET || config.razorpayWebhookSecret;
    if (!razorpaySecret || razorpaySecret.trim().length === 0) {
      if (isProd) {
        errors.push(
          'Missing required environment variable for enabled billing provider: RAZORPAY_WEBHOOK_SECRET. Required for Razorpay HMAC signature verification.'
        );
      } else {
        warnings.push(
          'RAZORPAY_WEBHOOK_SECRET is not configured for enabled Razorpay provider. Webhook signature verification will fail.'
        );
      }
    }
  }

  if (isBillingProviderEnabled('stripe', env)) {
    const stripeSecret = env.STRIPE_WEBHOOK_SECRET || config.stripeWebhookSecret;
    if (!stripeSecret || stripeSecret.trim().length === 0) {
      if (isProd) {
        errors.push(
          'Missing required environment variable for enabled billing provider: STRIPE_WEBHOOK_SECRET. Required for Stripe webhook signature verification.'
        );
      } else {
        warnings.push(
          'STRIPE_WEBHOOK_SECRET is not configured for enabled Stripe provider. Webhook signature verification will fail.'
        );
      }
    }
  }

  // 4. Transcription & AI warnings
  const provider = (config.transcriptionProvider || 'groq').toLowerCase().trim();
  if (provider === 'groq' && !config.groqApiKey) {
    warnings.push('TRANSCRIPTION_PROVIDER is set to "groq" but GROQ_API_KEY is not configured.');
  } else if (provider === 'openrouter' && !config.openrouterApiKey) {
    warnings.push('TRANSCRIPTION_PROVIDER is set to "openrouter" but OPENROUTER_API_KEY is not configured.');
  }

  if (!config.openrouterApiKey) {
    warnings.push('OPENROUTER_API_KEY is not configured. AI content generation will fail until set.');
  }

  // 5. Output handling & Process Exit
  const valid = errors.length === 0;

  if (!valid) {
    const errMsg = errors.join('; ');
    if (isProd) {
      console.error(`[FATAL] Production environment validation failed:\n  - ${errors.join('\n  - ')}`);
      if (options.throwOnError) {
        throw new Error(`Production environment validation failed: ${errMsg}`);
      }
      if (options.exitOnError !== false) {
        process.exit(1);
      }
    } else {
      console.warn(`[WARN] Environment validation warnings:\n  - ${errors.concat(warnings).join('\n  - ')}`);
    }
  } else if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`[WARN] ${w}`);
    }
  }

  return { valid, errors, warnings };
}

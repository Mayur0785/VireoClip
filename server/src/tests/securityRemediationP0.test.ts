import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  config,
  validateSocialTokenEncryptionKey,
  isBillingProviderEnabled,
  validateEnvironment,
} from '../config/index.js';
import { encryptToken, decryptToken } from '../utils/tokenEncryption.js';
import { PaddleBillingProvider } from '../services/billing/providers/paddleBillingProvider.js';
import { RazorpayBillingProvider } from '../services/billing/providers/razorpayBillingProvider.js';

describe('P0 Security Remediation — Encryption Key & Billing Webhook Secrets', () => {
  describe('Task 1 — SOCIAL_TOKEN_ENCRYPTION_KEY Hardening & Cryptographic Compatibility', () => {
    it('rejects missing or empty key in production', () => {
      const emptyRes = validateSocialTokenEncryptionKey('', true);
      assert.equal(emptyRes.valid, false);
      assert.ok(emptyRes.error?.includes('missing or empty'));
      assert.ok(!emptyRes.error?.includes('undefined'));

      const whitespaceRes = validateSocialTokenEncryptionKey('   ', true);
      assert.equal(whitespaceRes.valid, false);
      assert.ok(whitespaceRes.error?.includes('missing or empty'));
    });

    it('rejects keys with fewer than 32 bytes (< 256 bits)', () => {
      const shortKey = 'short-key-16-bytes';
      const shortRes = validateSocialTokenEncryptionKey(shortKey, true);
      assert.equal(shortRes.valid, false);
      assert.ok(shortRes.error?.includes('key byte length is 18 bytes'));
      assert.ok(shortRes.error?.includes('requires at least 32 bytes'));
      // Ensure the key itself is never exposed in the error
      assert.ok(!shortRes.error?.includes(shortKey));
    });

    it('enforces byte length rather than character count for multi-byte UTF-8 sequences', () => {
      // 16 characters each 2 bytes in UTF-8 (e.g. Greek characters 'αβγδεζηθικλμνξοπ')
      const multiByteStr = 'αβγδεζηθικλμνξοπ'; // 16 characters, 32 bytes
      assert.equal(multiByteStr.length, 16);
      assert.equal(Buffer.byteLength(multiByteStr, 'utf8'), 32);

      const validRes = validateSocialTokenEncryptionKey(multiByteStr, true);
      assert.equal(validRes.valid, true);

      // Now test 31 characters of 1-byte ASCII (31 characters = 31 bytes -> invalid, < 32 bytes)
      const ascii31 = '1234567890123456789012345678901';
      assert.equal(ascii31.length, 31);
      assert.equal(Buffer.byteLength(ascii31, 'utf8'), 31);
      const invalidRes = validateSocialTokenEncryptionKey(ascii31, true);
      assert.equal(invalidRes.valid, false);
      assert.ok(invalidRes.error?.includes('31 bytes'));
    });

    it('rejects malformed 0x-prefixed hex string', () => {
      const short0x = '0x1234abcd';
      const res = validateSocialTokenEncryptionKey(short0x, true);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes('0x-prefixed key must contain exactly 64 hexadecimal characters'));
      assert.ok(!res.error?.includes(short0x));

      // 66 chars with 0x but non-hex characters
      const nonHex0x = '0x' + 'z'.repeat(64);
      const resNonHex = validateSocialTokenEncryptionKey(nonHex0x, true);
      assert.equal(resNonHex.valid, false);
      assert.ok(resNonHex.error?.includes('0x-prefixed key must contain exactly 64 hexadecimal characters'));
    });

    it('accepts valid 64-character hexadecimal key and encrypts/decrypts accurately', () => {
      const validHexKey = crypto.randomBytes(32).toString('hex');
      assert.equal(validHexKey.length, 64);

      const res = validateSocialTokenEncryptionKey(validHexKey, true);
      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);

      // Test cryptographic round-trip with this key parsed directly
      const rawBuf = Buffer.from(validHexKey, 'hex');
      const plaintext = 'token_secret_oauth_payload_12345';
      const ciphertext = encryptToken(plaintext, rawBuf);
      const decrypted = decryptToken(ciphertext, rawBuf);
      assert.equal(decrypted, plaintext);
    });

    it('accepts valid 0x-prefixed 64-character hexadecimal key', () => {
      const validHexKey = '0x' + crypto.randomBytes(32).toString('hex');
      assert.equal(validHexKey.length, 66);

      const res = validateSocialTokenEncryptionKey(validHexKey, true);
      assert.equal(res.valid, true);
    });

    it('accepts raw passphrase of >= 32 bytes and maintains SHA-256 derivation compatibility', () => {
      const rawPassphrase = 'production-grade-encryption-secret-passphrase-at-least-32-bytes!';
      assert.ok(Buffer.byteLength(rawPassphrase, 'utf8') >= 32);

      const res = validateSocialTokenEncryptionKey(rawPassphrase, true);
      assert.equal(res.valid, true);

      // SHA-256 derived key round-trip
      const derivedBuf = crypto.createHash('sha256').update(rawPassphrase).digest();
      const plaintext = 'sensitive_youtube_refresh_token_xyz';
      const ciphertext = encryptToken(plaintext, derivedBuf);
      const decrypted = decryptToken(ciphertext, derivedBuf);
      assert.equal(decrypted, plaintext);
    });

    it('preserves existing development fallback compatibility in non-production', () => {
      const devFallback = 'default-dev-social-token-encryption-key-32-chars-long!';
      assert.ok(Buffer.byteLength(devFallback, 'utf8') >= 32);

      const res = validateSocialTokenEncryptionKey(devFallback, false);
      assert.equal(res.valid, true);

      // When config uses dev fallback in non-production, round-trip continues working
      const plaintext = 'local_dev_token_value';
      const encrypted = encryptToken(plaintext);
      const decrypted = decryptToken(encrypted);
      assert.equal(decrypted, plaintext);
    });

    it('never logs or leaks the secret value in error messages', () => {
      const sensitiveLeakCandidate = 'SUPER_SENSITIVE_LEAKABLE_KEY'; // 28 bytes (< 32 bytes)
      assert.ok(Buffer.byteLength(sensitiveLeakCandidate, 'utf8') < 32);

      const res = validateSocialTokenEncryptionKey(sensitiveLeakCandidate, true);
      assert.equal(res.valid, false);
      assert.ok(!res.error?.includes(sensitiveLeakCandidate));
      assert.ok(!res.error?.includes('SUPER_SENSITIVE'));
    });
  });

  describe('Task 2 — Billing Webhook Secrets & Provider Enablement Validation', () => {
    it('correctly resolves default billing provider enablement (Paddle enabled by default)', () => {
      const isPaddleEnabled = isBillingProviderEnabled('paddle', {
        BILLING_PROVIDER_DEFAULT: 'paddle',
      });
      assert.equal(isPaddleEnabled, true);

      const isRazorpayDefault = isBillingProviderEnabled('razorpay', {
        BILLING_PROVIDER_DEFAULT: 'paddle',
      });
      assert.equal(isRazorpayDefault, false);
    });

    it('detects explicitly disabled billing provider via <PROVIDER>_ENABLED=false', () => {
      const paddleDisabled = isBillingProviderEnabled('paddle', {
        BILLING_PROVIDER_DEFAULT: 'paddle',
        PADDLE_ENABLED: 'false',
      });
      assert.equal(paddleDisabled, false);

      const razorpayDisabled = isBillingProviderEnabled('razorpay', {
        BILLING_PROVIDER_DEFAULT: 'razorpay',
        RAZORPAY_ENABLED: 'false',
      });
      assert.equal(razorpayDisabled, false);
    });

    it('detects explicitly enabled billing provider via credentials or flags', () => {
      const razorpayWithKeys = isBillingProviderEnabled('razorpay', {
        BILLING_PROVIDER_DEFAULT: 'paddle',
        RAZORPAY_KEY_ID: 'rzp_test_12345',
        RAZORPAY_KEY_SECRET: 'secret_key_12345',
      });
      assert.equal(razorpayWithKeys, true);

      const razorpayWithFlag = isBillingProviderEnabled('razorpay', {
        BILLING_PROVIDER_DEFAULT: 'paddle',
        RAZORPAY_ENABLED: 'true',
      });
      assert.equal(razorpayWithFlag, true);
    });

    it('validateEnvironment fails fast in production when SOCIAL_TOKEN_ENCRYPTION_KEY is missing', () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret',
        MONGODB_URI: 'mongodb://127.0.0.1:27017',
        MONGODB_DB_NAME: 'vireo_test',
        R2_ACCOUNT_ID: 'test-r2-acc',
        R2_ACCESS_KEY_ID: 'test-r2-key',
        R2_SECRET_ACCESS_KEY: 'test-r2-secret',
        SOCIAL_TOKEN_ENCRYPTION_KEY: '', // Missing
        PADDLE_ENABLED: 'false',
        RAZORPAY_ENABLED: 'false',
        STRIPE_ENABLED: 'false',
      };

      const result = validateEnvironment({
        isProduction: true,
        exitOnError: false,
        env: mockEnv,
      });

      assert.equal(result.valid, false);
      assert.ok(
        result.errors.some((e) =>
          e.includes('Missing required environment variable: SOCIAL_TOKEN_ENCRYPTION_KEY')
        )
      );
    });

    it('validateEnvironment fails fast in production when SOCIAL_TOKEN_ENCRYPTION_KEY is malformed', () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret',
        MONGODB_URI: 'mongodb://127.0.0.1:27017',
        MONGODB_DB_NAME: 'vireo_test',
        R2_ACCOUNT_ID: 'test-r2-acc',
        R2_ACCESS_KEY_ID: 'test-r2-key',
        R2_SECRET_ACCESS_KEY: 'test-r2-secret',
        SOCIAL_TOKEN_ENCRYPTION_KEY: 'too-short', // Only 9 bytes
        PADDLE_ENABLED: 'false',
        RAZORPAY_ENABLED: 'false',
        STRIPE_ENABLED: 'false',
      };

      const result = validateEnvironment({
        isProduction: true,
        exitOnError: false,
        env: mockEnv,
      });

      assert.equal(result.valid, false);
      assert.ok(
        result.errors.some((e) =>
          e.includes('SOCIAL_TOKEN_ENCRYPTION_KEY is invalid')
        )
      );
    });

    it('validateEnvironment fails fast in production when enabled Paddle lacks PADDLE_WEBHOOK_SECRET', () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret',
        MONGODB_URI: 'mongodb://127.0.0.1:27017',
        MONGODB_DB_NAME: 'vireo_test',
        R2_ACCOUNT_ID: 'test-r2-acc',
        R2_ACCESS_KEY_ID: 'test-r2-key',
        R2_SECRET_ACCESS_KEY: 'test-r2-secret',
        SOCIAL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
        BILLING_PROVIDER_DEFAULT: 'paddle',
        PADDLE_ENABLED: 'true',
        PADDLE_WEBHOOK_SECRET: '', // Missing
        RAZORPAY_ENABLED: 'false',
        STRIPE_ENABLED: 'false',
      };

      const result = validateEnvironment({
        isProduction: true,
        exitOnError: false,
        env: mockEnv,
      });

      assert.equal(result.valid, false);
      assert.ok(
        result.errors.some((e) =>
          e.includes('PADDLE_WEBHOOK_SECRET')
        )
      );
    });

    it('validateEnvironment fails fast in production when enabled Razorpay lacks RAZORPAY_WEBHOOK_SECRET', () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret',
        MONGODB_URI: 'mongodb://127.0.0.1:27017',
        MONGODB_DB_NAME: 'vireo_test',
        R2_ACCOUNT_ID: 'test-r2-acc',
        R2_ACCESS_KEY_ID: 'test-r2-key',
        R2_SECRET_ACCESS_KEY: 'test-r2-secret',
        SOCIAL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
        BILLING_PROVIDER_DEFAULT: 'razorpay',
        RAZORPAY_ENABLED: 'true',
        RAZORPAY_WEBHOOK_SECRET: '', // Missing
        PADDLE_ENABLED: 'false',
        STRIPE_ENABLED: 'false',
      };

      const result = validateEnvironment({
        isProduction: true,
        exitOnError: false,
        env: mockEnv,
      });

      assert.equal(result.valid, false);
      assert.ok(
        result.errors.some((e) =>
          e.includes('RAZORPAY_WEBHOOK_SECRET')
        )
      );
    });

    it('validateEnvironment does NOT fail when a disabled provider lacks webhook secrets', () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret',
        MONGODB_URI: 'mongodb://127.0.0.1:27017',
        MONGODB_DB_NAME: 'vireo_test',
        R2_ACCOUNT_ID: 'test-r2-acc',
        R2_ACCESS_KEY_ID: 'test-r2-key',
        R2_SECRET_ACCESS_KEY: 'test-r2-secret',
        SOCIAL_TOKEN_ENCRYPTION_KEY: 'b'.repeat(64),
        BILLING_PROVIDER_DEFAULT: 'paddle',
        PADDLE_ENABLED: 'true',
        PADDLE_WEBHOOK_SECRET: 'pdl_whsec_test_1234567890',
        RAZORPAY_ENABLED: 'false', // Explicitly disabled
        RAZORPAY_WEBHOOK_SECRET: '', // Omitted without error
        STRIPE_ENABLED: 'false', // Explicitly disabled
      };

      const result = validateEnvironment({
        isProduction: true,
        exitOnError: false,
        env: mockEnv,
      });

      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('throws with throwOnError: true in production', () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SUPABASE_URL: '',
      };

      assert.throws(
        () => {
          validateEnvironment({
            isProduction: true,
            throwOnError: true,
            exitOnError: false,
            env: mockEnv,
          });
        },
        (err: Error) => {
          return err.message.includes('Production environment validation failed');
        }
      );
    });

    it('never bypasses webhook signature verification when secret is missing', async () => {
      const paddle = new PaddleBillingProvider();
      const fakePaddleBody = JSON.stringify({ event_type: 'subscription.activated' });
      // When paddleWebhookSecret is not configured, must return false (no bypass)
      const paddleResult = await paddle.verifyWebhook(fakePaddleBody, {
        'paddle-signature': 'ts=12345;h=fakehash',
      });
      assert.equal(paddleResult, false);

      const razorpay = new RazorpayBillingProvider();
      const fakeRazorpayBody = JSON.stringify({ event: 'subscription.charged' });
      // When razorpayWebhookSecret is not configured or altered, must return false (no bypass)
      (config as any).razorpayWebhookSecret = '';
      const rzpResult = await razorpay.verifyWebhook(fakeRazorpayBody, {
        'x-razorpay-signature': 'invalidsig',
      });
      assert.equal(rzpResult, false);
    });
  });
});

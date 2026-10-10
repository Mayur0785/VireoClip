import crypto from 'node:crypto';
import { config, validateSocialTokenEncryptionKey } from '../config/index.js';

export { validateSocialTokenEncryptionKey };

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes auth tag

/**
 * Derives a consistent 32-byte key from configuration or throws if missing/malformed.
 * Fails fast with clear non-sensitive error; never exposes the key itself.
 */
function getEncryptionKey(): Buffer {
  const secret = config.socialTokenEncryptionKey;
  const validation = validateSocialTokenEncryptionKey(secret, config.isProduction);

  if (!validation.valid) {
    throw new Error(validation.error || 'SOCIAL_TOKEN_ENCRYPTION_KEY environment variable is not configured.');
  }

  const trimmed = secret.trim();

  // If secret is 0x-prefixed 64 hex characters (66 chars)
  if ((trimmed.startsWith('0x') || trimmed.startsWith('0X')) && /^[0-9a-fA-F]{64}$/.test(trimmed.slice(2))) {
    return Buffer.from(trimmed.slice(2), 'hex');
  }

  // If secret is 64 hex characters (32 bytes hex), parse directly
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // Otherwise, use sha256 to deterministically produce 32 bytes
  return crypto.createHash('sha256').update(trimmed).digest();
}

/**
 * Encrypts plaintext string using AES-256-GCM.
 * Output format: hex string composed of iv:authTag:ciphertext
 */
export function encryptToken(plaintext: string, overrideKey?: Buffer): string {
  if (!plaintext) {
    throw new Error('Plaintext cannot be empty');
  }

  const key = overrideKey ?? getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a token encrypted with encryptToken using AES-256-GCM.
 * Validates integrity via the GCM authentication tag.
 */
export function decryptToken(encryptedBundle: string, overrideKey?: Buffer): string {
  if (!encryptedBundle) {
    throw new Error('Encrypted payload cannot be empty');
  }

  const parts = encryptedBundle.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token bundle format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = overrideKey ?? getEncryptionKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

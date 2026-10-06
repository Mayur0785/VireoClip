import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptToken, decryptToken } from '../utils/tokenEncryption.js';
import { socialProviderRegistry } from '../services/social/socialProviderRegistry.js';
import { socialService } from '../services/socialService.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';

describe('Phase 9 — Social OAuth & Account Connections', () => {
  const testUserId = 'a4d30f59-432e-48ac-a870-c455d351e25e';
  const otherUserId = 'b5e41f60-543f-49bd-b981-d566e462f36f';

  after(async () => {
    await closeMongo();
  });

  describe('Token Encryption & Decryption (AES-256-GCM)', () => {
    it('encrypts and decrypts a token accurately', () => {
      const sampleToken = 'ya29.a0AfH6SMDh_fake_google_access_token_12345';
      const encrypted = encryptToken(sampleToken);

      assert.notEqual(encrypted, sampleToken);
      assert.equal(encrypted.split(':').length, 3); // iv:authTag:ciphertext

      const decrypted = decryptToken(encrypted);
      assert.equal(decrypted, sampleToken);
    });

    it('produces different ciphertexts for identical plaintext due to random IV', () => {
      const sampleToken = 'gho_secret_access_token_test';
      const enc1 = encryptToken(sampleToken);
      const enc2 = encryptToken(sampleToken);

      assert.notEqual(enc1, enc2);
      assert.equal(decryptToken(enc1), sampleToken);
      assert.equal(decryptToken(enc2), sampleToken);
    });

    it('fails decryption when ciphertext or authentication tag is tampered with', () => {
      const sampleToken = 'sample_secret_token';
      const encrypted = encryptToken(sampleToken);
      const [iv, authTag, cipher] = encrypted.split(':');

      // Tamper with the ciphertext
      const tamperedCipher = cipher.slice(0, -2) + (cipher.slice(-2) === 'aa' ? 'bb' : 'aa');
      const tamperedBundle = `${iv}:${authTag}:${tamperedCipher}`;

      assert.throws(() => decryptToken(tamperedBundle));
    });

    it('fails decryption if wrong key is provided', () => {
      const sampleToken = 'secret_access_token';
      const key1 = crypto.randomBytes(32);
      const key2 = crypto.randomBytes(32);

      const encrypted = encryptToken(sampleToken, key1);
      assert.throws(() => decryptToken(encrypted, key2));
    });
  });

  describe('Provider Adapter Abstraction & Configuration Checks', () => {
    it('has all 5 required providers registered in registry', () => {
      assert.equal(socialProviderRegistry.hasProvider('youtube'), true);
      assert.equal(socialProviderRegistry.hasProvider('instagram'), true);
      assert.equal(socialProviderRegistry.hasProvider('tiktok'), true);
      assert.equal(socialProviderRegistry.hasProvider('linkedin'), true);
      assert.equal(socialProviderRegistry.hasProvider('x'), true);
    });

    it('accurately reports configured status for all providers without crashing', () => {
      const status = socialProviderRegistry.getPlatformConfigStatus();
      assert.equal(typeof status.youtube, 'boolean');
      assert.equal(typeof status.instagram, 'boolean');
      assert.equal(typeof status.tiktok, 'boolean');
      assert.equal(typeof status.linkedin, 'boolean');
      assert.equal(typeof status.x, 'boolean');
    });

    it('throws when requesting authorization URL for unconfigured provider', async () => {
      const provider = socialProviderRegistry.getProvider('youtube');
      if (!provider.isConfigured()) {
        await assert.rejects(
          async () => socialService.generateAuthorizationFlow(testUserId, 'youtube'),
          /PROVIDER_NOT_CONFIGURED|not configured/i
        );
      }
    });
  });

  describe('OAuth State Lifecycle & Security', () => {
    it('creates state bound to user and provider and generates valid URL', async () => {
      const youtubeProvider = socialProviderRegistry.getProvider('youtube');
      const origIsConfigured = youtubeProvider.isConfigured.bind(youtubeProvider);
      const origGetAuthUrl = youtubeProvider.getAuthorizationUrl.bind(youtubeProvider);

      youtubeProvider.isConfigured = () => true;
      youtubeProvider.getAuthorizationUrl = async (state: string) => ({
        url: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&client_id=mock`,
        state,
      });

      try {
        const { authorizationUrl } = await socialService.generateAuthorizationFlow(testUserId, 'youtube');
        assert.ok(authorizationUrl.includes('state='));

        const db = await getMongoDb();
        const urlParams = new URL(authorizationUrl).searchParams;
        const stateParam = urlParams.get('state')!;
        const stateHash = crypto.createHash('sha256').update(stateParam).digest('hex');

        const stateInDb = await db.collection('oauth_states').findOne({ state_hash: stateHash });
        assert.ok(stateInDb);
        assert.equal(stateInDb?.user_id, testUserId);
        assert.equal(stateInDb?.provider, 'youtube');
        assert.equal(stateInDb?.consumed_at, null);
      } finally {
        youtubeProvider.isConfigured = origIsConfigured;
        youtubeProvider.getAuthorizationUrl = origGetAuthUrl;
      }
    });

    it('rejects missing or tampered state', async () => {
      await assert.rejects(
        async () => socialService.handleOAuthCallback('youtube', 'non_existent_fake_state', 'fake_code'),
        /OAUTH_STATE_REJECTED|invalid/i
      );
    });

    it('enforces single-use: state cannot be replayed twice', async () => {
      const db = await getMongoDb();
      const rawState = crypto.randomBytes(32).toString('hex');
      const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');
      const now = new Date();

      await db.collection('oauth_states').insertOne({
        id: crypto.randomUUID(),
        user_id: testUserId,
        provider: 'youtube',
        state_hash: stateHash,
        redirect_uri: '',
        expires_at: new Date(now.getTime() + 600000),
        consumed_at: null,
        created_at: now,
        updated_at: now,
      });

      const youtubeProvider = socialProviderRegistry.getProvider('youtube');
      const origExchange = youtubeProvider.exchangeCode.bind(youtubeProvider);
      const origIdentity = youtubeProvider.getAccountIdentity.bind(youtubeProvider);

      youtubeProvider.exchangeCode = async () => ({
        accessToken: 'access_mock_123',
        refreshToken: 'refresh_mock_123',
        expiresInSeconds: 3600,
        scopes: ['youtube.readonly'],
      });
      youtubeProvider.getAccountIdentity = async () => ({
        providerAccountId: 'channel_replay_test_1',
        accountName: 'Test Channel',
        username: '@testchannel',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      try {
        const res1 = await socialService.handleOAuthCallback('youtube', rawState, 'valid_code_1');
        assert.equal(res1.connection.provider, 'youtube');

        await assert.rejects(
          async () => socialService.handleOAuthCallback('youtube', rawState, 'replay_code_2'),
          /OAUTH_STATE_REJECTED|invalid|expired/i
        );
      } finally {
        youtubeProvider.exchangeCode = origExchange;
        youtubeProvider.getAccountIdentity = origIdentity;
        await db.collection('social_account_connections').deleteMany({
          provider_account_id: 'channel_replay_test_1',
        });
      }
    });

    it('rejects expired state', async () => {
      const db = await getMongoDb();
      const rawState = crypto.randomBytes(32).toString('hex');
      const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');
      const expiredDate = new Date(Date.now() - 10000);

      await db.collection('oauth_states').insertOne({
        id: crypto.randomUUID(),
        user_id: testUserId,
        provider: 'youtube',
        state_hash: stateHash,
        redirect_uri: '',
        expires_at: expiredDate,
        consumed_at: null,
        created_at: expiredDate,
        updated_at: expiredDate,
      });

      await assert.rejects(
        async () => socialService.handleOAuthCallback('youtube', rawState, 'code_expired'),
        /OAUTH_STATE_REJECTED|invalid|expired/i
      );
    });
  });

  describe('Account Isolation, IDOR & Token Secrecy', () => {
    it('prevents linking the same provider account to multiple Vireo users', async () => {
      const db = await getMongoDb();
      const duplicateAccountId = 'unique_global_channel_999';

      await db.collection('social_account_connections').insertOne({
        id: crypto.randomUUID(),
        user_id: testUserId,
        provider: 'youtube',
        provider_account_id: duplicateAccountId,
        provider_account_name: 'Original Owner Channel',
        access_token: encryptToken('some_token'),
        scopes: ['youtube.readonly'],
        status: 'connected',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const rawStateUserB = crypto.randomBytes(32).toString('hex');
      const stateHashUserB = crypto.createHash('sha256').update(rawStateUserB).digest('hex');
      await db.collection('oauth_states').insertOne({
        id: crypto.randomUUID(),
        user_id: otherUserId,
        provider: 'youtube',
        state_hash: stateHashUserB,
        redirect_uri: '',
        expires_at: new Date(Date.now() + 600000),
        consumed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const ytProvider = socialProviderRegistry.getProvider('youtube');
      const origExchange = ytProvider.exchangeCode.bind(ytProvider);
      const origIdentity = ytProvider.getAccountIdentity.bind(ytProvider);

      ytProvider.exchangeCode = async () => ({
        accessToken: 'access_mock_user_b',
        refreshToken: null,
        expiresInSeconds: 3600,
        scopes: ['youtube.readonly'],
      });
      ytProvider.getAccountIdentity = async () => ({
        providerAccountId: duplicateAccountId,
        accountName: 'Same Global Channel',
      });

      try {
        await assert.rejects(
          async () => socialService.handleOAuthCallback('youtube', rawStateUserB, 'code_b'),
          /already connected to a different Vireo user/i
        );
      } finally {
        ytProvider.exchangeCode = origExchange;
        ytProvider.getAccountIdentity = origIdentity;
        await db.collection('social_account_connections').deleteMany({
          provider_account_id: duplicateAccountId,
        });
      }
    });

    it('NEVER returns plaintext or encrypted access/refresh tokens in getSafeUserConnections', async () => {
      const db = await getMongoDb();
      const testConnId = crypto.randomUUID();

      await db.collection('social_account_connections').insertOne({
        id: testConnId,
        user_id: testUserId,
        provider: 'youtube',
        provider_account_id: 'channel_safety_check',
        provider_account_name: 'Safe Channel',
        access_token: encryptToken('super_secret_access_token'),
        refresh_token: encryptToken('super_secret_refresh_token'),
        scopes: ['youtube.readonly'],
        status: 'connected',
        created_at: new Date(),
        updated_at: new Date(),
      });

      try {
        const safeConnections = await socialService.getSafeUserConnections(testUserId);
        const found = safeConnections.find((c) => c.id === testConnId);
        assert.ok(found);

        assert.equal((found as any).access_token, undefined);
        assert.equal((found as any).refresh_token, undefined);
        assert.equal((found as any).accessToken, undefined);
        assert.equal((found as any).refreshToken, undefined);
        assert.equal((found as any).secret, undefined);
      } finally {
        await db.collection('social_account_connections').deleteOne({ id: testConnId });
      }
    });

    it('prevents IDOR: User B cannot disconnect User A connection', async () => {
      const db = await getMongoDb();
      const testConnId = crypto.randomUUID();

      await db.collection('social_account_connections').insertOne({
        id: testConnId,
        user_id: testUserId,
        provider: 'youtube',
        provider_account_id: 'channel_idor_test',
        provider_account_name: 'User A Channel',
        access_token: encryptToken('token_a'),
        scopes: ['youtube.readonly'],
        status: 'connected',
        created_at: new Date(),
        updated_at: new Date(),
      });

      try {
        await assert.rejects(
          async () => socialService.disconnectAccount(otherUserId, testConnId),
          /Forbidden|permission/i
        );

        const stillExists = await db.collection('social_account_connections').findOne({ id: testConnId });
        assert.ok(stillExists);

        await socialService.disconnectAccount(testUserId, testConnId);
        const afterDelete = await db.collection('social_account_connections').findOne({ id: testConnId });
        assert.equal(afterDelete, null);
      } finally {
        await db.collection('social_account_connections').deleteOne({ id: testConnId });
      }
    });
  });
});

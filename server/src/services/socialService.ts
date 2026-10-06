import crypto from 'node:crypto';
import { getMongoDb } from '../db/mongoClient.js';
import {
  AppError,
  SocialPlatform,
  SocialAccountConnectionRecord,
  SafeSocialAccountConnection,
  OAuthStateRecord,
} from '../types/index.js';
import { socialProviderRegistry } from './social/socialProviderRegistry.js';
import { encryptToken, decryptToken } from '../utils/tokenEncryption.js';
import { logger } from '../utils/logger.js';

const STATE_TTL_SECONDS = 600; // 10 minutes

export class SocialService {
  /**
   * Generates a cryptographically random OAuth state bound to user and provider.
   * Stores sha256 hash of state in MongoDB to guard against forgery/tampering.
   */
  async generateAuthorizationFlow(
    userId: string,
    platform: SocialPlatform,
    redirectUri?: string
  ): Promise<{ authorizationUrl: string }> {
    const provider = socialProviderRegistry.getProvider(platform);
    if (!provider.isConfigured()) {
      throw new AppError(
        `${platform.toUpperCase()} connection is not configured on the server. Missing API credentials.`,
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    // Generate 32 bytes cryptographically secure random state
    const rawState = crypto.randomBytes(32).toString('hex');
    const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');

    // Get authorization URL from provider (handles PKCE if needed)
    const authResult = await provider.getAuthorizationUrl(rawState, redirectUri);

    const db = await getMongoDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STATE_TTL_SECONDS * 1000);

    const stateRecord: OAuthStateRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      provider: platform,
      state_hash: stateHash,
      code_verifier: authResult.codeVerifier,
      redirect_uri: redirectUri || '',
      expires_at: expiresAt,
      consumed_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.collection<OAuthStateRecord>('oauth_states').insertOne(stateRecord);

    return { authorizationUrl: authResult.url };
  }

  /**
   * Consumes single-use OAuth state and completes code exchange & credential encryption.
   */
  async handleOAuthCallback(
    platform: SocialPlatform,
    rawState: string,
    code: string,
    redirectUri?: string
  ): Promise<{ connection: SafeSocialAccountConnection }> {
    if (!rawState) {
      throw new AppError('Missing OAuth state parameter.', 400, 'INVALID_OAUTH_STATE');
    }
    if (!code) {
      throw new AppError('Missing OAuth authorization code.', 400, 'MISSING_AUTHORIZATION_CODE');
    }

    const provider = socialProviderRegistry.getProvider(platform);
    const db = await getMongoDb();
    const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');

    // Atomic find and mark as consumed to prevent replay attacks
    const now = new Date();
    const stateRecord = await db.collection<OAuthStateRecord>('oauth_states').findOneAndUpdate(
      {
        state_hash: stateHash,
        provider: platform,
        consumed_at: null,
        expires_at: { $gt: now },
      },
      {
        $set: { consumed_at: now, updated_at: now },
      },
      { returnDocument: 'after' }
    );

    if (!stateRecord) {
      throw new AppError(
        'OAuth state is invalid, expired, or has already been used.',
        400,
        'OAUTH_STATE_REJECTED'
      );
    }

    const { user_id: userId, code_verifier: codeVerifier } = stateRecord;

    // Exchange authorization code for provider tokens
    const tokenResult = await provider.exchangeCode(code, redirectUri, codeVerifier);

    // Fetch account identity
    const identity = await provider.getAccountIdentity(tokenResult.accessToken);

    // Check if provider account is already linked to another Vireo user
    const existingOtherUser = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      provider: platform,
      provider_account_id: identity.providerAccountId,
      user_id: { $ne: userId },
    });

    if (existingOtherUser) {
      throw new AppError(
        `This ${platform} account is already connected to a different Vireo user.`,
        409,
        'ACCOUNT_ALREADY_LINKED'
      );
    }

    // Encrypt sensitive tokens with authenticated AES-256-GCM
    const encryptedAccessToken = encryptToken(tokenResult.accessToken);
    const encryptedRefreshToken = tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null;

    const tokenExpiresAt = tokenResult.expiresInSeconds
      ? new Date(Date.now() + tokenResult.expiresInSeconds * 1000)
      : null;

    // Upsert user connection
    const connectionRecord: Partial<SocialAccountConnectionRecord> = {
      user_id: userId,
      provider: platform,
      provider_account_id: identity.providerAccountId,
      provider_account_name: identity.accountName,
      provider_username: identity.username,
      provider_avatar_url: identity.avatarUrl,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: tokenExpiresAt,
      scopes: tokenResult.scopes,
      status: 'connected',
      metadata: identity.metadata,
      last_verified_at: now,
      last_error_at: null,
      last_error_code: null,
      updated_at: now,
    };

    const existingUserConn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      user_id: userId,
      provider: platform,
    });

    let savedId: string;
    if (existingUserConn) {
      savedId = existingUserConn.id;
      // Preserve existing refresh token if new response did not rotate it
      if (!encryptedRefreshToken && existingUserConn.refresh_token) {
        connectionRecord.refresh_token = existingUserConn.refresh_token;
      }
      await db.collection<SocialAccountConnectionRecord>('social_account_connections').updateOne(
        { id: savedId },
        { $set: connectionRecord }
      );
    } else {
      savedId = crypto.randomUUID();
      connectionRecord.id = savedId;
      connectionRecord.created_at = now;
      await db.collection<SocialAccountConnectionRecord>('social_account_connections').insertOne(
        connectionRecord as SocialAccountConnectionRecord
      );
    }

    logger.info('Social account connected successfully', {
      userId,
      platform,
      providerAccountId: identity.providerAccountId,
    });

    return {
      connection: {
        id: savedId,
        provider: platform,
        account_name: identity.accountName,
        username: identity.username,
        avatar_url: identity.avatarUrl,
        status: 'connected',
        scopes: tokenResult.scopes,
        connected_at: now.toISOString(),
        last_verified_at: now.toISOString(),
        is_configured: true,
      },
    };
  }

  /**
   * Retrieves all connected social accounts for a user with all token secrets stripped.
   */
  async getSafeUserConnections(userId: string): Promise<SafeSocialAccountConnection[]> {
    const db = await getMongoDb();
    const records = await db
      .collection<SocialAccountConnectionRecord>('social_account_connections')
      .find({ user_id: userId })
      .toArray();

    const configStatus = socialProviderRegistry.getPlatformConfigStatus();

    return records.map((record) => ({
      id: record.id,
      provider: record.provider,
      account_name: record.provider_account_name,
      username: record.provider_username,
      avatar_url: record.provider_avatar_url,
      status: record.status,
      scopes: record.scopes || [],
      connected_at: record.created_at ? new Date(record.created_at).toISOString() : new Date().toISOString(),
      last_verified_at: record.last_verified_at ? new Date(record.last_verified_at).toISOString() : null,
      is_configured: Boolean(configStatus[record.provider]),
    }));
  }

  /**
   * Disconnects a user's social connection, revoking provider token if supported.
   * Strictly enforces user ownership.
   */
  async disconnectAccount(userId: string, connectionId: string): Promise<void> {
    const db = await getMongoDb();
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: connectionId,
    });

    if (!conn) {
      throw new AppError('Connection not found.', 404, 'CONNECTION_NOT_FOUND');
    }

    if (conn.user_id !== userId) {
      throw new AppError('Forbidden: You do not have permission to disconnect this account.', 403, 'FORBIDDEN');
    }

    // Try revoking provider tokens
    try {
      const provider = socialProviderRegistry.getProvider(conn.provider);
      if (provider.revokeConnection && conn.access_token) {
        const decryptedAccess = decryptToken(conn.access_token);
        const decryptedRefresh = conn.refresh_token ? decryptToken(conn.refresh_token) : null;
        await provider.revokeConnection(decryptedAccess, decryptedRefresh);
      }
    } catch (err) {
      logger.warn('Failed provider revoke (non-fatal, continuing local delete)', {
        connectionId,
        provider: conn.provider,
        err,
      });
    }

    await db.collection<SocialAccountConnectionRecord>('social_account_connections').deleteOne({
      id: connectionId,
      user_id: userId,
    });

    logger.info('Social account disconnected successfully', { userId, connectionId, provider: conn.provider });
  }

  /**
   * Refreshes credentials for a connected social account.
   */
  async refreshConnection(userId: string, connectionId: string): Promise<SafeSocialAccountConnection> {
    const db = await getMongoDb();
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: connectionId,
    });

    if (!conn) {
      throw new AppError('Connection not found.', 404, 'CONNECTION_NOT_FOUND');
    }

    if (conn.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }

    const provider = socialProviderRegistry.getProvider(conn.provider);

    // Refresh token requirement: either refresh_token is present, or provider supports refreshing access token (e.g. Meta)
    const rawRefreshToken = conn.refresh_token ? decryptToken(conn.refresh_token) : decryptToken(conn.access_token);

    const refreshResult = await provider.refreshAccessToken(rawRefreshToken);
    const now = new Date();

    const updates: Partial<SocialAccountConnectionRecord> = {
      access_token: encryptToken(refreshResult.accessToken),
      token_expires_at: refreshResult.expiresInSeconds
        ? new Date(now.getTime() + refreshResult.expiresInSeconds * 1000)
        : null,
      last_verified_at: now,
      status: 'connected',
      last_error_at: null,
      last_error_code: null,
      updated_at: now,
    };

    // If provider rotated refresh token, update it; otherwise preserve existing
    if (refreshResult.refreshToken) {
      updates.refresh_token = encryptToken(refreshResult.refreshToken);
    }

    await db.collection<SocialAccountConnectionRecord>('social_account_connections').updateOne(
      { id: connectionId },
      { $set: updates }
    );

    return {
      id: conn.id,
      provider: conn.provider,
      account_name: conn.provider_account_name,
      username: conn.provider_username,
      avatar_url: conn.provider_avatar_url,
      status: 'connected',
      scopes: refreshResult.scopes || conn.scopes,
      connected_at: conn.created_at ? new Date(conn.created_at).toISOString() : now.toISOString(),
      last_verified_at: now.toISOString(),
      is_configured: true,
    };
  }

  /**
   * Returns safe status of a specific connection.
   */
  async getConnectionStatus(userId: string, connectionId: string): Promise<SafeSocialAccountConnection> {
    const db = await getMongoDb();
    const conn = await db.collection<SocialAccountConnectionRecord>('social_account_connections').findOne({
      id: connectionId,
    });

    if (!conn) {
      throw new AppError('Connection not found.', 404, 'CONNECTION_NOT_FOUND');
    }

    if (conn.user_id !== userId) {
      throw new AppError('Forbidden: Access denied.', 403, 'FORBIDDEN');
    }

    const isConfigured = socialProviderRegistry.getProvider(conn.provider).isConfigured();

    return {
      id: conn.id,
      provider: conn.provider,
      account_name: conn.provider_account_name,
      username: conn.provider_username,
      avatar_url: conn.provider_avatar_url,
      status: conn.status,
      scopes: conn.scopes,
      connected_at: conn.created_at ? new Date(conn.created_at).toISOString() : new Date().toISOString(),
      last_verified_at: conn.last_verified_at ? new Date(conn.last_verified_at).toISOString() : null,
      is_configured: isConfigured,
    };
  }

  /**
   * Cleans up expired or consumed OAuth states older than 1 hour.
   */
  async cleanupExpiredOAuthStates(): Promise<number> {
    const db = await getMongoDb();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const result = await db.collection<OAuthStateRecord>('oauth_states').deleteMany({
      $or: [
        { expires_at: { $lt: now } },
        { consumed_at: { $lt: oneHourAgo } },
      ],
    });
    return result.deletedCount || 0;
  }
}

export const socialService = new SocialService();

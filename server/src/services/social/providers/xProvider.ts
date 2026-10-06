import crypto from 'node:crypto';
import { config } from '../../../config/index.js';
import { AppError } from '../../../types/index.js';
import {
  SocialOAuthProvider,
  OAuthAuthorizationUrlResult,
  OAuthTokenExchangeResult,
  ProviderAccountIdentity,
  RefreshTokenResult,
} from '../types.js';

/**
 * X / Twitter OAuth 2.0 with PKCE Provider
 * Auth: https://twitter.com/i/oauth2/authorize
 * Token: https://api.twitter.com/2/oauth2/token
 * Scopes: tweet.read, tweet.write, users.read, offline.access
 */
export class XOAuthProvider implements SocialOAuthProvider {
  readonly platform = 'x' as const;

  private readonly defaultScopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

  isConfigured(): boolean {
    return Boolean(config.xClientId);
  }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  async getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'X (Twitter) OAuth is not configured. Please set X_CLIENT_ID.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const rUri = redirectUri || config.xRedirectUri;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.xClientId,
      redirect_uri: rUri,
      scope: this.defaultScopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  async exchangeCode(
    code: string,
    redirectUri?: string,
    codeVerifier?: string
  ): Promise<OAuthTokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new AppError('X OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    if (!codeVerifier) {
      throw new AppError('X OAuth requires PKCE code_verifier.', 400, 'PKCE_VERIFIER_MISSING');
    }

    const rUri = redirectUri || config.xRedirectUri;
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: config.xClientId,
      redirect_uri: rUri,
      code_verifier: codeVerifier,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (config.xClientSecret) {
      const basicAuth = Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `X token exchange failed: ${data.error_description || data.error || res.statusText}`,
        400,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 7200,
      tokenType: data.token_type || 'Bearer',
      scopes: data.scope ? data.scope.split(' ') : this.defaultScopes,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult> {
    if (!this.isConfigured()) {
      throw new AppError('X OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.xClientId,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (config.xClientSecret) {
      const basicAuth = Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `X token refresh failed: ${data.error_description || data.error || res.statusText}`,
        401,
        'TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null, // Twitter rotates refresh tokens
      expiresInSeconds: data.expires_in || 7200,
      scopes: data.scope ? data.scope.split(' ') : undefined,
    };
  }

  async getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity> {
    const res = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new AppError('Failed to fetch X user info.', 400, 'IDENTITY_FETCH_FAILED');
    }

    const data = await res.json() as any;
    const user = data.data || {};

    return {
      providerAccountId: user.id || 'unknown_x_id',
      accountName: user.name || user.username || 'X User',
      username: user.username ? `@${user.username}` : null,
      avatarUrl: user.profile_image_url || null,
      metadata: {
        xUserId: user.id,
      },
    };
  }

  async revokeConnection(accessToken: string): Promise<void> {
    try {
      const body = new URLSearchParams({
        token: accessToken,
        token_type_hint: 'access_token',
        client_id: config.xClientId,
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      if (config.xClientSecret) {
        const basicAuth = Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
      }
      await fetch('https://api.twitter.com/2/oauth2/revoke', {
        method: 'POST',
        headers,
        body: body.toString(),
      });
    } catch {
      // Best-effort
    }
  }

  normalizeError(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'An error occurred during X OAuth.';
  }
}

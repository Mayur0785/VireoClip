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
 * TikTok Developer OAuth 2.0 Provider
 * Flow uses TikTok Login Kit v2
 * Auth: https://www.tiktok.com/v2/auth/authorize/
 * Token: https://open.tiktokapis.com/v2/oauth/token/
 * Scopes: user.info.basic, video.upload
 */
export class TikTokOAuthProvider implements SocialOAuthProvider {
  readonly platform = 'tiktok' as const;

  private readonly defaultScopes = ['user.info.basic', 'video.upload'];

  isConfigured(): boolean {
    return Boolean(config.tiktokClientKey && config.tiktokClientSecret);
  }

  async getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'TikTok OAuth is not configured. Please set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    const rUri = redirectUri || config.tiktokRedirectUri;
    const params = new URLSearchParams({
      client_key: config.tiktokClientKey,
      scope: this.defaultScopes.join(','),
      response_type: 'code',
      redirect_uri: rUri,
      state,
    });

    return {
      url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
      state,
    };
  }

  async exchangeCode(code: string, redirectUri?: string): Promise<OAuthTokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new AppError('TikTok OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const rUri = redirectUri || config.tiktokRedirectUri;
    const body = new URLSearchParams({
      client_key: config.tiktokClientKey,
      client_secret: config.tiktokClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: rUri,
    });

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `TikTok token exchange failed: ${data.error_description || data.message || res.statusText}`,
        400,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 86400,
      tokenType: data.token_type || 'Bearer',
      scopes: data.scope ? data.scope.split(',') : this.defaultScopes,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult> {
    if (!this.isConfigured()) {
      throw new AppError('TikTok OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const body = new URLSearchParams({
      client_key: config.tiktokClientKey,
      client_secret: config.tiktokClientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `TikTok token refresh failed: ${data.error_description || data.message || res.statusText}`,
        401,
        'TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 86400,
      scopes: data.scope ? data.scope.split(',') : undefined,
    };
  }

  async getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity> {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      throw new AppError('Failed to fetch TikTok account identity.', 400, 'IDENTITY_FETCH_FAILED');
    }

    const data = await res.json() as any;
    const user = data.data?.user || {};

    return {
      providerAccountId: user.open_id || user.union_id || 'unknown_tiktok_id',
      accountName: user.display_name || user.username || 'TikTok Creator',
      username: user.username || null,
      avatarUrl: user.avatar_url || null,
      metadata: {
        openId: user.open_id,
        unionId: user.union_id,
      },
    };
  }

  async revokeConnection(accessToken: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const body = new URLSearchParams({
        client_key: config.tiktokClientKey,
        client_secret: config.tiktokClientSecret,
        token: accessToken,
      });
      await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      // Best-effort
    }
  }

  normalizeError(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'An error occurred during TikTok OAuth.';
  }
}

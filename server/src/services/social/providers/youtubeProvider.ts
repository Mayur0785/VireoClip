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
 * YouTube OAuth 2.0 Provider
 * Official Google Identity OAuth endpoints:
 * Auth: https://accounts.google.com/o/oauth2/v2/auth
 * Token: https://oauth2.googleapis.com/token
 * Scopes: youtube.readonly, youtube.upload
 */
export class YouTubeOAuthProvider implements SocialOAuthProvider {
  readonly platform = 'youtube' as const;

  private readonly defaultScopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
    'openid',
    'profile',
    'email',
  ];

  isConfigured(): boolean {
    return Boolean(config.googleClientId && config.googleClientSecret);
  }

  async getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'Google / YouTube OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    const rUri = redirectUri || config.googleRedirectUri;
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: rUri,
      response_type: 'code',
      scope: this.defaultScopes.join(' '),
      access_type: 'offline', // Demands refresh_token
      prompt: 'consent', // Ensures refresh token is re-issued
      state,
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  async exchangeCode(
    code: string,
    redirectUri?: string
  ): Promise<OAuthTokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new AppError('Google / YouTube OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const rUri = redirectUri || config.googleRedirectUri;
    const body = new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: rUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `YouTube token exchange failed: ${data.error_description || data.error || res.statusText}`,
        400,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 3600,
      tokenType: data.token_type || 'Bearer',
      scopes: data.scope ? data.scope.split(' ') : this.defaultScopes,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult> {
    if (!this.isConfigured()) {
      throw new AppError('Google / YouTube OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const body = new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `YouTube token refresh failed: ${data.error_description || data.error || res.statusText}`,
        401,
        'TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      // Note: Google does not always send a new refresh token unless rotated
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 3600,
      scopes: data.scope ? data.scope.split(' ') : undefined,
    };
  }

  async getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity> {
    // 1. First fetch channel info from YouTube Data API v3
    try {
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (ytRes.ok) {
        const ytData = await ytRes.json() as any;
        if (ytData.items && ytData.items.length > 0) {
          const channel = ytData.items[0];
          const snippet = channel.snippet || {};
          return {
            providerAccountId: channel.id,
            accountName: snippet.title || 'YouTube Channel',
            username: snippet.customUrl || null,
            avatarUrl: snippet.thumbnails?.default?.url || snippet.thumbnails?.high?.url || null,
            metadata: {
              channelId: channel.id,
              customUrl: snippet.customUrl,
              description: snippet.description,
            },
          };
        }
      }
    } catch {
      // Fall through to Google userinfo if YouTube channel query fails or channel does not exist
    }

    // 2. Fallback to Google UserInfo if channel query failed (e.g. brand account without channel)
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      throw new AppError('Failed to fetch Google/YouTube account identity.', 400, 'IDENTITY_FETCH_FAILED');
    }

    const userData = await userRes.json() as any;
    return {
      providerAccountId: userData.id,
      accountName: userData.name || userData.email || 'YouTube User',
      username: userData.email || null,
      avatarUrl: userData.picture || null,
      metadata: {
        email: userData.email,
        verified_email: userData.verified_email,
      },
    };
  }

  async revokeConnection(accessToken: string): Promise<void> {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // Best-effort revocation
    }
  }

  normalizeError(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'An unknown error occurred during YouTube OAuth.';
  }
}

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
 * LinkedIn OAuth 2.0 Provider
 * Auth: https://www.linkedin.com/oauth/v2/authorization
 * Token: https://www.linkedin.com/oauth/v2/accessToken
 * Scopes: openid, profile, email, w_member_social
 */
export class LinkedInOAuthProvider implements SocialOAuthProvider {
  readonly platform = 'linkedin' as const;

  private readonly defaultScopes = ['openid', 'profile', 'email', 'w_member_social'];

  isConfigured(): boolean {
    return Boolean(config.linkedinClientId && config.linkedinClientSecret);
  }

  async getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    const rUri = redirectUri || config.linkedinRedirectUri;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.linkedinClientId,
      redirect_uri: rUri,
      state,
      scope: this.defaultScopes.join(' '),
    });

    return {
      url: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
      state,
    };
  }

  async exchangeCode(code: string, redirectUri?: string): Promise<OAuthTokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new AppError('LinkedIn OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const rUri = redirectUri || config.linkedinRedirectUri;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.linkedinClientId,
      client_secret: config.linkedinClientSecret,
      redirect_uri: rUri,
    });

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `LinkedIn token exchange failed: ${data.error_description || data.error || res.statusText}`,
        400,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 5184000,
      tokenType: data.token_type || 'Bearer',
      scopes: data.scope ? data.scope.split(' ') : this.defaultScopes,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult> {
    if (!this.isConfigured()) {
      throw new AppError('LinkedIn OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.linkedinClientId,
      client_secret: config.linkedinClientSecret,
    });

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new AppError(
        `LinkedIn token refresh failed: ${data.error_description || data.error || res.statusText}`,
        401,
        'TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresInSeconds: data.expires_in || 5184000,
      scopes: data.scope ? data.scope.split(' ') : undefined,
    };
  }

  async getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity> {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new AppError('Failed to fetch LinkedIn user info.', 400, 'IDENTITY_FETCH_FAILED');
    }

    const data = await res.json() as any;
    return {
      providerAccountId: data.sub,
      accountName: data.name || `${data.given_name || ''} ${data.family_name || ''}`.trim() || 'LinkedIn Member',
      username: data.email || null,
      avatarUrl: data.picture || null,
      metadata: {
        urn: `urn:li:person:${data.sub}`,
        email: data.email,
      },
    };
  }

  normalizeError(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'An error occurred during LinkedIn OAuth.';
  }
}

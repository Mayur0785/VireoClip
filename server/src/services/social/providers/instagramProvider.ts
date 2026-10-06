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
 * Instagram / Meta Graph API OAuth Provider
 * Flow uses Meta / Facebook Login for Instagram Professional/Creator accounts
 * Auth: https://www.facebook.com/v19.0/dialog/oauth
 * Token exchange: https://graph.facebook.com/v19.0/oauth/access_token
 * Scopes: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement
 */
export class InstagramOAuthProvider implements SocialOAuthProvider {
  readonly platform = 'instagram' as const;

  private readonly defaultScopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ];

  isConfigured(): boolean {
    return Boolean(config.metaClientId && config.metaClientSecret);
  }

  async getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'Meta / Instagram OAuth is not configured. Please set META_CLIENT_ID and META_CLIENT_SECRET.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    const rUri = redirectUri || config.metaRedirectUri;
    const params = new URLSearchParams({
      client_id: config.metaClientId,
      redirect_uri: rUri,
      state,
      scope: this.defaultScopes.join(','),
      response_type: 'code',
    });

    return {
      url: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
      state,
    };
  }

  async exchangeCode(code: string, redirectUri?: string): Promise<OAuthTokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new AppError('Meta / Instagram OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const rUri = redirectUri || config.metaRedirectUri;
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', config.metaClientId);
    tokenUrl.searchParams.set('client_secret', config.metaClientSecret);
    tokenUrl.searchParams.set('redirect_uri', rUri);
    tokenUrl.searchParams.set('code', code);

    const res = await fetch(tokenUrl.toString());
    const data = await res.json() as any;

    if (!res.ok || data.error) {
      throw new AppError(
        `Instagram token exchange failed: ${data.error?.message || res.statusText}`,
        400,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    // Exchange short-lived token for long-lived Meta token (60 days)
    let finalAccessToken = data.access_token;
    let expiresIn = data.expires_in || 5184000; // default ~60 days

    try {
      const longLivedUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
      longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longLivedUrl.searchParams.set('client_id', config.metaClientId);
      longLivedUrl.searchParams.set('client_secret', config.metaClientSecret);
      longLivedUrl.searchParams.set('fb_exchange_token', data.access_token);

      const llRes = await fetch(longLivedUrl.toString());
      if (llRes.ok) {
        const llData = await llRes.json() as any;
        if (llData.access_token) {
          finalAccessToken = llData.access_token;
          expiresIn = llData.expires_in || 5184000;
        }
      }
    } catch {
      // Continue with original access token
    }

    return {
      accessToken: finalAccessToken,
      refreshToken: null, // Meta long-lived tokens refresh by exchanging existing token
      expiresInSeconds: expiresIn,
      tokenType: data.token_type || 'Bearer',
      scopes: this.defaultScopes,
    };
  }

  async refreshAccessToken(currentAccessToken: string): Promise<RefreshTokenResult> {
    if (!this.isConfigured()) {
      throw new AppError('Meta / Instagram OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const url = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', config.metaClientId);
    url.searchParams.set('client_secret', config.metaClientSecret);
    url.searchParams.set('fb_exchange_token', currentAccessToken);

    const res = await fetch(url.toString());
    const data = await res.json() as any;

    if (!res.ok || data.error) {
      throw new AppError(
        `Instagram token refresh failed: ${data.error?.message || res.statusText}`,
        401,
        'TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresInSeconds: data.expires_in || 5184000,
    };
  }

  async getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity> {
    // 1. Fetch user accounts/pages to find linked Instagram Business/Creator Account
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${accessToken}`
    );

    if (pagesRes.ok) {
      const pagesData = await pagesRes.json() as any;
      if (pagesData.data && pagesData.data.length > 0) {
        for (const page of pagesData.data) {
          if (page.instagram_business_account) {
            const ig = page.instagram_business_account;
            return {
              providerAccountId: ig.id,
              accountName: ig.name || ig.username || 'Instagram Business',
              username: ig.username || null,
              avatarUrl: ig.profile_picture_url || null,
              metadata: {
                pageId: page.id,
                instagramBusinessId: ig.id,
              },
            };
          }
        }
      }
    }

    // 2. Fallback to basic Meta /me identity if no business account is linked yet
    const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${accessToken}`);
    if (!meRes.ok) {
      throw new AppError('Failed to fetch Instagram account identity.', 400, 'IDENTITY_FETCH_FAILED');
    }

    const meData = await meRes.json() as any;
    return {
      providerAccountId: meData.id,
      accountName: meData.name || 'Instagram User',
      username: null,
      avatarUrl: meData.picture?.data?.url || null,
      metadata: {
        note: 'No Instagram Professional Account linked to Meta Page. Link an IG account for publishing in Phase 10.',
      },
    };
  }

  normalizeError(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'An error occurred during Instagram OAuth.';
  }
}

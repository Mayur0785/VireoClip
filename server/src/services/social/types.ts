import { SocialPlatform } from '../../types/index.js';

export interface OAuthAuthorizationUrlResult {
  url: string;
  state: string;
  codeVerifier?: string; // PKCE verifier if provider uses PKCE (e.g. X)
}

export interface OAuthTokenExchangeResult {
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  tokenType?: string;
  scopes: string[];
}

export interface ProviderAccountIdentity {
  providerAccountId: string;
  accountName: string;
  username?: string | null;
  avatarUrl?: string | null;
  metadata?: Record<string, any>;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken?: string | null; // Providers may rotate refresh token or omit it
  expiresInSeconds?: number | null;
  scopes?: string[];
}

export interface SocialOAuthProvider {
  readonly platform: SocialPlatform;

  /** Checks if server environment has necessary credentials configured for this provider */
  isConfigured(): boolean;

  /** Generates the provider authorization URL with required scopes & CSRF state */
  getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult>;

  /** Exchanges the authorization code received from provider callback for access/refresh tokens */
  exchangeCode(code: string, redirectUri?: string, codeVerifier?: string): Promise<OAuthTokenExchangeResult>;

  /** Refreshes an expired access token using the stored refresh token */
  refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult>;

  /** Fetches public account identity and verified channel/user information from the provider */
  getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity>;

  /** Revokes token access on provider server if supported */
  revokeConnection?(accessToken: string, refreshToken?: string | null): Promise<void>;

  /** Normalizes provider-specific error responses into standardized error messages */
  normalizeError(error: unknown): string;
}

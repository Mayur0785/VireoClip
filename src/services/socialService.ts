import { backendRequest } from './backendClient';

export type SocialPlatform = 'youtube' | 'instagram' | 'tiktok' | 'linkedin' | 'x';

export type SocialConnectionStatus = 'connected' | 'expired' | 'revoked' | 'error';

export interface SafeSocialAccountConnection {
  id: string;
  provider: SocialPlatform;
  account_name: string;
  username?: string | null;
  avatar_url?: string | null;
  status: SocialConnectionStatus;
  scopes: string[];
  connected_at: string;
  last_verified_at?: string | null;
  is_configured: boolean;
}

export interface ConnectedAccountsResponse {
  status: 'ok';
  data: {
    accounts: SafeSocialAccountConnection[];
    configuredProviders: Record<SocialPlatform, boolean>;
  };
}

export interface InitiateConnectResponse {
  status: 'ok';
  data: {
    authorizationUrl: string;
  };
}

export const socialService = {
  /**
   * Fetches all connected accounts and server provider configuration states
   */
  async getAccounts(): Promise<{
    accounts: SafeSocialAccountConnection[];
    configuredProviders: Record<SocialPlatform, boolean>;
  }> {
    const res = await backendRequest<ConnectedAccountsResponse>('/social/accounts');
    return res.data;
  },

  /**
   * Initiates the OAuth flow by requesting the authorization URL from the server
   */
  async getAuthorizationUrl(provider: SocialPlatform): Promise<string> {
    const res = await backendRequest<InitiateConnectResponse>(`/social/${provider}/connect`, {
      method: 'POST',
    });
    return res.data.authorizationUrl;
  },

  /**
   * Disconnects a connected social account
   */
  async disconnectAccount(connectionId: string): Promise<void> {
    await backendRequest<{ status: 'ok'; message: string }>(`/social/${connectionId}/disconnect`, {
      method: 'POST',
    });
  },

  /**
   * Refreshes an account's OAuth credentials
   */
  async refreshConnection(connectionId: string): Promise<SafeSocialAccountConnection> {
    const res = await backendRequest<{ status: 'ok'; data: { connection: SafeSocialAccountConnection } }>(
      `/social/${connectionId}/refresh`,
      {
        method: 'POST',
      }
    );
    return res.data.connection;
  },
};

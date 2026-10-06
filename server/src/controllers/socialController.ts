import { Response } from 'express';
import { AuthenticatedRequest, AppError, SocialPlatform } from '../types/index.js';
import { socialService } from '../services/socialService.js';
import { socialProviderRegistry } from '../services/social/socialProviderRegistry.js';
import { config } from '../config/index.js';

export async function getConnectedAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  const accounts = await socialService.getSafeUserConnections(req.user.id);
  const configStatus = socialProviderRegistry.getPlatformConfigStatus();

  res.json({
    status: 'ok',
    data: {
      accounts,
      configuredProviders: configStatus,
    },
  });
}

export async function initiateConnect(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  const { provider } = req.params;
  if (!socialProviderRegistry.hasProvider(provider)) {
    throw new AppError(`Unsupported provider: ${provider}`, 400, 'UNSUPPORTED_PROVIDER');
  }

  const redirectUri = (req.body && req.body.redirectUri) || (req.query && req.query.redirectUri as string) || undefined;
  const result = await socialService.generateAuthorizationFlow(
    req.user.id,
    provider as SocialPlatform,
    redirectUri
  );

  res.json({
    status: 'ok',
    data: {
      authorizationUrl: result.authorizationUrl,
    },
  });
}

export async function handleCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { provider } = req.params;
  const { state, code, error, error_description } = req.query;

  // Handle provider denial or error parameters
  if (error) {
    const errorMsg = (error_description as string) || (error as string) || 'Provider authorization denied';
    const clientRedirect = `${config.appUrl}/settings?social_error=${encodeURIComponent(errorMsg)}&provider=${provider}`;
    res.redirect(clientRedirect);
    return;
  }

  if (!state || typeof state !== 'string') {
    const clientRedirect = `${config.appUrl}/settings?social_error=${encodeURIComponent('Missing OAuth state parameter')}&provider=${provider}`;
    res.redirect(clientRedirect);
    return;
  }

  if (!code || typeof code !== 'string') {
    const clientRedirect = `${config.appUrl}/settings?social_error=${encodeURIComponent('Missing authorization code from provider')}&provider=${provider}`;
    res.redirect(clientRedirect);
    return;
  }

  if (!socialProviderRegistry.hasProvider(provider)) {
    const clientRedirect = `${config.appUrl}/settings?social_error=${encodeURIComponent('Unsupported provider')}&provider=${provider}`;
    res.redirect(clientRedirect);
    return;
  }

  try {
    await socialService.handleOAuthCallback(
      provider as SocialPlatform,
      state,
      code
    );

    // Redirect user back to frontend Settings page with success indicator
    const clientRedirect = `${config.appUrl}/settings?social_connected=${encodeURIComponent(provider)}`;
    res.redirect(clientRedirect);
  } catch (err: any) {
    const errMsg = err?.message || 'Failed to complete account connection';
    const clientRedirect = `${config.appUrl}/settings?social_error=${encodeURIComponent(errMsg)}&provider=${provider}`;
    res.redirect(clientRedirect);
  }
}

export async function disconnectAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  const { connectionId } = req.params;
  if (!connectionId) {
    throw new AppError('Connection ID is required.', 400, 'INVALID_REQUEST');
  }

  await socialService.disconnectAccount(req.user.id, connectionId);

  res.json({
    status: 'ok',
    message: 'Account disconnected successfully.',
  });
}

export async function refreshConnection(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  const { connectionId } = req.params;
  if (!connectionId) {
    throw new AppError('Connection ID is required.', 400, 'INVALID_REQUEST');
  }

  const refreshed = await socialService.refreshConnection(req.user.id, connectionId);

  res.json({
    status: 'ok',
    data: {
      connection: refreshed,
    },
  });
}

export async function getConnectionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  const { connectionId } = req.params;
  if (!connectionId) {
    throw new AppError('Connection ID is required.', 400, 'INVALID_REQUEST');
  }

  const connStatus = await socialService.getConnectionStatus(req.user.id, connectionId);

  res.json({
    status: 'ok',
    data: {
      connection: connStatus,
    },
  });
}

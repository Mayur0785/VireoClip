import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AuthenticatedRequest, AppError, BillingProviderName, PlanId, BillingInterval } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPlanDefinition, getAllPlans } from '../services/billing/planConfig.js';
import { BillingRegistry } from '../services/billing/billingRegistry.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { UsageService } from '../services/usageService.js';
import { getMongoDb } from '../db/mongoClient.js';

/**
 * GET /api/billing/plans
 * Returns available plans and their limits
 */
export async function getPlans(req: Request, res: Response): Promise<void> {
  const plans = getAllPlans();
  const availableProviders = BillingRegistry.getAvailableProviders();

  res.status(200).json({
    status: 'ok',
    data: {
      plans,
      providers: availableProviders,
      defaultProvider: config.billingProviderDefault || 'paddle',
    },
  });
}

/**
 * GET /api/billing/usage
 * Retrieves user's monthly processing usage, limits, and UTC reset date
 */
export async function getBillingUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const usage = await UsageService.getCurrentUsage(userId, req.user?.email);
  res.status(200).json({
    status: 'ok',
    data: usage,
  });
}

/**
 * GET /api/billing/subscription
 * Retrieves active entitlement, plan details, and subscription state
 */
export async function getSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const entitlement = await SubscriptionService.resolveUserEntitlement(userId, req.user?.email);
  const currentPlan = getPlanDefinition(entitlement.plan_id === 'developer' ? 'business' : entitlement.plan_id);

  res.status(200).json({
    status: 'ok',
    data: {
      entitlement,
      plan: currentPlan,
      isUnlimited: entitlement.is_unlimited,
      providers: BillingRegistry.getAvailableProviders(),
    },
  });
}

/**
 * POST /api/billing/checkout
 * Creates a real checkout session/subscription with the requested provider
 */
export async function createCheckout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  const userEmail = req.user?.email;

  if (!userId || !userEmail) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const { planId, interval = 'month', provider: requestedProvider } = req.body;
  if (!planId || !['creator', 'pro', 'studio'].includes(planId)) {
    throw new AppError('Invalid planId. Must be "creator", "pro", or "studio".', 400, 'INVALID_PLAN');
  }

  const selectedInterval: BillingInterval = interval === 'year' ? 'year' : 'month';
  const plan = getPlanDefinition(planId as PlanId);
  if (!plan) {
    throw new AppError(`Plan "${planId}" not found.`, 404, 'PLAN_NOT_FOUND');
  }

  // Provider resolution with server control
  const providerName: BillingProviderName = requestedProvider || config.billingProviderDefault || 'paddle';
  if (!['paddle', 'razorpay', 'stripe'].includes(providerName)) {
    throw new AppError(`Unsupported billing provider "${providerName}".`, 400, 'INVALID_PROVIDER');
  }

  const provider = BillingRegistry.getProvider(providerName);
  if (!provider.isConfigured()) {
    throw new AppError(
      `Payment provider "${providerName}" is not configured on the server. Please check environment variables.`,
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  const successUrl = `${config.appUrl}/billing?success=true&provider=${providerName}`;
  const cancelUrl = `${config.appUrl}/billing?canceled=true&provider=${providerName}`;

  const checkoutResult = await provider.createCheckout({
    userId,
    userEmail,
    planId: planId as PlanId,
    interval: selectedInterval,
    successUrl,
    cancelUrl,
  });

  logger.info(`[Billing] Created checkout for user ${userId} on plan ${planId} (${selectedInterval}) via ${providerName}`);

  res.status(200).json({
    status: 'ok',
    data: checkoutResult,
  });
}

/**
 * POST /api/billing/cancel
 * Cancels user's active paid subscription with the provider
 */
export async function cancelSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const db = await getMongoDb();
  const subCol = db.collection<any>('subscriptions');
  const activeSub = await subCol.findOne({
    user_id: userId,
    status: { $in: ['active', 'trialing', 'past_due'] },
  });

  if (!activeSub || !activeSub.provider_subscription_id) {
    throw new AppError('No active subscription found to cancel.', 404, 'SUBSCRIPTION_NOT_FOUND');
  }

  const provider = BillingRegistry.getProvider(activeSub.provider);
  const cancelResult = await provider.cancelSubscription(activeSub.provider_subscription_id);

  // Update local subscription record
  await subCol.updateOne(
    { id: activeSub.id },
    {
      $set: {
        cancel_at_period_end: cancelResult.cancelAtPeriodEnd,
        status: cancelResult.status,
        canceled_at: cancelResult.canceledAt || new Date(),
        updated_at: new Date(),
      },
    }
  );

  logger.info(`[Billing] User ${userId} canceled subscription ${activeSub.provider_subscription_id} on ${activeSub.provider}`);

  res.status(200).json({
    status: 'ok',
    data: cancelResult,
  });
}

/**
 * POST /api/billing/portal
 * Generates customer portal or management session URL
 */
export async function createBillingPortalSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const db = await getMongoDb();
  const subCol = db.collection<any>('subscriptions');
  const sub = await subCol.findOne({ user_id: userId }, { sort: { updated_at: -1 } });

  const providerName: BillingProviderName = sub?.provider || config.billingProviderDefault || 'paddle';
  const provider = BillingRegistry.getProvider(providerName);

  if (!provider.createCustomerPortal) {
    res.status(200).json({
      status: 'ok',
      data: { url: `${config.appUrl}/billing` },
    });
    return;
  }

  const customerCol = db.collection<any>('billing_customers');
  const customer = await customerCol.findOne({ user_id: userId, provider: providerName });

  const portalResult = await provider.createCustomerPortal(
    customer?.provider_customer_id || '',
    `${config.appUrl}/billing`
  );

  res.status(200).json({
    status: 'ok',
    data: portalResult,
  });
}

/**
 * GET /api/billing/invoices
 * Lists user's billing invoices
 */
export async function getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const invoices = await SubscriptionService.getUserInvoices(userId);
  res.status(200).json({
    status: 'ok',
    data: {
      invoices,
    },
  });
}

/**
 * Generic webhook event processor with signature verification, idempotency, and normalization
 */
async function processWebhook(
  providerName: BillingProviderName,
  req: Request,
  res: Response
): Promise<void> {
  const provider = BillingRegistry.getProvider(providerName);
  const rawBody = req.body; // Captured Buffer or string from express.raw()

  if (!rawBody || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
    logger.warn(`[${providerName} Webhook] Missing or invalid raw body.`);
    res.status(400).send('Invalid request payload.');
    return;
  }

  // 1. Signature Verification
  const isValid = await provider.verifyWebhook(rawBody, req.headers as any);
  if (!isValid) {
    logger.warn(`[${providerName} Webhook] Signature verification failed.`);
    res.status(400).send('Invalid webhook signature.');
    return;
  }

  // 2. Event Normalization
  const event = await provider.normalizeWebhook(rawBody, req.headers as any);
  if (!event) {
    logger.info(`[${providerName} Webhook] Unhandled or unmapped event payload.`);
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  // 3. Idempotency Check
  const alreadyProcessed = await SubscriptionService.isEventAlreadyProcessed(providerName, event.eventId);
  if (alreadyProcessed) {
    logger.info(`[${providerName} Webhook] Duplicate event ${event.eventId} already processed.`);
    res.status(200).json({ received: true, idempotent: true });
    return;
  }

  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event.rawPayload)).digest('hex');

  // 4. Authoritative Mutation & Persistence
  try {
    await SubscriptionService.processNormalizedEvent(event);
    await SubscriptionService.recordEvent(providerName, event.eventId, event.rawEventType, 'processed', payloadHash);
    logger.info(`[${providerName} Webhook] Successfully processed event ${event.eventId} (${event.eventType})`);
    res.status(200).json({ received: true });
  } catch (err: any) {
    logger.error(`[${providerName} Webhook] Failed to process event ${event.eventId}:`, err);
    await SubscriptionService.recordEvent(
      providerName,
      event.eventId,
      event.rawEventType,
      'failed',
      payloadHash,
      err.code || 'PROCESS_FAILED',
      err.message
    );
    res.status(500).json({ error: 'Failed to process webhook event.' });
  }
}

/**
 * POST /api/billing/webhooks/paddle
 */
export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  await processWebhook('paddle', req, res);
}

/**
 * POST /api/billing/webhooks/razorpay
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  await processWebhook('razorpay', req, res);
}

/**
 * POST /api/billing/webhook (Stripe backwards compatibility)
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  await processWebhook('stripe', req, res);
}

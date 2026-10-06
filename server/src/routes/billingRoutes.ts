import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import {
  getPlans,
  getBillingUsage,
  getSubscription,
  createCheckout,
  cancelSubscription,
  createBillingPortalSession,
  getInvoices,
  handlePaddleWebhook,
  handleRazorpayWebhook,
  handleStripeWebhook,
} from '../controllers/billingController.js';

const router = Router();

// Public: View plans and available providers
router.get('/plans', asyncHandler(getPlans));

// Webhooks: Unauthenticated endpoints verified strictly via cryptographic signatures with dedicated webhook rate limiter
router.post('/webhooks/paddle', webhookLimiter, asyncHandler(handlePaddleWebhook));
router.post('/webhooks/razorpay', webhookLimiter, asyncHandler(handleRazorpayWebhook));
router.post('/webhook', webhookLimiter, asyncHandler(handleStripeWebhook)); // Stripe backward compatibility

// Authenticated billing routes
router.get('/usage', requireAuth, asyncHandler(getBillingUsage));
router.get('/subscription', requireAuth, asyncHandler(getSubscription));
router.post('/checkout', requireAuth, asyncHandler(createCheckout));
router.post('/cancel', requireAuth, asyncHandler(cancelSubscription));
router.post('/portal', requireAuth, asyncHandler(createBillingPortalSession));
router.get('/invoices', requireAuth, asyncHandler(getInvoices));

export default router;

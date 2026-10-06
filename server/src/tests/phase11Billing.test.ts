import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PLANS, getPlanDefinition, resolvePlanFromPriceId, resolvePlanFromProviderId, getAllPlans } from '../services/billing/planConfig.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { isUserUnlimited } from '../services/usageService.js';
import { BillingRegistry } from '../services/billing/billingRegistry.js';
import { PaddleBillingProvider } from '../services/billing/providers/paddleBillingProvider.js';
import { RazorpayBillingProvider } from '../services/billing/providers/razorpayBillingProvider.js';
import { StripeBillingProvider } from '../services/billing/providers/stripeBillingProvider.js';
import { config } from '../config/index.js';
import { closeMongo } from '../db/mongoClient.js';

describe('Phase 11: Billing, Plans & Subscriptions (Paddle + Razorpay + Stripe) Tests', () => {
  after(async () => {
    await closeMongo();
  });

  describe('1. Central Server-Side Plan Definitions & Boundaries', () => {
    it('provides all 4 plans: free, creator, pro, studio', () => {
      const plans = getAllPlans();
      assert.equal(plans.length, 4);
      assert.deepEqual(plans.map(p => p.id), ['free', 'creator', 'pro', 'studio']);
    });

    it('free plan matches exact specification: 15 mins, 5 projects, 10 clips, 2 social, 5 scheduled, ₹0 / $0', () => {
      const free = getPlanDefinition('free');
      assert.ok(free);
      assert.equal(free.monthly_price, 0);
      assert.equal(free.inr_monthly_price, 0);
      assert.equal(free.monthly_minutes, 15);
      assert.equal(free.max_projects, 5);
      assert.equal(free.max_clip_renders, 10);
      assert.equal(free.max_social_connections, 2);
      assert.equal(free.max_scheduled_posts, 5);
    });

    it('creator plan matches exact specification: 120 mins, 25 projects, 50 clips, 3 social, 20 scheduled, ₹999 / $12', () => {
      const creator = getPlanDefinition('creator');
      assert.ok(creator);
      assert.equal(creator.monthly_price, 12);
      assert.equal(creator.inr_monthly_price, 999);
      assert.equal(creator.monthly_minutes, 120);
      assert.equal(creator.max_projects, 25);
      assert.equal(creator.max_clip_renders, 50);
      assert.equal(creator.max_social_connections, 3);
      assert.equal(creator.max_scheduled_posts, 20);
    });

    it('pro plan matches exact specification: 360 mins, 100 projects, 200 clips, 10 social, 100 scheduled, ₹1,999 / $24, recommended', () => {
      const pro = getPlanDefinition('pro');
      assert.ok(pro);
      assert.equal(pro.monthly_price, 24);
      assert.equal(pro.inr_monthly_price, 1999);
      assert.equal(pro.monthly_minutes, 360);
      assert.equal(pro.max_projects, 100);
      assert.equal(pro.max_clip_renders, 200);
      assert.equal(pro.max_social_connections, 10);
      assert.equal(pro.max_scheduled_posts, 100);
      assert.equal(pro.is_recommended, true);
    });

    it('studio plan matches exact specification: 900 mins, 250 projects, 500 clips, 25 social, 500 scheduled, ₹3,999 / $49', () => {
      const studio = getPlanDefinition('studio');
      assert.ok(studio);
      assert.equal(studio.monthly_price, 49);
      assert.equal(studio.inr_monthly_price, 3999);
      assert.equal(studio.monthly_minutes, 900);
      assert.equal(studio.max_projects, 250);
      assert.equal(studio.max_clip_renders, 500);
      assert.equal(studio.max_social_connections, 25);
      assert.equal(studio.max_scheduled_posts, 500);
    });

    it('returns null for nonexistent plan', () => {
      assert.equal(getPlanDefinition('ultra-vip'), null);
      assert.equal(getPlanDefinition('business'), null);
      assert.equal(getPlanDefinition(''), null);
    });
  });

  describe('2. Developer Unlimited Entitlement Isolation', () => {
    it('recognizes vertexdigitals07@gmail.com as unlimited entitlement', () => {
      assert.equal(isUserUnlimited('vertexdigitals07@gmail.com'), true);
      assert.equal(isUserUnlimited('  VertexDigitals07@GMAIL.com  '), true);
    });

    it('rejects arbitrary user emails as unlimited entitlement', () => {
      assert.equal(isUserUnlimited('attacker@evil.com'), false);
      assert.equal(isUserUnlimited('user@gmail.com'), false);
      assert.equal(isUserUnlimited(''), false);
      assert.equal(isUserUnlimited(undefined), false);
    });

    it('resolves developer entitlement with 999999 limits without requiring a provider subscription', async () => {
      const devUserId = 'a4d30f59-432e-48ac-a870-c455d351e25e';
      const entitlement = await SubscriptionService.resolveUserEntitlement(devUserId, 'vertexdigitals07@gmail.com');
      assert.equal(entitlement.plan_id, 'developer');
      assert.equal(entitlement.is_unlimited, true);
      assert.equal(entitlement.monthly_minutes, 999999);
      assert.equal(entitlement.max_projects, 999999);
      assert.equal(entitlement.max_clip_renders, 999999);
      assert.equal(entitlement.subscription, null);
    });
  });

  describe('3. Default Free Plan Entitlement Fallback', () => {
    it('resolves free plan for normal user with no active subscription', async () => {
      const randomUserId = crypto.randomUUID();
      const entitlement = await SubscriptionService.resolveUserEntitlement(randomUserId, 'testuser@example.com');
      assert.equal(entitlement.plan_id, 'free');
      assert.equal(entitlement.is_unlimited, false);
      assert.equal(entitlement.monthly_minutes, 15);
      assert.equal(entitlement.max_projects, 5);
      assert.equal(entitlement.subscription, null);
    });
  });

  describe('4. Billing Provider Registry & Providers', () => {
    it('registers paddle, razorpay, and stripe providers', () => {
      const paddle = BillingRegistry.getProvider('paddle');
      const razorpay = BillingRegistry.getProvider('razorpay');
      const stripe = BillingRegistry.getProvider('stripe');

      assert.equal(paddle.provider, 'paddle');
      assert.equal(razorpay.provider, 'razorpay');
      assert.equal(stripe.provider, 'stripe');
    });

    it('throws error for unknown provider', () => {
      assert.throws(() => BillingRegistry.getProvider('paypal' as any), /not registered/);
    });

    it('exposes provider configuration statuses', () => {
      const providers = BillingRegistry.getAvailableProviders();
      assert.equal(providers.length, 3);
      assert.deepEqual(providers.map(p => p.name), ['paddle', 'razorpay', 'stripe']);
    });
  });

  describe('5. Webhook Idempotency & Replay Protection', () => {
    it('records and detects processed webhook event idempotently across providers', async () => {
      const paddleEventId = `evt_paddle_${crypto.randomUUID()}`;
      const rzpEventId = `evt_rzp_${crypto.randomUUID()}`;
      
      assert.equal(await SubscriptionService.isEventAlreadyProcessed('paddle', paddleEventId), false);
      assert.equal(await SubscriptionService.isEventAlreadyProcessed('razorpay', rzpEventId), false);

      await SubscriptionService.recordEvent('paddle', paddleEventId, 'subscription.activated', 'processed', 'fake_hash');
      await SubscriptionService.recordEvent('razorpay', rzpEventId, 'subscription.charged', 'processed', 'fake_hash');

      assert.equal(await SubscriptionService.isEventAlreadyProcessed('paddle', paddleEventId), true);
      assert.equal(await SubscriptionService.isEventAlreadyProcessed('razorpay', rzpEventId), true);
    });
  });

  describe('6. Razorpay Webhook HMAC Signature Verification', () => {
    it('rejects missing or invalid razorpay signature', async () => {
      const razorpay = new RazorpayBillingProvider();
      const fakeBody = JSON.stringify({ event: 'subscription.charged' });
      
      const missing = await razorpay.verifyWebhook(fakeBody, {});
      assert.equal(missing, false);

      const invalid = await razorpay.verifyWebhook(fakeBody, { 'x-razorpay-signature': 'invalid_hex' });
      assert.equal(invalid, false);
    });

    it('validates authentic HMAC signature when secret is configured', async () => {
      const razorpay = new RazorpayBillingProvider();
      const testSecret = 'secret_test_key_123';
      (config as any).razorpayWebhookSecret = testSecret;

      const payload = JSON.stringify({
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: {
              id: 'sub_test_123',
              status: 'active',
              current_start: Math.floor(Date.now() / 1000),
              current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
            },
          },
        },
      });

      const validSignature = crypto.createHmac('sha256', testSecret).update(payload).digest('hex');
      const isValid = await razorpay.verifyWebhook(payload, { 'x-razorpay-signature': validSignature });
      assert.equal(isValid, true);
    });
  });

  describe('7. Razorpay Event Normalization', () => {
    it('normalizes subscription.charged event', async () => {
      const razorpay = new RazorpayBillingProvider();
      const payload = {
        event: 'subscription.charged',
        created_at: 1700000000,
        payload: {
          subscription: {
            entity: {
              id: 'sub_mock_888',
              customer_id: 'cust_888',
              status: 'active',
              current_start: 1700000000,
              current_end: 1702592000,
              notes: {
                userId: 'user_mock_888',
                planId: 'pro',
                interval: 'month',
              },
            },
          },
          payment: {
            entity: {
              id: 'pay_mock_888',
              amount: 199900,
              currency: 'INR',
            },
          },
        },
      };

      const normalized = await razorpay.normalizeWebhook(JSON.stringify(payload), {});
      assert.ok(normalized);
      assert.equal(normalized.provider, 'razorpay');
      assert.equal(normalized.eventType, 'subscription.active');
      assert.equal(normalized.subscriptionId, 'sub_mock_888');
      assert.equal(normalized.userId, 'user_mock_888');
      assert.equal(normalized.planId, 'pro');
      assert.equal(normalized.interval, 'month');
      assert.equal(normalized.status, 'active');
      assert.equal(normalized.amount, 1999);
      assert.equal(normalized.currency, 'INR');
    });
  });

  describe('8. Paddle Event Normalization', () => {
    it('normalizes subscription.activated event', async () => {
      const paddle = new PaddleBillingProvider();
      const payload = {
        event_id: 'evt_pad_123',
        event_type: 'subscription.activated',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_pad_456',
          customer_id: 'ctm_pad_456',
          status: 'active',
          current_billing_period: {
            starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
          },
          custom_data: {
            userId: 'user_pad_123',
            planId: 'studio',
            interval: 'year',
          },
        },
      };

      const normalized = await paddle.normalizeWebhook(JSON.stringify(payload), {});
      assert.ok(normalized);
      assert.equal(normalized.provider, 'paddle');
      assert.equal(normalized.eventType, 'subscription.active');
      assert.equal(normalized.subscriptionId, 'sub_pad_456');
      assert.equal(normalized.userId, 'user_pad_123');
      assert.equal(normalized.planId, 'studio');
      assert.equal(normalized.interval, 'year');
      assert.equal(normalized.status, 'active');
    });
  });

  describe('9. Provider ID to Plan Mapping Security', () => {
    it('returns null when provider price ID is unknown or empty', () => {
      assert.equal(resolvePlanFromProviderId('paddle', 'pri_fake_123'), null);
      assert.equal(resolvePlanFromProviderId('razorpay', 'plan_fake_123'), null);
      assert.equal(resolvePlanFromProviderId('stripe', 'price_fake_123'), null);
      assert.equal(resolvePlanFromPriceId('price_malicious_123'), null);
      assert.equal(resolvePlanFromPriceId(''), null);
    });
  });

  describe('10. Security & Secret Protection', () => {
    it('ensures billing secrets are not exposed in public environment', () => {
      assert.ok(!config.paddleClientToken.startsWith('paddlesecret_'));
      assert.ok(!config.razorpayKeyId.includes(config.razorpayKeySecret || 'UNDEFINED'));
      assert.ok(!config.stripePublishableKey.startsWith('sk_'));
    });
  });
});

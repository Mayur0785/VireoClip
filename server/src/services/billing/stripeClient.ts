import Stripe from 'stripe';
import { config } from '../../config/index.js';

let stripeInstance: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured on the server. Please add test credentials to .env or .env.local.');
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(config.stripeSecretKey, {
      apiVersion: '2025-02-24.acacia' as any,
      typescript: true,
      appInfo: {
        name: 'VireoClip',
        version: '0.1.0',
      },
    });
  }

  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return Boolean(config.stripeSecretKey && config.stripeSecretKey.startsWith('sk_test_'));
}

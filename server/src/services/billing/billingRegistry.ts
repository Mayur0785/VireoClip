import { config } from '../../config/index.js';
import { BillingProviderName } from '../../types/index.js';
import { BillingProvider } from './types.js';
import { PaddleBillingProvider } from './providers/paddleBillingProvider.js';
import { RazorpayBillingProvider } from './providers/razorpayBillingProvider.js';
import { StripeBillingProvider } from './providers/stripeBillingProvider.js';

export class BillingRegistry {
  private static providers: Map<BillingProviderName, BillingProvider> = new Map();

  static initialize(): void {
    if (this.providers.size > 0) return;

    const paddle = new PaddleBillingProvider();
    const razorpay = new RazorpayBillingProvider();
    const stripe = new StripeBillingProvider();

    this.providers.set('paddle', paddle);
    this.providers.set('razorpay', razorpay);
    this.providers.set('stripe', stripe);
  }

  static getProvider(name?: BillingProviderName): BillingProvider {
    this.initialize();
    const targetName = name || config.billingProviderDefault || 'paddle';
    const provider = this.providers.get(targetName);

    if (!provider) {
      throw new Error(`Billing provider "${targetName}" is not registered.`);
    }

    return provider;
  }

  static getAvailableProviders(): Array<{
    name: BillingProviderName;
    displayName: string;
    isConfigured: boolean;
  }> {
    this.initialize();
    return [
      {
        name: 'paddle',
        displayName: 'Paddle Billing (Global / Cards & PayPal)',
        isConfigured: this.getProvider('paddle').isConfigured(),
      },
      {
        name: 'razorpay',
        displayName: 'Razorpay Subscriptions (UPI & Netbanking)',
        isConfigured: this.getProvider('razorpay').isConfigured(),
      },
      {
        name: 'stripe',
        displayName: 'Stripe',
        isConfigured: this.getProvider('stripe').isConfigured(),
      },
    ];
  }
}

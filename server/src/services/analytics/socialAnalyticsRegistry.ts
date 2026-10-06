import { SocialPlatform } from '../../types/index.js';
import { SocialAnalyticsProvider } from './types.js';
import { YouTubeAnalyticsProvider } from './providers/youtubeAnalyticsProvider.js';
import { InstagramAnalyticsProvider } from './providers/instagramAnalyticsProvider.js';
import { TikTokAnalyticsProvider } from './providers/tiktokAnalyticsProvider.js';
import { LinkedInAnalyticsProvider } from './providers/linkedinAnalyticsProvider.js';
import { XAnalyticsProvider } from './providers/xAnalyticsProvider.js';

class SocialAnalyticsRegistry {
  private providers = new Map<SocialPlatform, SocialAnalyticsProvider>();

  constructor() {
    this.register(new YouTubeAnalyticsProvider());
    this.register(new InstagramAnalyticsProvider());
    this.register(new TikTokAnalyticsProvider());
    this.register(new LinkedInAnalyticsProvider());
    this.register(new XAnalyticsProvider());
  }

  register(provider: SocialAnalyticsProvider): void {
    this.providers.set(provider.platform, provider);
  }

  getProvider(platform: SocialPlatform): SocialAnalyticsProvider | undefined {
    return this.providers.get(platform);
  }

  getAllCapabilities() {
    const list: Record<string, any> = {};
    for (const [platform, provider] of this.providers.entries()) {
      list[platform] = provider.getCapabilities();
    }
    return list;
  }
}

export const socialAnalyticsRegistry = new SocialAnalyticsRegistry();

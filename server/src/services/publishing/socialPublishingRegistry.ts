import { SocialPlatform } from '../../types/index.js';
import { SocialPublishingProvider } from './types.js';
import { YouTubePublishingProvider } from './providers/youtubePublishingProvider.js';
import { InstagramPublishingProvider } from './providers/instagramPublishingProvider.js';
import { TikTokPublishingProvider } from './providers/tiktokPublishingProvider.js';
import { LinkedInPublishingProvider } from './providers/linkedinPublishingProvider.js';
import { XPublishingProvider } from './providers/xPublishingProvider.js';
import { AppError } from '../../types/index.js';

class SocialPublishingRegistry {
  private providers = new Map<SocialPlatform, SocialPublishingProvider>();

  constructor() {
    this.register(new YouTubePublishingProvider());
    this.register(new InstagramPublishingProvider());
    this.register(new TikTokPublishingProvider());
    this.register(new LinkedInPublishingProvider());
    this.register(new XPublishingProvider());
  }

  register(provider: SocialPublishingProvider): void {
    this.providers.set(provider.platform, provider);
  }

  getProvider(platform: SocialPlatform): SocialPublishingProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new AppError(`Publishing provider not found for platform: ${platform}`, 400, 'UNSUPPORTED_PLATFORM');
    }
    return provider;
  }

  hasProvider(platform: string): platform is SocialPlatform {
    return this.providers.has(platform as SocialPlatform);
  }
}

export const socialPublishingRegistry = new SocialPublishingRegistry();

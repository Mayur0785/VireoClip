import { SocialPlatform } from '../../types/index.js';
import { SocialOAuthProvider } from './types.js';
import { YouTubeOAuthProvider } from './providers/youtubeProvider.js';
import { InstagramOAuthProvider } from './providers/instagramProvider.js';
import { TikTokOAuthProvider } from './providers/tiktokProvider.js';
import { LinkedInOAuthProvider } from './providers/linkedinProvider.js';
import { XOAuthProvider } from './providers/xProvider.js';
import { AppError } from '../../types/index.js';

class SocialProviderRegistry {
  private providers = new Map<SocialPlatform, SocialOAuthProvider>();

  constructor() {
    this.register(new YouTubeOAuthProvider());
    this.register(new InstagramOAuthProvider());
    this.register(new TikTokOAuthProvider());
    this.register(new LinkedInOAuthProvider());
    this.register(new XOAuthProvider());
  }

  register(provider: SocialOAuthProvider): void {
    this.providers.set(provider.platform, provider);
  }

  getProvider(platform: SocialPlatform): SocialOAuthProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new AppError(`Unsupported social platform: ${platform}`, 400, 'UNSUPPORTED_PLATFORM');
    }
    return provider;
  }

  hasProvider(platform: string): platform is SocialPlatform {
    return this.providers.has(platform as SocialPlatform);
  }

  getAllProviders(): SocialOAuthProvider[] {
    return Array.from(this.providers.values());
  }

  getPlatformConfigStatus(): Record<SocialPlatform, boolean> {
    const status: Partial<Record<SocialPlatform, boolean>> = {};
    for (const [platform, provider] of this.providers.entries()) {
      status[platform] = provider.isConfigured();
    }
    return status as Record<SocialPlatform, boolean>;
  }
}

export const socialProviderRegistry = new SocialProviderRegistry();

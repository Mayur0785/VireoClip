import {
  MediaType,
  MediaSearchFilter,
  MediaSearchResult,
  NormalizedMediaItem,
  ProviderCapabilities,
  ProviderCapabilityStatus,
  AppError,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface MediaSearchProvider {
  name: string;
  getCapabilities(): ProviderCapabilities;
  searchVideos(query: string, options?: MediaSearchFilter): Promise<MediaSearchResult>;
  searchImages(query: string, options?: MediaSearchFilter): Promise<MediaSearchResult>;
  getAsset(id: string): Promise<NormalizedMediaItem | null>;
}

export class PexelsProvider implements MediaSearchProvider {
  public readonly name = 'pexels';
  private readonly apiKey: string | null;

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY ? process.env.PEXELS_API_KEY.trim() : null;
  }

  public getCapabilities(): ProviderCapabilities {
    const isConfigured = Boolean(this.apiKey && this.apiKey.length > 0);
    return {
      provider: 'pexels',
      status: isConfigured ? 'SUPPORTED' : 'NOT_CONFIGURED',
      supports_video: isConfigured,
      supports_image: isConfigured,
      supports_similar: false,
      requires_attribution: false,
      max_results_per_page: 50,
      supported_orientations: ['portrait', 'landscape', 'square'],
      message: isConfigured ? 'Pexels API is active' : 'Pexels API key is not configured',
    };
  }

  public async searchVideos(query: string, options: MediaSearchFilter = {}): Promise<MediaSearchResult> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') {
      return {
        provider: 'pexels',
        status: 'NOT_CONFIGURED',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }

    try {
      const page = options.page || 1;
      const perPage = Math.min(options.page_size || options.per_page || 15, 30);
      const orientationParam = options.orientation === 'portrait' ? '&orientation=portrait' : options.orientation === 'landscape' ? '&orientation=landscape' : '';
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}${orientationParam}`;

      const res = await fetch(url, {
        headers: { Authorization: this.apiKey! },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        logger.warn(`[PexelsProvider] Search failed with status ${res.status}`);
        return {
          provider: 'pexels',
          status: 'ERROR',
          items: [],
          total_count: 0,
          page,
          has_more: false,
        };
      }

      const data = (await res.json()) as any;
      const items: NormalizedMediaItem[] = (data.videos || []).map((v: any) => {
        const file = v.video_files?.find((f: any) => f.quality === 'hd') || v.video_files?.[0];
        return {
          id: `pexels_video_${v.id}`,
          provider: 'pexels',
          provider_asset_id: String(v.id),
          media_type: 'VIDEO' as MediaType,
          title: `Pexels Video #${v.id}`,
          preview_url: v.video_pictures?.[0]?.picture || v.image,
          source_url: file?.link || '',
          duration: v.duration || 0,
          width: v.width || 1080,
          height: v.height || 1920,
          aspect_ratio: v.width && v.height ? (v.height > v.width ? '9:16' : v.width > v.height ? '16:9' : '1:1') : '9:16',
          license_type: 'Pexels License',
          license_source: 'Pexels',
          source_page_url: v.url,
          attribution: v.user?.name ? `Video by ${v.user.name} on Pexels` : 'Free to use under Pexels License',
          tags: query.split(/\s+/).filter(Boolean),
        };
      });

      return {
        provider: 'pexels',
        status: 'SUPPORTED',
        items,
        total_count: data.total_results || items.length,
        page,
        has_more: Boolean(data.next_page),
      };
    } catch (err: any) {
      logger.error('[PexelsProvider] Video search failed', { error: err.message });
      return {
        provider: 'pexels',
        status: err.name === 'TimeoutError' ? 'TEMP_UNAVAILABLE' : 'ERROR',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }
  }

  public async searchImages(query: string, options: MediaSearchFilter = {}): Promise<MediaSearchResult> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') {
      return {
        provider: 'pexels',
        status: 'NOT_CONFIGURED',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }

    try {
      const page = options.page || 1;
      const perPage = Math.min(options.page_size || options.per_page || 15, 30);
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;

      const res = await fetch(url, {
        headers: { Authorization: this.apiKey! },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return {
          provider: 'pexels',
          status: 'ERROR',
          items: [],
          total_count: 0,
          page,
          has_more: false,
        };
      }

      const data = (await res.json()) as any;
      const items: NormalizedMediaItem[] = (data.photos || []).map((p: any) => ({
        id: `pexels_photo_${p.id}`,
        provider: 'pexels',
        provider_asset_id: String(p.id),
        media_type: 'IMAGE' as MediaType,
        title: p.alt || `Pexels Photo #${p.id}`,
        preview_url: p.src?.medium || p.src?.tiny,
        source_url: p.src?.original || p.src?.large,
        duration: 0,
        width: p.width || 1080,
        height: p.height || 1920,
        aspect_ratio: p.width && p.height ? (p.height > p.width ? '9:16' : p.width > p.height ? '16:9' : '1:1') : '9:16',
        license_type: 'Pexels License',
        license_source: 'Pexels',
        source_page_url: p.url,
        attribution: p.photographer ? `Photo by ${p.photographer} on Pexels` : 'Free to use under Pexels License',
        tags: query.split(/\s+/).filter(Boolean),
      }));

      return {
        provider: 'pexels',
        status: 'SUPPORTED',
        items,
        total_count: data.total_results || items.length,
        page,
        has_more: Boolean(data.next_page),
      };
    } catch (err: any) {
      return {
        provider: 'pexels',
        status: err.name === 'TimeoutError' ? 'TEMP_UNAVAILABLE' : 'ERROR',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }
  }

  public async getAsset(id: string): Promise<NormalizedMediaItem | null> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') return null;
    return null;
  }
}

export class PixabayProvider implements MediaSearchProvider {
  public readonly name = 'pixabay';
  private readonly apiKey: string | null;

  constructor() {
    this.apiKey = process.env.PIXABAY_API_KEY ? process.env.PIXABAY_API_KEY.trim() : null;
  }

  public getCapabilities(): ProviderCapabilities {
    const isConfigured = Boolean(this.apiKey && this.apiKey.length > 0);
    return {
      provider: 'pixabay',
      status: isConfigured ? 'SUPPORTED' : 'NOT_CONFIGURED',
      supports_video: isConfigured,
      supports_image: isConfigured,
      supports_similar: false,
      requires_attribution: false,
      max_results_per_page: 50,
      supported_orientations: ['portrait', 'landscape', 'square'],
      message: isConfigured ? 'Pixabay API is active' : 'Pixabay API key is not configured',
    };
  }

  public async searchVideos(query: string, options: MediaSearchFilter = {}): Promise<MediaSearchResult> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') {
      return {
        provider: 'pixabay',
        status: 'NOT_CONFIGURED',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }

    try {
      const page = options.page || 1;
      const perPage = Math.min(options.page_size || options.per_page || 15, 30);
      const url = `https://pixabay.com/api/videos/?key=${this.apiKey}&q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        return {
          provider: 'pixabay',
          status: 'ERROR',
          items: [],
          total_count: 0,
          page,
          has_more: false,
        };
      }

      const data = (await res.json()) as any;
      const items: NormalizedMediaItem[] = (data.hits || []).map((h: any) => {
        const video = h.videos?.large || h.videos?.medium || h.videos?.small;
        return {
          id: `pixabay_video_${h.id}`,
          provider: 'pixabay',
          provider_asset_id: String(h.id),
          media_type: 'VIDEO' as MediaType,
          title: h.tags || `Pixabay Video #${h.id}`,
          preview_url: h.videos?.tiny?.url || h.picture_id,
          source_url: video?.url || '',
          duration: h.duration || 0,
          width: video?.width || 1920,
          height: video?.height || 1080,
          aspect_ratio: video?.width && video?.height ? (video.height > video.width ? '9:16' : video.width > video.height ? '16:9' : '1:1') : '16:9',
          license_type: 'Pixabay Content License',
          license_source: 'Pixabay',
          source_page_url: h.pageURL,
          attribution: h.user ? `Video by ${h.user} on Pixabay` : 'Free to use under Pixabay License',
          tags: (h.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
        };
      });

      return {
        provider: 'pixabay',
        status: 'SUPPORTED',
        items,
        total_count: data.totalHits || items.length,
        page,
        has_more: page * perPage < (data.totalHits || 0),
      };
    } catch (err: any) {
      return {
        provider: 'pixabay',
        status: err.name === 'TimeoutError' ? 'TEMP_UNAVAILABLE' : 'ERROR',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }
  }

  public async searchImages(query: string, options: MediaSearchFilter = {}): Promise<MediaSearchResult> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') {
      return {
        provider: 'pixabay',
        status: 'NOT_CONFIGURED',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }

    try {
      const page = options.page || 1;
      const perPage = Math.min(options.page_size || options.per_page || 15, 30);
      const url = `https://pixabay.com/api/?key=${this.apiKey}&q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&image_type=photo`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        return {
          provider: 'pixabay',
          status: 'ERROR',
          items: [],
          total_count: 0,
          page,
          has_more: false,
        };
      }

      const data = (await res.json()) as any;
      const items: NormalizedMediaItem[] = (data.hits || []).map((h: any) => ({
        id: `pixabay_photo_${h.id}`,
        provider: 'pixabay',
        provider_asset_id: String(h.id),
        media_type: 'IMAGE' as MediaType,
        title: h.tags || `Pixabay Image #${h.id}`,
        preview_url: h.webformatURL || h.previewURL,
        source_url: h.largeImageURL || h.webformatURL,
        duration: 0,
        width: h.imageWidth || 1920,
        height: h.imageHeight || 1080,
        aspect_ratio: h.imageWidth && h.imageHeight ? (h.imageHeight > h.imageWidth ? '9:16' : h.imageWidth > h.imageHeight ? '16:9' : '1:1') : '16:9',
        license_type: 'Pixabay Content License',
        license_source: 'Pixabay',
        source_page_url: h.pageURL,
        attribution: h.user ? `Image by ${h.user} on Pixabay` : 'Free to use under Pixabay License',
        tags: (h.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      }));

      return {
        provider: 'pixabay',
        status: 'SUPPORTED',
        items,
        total_count: data.totalHits || items.length,
        page,
        has_more: page * perPage < (data.totalHits || 0),
      };
    } catch (err: any) {
      return {
        provider: 'pixabay',
        status: err.name === 'TimeoutError' ? 'TEMP_UNAVAILABLE' : 'ERROR',
        items: [],
        total_count: 0,
        page: options.page || 1,
        has_more: false,
      };
    }
  }

  public async getAsset(id: string): Promise<NormalizedMediaItem | null> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') return null;
    return null;
  }
}

export class GeneratedMediaProvider {
  public readonly name = 'ai_generated';

  public getCapabilities(): ProviderCapabilities {
    const apiKey = process.env.AI_MEDIA_GEN_API_KEY || null;
    const isConfigured = Boolean(apiKey && apiKey.length > 0);
    return {
      provider: 'ai_generated',
      status: isConfigured ? 'SUPPORTED' : 'NOT_CONFIGURED',
      supports_video: false,
      supports_image: false,
      supports_similar: false,
      requires_attribution: false,
      max_results_per_page: 10,
      supported_orientations: ['portrait', 'landscape', 'square'],
      message: isConfigured ? 'AI generation provider active' : 'AI media generation provider is not configured',
    };
  }

  public async generateMedia(dto: {
    prompt: string;
    media_type: MediaType;
    duration?: number;
  }): Promise<{ status: ProviderCapabilityStatus; error?: string; asset?: NormalizedMediaItem }> {
    const caps = this.getCapabilities();
    if (caps.status === 'NOT_CONFIGURED') {
      return {
        status: 'NOT_CONFIGURED',
        error: 'AI media generation provider is not configured. Configure AI_MEDIA_GEN_API_KEY to enable text-to-video or text-to-image.',
      };
    }

    throw new AppError('AI media generation provider is not configured.', 400, 'PROVIDER_NOT_CONFIGURED');
  }
}

export class StockMediaProviderRegistry {
  private static providers: Map<string, MediaSearchProvider> = new Map<string, MediaSearchProvider>([
    ['pexels', new PexelsProvider()],
    ['pixabay', new PixabayProvider()],
  ]);

  private static genProvider = new GeneratedMediaProvider();

  public static getProvider(name?: string): MediaSearchProvider | undefined {
    if (!name) return this.providers.get('pexels');
    return this.providers.get(name.toLowerCase());
  }

  public static getGeneratedProvider(): GeneratedMediaProvider {
    return this.genProvider;
  }

  public static getAllCapabilities(): ProviderCapabilities[] {
    const caps: ProviderCapabilities[] = [];
    for (const provider of this.providers.values()) {
      caps.push(provider.getCapabilities());
    }
    caps.push(this.genProvider.getCapabilities());
    return caps;
  }

  public static async searchStock(
    query: string,
    filter: MediaSearchFilter = {}
  ): Promise<MediaSearchResult> {
    const providerName = filter.provider || 'pexels';
    const provider = this.getProvider(providerName);

    if (!provider) {
      return {
        provider: providerName,
        status: 'NOT_SUPPORTED',
        items: [],
        total_count: 0,
        page: filter.page || 1,
        has_more: false,
      };
    }

    if (filter.media_type === 'IMAGE') {
      return provider.searchImages(query, filter);
    }
    return provider.searchVideos(query, filter);
  }
}

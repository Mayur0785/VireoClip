import { backendRequest } from './backendClient';
import {
  ContentPack,
  ContentPackItem,
  ContentPackGenerationMode,
  ContentPackTemplate,
  OutputPlatform,
} from '../types';

export interface GenerateContentPackParams {
  projectId: string;
  clipId: string;
  mode?: ContentPackGenerationMode;
  template?: ContentPackTemplate;
  platform?: OutputPlatform;
  user_instruction?: string;
  brand_brain_id?: string;
  idempotency_key?: string;
}

export interface ContentPackCapabilities {
  provider_state: 'CONFIGURED' | 'NOT_CONFIGURED' | 'TEMP_UNAVAILABLE' | 'ERROR';
  supported_platforms: string[];
  supported_modes: string[];
  supported_templates: string[];
  item_types: string[];
}

class FrontendContentPackService {
  /**
   * Retrieves capabilities and provider status
   */
  async getCapabilities(): Promise<ContentPackCapabilities> {
    const res = await backendRequest<{ status: string; data: ContentPackCapabilities }>(
      '/content-packs/capabilities'
    );
    return res.data;
  }

  /**
   * Generates a new Content Pack for a clip
   */
  async generateContentPack(params: GenerateContentPackParams): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/projects/${params.projectId}/clips/${params.clipId}/content-pack`,
      {
        method: 'POST',
        headers: params.idempotency_key ? { 'Idempotency-Key': params.idempotency_key } : undefined,
        body: JSON.stringify(params),
      }
    );
    return res.data;
  }

  /**
   * Retrieves a Content Pack and all items by ID
   */
  async getContentPack(id: string): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${id}`
    );
    return res.data;
  }

  /**
   * Lists content packs for a specific clip
   */
  async listPacksForClip(projectId: string, clipId: string): Promise<ContentPack[]> {
    const res = await backendRequest<{ status: string; data: ContentPack[] }>(
      `/projects/${projectId}/clips/${clipId}/content-packs`
    );
    return res.data || [];
  }

  /**
   * Updates an item (text edit, lock, approval)
   */
  async updateItem(
    contentPackId: string,
    itemId: string,
    updates: { text?: string; locked?: boolean; approved?: boolean }
  ): Promise<ContentPackItem> {
    const res = await backendRequest<{ status: string; data: ContentPackItem }>(
      `/content-packs/${contentPackId}/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return res.data;
  }

  /**
   * Regenerates a single item
   */
  async regenerateItem(
    contentPackId: string,
    itemId: string,
    userInstruction?: string
  ): Promise<ContentPackItem> {
    const res = await backendRequest<{ status: string; data: ContentPackItem }>(
      `/content-packs/${contentPackId}/items/${itemId}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return res.data;
  }

  /**
   * Regenerates items for a specific platform
   */
  async regeneratePlatform(
    contentPackId: string,
    platform: OutputPlatform,
    userInstruction?: string
  ): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/platforms/${platform}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return res.data;
  }

  /**
   * Regenerates the entire Content Pack
   */
  async regeneratePack(
    contentPackId: string,
    userInstruction?: string
  ): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return res.data;
  }

  /**
   * Approves the Content Pack and all items
   */
  async approvePack(contentPackId: string): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/approve`,
      {
        method: 'POST',
      }
    );
    return res.data;
  }

  /**
   * Translates the Content Pack to a target language
   */
  async translatePack(contentPackId: string, targetLanguage: string): Promise<ContentPack> {
    const res = await backendRequest<{ status: string; data: ContentPack }>(
      `/content-packs/${contentPackId}/translate`,
      {
        method: 'POST',
        body: JSON.stringify({ target_language: targetLanguage }),
      }
    );
    return res.data;
  }

  /**
   * Retrieves publish handoff payload
   */
  async getPublishHandoff(
    contentPackId: string,
    platform: OutputPlatform
  ): Promise<Record<string, any>> {
    const res = await backendRequest<{ status: string; data: Record<string, any> }>(
      `/content-packs/${contentPackId}/publish-handoff/${platform}`
    );
    return res.data;
  }
}

export const contentPackService = new FrontendContentPackService();
export default contentPackService;

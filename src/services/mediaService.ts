import { backendRequest } from './backendClient';
import {
  MediaAssetRecord,
  MediaSearchFilter,
  MediaSearchResult,
  ProviderCapabilities,
  BrollOpportunity,
  BrollPlanRecord,
  BrollStyle,
  EditorProject,
} from '../types';

export interface ApiResponse<T> {
  status: 'ok' | 'error';
  data: T;
  code?: string;
  message?: string;
}

class MediaService {
  /**
   * Retrieves status and capabilities of all stock and AI media providers.
   */
  async getMediaCapabilities(): Promise<ProviderCapabilities[]> {
    const res = await backendRequest<ApiResponse<ProviderCapabilities[]>>('/media/capabilities');
    return res.data;
  }

  /**
   * Searches media across project, user library, brand assets, and stock providers.
   */
  async searchMedia(filter: MediaSearchFilter = {}): Promise<MediaSearchResult> {
    const res = await backendRequest<ApiResponse<MediaSearchResult>>('/media/search', {
      method: 'POST',
      body: JSON.stringify(filter),
    });
    return res.data;
  }

  /**
   * Lists persisted media assets in user library.
   */
  async listMediaAssets(params: {
    project_id?: string;
    source_type?: string;
    media_type?: string;
  } = {}): Promise<MediaSearchResult> {
    const query = new URLSearchParams();
    if (params.project_id) query.set('project_id', params.project_id);
    if (params.source_type) query.set('source_type', params.source_type);
    if (params.media_type) query.set('media_type', params.media_type);

    const queryString = query.toString();
    const url = `/media/assets${queryString ? `?${queryString}` : ''}`;
    const res = await backendRequest<ApiResponse<MediaSearchResult>>(url);
    return res.data;
  }

  /**
   * Retrieves an individual media asset by ID.
   */
  async getMediaAsset(id: string): Promise<MediaAssetRecord> {
    const res = await backendRequest<ApiResponse<MediaAssetRecord>>(`/media/assets/${id}`);
    return res.data;
  }

  /**
   * Retrieves similar assets from the media library.
   */
  async getSimilarMediaAssets(id: string): Promise<MediaAssetRecord[]> {
    const res = await backendRequest<ApiResponse<MediaAssetRecord[]>>(`/media/assets/${id}/similar`);
    return res.data;
  }

  /**
   * Backend SSRF-protected download and import of remote stock media.
   */
  async importRemoteMedia(dto: {
    url: string;
    provider?: string;
    provider_asset_id?: string;
    title?: string;
    license_type?: string;
    license_source?: string;
    source_page_url?: string;
    attribution?: string;
    project_id?: string;
  }): Promise<MediaAssetRecord> {
    const res = await backendRequest<ApiResponse<MediaAssetRecord>>('/media/import', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Analyzes clip timeline and identifies B-roll insertion opportunities.
   */
  async detectClipBrollOpportunities(clipId: string, style: BrollStyle = 'BALANCED'): Promise<BrollOpportunity[]> {
    const res = await backendRequest<ApiResponse<BrollOpportunity[]>>(`/clips/${clipId}/broll/opportunities`, {
      method: 'POST',
      body: JSON.stringify({ style }),
    });
    return res.data;
  }

  /**
   * Creates a new reviewable B-roll plan for the clip with discovered candidate assets.
   */
  async createClipBrollPlan(clipId: string, style: BrollStyle = 'BALANCED'): Promise<BrollPlanRecord> {
    const res = await backendRequest<ApiResponse<BrollPlanRecord>>(`/clips/${clipId}/broll/plan`, {
      method: 'POST',
      body: JSON.stringify({ style }),
    });
    return res.data;
  }

  /**
   * Fetches latest B-roll plan for a clip.
   */
  async getClipBrollPlan(clipId: string): Promise<BrollPlanRecord | null> {
    const res = await backendRequest<ApiResponse<BrollPlanRecord | null>>(`/clips/${clipId}/broll/plan`);
    return res.data;
  }

  /**
   * Applies approved B-roll suggestions into the Pro Editor timeline.
   */
  async applyBrollPlan(planId: string, selectedSuggestionIds?: string[]): Promise<{ editorProject: EditorProject; appliedCount: number }> {
    const res = await backendRequest<ApiResponse<{ editorProject: EditorProject; appliedCount: number }>>(`/broll-plans/${planId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ suggestion_ids: selectedSuggestionIds }),
    });
    return res.data;
  }

  /**
   * Directly inserts a single chosen media asset into an editor project.
   */
  async insertDirectBroll(
    projectId: string,
    assetId: string,
    timelineStart: number,
    duration?: number
  ): Promise<EditorProject> {
    const res = await backendRequest<ApiResponse<EditorProject>>(`/editor-projects/${projectId}/insert-broll`, {
      method: 'POST',
      body: JSON.stringify({
        asset_id: assetId,
        timeline_start: timelineStart,
        duration: duration || 3.0,
      }),
    });
    return res.data;
  }
}

export const mediaService = new MediaService();

import {
  ThumbnailLabSession,
  ThumbnailConcept,
  ThumbnailSourceFrame,
  ThumbnailCapabilityModel,
  ThumbnailAspectRatio,
  ThumbnailStyleDirection,
  ThumbnailTextLayer,
  ThumbnailComposition,
  ThumbnailDiagnostics,
  ThumbnailConceptStatus,
} from '../types';

const API_BASE = '/api/thumbnail-lab';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('vireo_auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export const thumbnailLabService = {
  /**
   * Retrieves capabilities of Thumbnail Lab.
   */
  async getCapabilities(): Promise<ThumbnailCapabilityModel> {
    const data = await request<{ capabilities: ThumbnailCapabilityModel }>('/capabilities');
    return data.capabilities;
  },

  /**
   * Creates or gets a ThumbnailLabSession for a clip.
   */
  async createOrGetSession(
    clipId: string,
    options: {
      project_id?: string;
      content_pack_id?: string;
      aspect_ratio?: ThumbnailAspectRatio;
      target_platform?: string;
      target_audience?: string;
      video_topic?: string;
      objective?: string;
    } = {}
  ): Promise<ThumbnailLabSession> {
    const data = await request<{ session: ThumbnailLabSession }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ clip_id: clipId, ...options }),
    });
    return data.session;
  },

  /**
   * Retrieves a session by ID with its concepts.
   */
  async getSession(
    sessionId: string
  ): Promise<{ session: ThumbnailLabSession; concepts: ThumbnailConcept[] }> {
    return await request<{ session: ThumbnailLabSession; concepts: ThumbnailConcept[] }>(
      `/sessions/${sessionId}`
    );
  },

  /**
   * Extracts or retrieves candidate source frames for a session.
   */
  async getSourceFrames(sessionId: string): Promise<ThumbnailSourceFrame[]> {
    const data = await request<{ frames: ThumbnailSourceFrame[] }>(
      `/sessions/${sessionId}/source-frames`
    );
    return data.frames;
  },

  /**
   * Generates new concepts for the session.
   */
  async generateConcepts(
    sessionId: string,
    options: {
      style_direction?: ThumbnailStyleDirection;
      reference_frame_id?: string;
      user_instruction?: string;
      count?: number;
    } = {}
  ): Promise<ThumbnailConcept[]> {
    const data = await request<{ concepts: ThumbnailConcept[] }>(
      `/sessions/${sessionId}/generate`,
      {
        method: 'POST',
        body: JSON.stringify(options),
      }
    );
    return data.concepts;
  },

  /**
   * Updates a concept (text layer, composition, locking, status).
   */
  async updateConcept(
    sessionId: string,
    conceptId: string,
    updates: {
      title?: string;
      text_layer?: Partial<ThumbnailTextLayer>;
      composition?: Partial<ThumbnailComposition>;
      reference_frame_id?: string;
      status?: ThumbnailConceptStatus;
      locked?: boolean;
      favorited?: boolean;
    }
  ): Promise<ThumbnailConcept> {
    const data = await request<{ concept: ThumbnailConcept }>(
      `/sessions/${sessionId}/concepts/${conceptId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return data.concept;
  },

  /**
   * Approves a concept.
   */
  async approveConcept(
    sessionId: string,
    conceptId: string
  ): Promise<{ concept: ThumbnailConcept; session: ThumbnailLabSession }> {
    return await request<{ concept: ThumbnailConcept; session: ThumbnailLabSession }>(
      `/sessions/${sessionId}/concepts/${conceptId}/approve`,
      { method: 'POST' }
    );
  },

  /**
   * Imports thumbnail brief & texts from an existing Content Pack.
   */
  async importContentPack(clipId: string, contentPackId: string): Promise<ThumbnailConcept[]> {
    const data = await request<{ concepts: ThumbnailConcept[] }>(
      '/sessions/import-content-pack',
      {
        method: 'POST',
        body: JSON.stringify({ clip_id: clipId, content_pack_id: contentPackId }),
      }
    );
    return data.concepts;
  },

  /**
   * Gets publishing handoff metadata payload.
   */
  async getPublishingHandoff(
    sessionId: string,
    conceptId: string
  ): Promise<{
    thumbnail_url: string;
    aspect_ratio: ThumbnailAspectRatio;
    title: string;
    platform: string;
    diagnostics: ThumbnailDiagnostics;
  }> {
    const data = await request<{ handoff: any }>(
      `/sessions/${sessionId}/concepts/${conceptId}/publishing-handoff`
    );
    return data.handoff;
  },

  /**
   * Restores an earlier version snapshot.
   */
  async restoreVersion(sessionId: string, versionId: string): Promise<ThumbnailConcept> {
    const data = await request<{ concept: ThumbnailConcept }>(
      `/sessions/${sessionId}/versions/${versionId}/restore`,
      { method: 'POST' }
    );
    return data.concept;
  },
};

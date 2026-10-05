import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { RenderedClip, ClipAspectRatio } from '../types';

export interface CreateClipResponse {
  status: 'ok';
  message: string;
  clip: RenderedClip;
  renderJob?: any;
}

export interface GetClipsResponse {
  status: 'ok';
  projectId: string;
  count: number;
  clips: RenderedClip[];
}

export interface GetClipResponse {
  status: 'ok';
  clip: RenderedClip;
}

export interface SignedUrlResponse {
  status: 'ok';
  signedUrl: string;
  filename?: string;
  expiresInSeconds: number;
}

class ClipRenderService {
  private getApiUrl(): string {
    return import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  }

  private async getAuthHeader(): Promise<HeadersInit> {
    if (!isSupabaseConfigured) {
      return { 'Content-Type': 'application/json' };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Creates a new clip from a selected AI candidate and queues background 9:16 rendering
   */
  async createClipFromCandidate(
    projectId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16'
  ): Promise<CreateClipResponse> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/projects/${projectId}/clips`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ candidateId, aspectRatio }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create clip from candidate.');
    }

    return (await res.json()) as CreateClipResponse;
  }

  /**
   * Fetches all rendered / in-progress clips for a project
   */
  async getProjectClips(projectId: string): Promise<RenderedClip[]> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/projects/${projectId}/clips`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch project clips.');
    }

    const data = (await res.json()) as GetClipsResponse;
    return data.clips || [];
  }

  /**
   * Fetches single clip and its latest render progress
   */
  async getClip(clipId: string): Promise<RenderedClip> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch clip details.');
    }

    const data = (await res.json()) as GetClipResponse;
    return data.clip;
  }

  /**
   * Retries rendering for a failed or draft clip
   */
  async renderClip(clipId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/render`, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to start clip rendering.');
    }
  }

  /**
   * Deletes a clip and its rendered file from storage
   */
  async deleteClip(clipId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete clip.');
    }
  }

  /**
   * Obtains a signed preview URL for <video> playback
   */
  async getPreviewUrl(clipId: string): Promise<string> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/preview-url`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get preview URL.');
    }

    const data = (await res.json()) as SignedUrlResponse;
    return data.signedUrl;
  }

  /**
   * Obtains a signed download URL with filename attachment
   */
  async getDownloadUrl(clipId: string): Promise<{ signedUrl: string; filename?: string }> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/download-url`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get download URL.');
    }

    const data = (await res.json()) as SignedUrlResponse;
    return { signedUrl: data.signedUrl, filename: data.filename };
  }

  /**
   * Phase 12: Fetches full editor bundle (metadata, editor config, caption timing mode, presets, preview)
   */
  async getClipEditorData(clipId: string): Promise<{
    clip: RenderedClip;
    timingMode: string;
    availablePresets: string[];
    previewUrl?: string;
  }> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/editor`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to load clip editor data.');
    }

    return (await res.json()) as {
      clip: RenderedClip;
      timingMode: string;
      availablePresets: string[];
      previewUrl?: string;
    };
  }

  /**
   * Phase 12: Saves updated editor configuration
   */
  async updateClipEditor(
    clipId: string,
    update: Record<string, any>
  ): Promise<RenderedClip> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/editor`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(update),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to save editor configuration.');
    }

    const data = await res.json();
    return data.clip;
  }

  /**
   * Phase 12: Resets editor configuration back to baseline defaults
   */
  async resetClipEditor(clipId: string): Promise<RenderedClip> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/editor/reset`, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to reset editor configuration.');
    }

    const data = await res.json();
    return data.clip;
  }

  /**
   * Phase 12: Fetches normalized preview caption cues
   */
  async getClipCaptions(clipId: string): Promise<{
    timingMode: string;
    cues: Array<{
      id: string;
      start: number;
      end: number;
      text: string;
      tokens?: Array<{ text: string; start: number; end: number }>;
    }>;
  }> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/captions`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch clip captions.');
    }

    return await res.json();
  }

  /**
   * Phase 13: Triggers smart auto-reframe face tracking analysis
   */
  async analyzeClipReframe(clipId: string): Promise<{
    status: string;
    analysis_status: string;
    clipId: string;
  }> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/reframe/analyze`, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to start smart reframe analysis.');
    }

    return await res.json();
  }

  /**
   * Phase 13: Fetches latest smart reframe tracking data
   */
  async getClipReframe(clipId: string): Promise<{
    status: 'pending' | 'analyzing' | 'ready' | 'failed';
    detectedFaceCount: number;
    dominantTrackId: string | null;
    smoothedKeyframes: Array<{ time: number; centerX: number; centerY: number }>;
    analysisVersion: number;
    analyzedTrimStart?: number;
    analyzedTrimEnd?: number;
    analyzedAspectRatio?: string;
    isStale?: boolean;
  }> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.getApiUrl()}/clips/${clipId}/reframe`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch smart reframe tracking status.');
    }

    return await res.json();
  }
}

export const clipRenderService = new ClipRenderService();


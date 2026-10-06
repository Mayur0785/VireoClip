import { backendRequest } from './backendClient';
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
  /**
   * Creates a new clip from a selected AI candidate and queues background 9:16 rendering
   */
  async createClipFromCandidate(
    projectId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16'
  ): Promise<CreateClipResponse> {
    return backendRequest<CreateClipResponse>(`/projects/${projectId}/clips`, {
      method: 'POST',
      body: JSON.stringify({ candidateId, aspectRatio }),
    });
  }

  /**
   * Fetches all rendered / in-progress clips for a project
   */
  async getProjectClips(projectId: string): Promise<RenderedClip[]> {
    const data = await backendRequest<GetClipsResponse>(`/projects/${projectId}/clips`);
    return data.clips || [];
  }

  /**
   * Fetches single clip and its latest render progress
   */
  async getClip(clipId: string): Promise<RenderedClip> {
    const data = await backendRequest<GetClipResponse>(`/clips/${clipId}`);
    return data.clip;
  }

  /**
   * Retries rendering for a failed or draft clip
   */
  async renderClip(clipId: string): Promise<void> {
    await backendRequest<void>(`/clips/${clipId}/render`, { method: 'POST' });
  }

  /**
   * Deletes a clip and its rendered file from storage
   */
  async deleteClip(clipId: string): Promise<void> {
    await backendRequest<void>(`/clips/${clipId}`, { method: 'DELETE' });
  }

  /**
   * Obtains a signed preview URL for <video> playback
   */
  async getPreviewUrl(clipId: string): Promise<string> {
    const data = await backendRequest<SignedUrlResponse>(`/clips/${clipId}/preview-url`);
    return data.signedUrl;
  }

  /**
   * Obtains a signed download URL with filename attachment
   */
  async getDownloadUrl(clipId: string): Promise<{ signedUrl: string; filename?: string }> {
    const data = await backendRequest<SignedUrlResponse>(`/clips/${clipId}/download-url`);
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
    return backendRequest(`/clips/${clipId}/editor`);
  }

  /**
   * Phase 12: Saves updated editor configuration
   */
  async updateClipEditor(
    clipId: string,
    update: Record<string, any>
  ): Promise<RenderedClip> {
    const data = await backendRequest<{ clip: RenderedClip }>(`/clips/${clipId}/editor`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
    return data.clip;
  }

  /**
   * Phase 12: Resets editor configuration back to baseline defaults
   */
  async resetClipEditor(clipId: string): Promise<RenderedClip> {
    const data = await backendRequest<{ clip: RenderedClip }>(`/clips/${clipId}/editor/reset`, {
      method: 'POST',
    });
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
    return backendRequest(`/clips/${clipId}/captions`);
  }

  /**
   * Phase 13: Triggers smart auto-reframe face tracking analysis
   */
  async analyzeClipReframe(clipId: string): Promise<{
    status: string;
    analysis_status: string;
    clipId: string;
  }> {
    return backendRequest(`/clips/${clipId}/reframe/analyze`, { method: 'POST' });
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
    return backendRequest(`/clips/${clipId}/reframe`);
  }
}

export const clipRenderService = new ClipRenderService();

import {
  HookLabSession,
  HookCandidate,
  HookCandidateStatus,
  HookLabCapabilityModel,
  HookType,
} from '../types';

const API_BASE = '/api/hook-lab';

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

export const hookLabService = {
  /**
   * Retrieves capabilities of Hook Lab.
   */
  async getCapabilities(): Promise<HookLabCapabilityModel> {
    const data = await request<{ capabilities: HookLabCapabilityModel }>('/capabilities');
    return data.capabilities;
  },

  /**
   * Creates or retrieves a session for a clip.
   */
  async createOrGetSession(
    clipId: string,
    options: {
      project_id?: string;
      content_pack_id?: string;
      opening_window_sec?: number;
      user_instruction?: string;
      platform?: string;
    } = {}
  ): Promise<HookLabSession> {
    const data = await request<{ session: HookLabSession }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ clip_id: clipId, ...options }),
    });
    return data.session;
  },

  /**
   * Retrieves a session and all its candidates.
   */
  async getSession(sessionId: string): Promise<{ session: HookLabSession; candidates: HookCandidate[] }> {
    return await request<{ session: HookLabSession; candidates: HookCandidate[] }>(`/sessions/${sessionId}`);
  },

  /**
   * Generates candidates for a session.
   */
  async generateCandidates(
    sessionId: string,
    options: {
      user_instruction?: string;
      candidate_count?: number;
      preferred_types?: HookType[];
      platform?: string;
    } = {}
  ): Promise<HookCandidate[]> {
    const data = await request<{ candidates: HookCandidate[] }>(`/sessions/${sessionId}/generate`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
    return data.candidates;
  },

  /**
   * Updates a single candidate (inline edit, toggle lock, status).
   */
  async updateCandidate(
    sessionId: string,
    candidateId: string,
    updates: { text?: string; locked?: boolean; status?: HookCandidateStatus }
  ): Promise<HookCandidate> {
    const data = await request<{ candidate: HookCandidate }>(`/sessions/${sessionId}/candidates/${candidateId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data.candidate;
  },

  /**
   * Regenerates a single candidate.
   */
  async regenerateCandidate(
    sessionId: string,
    candidateId: string,
    userInstruction?: string
  ): Promise<HookCandidate> {
    const data = await request<{ candidate: HookCandidate }>(
      `/sessions/${sessionId}/candidates/${candidateId}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ user_instruction: userInstruction }),
      }
    );
    return data.candidate;
  },

  /**
   * Applies candidate to an EditorProject reversibly.
   */
  async applyToEditor(
    sessionId: string,
    candidateId: string,
    editorProjectId: string
  ): Promise<{ updatedProject: any; previousProjectSnapshot: any; appliedOperations: string[] }> {
    return await request<{ updatedProject: any; previousProjectSnapshot: any; appliedOperations: string[] }>(
      `/sessions/${sessionId}/candidates/${candidateId}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({ editor_project_id: editorProjectId }),
      }
    );
  },

  /**
   * Reverts candidate in EditorProject using snapshot.
   */
  async revertInEditor(
    sessionId: string,
    candidateId: string,
    editorProjectId: string,
    snapshot: any
  ): Promise<{ project: any }> {
    return await request<{ project: any }>(`/sessions/${sessionId}/candidates/${candidateId}/revert`, {
      method: 'POST',
      body: JSON.stringify({ editor_project_id: editorProjectId, snapshot }),
    });
  },

  /**
   * Alias for revertInEditor
   */
  async revertApply(
    sessionId: string,
    candidateId: string,
    editorProjectId: string,
    snapshot?: any
  ): Promise<{ project: any }> {
    return this.revertInEditor(sessionId, candidateId, editorProjectId, snapshot);
  },

  /**
   * Renders lightweight preview for candidate.
   */
  async renderPreview(
    sessionId: string,
    candidateId: string
  ): Promise<{ previewUrl: string; duration: number; verified: boolean }> {
    const data = await request<{ preview: { previewUrl: string; duration: number; verified: boolean } }>(
      `/sessions/${sessionId}/candidates/${candidateId}/preview`,
      { method: 'POST' }
    );
    return data.preview;
  },

  /**
   * Approves candidate and writes Brand Brain evidence.
   */
  async approveCandidate(sessionId: string, candidateId: string): Promise<HookCandidate> {
    const data = await request<{ candidate: HookCandidate }>(
      `/sessions/${sessionId}/candidates/${candidateId}/approve`,
      { method: 'POST' }
    );
    return data.candidate;
  },

  /**
   * Imports HOOK items from a Content Pack.
   */
  async importContentPack(sessionId: string, contentPackId: string): Promise<HookCandidate[]> {
    const data = await request<{ candidates: HookCandidate[] }>(`/sessions/${sessionId}/import-content-pack`, {
      method: 'POST',
      body: JSON.stringify({ content_pack_id: contentPackId }),
    });
    return data.candidates;
  },

  /**
   * Syncs candidate to a Content Pack.
   */
  async syncContentPack(
    sessionId: string,
    candidateId: string,
    contentPackId: string,
    force: boolean = false
  ): Promise<{ synced: boolean; updatedItemId?: string }> {
    return await request<{ synced: boolean; updatedItemId?: string }>(`/sessions/${sessionId}/sync-content-pack`, {
      method: 'POST',
      body: JSON.stringify({ candidate_id: candidateId, content_pack_id: contentPackId, force }),
    });
  },

  /**
   * Gets honest analytics advisory.
   */
  async getAnalyticsAdvisory(): Promise<{
    status: 'SUFFICIENT' | 'INSUFFICIENT_DATA';
    sample_count: number;
    advisory?: string;
  }> {
    return await request<{
      status: 'SUFFICIENT' | 'INSUFFICIENT_DATA';
      sample_count: number;
      advisory?: string;
    }>('/analytics-advisory');
  },

  /**
   * Gets discovered existing source lines.
   */
  async getExistingLines(sessionId: string): Promise<any[]> {
    const data = await request<{ lines: any[] }>(`/sessions/${sessionId}/existing-lines`);
    return data.lines;
  },
};

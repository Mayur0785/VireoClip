import { supabase } from '../lib/supabase';
import { ClipCandidate, ClipCandidateStatus } from '../types';

export interface AnalyzeClipsResponse {
  status: 'ok';
  projectId: string;
  count: number;
  candidates: ClipCandidate[];
}

export interface GetClipCandidatesResponse {
  status: 'ok';
  projectId: string;
  count: number;
  candidates: ClipCandidate[];
}

export interface UpdateClipCandidateResponse {
  status: 'ok';
  candidate: ClipCandidate;
}

class ClipService {
  private getApiUrl(): string {
    return import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  }

  private async getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      throw new Error('User session not found. Please log in again.');
    }
    return token;
  }

  /**
   * Triggers AI clip analysis for a transcribed project
   */
  async analyzeClips(projectId: string, customNotes?: string): Promise<AnalyzeClipsResponse> {
    const token = await this.getAuthToken();
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/projects/${projectId}/analyze-clips`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customNotes }),
    });

    const data = await response.json();
    if (!response.ok) {
      const error: any = new Error(data.message || 'Failed to analyze clips.');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }

    return data as AnalyzeClipsResponse;
  }

  /**
   * Fetches all clip candidates for a project, sorted by engagement_score DESC
   */
  async getClipCandidates(projectId: string): Promise<ClipCandidate[]> {
    const token = await this.getAuthToken();
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/projects/${projectId}/clip-candidates`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      const error: any = new Error(data.message || 'Failed to fetch clip candidates.');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }

    return (data.candidates || []) as ClipCandidate[];
  }

  /**
   * Updates candidate status (suggested | selected | dismissed)
   */
  async updateClipCandidateStatus(
    projectId: string,
    candidateId: string,
    status: ClipCandidateStatus
  ): Promise<ClipCandidate> {
    const token = await this.getAuthToken();
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/projects/${projectId}/clip-candidates/${candidateId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    const data = await response.json();
    if (!response.ok) {
      const error: any = new Error(data.message || 'Failed to update clip candidate.');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }

    return data.candidate as ClipCandidate;
  }
}

export const clipService = new ClipService();

import { backendRequest } from './backendClient';
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
  /**
   * Triggers AI clip analysis for a transcribed project
   */
  async analyzeClips(projectId: string, customNotes?: string): Promise<AnalyzeClipsResponse> {
    return backendRequest<AnalyzeClipsResponse>(`/projects/${projectId}/analyze-clips`, {
      method: 'POST',
      body: JSON.stringify({ customNotes }),
    });
  }

  /**
   * Fetches all clip candidates for a project, sorted by engagement_score DESC
   */
  async getClipCandidates(projectId: string): Promise<ClipCandidate[]> {
    const data = await backendRequest<GetClipCandidatesResponse>(`/projects/${projectId}/clip-candidates`);
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
    const data = await backendRequest<UpdateClipCandidateResponse>(`/projects/${projectId}/clip-candidates/${candidateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return data.candidate;
  }
}

export const clipService = new ClipService();

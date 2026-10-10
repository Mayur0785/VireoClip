import { backendRequest } from './backendClient';
import {
  ContentWorkflowFilterOptions,
  ContentWorkflowListResponse,
  ContentWorkflowRecord,
  WorkflowState,
} from '../types';

export const workflowService = {
  async listWorkflows(options: ContentWorkflowFilterOptions = {}): Promise<ContentWorkflowListResponse> {
    const params = new URLSearchParams();
    if (options.state) params.append('state', options.state);
    if (options.clipId) params.append('clipId', options.clipId);
    if (options.projectId) params.append('projectId', options.projectId);
    if (options.search) params.append('search', options.search);
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.page) params.append('page', String(options.page));
    if (options.limit) params.append('limit', String(options.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await backendRequest<{ success: boolean; data: ContentWorkflowListResponse }>(`/workflows${qs}`);
    return res.data;
  },

  async getWorkflow(id: string): Promise<ContentWorkflowRecord> {
    const res = await backendRequest<{ success: boolean; data: ContentWorkflowRecord }>(`/workflows/${id}`);
    return res.data;
  },

  async createWorkflow(payload: {
    title: string;
    project_id: string;
    clip_id?: string | null;
    notes?: string;
    tags?: string[];
    initial_state?: WorkflowState;
  }): Promise<ContentWorkflowRecord> {
    const res = await backendRequest<{ success: boolean; data: ContentWorkflowRecord }>('/workflows', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async transitionWorkflow(
    id: string,
    targetState: WorkflowState,
    options: { expectedVersion?: number; notes?: string; approvalNotes?: string } = {}
  ): Promise<ContentWorkflowRecord> {
    const res = await backendRequest<{ success: boolean; data: ContentWorkflowRecord }>(`/workflows/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ targetState, ...options }),
    });
    return res.data;
  },

  async approveWorkflow(id: string, notes?: string): Promise<ContentWorkflowRecord> {
    const res = await backendRequest<{ success: boolean; data: ContentWorkflowRecord }>(`/workflows/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
    return res.data;
  },

  async requestRevisions(id: string, reason: string): Promise<ContentWorkflowRecord> {
    const res = await backendRequest<{ success: boolean; data: ContentWorkflowRecord }>(`/workflows/${id}/request-revisions`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },
};

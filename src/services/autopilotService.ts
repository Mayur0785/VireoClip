import {
  AutopilotRunRecord,
  AutopilotCapabilityModel,
  AutopilotSettings,
  AutopilotStepName,
} from '../types';

import { backendRequest } from './backendClient';

const API_BASE = '/autopilot';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await backendRequest<{ success?: boolean; data?: T } | T>(
    `${API_BASE}${endpoint}`,
    options
  );

  if (res && typeof res === 'object' && 'success' in res && 'data' in res) {
    return (res as { data: T }).data;
  }

  return res as T;
}

export const autopilotService = {
  /**
   * Retrieves capabilities of Autopilot orchestrator.
   */
  async getCapabilities(): Promise<AutopilotCapabilityModel> {
    return await request<AutopilotCapabilityModel>('/capabilities');
  },

  /**
   * Initializes a new Autopilot run.
   */
  async createRun(
    clipId: string,
    settings?: AutopilotSettings,
    idempotencyKey?: string
  ): Promise<AutopilotRunRecord> {
    return await request<AutopilotRunRecord>('/runs', {
      method: 'POST',
      body: JSON.stringify({
        clip_id: clipId,
        settings,
        idempotency_key: idempotencyKey,
      }),
    });
  },

  /**
   * Retrieves all Autopilot runs for a clip.
   */
  async getRunsForClip(clipId: string): Promise<AutopilotRunRecord[]> {
    return await request<AutopilotRunRecord[]>(`/clips/${clipId}`);
  },

  /**
   * Retrieves an Autopilot run by ID.
   */
  async getRun(runId: string): Promise<AutopilotRunRecord> {
    return await request<AutopilotRunRecord>(`/runs/${runId}`);
  },

  /**
   * Triggers or resumes pipeline execution for an Autopilot run.
   */
  async executeRun(runId: string): Promise<AutopilotRunRecord> {
    return await request<AutopilotRunRecord>(`/runs/${runId}/execute`, {
      method: 'POST',
    });
  },

  /**
   * Retries an eligible failed pipeline step or forces an upstream rerun with safe invalidation.
   */
  async retryStep(runId: string, step: AutopilotStepName, forceRerun = false): Promise<AutopilotRunRecord> {
    return await request<AutopilotRunRecord>(`/runs/${runId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ step, forceRerun }),
    });
  },

  /**
   * Records explicit human approval and generates consolidated publishing handoff.
   */
  async approveRun(
    runId: string,
    options: {
      selected_hook_candidate_id?: string;
      selected_thumbnail_concept_id?: string;
      custom_instruction?: string;
    } = {}
  ): Promise<{ run: AutopilotRunRecord; publishing_handoff: Record<string, any> }> {
    return await request<{ run: AutopilotRunRecord; publishing_handoff: Record<string, any> }>(
      `/runs/${runId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify(options),
      }
    );
  },
};

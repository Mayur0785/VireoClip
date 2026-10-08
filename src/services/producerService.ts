import { backendRequest } from './backendClient';
import {
  ProducerEditPlan,
  GenerateProducerPlanDTO,
  ReviseProducerPlanDTO,
  RenderedClip,
} from '../types';

export interface GeneratePlanResponse {
  status: 'ok';
  data: ProducerEditPlan;
}

export interface GetPlansResponse {
  status: 'ok';
  data: ProducerEditPlan[];
}

export interface GetPlanResponse {
  status: 'ok';
  data: ProducerEditPlan;
}

export interface PreviewPlanResponse {
  status: 'ok';
  data: {
    previewUrl: string;
    duration: number;
  };
}

export interface ApplyPlanResponse {
  status: 'ok';
  message: string;
  data: {
    clip: RenderedClip;
    plan: ProducerEditPlan;
  };
}

class ProducerService {
  /**
   * Generates a new AI ProducerEditPlan for a clip
   */
  async generatePlan(clipId: string, dto: GenerateProducerPlanDTO = {}): Promise<ProducerEditPlan> {
    const res = await backendRequest<GeneratePlanResponse>(`/clips/${clipId}/producer/plan`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Fetches all generated plans for a clip
   */
  async getPlans(clipId: string): Promise<ProducerEditPlan[]> {
    const res = await backendRequest<GetPlansResponse>(`/clips/${clipId}/producer/plans`);
    return res.data || [];
  }

  /**
   * Fetches a single plan by ID
   */
  async getPlan(clipId: string, planId: string): Promise<ProducerEditPlan> {
    const res = await backendRequest<GetPlanResponse>(`/clips/${clipId}/producer/plans/${planId}`);
    return res.data;
  }

  /**
   * Revises a plan through natural language instructions or operation toggles
   */
  async revisePlan(clipId: string, planId: string, dto: ReviseProducerPlanDTO): Promise<ProducerEditPlan> {
    const res = await backendRequest<GeneratePlanResponse>(`/clips/${clipId}/producer/plans/${planId}/revise`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Renders or fetches a lightweight 720p preview video executing the plan's edits
   */
  async previewPlan(clipId: string, planId: string): Promise<{ previewUrl: string; duration: number }> {
    const res = await backendRequest<PreviewPlanResponse>(`/clips/${clipId}/producer/plans/${planId}/preview`, {
      method: 'POST',
    });
    return res.data;
  }

  /**
   * Applies the approved ProducerEditPlan to the clip non-destructively and starts render
   */
  async applyPlan(clipId: string, planId: string): Promise<{ clip: RenderedClip; plan: ProducerEditPlan }> {
    const res = await backendRequest<ApplyPlanResponse>(`/clips/${clipId}/producer/plans/${planId}/apply`, {
      method: 'POST',
    });
    return res.data;
  }

  /**
   * Deletes a plan
   */
  async deletePlan(clipId: string, planId: string): Promise<void> {
    await backendRequest<{ status: 'ok' }>(`/clips/${clipId}/producer/plans/${planId}`, {
      method: 'DELETE',
    });
  }
}

export const producerService = new ProducerService();

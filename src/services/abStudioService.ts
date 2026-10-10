import {
  ABExperiment,
  ABCapabilityModel,
  ABExperimentReport,
  ListABExperimentsQuery,
  CreateABExperimentDTO,
  RecordABObservationDTO,
  DeclareABWinnerDTO,
  PromoteABWinnerDTO,
  ABCsvColumnMapping,
  ABCsvPreviewResult,
  ABCsvImportResult,
} from '../types';

import { backendRequest, apiBase, authToken } from './backendClient';

const API_BASE = '/ab-studio';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await backendRequest<{ success?: boolean; data?: T; message?: string } | T>(
    `${API_BASE}${endpoint}`,
    options
  );

  if (res && typeof res === 'object' && 'success' in res && 'data' in res) {
    return (res as { data: T }).data;
  }

  return res as T;
}

export const abStudioService = {
  /**
   * Retrieves system capabilities and statistical decision parameters.
   */
  async getCapabilities(): Promise<ABCapabilityModel> {
    return await request<ABCapabilityModel>('/capabilities');
  },

  /**
   * Creates a new A/B experiment in draft.
   */
  async createExperiment(dto: CreateABExperimentDTO): Promise<ABExperiment> {
    return await request<ABExperiment>('/experiments', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /**
   * Retrieves an experiment by ID with live statistical evaluation.
   */
  async getExperiment(experimentId: string): Promise<ABExperiment> {
    return await request<ABExperiment>(`/experiments/${experimentId}`);
  },

  /**
   * Lists all experiments for a clip.
   */
  async getExperimentsForClip(clipId: string): Promise<ABExperiment[]> {
    return await request<ABExperiment[]>(`/clips/${clipId}`);
  },

  /**
   * Starts an experiment.
   */
  async startExperiment(experimentId: string): Promise<ABExperiment> {
    return await request<ABExperiment>(`/experiments/${experimentId}/start`, {
      method: 'POST',
    });
  },

  /**
   * Pauses an active experiment.
   */
  async pauseExperiment(experimentId: string): Promise<ABExperiment> {
    return await request<ABExperiment>(`/experiments/${experimentId}/pause`, {
      method: 'POST',
    });
  },

  /**
   * Ingests observed performance batch.
   */
  async recordObservation(
    experimentId: string,
    dto: RecordABObservationDTO
  ): Promise<ABExperiment> {
    return await request<ABExperiment>(`/experiments/${experimentId}/observations`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /**
   * Declares winning variant.
   */
  async declareWinner(
    experimentId: string,
    dto: DeclareABWinnerDTO
  ): Promise<ABExperiment> {
    return await request<ABExperiment>(`/experiments/${experimentId}/declare-winner`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /**
   * Safely promotes winning variant to clip, Thumbnail Lab, and Brand Brain.
   */
  async promoteWinner(
    experimentId: string,
    dto: PromoteABWinnerDTO
  ): Promise<{
    experiment: ABExperiment;
    promotedTo: string[];
    brandEvidenceId?: string;
  }> {
    return await request<{
      experiment: ABExperiment;
      promotedTo: string[];
      brandEvidenceId?: string;
    }>(`/experiments/${experimentId}/promote-winner`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /**
   * Deletes a draft or cancelled experiment.
   */
  async deleteExperiment(experimentId: string): Promise<void> {
    await request<void>(`/experiments/${experimentId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Lists user's experiments with optional status and search filtering.
   */
  async listUserExperiments(query: ListABExperimentsQuery = {}): Promise<{
    experiments: ABExperiment[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.search) params.append('search', query.search);
    if (query.limit) params.append('limit', String(query.limit));
    if (query.offset) params.append('offset', String(query.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return await request<{
      experiments: ABExperiment[];
      total: number;
      limit: number;
      offset: number;
    }>(`/experiments${qs}`);
  },

  /**
   * Gets an experiment report with statistical summary and evidence level.
   */
  async getExperimentReport(experimentId: string): Promise<ABExperimentReport> {
    return await request<ABExperimentReport>(`/experiments/${experimentId}/report`);
  },

  /**
   * Downloads a CSV report for an experiment.
   */
  async downloadExperimentCsv(experimentId: string): Promise<void> {
    const token = await authToken();
    const response = await fetch(`${apiBase}${API_BASE}/experiments/${experimentId}/export`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`CSV export failed (${response.status})`);
    }

    const contentDisposition = response.headers.get('content-disposition');
    let filename = `vireo_ab_experiment_${experimentId.slice(0, 8)}.csv`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Previews CSV analytics import for an experiment.
   */
  async previewCsvImport(
    experimentId: string,
    csvContent: string,
    columnMapping?: Partial<ABCsvColumnMapping>
  ): Promise<ABCsvPreviewResult> {
    return await request<ABCsvPreviewResult>(`/experiments/${experimentId}/import-csv/preview`, {
      method: 'POST',
      body: JSON.stringify({ csv_content: csvContent, column_mapping: columnMapping }),
    });
  },

  /**
   * Executes CSV analytics import for an experiment.
   */
  async executeCsvImport(
    experimentId: string,
    csvContent: string,
    columnMapping?: Partial<ABCsvColumnMapping>
  ): Promise<ABCsvImportResult> {
    return await request<ABCsvImportResult>(`/experiments/${experimentId}/import-csv/execute`, {
      method: 'POST',
      body: JSON.stringify({ csv_content: csvContent, column_mapping: columnMapping }),
    });
  },
};

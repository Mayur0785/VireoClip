import { backendRequest } from './backendClient';
import {
  BrandBrainProfile,
  BrandBrainVersion,
  BrandEvidence,
  BrandContext,
  BrandCheckResult,
  BrandRecommendation,
} from '../types';

export interface BrandBrainResponse<T> {
  success: boolean;
  profile?: T;
  context?: T;
  evidence?: T;
  result?: T;
  versions?: T;
  draft?: T;
  error?: string;
}

class FrontendBrandBrainService {
  /**
   * Fetches active Brand Brain profile
   */
  async getProfile(brandId?: string): Promise<BrandBrainProfile> {
    const query = brandId ? `?brand_id=${encodeURIComponent(brandId)}` : '';
    const res = await backendRequest<{ success: boolean; profile: BrandBrainProfile }>(
      `/brand-brain${query}`
    );
    return res.profile;
  }

  /**
   * Updates Brand Brain profile
   */
  async updateProfile(
    updates: Partial<BrandBrainProfile>,
    brandId?: string
  ): Promise<BrandBrainProfile> {
    const query = brandId ? `?brand_id=${encodeURIComponent(brandId)}` : '';
    const res = await backendRequest<{ success: boolean; profile: BrandBrainProfile }>(
      `/brand-brain${query}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return res.profile;
  }

  /**
   * Toggles lock on a brand setting
   */
  async setLock(ruleKey: string, locked: boolean, brandId?: string): Promise<BrandBrainProfile> {
    const res = await backendRequest<{ success: boolean; profile: BrandBrainProfile }>(
      '/brand-brain/lock',
      {
        method: 'POST',
        body: JSON.stringify({ rule_key: ruleKey, locked, brand_id: brandId }),
      }
    );
    return res.profile;
  }

  /**
   * Resets learned layer preferences
   */
  async resetLearned(brandId?: string): Promise<BrandBrainProfile> {
    const res = await backendRequest<{ success: boolean; profile: BrandBrainProfile }>(
      '/brand-brain/reset-learned',
      {
        method: 'POST',
        body: JSON.stringify({ brand_id: brandId }),
      }
    );
    return res.profile;
  }

  /**
   * Retrieves task-specific minimized Brand Context
   */
  async getContext(
    taskType: string,
    platform?: string,
    projectId?: string,
    brandId?: string
  ): Promise<BrandContext> {
    const params = new URLSearchParams({ task_type: taskType });
    if (platform) params.append('platform', platform);
    if (projectId) params.append('project_id', projectId);
    if (brandId) params.append('brand_id', brandId);

    const res = await backendRequest<{ success: boolean; context: BrandContext }>(
      `/brand-brain/context?${params.toString()}`
    );
    return res.context;
  }

  /**
   * Fetches evidence ledger
   */
  async getEvidence(brandId?: string, dimension?: string): Promise<BrandEvidence[]> {
    const params = new URLSearchParams();
    if (brandId) params.append('brand_id', brandId);
    if (dimension) params.append('dimension', dimension);

    const res = await backendRequest<{ success: boolean; evidence: BrandEvidence[] }>(
      `/brand-brain/evidence?${params.toString()}`
    );
    return res.evidence || [];
  }

  /**
   * Runs content compliance and deterministic BrandMatch check
   */
  async checkCompliance(content: any, brandId?: string): Promise<BrandCheckResult> {
    const res = await backendRequest<{ success: boolean; result: BrandCheckResult }>(
      '/brand-brain/check',
      {
        method: 'POST',
        body: JSON.stringify({ content, brand_id: brandId }),
      }
    );
    return res.result;
  }

  /**
   * Fetches explainable recommendations and potential conflicts
   */
  async getRecommendations(brandId?: string): Promise<{
    recommendations: BrandRecommendation[];
    conflicts: any[];
    analytics_status: 'SUFFICIENT_DATA' | 'INSUFFICIENT_DATA';
    analytics_sample_count: number;
    explanation?: string;
  }> {
    const query = brandId ? `?brand_id=${encodeURIComponent(brandId)}` : '';
    return await backendRequest<{
      success: boolean;
      recommendations: BrandRecommendation[];
      conflicts: any[];
      analytics_status: 'SUFFICIENT_DATA' | 'INSUFFICIENT_DATA';
      analytics_sample_count: number;
      explanation?: string;
    }>(`/brand-brain/recommendations${query}`);
  }

  /**
   * Approves an explainable recommendation with optional confirmation and edited value
   */
  async approveRecommendation(
    recommendationId: string,
    options?: { confirm_overwrite?: boolean; edited_value?: any; brand_id?: string }
  ): Promise<{ profile: BrandBrainProfile; recommendation: BrandRecommendation }> {
    const res = await backendRequest<{
      success: boolean;
      profile: BrandBrainProfile;
      recommendation: BrandRecommendation;
    }>(`/brand-brain/recommendations/${encodeURIComponent(recommendationId)}/approve`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
    return { profile: res.profile, recommendation: res.recommendation };
  }

  /**
   * Dismisses an explainable recommendation
   */
  async dismissRecommendation(
    recommendationId: string
  ): Promise<{ success: boolean; recommendation: BrandRecommendation }> {
    return await backendRequest<{
      success: boolean;
      recommendation: BrandRecommendation;
    }>(`/brand-brain/recommendations/${encodeURIComponent(recommendationId)}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * Applies an explainable recommendation (legacy)
   */
  async applyRecommendation(
    dimension: string,
    field: string,
    suggestedValue: any,
    brandId?: string
  ): Promise<BrandBrainProfile> {
    const res = await backendRequest<{ success: boolean; profile: BrandBrainProfile }>(
      '/brand-brain/recommendations/apply',
      {
        method: 'POST',
        body: JSON.stringify({
          dimension,
          field,
          suggested_value: suggestedValue,
          brand_id: brandId,
        }),
      }
    );
    return res.profile;
  }

  /**
   * Applies brand style to an active Pro Editor project
   */
  async applyToEditor(
    editorProjectId: string,
    options?: any,
    brandId?: string
  ): Promise<{
    updatedProject: any;
    previousProjectSnapshot: any;
    changesApplied: string[];
  }> {
    return await backendRequest<{
      success: boolean;
      updatedProject: any;
      previousProjectSnapshot: any;
      changesApplied: string[];
    }>('/brand-brain/apply-to-editor', {
      method: 'POST',
      body: JSON.stringify({
        editor_project_id: editorProjectId,
        options,
        brand_id: brandId,
      }),
    });
  }

  /**
   * Reverts applied brand style from an editor project
   */
  async revertEditor(editorProjectId: string, snapshot: any): Promise<any> {
    const res = await backendRequest<{ success: boolean; project: any }>(
      '/brand-brain/revert-editor',
      {
        method: 'POST',
        body: JSON.stringify({
          editor_project_id: editorProjectId,
          snapshot,
        }),
      }
    );
    return res.project;
  }

  /**
   * Fetches version history
   */
  async getVersions(brandId?: string): Promise<BrandBrainVersion[]> {
    const query = brandId ? `?brand_id=${encodeURIComponent(brandId)}` : '';
    const res = await backendRequest<{ success: boolean; versions: BrandBrainVersion[] }>(
      `/brand-brain/versions${query}`
    );
    return res.versions || [];
  }

  /**
   * Restores a version snapshot
   */
  async restoreVersion(versionNumber: number, brandId?: string): Promise<BrandBrainProfile> {
    const res = await backendRequest<{ success: boolean; profile: BrandBrainProfile }>(
      `/brand-brain/restore/${versionNumber}`,
      {
        method: 'POST',
        body: JSON.stringify({ brand_id: brandId }),
      }
    );
    return res.profile;
  }

  /**
   * Parses public brand guidelines into candidate draft for review
   */
  async parseGuidelines(text: string): Promise<any> {
    const res = await backendRequest<{ success: boolean; draft: any }>(
      '/brand-brain/parse-guidelines',
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    );
    return res.draft;
  }

  /**
   * Triggers non-blocking background learning from an approved export
   */
  async learn(payload: {
    editor_project_id?: string;
    producer_plan_id?: string;
    brand_id?: string;
  }): Promise<any> {
    return await backendRequest('/brand-brain/learn', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const brandBrainService = new FrontendBrandBrainService();

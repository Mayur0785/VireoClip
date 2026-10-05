import { Project, ContentOutput, OutputPlatform, CreatorProfile, ProjectStatus, Transcript, GenerationOverrides } from '../types';
import { backendRequest } from './backendClient';

export interface CreateProjectInput {
  id?: string; userId?: string; title: string; sourceType?: 'upload' | 'url';
  sourceUrl?: string | null; videoStatus?: ProjectStatus; notes?: string;
}

const INITIAL_PROFILE: CreatorProfile = {
  name: 'Creator', email: 'creator@vireo.app', niche: 'Tech, SaaS & Solopreneurship',
  audience: 'Founders, builders, and content creators', language: 'English', tone: 'Friendly',
};

class ProjectService {
  private projects: Project[] = [];
  private outputs: ContentOutput[] = [];
  private profile: CreatorProfile = INITIAL_PROFILE;

  clear(): void { this.projects = []; this.outputs = []; this.profile = INITIAL_PROFILE; }

  private mapRow(row: any): Project {
    const status = (row.video_status as ProjectStatus) || 'uploading';
    return {
      id: row.id, user_id: row.user_id, title: row.title || 'Untitled Project',
      source_type: row.source_type || 'upload', source_url: row.source_url || null,
      video_url: row.source_url || null, notes: row.notes || '', status, video_status: status,
      created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString(),
    };
  }

  private cacheProject(row: any): Project {
    const project = this.mapRow(row);
    this.projects = [project, ...this.projects.filter((p) => p.id !== project.id)];
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId: project.id } }));
    return project;
  }

  async fetchProjects(_userId?: string): Promise<Project[]> {
    const data = await backendRequest<{ projects: any[] }>('/projects');
    this.projects = (data.projects || []).map((row) => this.mapRow(row));
    window.dispatchEvent(new CustomEvent('vireo_project_updated'));
    return this.getProjects();
  }

  async fetchProject(id: string): Promise<Project | null> {
    try {
      const data = await backendRequest<{ project: any }>(`/projects/${id}`);
      return this.cacheProject(data.project);
    } catch (error: any) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  getProjects(): Project[] { return [...this.projects]; }
  getProject(id: string): Project | undefined { return this.projects.find((p) => p.id === id); }
  getOutputs(projectId: string): ContentOutput[] { return this.outputs.filter((o) => o.project_id === projectId); }
  getProfile(): CreatorProfile { return { ...this.profile }; }
  updateProfile(profile: Partial<CreatorProfile>): CreatorProfile {
    this.profile = { ...this.profile, ...profile };
    return this.getProfile();
  }

  async createProjectAsync(input: CreateProjectInput): Promise<Project> {
    const data = await backendRequest<{ project: any }>('/projects', {
      method: 'POST', body: JSON.stringify({
        id: input.id || crypto.randomUUID(), title: input.title, source_type: input.sourceType || 'upload', notes: input.notes || '',
      }),
    });
    return this.cacheProject(data.project);
  }

  async updateProjectAsync(id: string, updates: Partial<Project>): Promise<Project | null> {
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (!Object.keys(patch).length) return this.fetchProject(id);
    const data = await backendRequest<{ project: any }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return this.cacheProject(data.project);
  }

  async deleteProject(id: string): Promise<boolean> {
    await backendRequest(`/projects/${id}`, { method: 'DELETE' });
    this.projects = this.projects.filter((p) => p.id !== id);
    this.outputs = this.outputs.filter((o) => o.project_id !== id);
    window.dispatchEvent(new CustomEvent('vireo_project_updated'));
    return true;
  }

  /** Local-only compatibility helper for old draft UI paths. */
  createProject(title: string, videoUrl: string | null, notes: string): Project {
    const isUrl = Boolean(videoUrl?.startsWith('https://') || videoUrl?.startsWith('http://'));
    const row = { id: crypto.randomUUID(), title, source_type: isUrl ? 'url' : 'upload',
      source_url: videoUrl, notes, video_status: isUrl ? 'queued' : 'uploading' };
    return this.cacheProject(row);
  }

  updateOutputContent(outputId: string, content: string): boolean {
    const item = this.outputs.find((o) => o.id === outputId);
    if (!item) return false;
    item.content = content;
    return true;
  }

  async startProcessing(projectId: string): Promise<{ success: boolean; message?: string }> {
    const data = await backendRequest<{ message?: string }>(`/projects/${projectId}/process`, { method: 'POST' });
    const project = this.getProject(projectId);
    if (project) { project.video_status = 'processing'; project.status = 'processing'; }
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));
    window.dispatchEvent(new CustomEvent('vireo_usage_updated'));
    return { success: true, message: data.message };
  }

  async fetchTranscript(projectId: string): Promise<Transcript | null> {
    try {
      const data = await backendRequest<{ transcript: Transcript }>(`/projects/${projectId}/transcript`);
      return data.transcript || null;
    } catch (error: any) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async fetchContentOutputs(projectId: string): Promise<ContentOutput[]> {
    const data = await backendRequest<{ outputs: ContentOutput[] }>(`/projects/${projectId}/content`);
    const outputs = data.outputs || [];
    this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(outputs);
    return outputs;
  }

  async generateContent(projectId: string, platform?: OutputPlatform, customNotes?: string,
    overrides?: GenerationOverrides): Promise<{ success: boolean; message: string; outputs: ContentOutput[] }> {
    const data = await backendRequest<{ message?: string; outputs?: ContentOutput[] }>(`/projects/${projectId}/generate-content`, {
      method: 'POST', body: JSON.stringify({ platform, customNotes,
        overrideTone: overrides?.overrideTone, overrideLanguage: overrides?.overrideLanguage,
        overrideCTA: overrides?.overrideCTA }),
    });
    const outputs = data.outputs || [];
    if (platform) this.outputs = this.outputs.filter((o) => !(o.project_id === projectId && o.platform === platform))
      .concat(outputs.filter((o) => o.platform === platform));
    else this.outputs = this.outputs.filter((o) => o.project_id !== projectId).concat(outputs);
    window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId } }));
    return { success: true, message: data.message || 'Content generated successfully.', outputs };
  }

  async updateOutputContentAsync(outputId: string, projectId: string, content: string): Promise<boolean> {
    await backendRequest(`/projects/${projectId}/content/${outputId}`, {
      method: 'PATCH', body: JSON.stringify({ content }),
    });
    this.updateOutputContent(outputId, content);
    return true;
  }
}

export const projectService = new ProjectService();

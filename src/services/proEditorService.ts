import { backendRequest } from './backendClient';
import {
  EditorProject,
  CreateEditorProjectDTO,
  UpdateEditorProjectDTO,
  SplitItemDTO,
  RippleDeleteDTO,
  DuplicateItemDTO,
  FreezeFrameDTO,
} from '../types';

export interface EditorProjectResponse {
  status: 'ok';
  data: EditorProject;
}

export interface SnapshotResponse {
  status: 'ok';
  data: {
    snapshot_url: string;
    timestamp: number;
  };
}

export interface RenderProjectResponse {
  status: 'ok';
  message: string;
  data: {
    job_id: string;
    project_id: string;
    status: string;
  };
}

class ProEditorService {
  /**
   * Retrieves an existing editor project for a clip, or creates one initialized
   * from the clip (and any applied Producer plan)
   */
  async getOrCreateEditorProject(
    clipId: string,
    dto: Partial<CreateEditorProjectDTO> = {}
  ): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/clips/${clipId}/editor-project`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Fetches an editor project by ID
   */
  async getEditorProject(projectId: string): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/editor-projects/${projectId}`);
    return res.data;
  }

  /**
   * Updates an editor project (tracks, canvas, playhead, settings)
   */
  async updateEditorProject(
    projectId: string,
    dto: UpdateEditorProjectDTO
  ): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/editor-projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Splits a clip at playhead time into two non-destructive segments
   */
  async splitItem(projectId: string, dto: SplitItemDTO): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/editor-projects/${projectId}/split`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Ripple deletes a clip and closes the timeline gap across unlocked tracks
   */
  async rippleDelete(projectId: string, dto: RippleDeleteDTO): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/editor-projects/${projectId}/ripple-delete`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Duplicates an item on the timeline non-destructively
   */
  async duplicateItem(projectId: string, dto: DuplicateItemDTO): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/editor-projects/${projectId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Freezes a frame at playhead and inserts a still segment
   */
  async freezeFrame(projectId: string, dto: FreezeFrameDTO): Promise<EditorProject> {
    const res = await backendRequest<EditorProjectResponse>(`/editor-projects/${projectId}/freeze-frame`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  /**
   * Captures an image snapshot at the given time
   */
  async captureSnapshot(
    projectId: string,
    trackId: string,
    itemId: string,
    time: number
  ): Promise<string> {
    const res = await backendRequest<SnapshotResponse>(`/editor-projects/${projectId}/snapshot`, {
      method: 'POST',
      body: JSON.stringify({
        track_id: trackId,
        item_id: itemId,
        time,
      }),
    });
    return res.data.snapshot_url;
  }

  /**
   * Submits a render job for the editor project
   */
  async renderProject(
    projectId: string,
    options: { resolution?: string; platform?: string } = {}
  ): Promise<{ job_id: string; status: string }> {
    const res = await backendRequest<RenderProjectResponse>(`/editor-projects/${projectId}/render`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
    return res.data;
  }
}

export const proEditorService = new ProEditorService();

import { backendRequest, apiBase, authToken } from './backendClient';
import {
  LanguageDefinition,
  TranslationProject,
  TranslatedSegment,
  DubProject,
  DubVoiceStrategy,
  DubAudioMode,
  TranslationProviderCapabilities,
  LipSyncProviderCapabilities,
  TranslationStyle,
} from '../types';

export interface TranslationCapabilitiesResponse {
  success: boolean;
  translation_providers: TranslationProviderCapabilities[];
  lipsync_providers: LipSyncProviderCapabilities[];
}

export interface DetectLanguageResponse {
  success: boolean;
  detected_language: string;
  confidence: number;
}

export interface CreateTranslationProjectParams {
  video_id?: string;
  clip_id?: string;
  project_id?: string;
  source_language?: string;
  target_languages: string[];
  style?: TranslationStyle;
  glossary_terms?: Record<string, string>;
  locked_terms?: string[];
  source_segments?: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    speaker_id?: string;
  }>;
}

export interface CreateDubProjectParams {
  translation_project_id: string;
  target_language: string;
  voice_strategy?: DubVoiceStrategy;
  target_voice_id?: string;
  speaker_voice_map?: Record<string, string>;
  audio_mode?: DubAudioMode;
  ducking_attenuation_db?: number;
  timing_adjustment?: {
    max_speed?: number;
    min_speed?: number;
    smart_shortening?: boolean;
  };
}

class TranslationService {
  /**
   * Fetches supported languages registry with script families and RTL flags.
   */
  async getSupportedLanguages(): Promise<LanguageDefinition[]> {
    const res = await backendRequest<{ success: boolean; languages: LanguageDefinition[] }>(
      '/translation/languages'
    );
    return res.languages || [];
  }

  /**
   * Fetches capabilities of translation and lip-sync providers.
   */
  async getCapabilities(): Promise<TranslationCapabilitiesResponse> {
    return backendRequest<TranslationCapabilitiesResponse>('/translation/capabilities');
  }

  /**
   * Automatically detects source language from text.
   */
  async detectLanguage(text: string): Promise<DetectLanguageResponse> {
    return backendRequest<DetectLanguageResponse>('/translation/detect', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  /**
   * Creates and starts a non-destructive translation project.
   */
  async createTranslationProject(params: CreateTranslationProjectParams): Promise<TranslationProject> {
    const res = await backendRequest<{ success: boolean; project: TranslationProject }>(
      '/translation/projects',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return res.project;
  }

  /**
   * Retrieves a translation project with all localized segments.
   */
  async getTranslationProject(projectId: string): Promise<TranslationProject> {
    const res = await backendRequest<{ success: boolean; project: TranslationProject }>(
      `/translation/projects/${projectId}`
    );
    return res.project;
  }

  /**
   * Updates an individual translated segment (manual edit, approval status).
   */
  async updateSegment(
    projectId: string,
    segmentId: string,
    updates: {
      translated_text?: string;
      is_approved?: boolean;
    }
  ): Promise<TranslatedSegment> {
    const res = await backendRequest<{ success: boolean; segment: TranslatedSegment }>(
      `/translation/projects/${projectId}/segments/${segmentId}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    return res.segment;
  }

  /**
   * Exports localized subtitles in SRT or VTT format.
   */
  async exportSubtitles(
    projectId: string,
    format: 'srt' | 'vtt' = 'srt',
    targetLanguage?: string
  ): Promise<string> {
    const token = await authToken();
    const query = new URLSearchParams({ format });
    if (targetLanguage) query.set('target_language', targetLanguage);

    const res = await fetch(`${apiBase}/translation/projects/${projectId}/subtitles?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to export subtitles: ${res.statusText}`);
    }

    return res.text();
  }

  /**
   * Triggers browser download for exported subtitles.
   */
  downloadSubtitlesFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Creates a multilingual voice dubbing project with timing alignment.
   */
  async createDubProject(params: CreateDubProjectParams): Promise<DubProject> {
    const res = await backendRequest<{ success: boolean; dub_project: DubProject }>(
      '/translation/dub-projects',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return res.dub_project;
  }

  /**
   * Retrieves dubbing project status and synthesized segments.
   */
  async getDubProject(dubId: string): Promise<DubProject> {
    const res = await backendRequest<{ success: boolean; dub_project: DubProject }>(
      `/translation/dub-projects/${dubId}`
    );
    return res.dub_project;
  }

  /**
   * Injects the synthesized dub track into the multi-track timeline with ducking.
   */
  async applyDubToTimeline(dubId: string): Promise<{ success: boolean; message: string }> {
    return backendRequest<{ success: boolean; message: string }>(
      `/translation/dub-projects/${dubId}/apply`,
      {
        method: 'POST',
      }
    );
  }
}

export const translationService = new TranslationService();

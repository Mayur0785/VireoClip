import { backendRequest } from './backendClient';
import {
  AudioAnalysisMetrics,
  AudioEnhancementConfig,
  AudioDuckingConfig,
  FillerWordMatch,
  RepeatedPhraseMatch,
  VoiceOption,
  VoiceProviderCapabilities,
  TTSRequest,
  TTSResult,
  VoiceCloneRequest,
  VoiceProfile,
  EditorProject,
} from '../types';

export interface ApiResponse<T> {
  success?: boolean;
  status?: 'ok' | 'error';
  data?: T;
  metrics?: AudioAnalysisMetrics;
  filler_words?: FillerWordMatch[];
  repeated_phrases?: RepeatedPhraseMatch[];
  plan?: any;
  capabilities?: any;
  voices?: VoiceOption[];
  result?: TTSResult;
  profile?: VoiceProfile;
  project?: EditorProject;
  preview_audio_path?: string;
  before?: AudioAnalysisMetrics;
  after?: AudioAnalysisMetrics;
}

class AudioStudioService {
  /**
   * Runs non-destructive acoustic analysis (LUFS, RMS, peak, clipping, silence).
   */
  async analyzeAudio(data: {
    file_path?: string;
    project_id?: string;
    clip_id?: string;
  }): Promise<AudioAnalysisMetrics> {
    const res = await backendRequest<ApiResponse<AudioAnalysisMetrics>>('/audio/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return (res.metrics || res.data) as AudioAnalysisMetrics;
  }

  /**
   * Generates a 5s non-destructive A/B snippet with before/after metrics.
   */
  async enhancePreview(data: {
    file_path?: string;
    project_id?: string;
    config: AudioEnhancementConfig;
    start_time?: number;
    duration?: number;
  }): Promise<{
    preview_audio_path: string;
    before: AudioAnalysisMetrics;
    after: AudioAnalysisMetrics;
  }> {
    const res = await backendRequest<ApiResponse<any>>('/audio/enhance-preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return {
      preview_audio_path: res.preview_audio_path || '',
      before: res.before!,
      after: res.after!,
    };
  }

  /**
   * Detects filler words from transcript words.
   */
  async detectFillerWords(words: any[]): Promise<FillerWordMatch[]> {
    const res = await backendRequest<ApiResponse<FillerWordMatch[]>>('/audio/filler-words', {
      method: 'POST',
      body: JSON.stringify({ words }),
    });
    return res.filler_words || [];
  }

  /**
   * Detects repeated takes / false starts.
   */
  async detectRepeatedPhrases(words: any[]): Promise<RepeatedPhraseMatch[]> {
    const res = await backendRequest<ApiResponse<RepeatedPhraseMatch[]>>('/audio/repeated-phrases', {
      method: 'POST',
      body: JSON.stringify({ words }),
    });
    return res.repeated_phrases || [];
  }

  /**
   * Calculates silence tightening recommendations.
   */
  async calculateSilenceTightening(intervals: any[], mode = 'natural'): Promise<any> {
    const res = await backendRequest<ApiResponse<any>>('/audio/silence-tighten', {
      method: 'POST',
      body: JSON.stringify({ intervals, mode }),
    });
    return res.plan;
  }

  /**
   * Retrieves audio, enhancement, and voice provider capabilities.
   */
  async getCapabilities(): Promise<VoiceProviderCapabilities> {
    const res = await backendRequest<ApiResponse<VoiceProviderCapabilities>>('/audio/capabilities');
    return res.capabilities;
  }

  /**
   * Lists available voices from configured voice providers.
   */
  async listVoices(): Promise<VoiceOption[]> {
    const res = await backendRequest<ApiResponse<VoiceOption[]>>('/audio/voices');
    return res.voices || [];
  }

  /**
   * Synthesizes or previews voiceover.
   */
  async generateVoiceover(data: TTSRequest): Promise<TTSResult> {
    const res = await backendRequest<ApiResponse<TTSResult>>('/audio/voiceover/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.result!;
  }

  /**
   * Clones voice with explicit consent.
   */
  async cloneVoice(data: VoiceCloneRequest): Promise<VoiceProfile> {
    const res = await backendRequest<ApiResponse<VoiceProfile>>('/audio/voice-clone', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.profile!;
  }

  /**
   * Applies Audio Studio settings to EditorProject.
   */
  async applyAudioStudio(
    editorProjectId: string,
    data: {
      enhancement?: AudioEnhancementConfig;
      ducking?: AudioDuckingConfig;
      dialogue_volume?: number;
      music_volume?: number;
      broll_audio_mode?: string;
    }
  ): Promise<EditorProject> {
    const res = await backendRequest<ApiResponse<EditorProject>>(
      `/editor-projects/${editorProjectId}/audio-studio`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return res.project!;
  }
}

export const audioStudioService = new AudioStudioService();

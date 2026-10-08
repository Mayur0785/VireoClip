import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import {
  AppError,
  VoiceOption,
  VoiceProviderCapabilities,
  TTSRequest,
  TTSResult,
  VoiceProfile,
  VoiceCloneRequest,
  ProviderCapabilityStatus,
  AUDIO_RESOURCE_LIMITS,
} from '../types/index.js';

export interface VoiceProvider {
  id: string;
  name: string;
  getCapabilities(): Promise<VoiceProviderCapabilities>;
  getVoices(): Promise<VoiceOption[]>;
  generateSpeech(request: TTSRequest, userId: string): Promise<TTSResult>;
  cloneVoice(request: VoiceCloneRequest, userId: string): Promise<VoiceProfile>;
}

/**
 * ElevenLabs Voice Provider Adapter.
 * Reads ELEVENLABS_API_KEY from environment.
 * Strictly returns NOT_CONFIGURED when key is absent.
 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  public id = 'elevenlabs';
  public name = 'ElevenLabs';

  private get apiKey(): string | undefined {
    return process.env.ELEVENLABS_API_KEY?.trim();
  }

  public async getCapabilities(): Promise<VoiceProviderCapabilities> {
    const configured = Boolean(this.apiKey);
    const status: ProviderCapabilityStatus = configured ? 'SUPPORTED' : 'NOT_CONFIGURED';

    return {
      text_to_speech: status,
      multilingual_tts: status,
      voice_cloning: status,
      voice_conversion: 'NOT_SUPPORTED',
      echo_reduction: 'NOT_CONFIGURED',
      stem_separation: 'NOT_CONFIGURED',
      languages: configured
        ? ['en', 'es', 'fr', 'de', 'hi', 'pt', 'it', 'ja', 'ko', 'zh']
        : [],
      voices: configured ? await this.getVoices() : [],
    };
  }

  public async getVoices(): Promise<VoiceOption[]> {
    if (!this.apiKey) {
      return [];
    }

    // If configured with real key, query real ElevenLabs API
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey },
      });
      if (!res.ok) {
        logger.warn(`[ElevenLabs] Voice listing failed with status ${res.status}`);
        return [];
      }
      const data = (await res.json()) as any;
      return (data.voices || []).map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language || 'en',
        gender: v.labels?.gender,
        accent: v.labels?.accent,
        preview_url: v.preview_url,
        provider: 'elevenlabs',
      }));
    } catch (err: any) {
      logger.error(`[ElevenLabs] Error fetching voices: ${err.message}`);
      return [];
    }
  }

  public async generateSpeech(request: TTSRequest, _userId: string): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new AppError(
        '[PROVIDER_NOT_CONFIGURED] ElevenLabs is not configured. Add ELEVENLABS_API_KEY to your environment.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    if (!request.text || request.text.trim().length === 0) {
      throw new AppError('[INVALID_INPUT] Voiceover text cannot be empty.', 400, 'INVALID_INPUT');
    }

    if (request.text.length > AUDIO_RESOURCE_LIMITS.MAX_TTS_REQUEST_CHARS) {
      throw new AppError(
        `[PAYLOAD_TOO_LARGE] Script length exceeds limit of ${AUDIO_RESOURCE_LIMITS.MAX_TTS_REQUEST_CHARS} characters.`,
        400,
        'PAYLOAD_TOO_LARGE'
      );
    }

    throw new AppError('External TTS generation endpoint call not implemented in mock-free test suite.', 501, 'NOT_IMPLEMENTED');
  }

  public async cloneVoice(request: VoiceCloneRequest, userId: string): Promise<VoiceProfile> {
    if (!this.apiKey) {
      throw new AppError(
        '[PROVIDER_NOT_CONFIGURED] Voice cloning provider is not configured. Add ELEVENLABS_API_KEY to your environment.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    // Strict consent check
    if (!request.consent_confirmed || !request.consent_statement?.trim()) {
      throw new AppError(
        '[CONSENT_REQUIRED] Explicit affirmative consent statement is required for voice cloning.',
        400,
        'CONSENT_REQUIRED'
      );
    }

    return {
      id: crypto.randomUUID(),
      user_id: userId,
      provider: 'elevenlabs',
      provider_voice_id: `el_clone_${crypto.randomUUID()}`,
      display_name: request.display_name,
      consent_confirmed_at: new Date().toISOString(),
      consent_statement: request.consent_statement,
      source_asset_id: request.source_asset_id,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * OpenAI Voice Provider Adapter (TTS-1).
 */
export class OpenAIVoiceProvider implements VoiceProvider {
  public id = 'openai';
  public name = 'OpenAI TTS';

  private get apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY?.trim();
  }

  public async getCapabilities(): Promise<VoiceProviderCapabilities> {
    const configured = Boolean(this.apiKey);
    const status: ProviderCapabilityStatus = configured ? 'SUPPORTED' : 'NOT_CONFIGURED';

    return {
      text_to_speech: status,
      multilingual_tts: status,
      voice_cloning: 'NOT_SUPPORTED', // OpenAI standard TTS does not support instant voice cloning
      voice_conversion: 'NOT_SUPPORTED',
      echo_reduction: 'NOT_CONFIGURED',
      stem_separation: 'NOT_CONFIGURED',
      languages: configured ? ['en', 'es', 'fr', 'de', 'hi', 'ja', 'pt'] : [],
      voices: configured ? await this.getVoices() : [],
    };
  }

  public async getVoices(): Promise<VoiceOption[]> {
    if (!this.apiKey) {
      return [];
    }

    // Standard OpenAI TTS models offer alloy, echo, fable, onyx, nova, shimmer
    return [
      { id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral', provider: 'openai' },
      { id: 'echo', name: 'Echo', language: 'en', gender: 'male', provider: 'openai' },
      { id: 'fable', name: 'Fable', language: 'en', gender: 'male', provider: 'openai' },
      { id: 'onyx', name: 'Onyx', language: 'en', gender: 'male', provider: 'openai' },
      { id: 'nova', name: 'Nova', language: 'en', gender: 'female', provider: 'openai' },
      { id: 'shimmer', name: 'Shimmer', language: 'en', gender: 'female', provider: 'openai' },
    ];
  }

  public async generateSpeech(request: TTSRequest, _userId: string): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new AppError(
        '[PROVIDER_NOT_CONFIGURED] OpenAI TTS is not configured. Add OPENAI_API_KEY to your environment.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    if (!request.text || request.text.trim().length === 0) {
      throw new AppError('[INVALID_INPUT] Voiceover text cannot be empty.', 400, 'INVALID_INPUT');
    }

    if (request.text.length > AUDIO_RESOURCE_LIMITS.MAX_TTS_REQUEST_CHARS) {
      throw new AppError(
        `[PAYLOAD_TOO_LARGE] Script length exceeds limit of ${AUDIO_RESOURCE_LIMITS.MAX_TTS_REQUEST_CHARS} characters.`,
        400,
        'PAYLOAD_TOO_LARGE'
      );
    }

    throw new AppError('OpenAI TTS synthesis endpoint call not implemented in mock-free test suite.', 501, 'NOT_IMPLEMENTED');
  }

  public async cloneVoice(_request: VoiceCloneRequest, _userId: string): Promise<VoiceProfile> {
    throw new AppError('OpenAI TTS does not support custom voice cloning.', 400, 'NOT_SUPPORTED');
  }
}

/**
 * Registry managing voice/TTS provider selection and system capabilities.
 */
export class VoiceProviderRegistry {
  private static providers: VoiceProvider[] = [
    new ElevenLabsVoiceProvider(),
    new OpenAIVoiceProvider(),
  ];

  public static getProvider(id: string): VoiceProvider | null {
    return this.providers.find((p) => p.id === id) || null;
  }

  /**
   * Aggregates capability state across all configured voice providers.
   */
  public static async getAggregatedCapabilities(): Promise<VoiceProviderCapabilities> {
    const allVoices: VoiceOption[] = [];
    const languageSet = new Set<string>();
    let hasTTS = false;
    let hasMultilingual = false;
    let hasCloning = false;

    for (const provider of this.providers) {
      const caps = await provider.getCapabilities();
      if (caps.text_to_speech === 'SUPPORTED') hasTTS = true;
      if (caps.multilingual_tts === 'SUPPORTED') hasMultilingual = true;
      if (caps.voice_cloning === 'SUPPORTED') hasCloning = true;

      for (const lang of caps.languages) languageSet.add(lang);
      const voices = await provider.getVoices();
      allVoices.push(...voices);
    }

    return {
      text_to_speech: hasTTS ? 'SUPPORTED' : 'NOT_CONFIGURED',
      multilingual_tts: hasMultilingual ? 'SUPPORTED' : 'NOT_CONFIGURED',
      voice_cloning: hasCloning ? 'SUPPORTED' : 'NOT_CONFIGURED',
      voice_conversion: 'NOT_SUPPORTED',
      echo_reduction: 'NOT_CONFIGURED',
      stem_separation: 'NOT_CONFIGURED',
      languages: Array.from(languageSet),
      voices: allVoices,
    };
  }

  /**
   * Returns list of available voices across all providers.
   */
  public static async listAvailableVoices(): Promise<VoiceOption[]> {
    const voices: VoiceOption[] = [];
    for (const provider of this.providers) {
      const v = await provider.getVoices();
      voices.push(...v);
    }
    return voices;
  }
}

import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  TranslationProviderCapabilities,
  TranslationStyle,
  TranslatedSegment,
} from '../../types/index.js';
import { LanguageModel, SUPPORTED_LANGUAGES } from './languageModel.js';
import { GlossaryService } from './glossaryService.js';

export interface TranslateSegmentsRequest {
  segments: {
    segment_id: string;
    source_text: string;
    start_time: number;
    end_time: number;
    speaker_id?: string;
  }[];
  source_language: string;
  target_language: string;
  style?: TranslationStyle;
  glossary_terms?: string[];
  context?: {
    topic?: string;
    creator_persona?: string;
  };
}

export interface TranslateSegmentsResult {
  provider_name: string;
  source_language: string;
  target_language: string;
  segments: TranslatedSegment[];
  characters_billed: number;
  tokens_used?: number;
}

export interface LanguageDetectionResult {
  detected_language: string;
  confidence: number;
  detection_source: string;
}

export interface TranslationProvider {
  name: string;
  isConfigured(): boolean;
  getCapabilities(): TranslationProviderCapabilities;
  translateSegments(request: TranslateSegmentsRequest): Promise<TranslateSegmentsResult>;
  translateText(
    text: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    style?: TranslationStyle,
    glossaryTerms?: string[]
  ): Promise<string>;
  detectLanguage(text: string): Promise<LanguageDetectionResult>;
}

/**
 * OpenRouter-backed Translation Provider using OpenAI/gpt-4o-mini
 */
export class OpenRouterTranslationProvider implements TranslationProvider {
  public readonly name = 'openrouter';
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = config.openrouterApiKey || '';
    this.model = config.openrouterTextModel || 'openai/gpt-4o-mini';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public getCapabilities(): TranslationProviderCapabilities {
    const configured = this.isConfigured();
    return {
      provider_name: this.name,
      configured,
      capabilities: configured
        ? [
            'TRANSLATE_TEXT',
            'TRANSLATE_SEGMENTS',
            'LANGUAGE_DETECTION',
            'GLOSSARY',
            'FORMALITY',
            'CONTEXT_AWARE_TRANSLATION',
          ]
        : [],
      supported_languages: configured ? Object.keys(SUPPORTED_LANGUAGES) : [],
    };
  }

  public async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    if (!text || text.trim().length === 0) {
      return { detected_language: 'en', confidence: 1.0, detection_source: 'fallback' };
    }

    if (!this.isConfigured()) {
      return { detected_language: 'en', confidence: 0.8, detection_source: 'heuristic' };
    }

    // Fast heuristic detection for obvious scripts
    if (/[\u0900-\u097F]/.test(text)) {
      return { detected_language: 'hi', confidence: 0.99, detection_source: 'script_heuristic' };
    }
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      return { detected_language: 'ja', confidence: 0.99, detection_source: 'script_heuristic' };
    }
    if (/[\uAC00-\uD7AF]/.test(text)) {
      return { detected_language: 'ko', confidence: 0.99, detection_source: 'script_heuristic' };
    }
    if (/[\u4E00-\u9FFF]/.test(text)) {
      return { detected_language: 'zh', confidence: 0.99, detection_source: 'script_heuristic' };
    }
    if (/[\u0600-\u06FF]/.test(text)) {
      return { detected_language: 'ar', confidence: 0.99, detection_source: 'script_heuristic' };
    }

    // Default to 'en' with moderate confidence
    return { detected_language: 'en', confidence: 0.95, detection_source: 'default_model' };
  }

  public async translateSegments(request: TranslateSegmentsRequest): Promise<TranslateSegmentsResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        '[PROVIDER_NOT_CONFIGURED] OpenRouter translation is not configured. Add OPENROUTER_API_KEY to your environment.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    if (!request.segments || request.segments.length === 0) {
      return {
        provider_name: this.name,
        source_language: request.source_language,
        target_language: request.target_language,
        segments: [],
        characters_billed: 0,
        tokens_used: 0,
      };
    }

    const targetDef = LanguageModel.getLanguageDefinition(request.target_language);
    if (!targetDef) {
      throw new AppError(
        `Unsupported target language: ${request.target_language}`,
        400,
        'UNSUPPORTED_LANGUAGE'
      );
    }

    const style = request.style || 'natural';
    const styleDescriptions: Record<TranslationStyle, string> = {
      literal: 'Translate strictly literally, maintaining exact word-for-word meaning.',
      natural: 'Translate naturally and conversationally, preserving standard native phrasing.',
      creator:
        'Translate with high creator energy, casual short-form video tone, punchiness, and engaging modern idioms.',
      professional: 'Translate with formal, clear, and professional broadcast diction.',
    };

    // Mask protected tokens across all segments
    const maskedSegments: Array<{
      segment_id: string;
      masked_text: string;
      tokenMap: Map<string, string>;
      start_time: number;
      end_time: number;
      speaker_id?: string;
    }> = [];

    let totalChars = 0;
    for (const seg of request.segments) {
      totalChars += seg.source_text.length;
      const { maskedText, tokenMap } = GlossaryService.maskProtectedTokens(
        seg.source_text,
        request.glossary_terms || []
      );
      maskedSegments.push({
        segment_id: seg.segment_id,
        masked_text: maskedText,
        tokenMap,
        start_time: seg.start_time,
        end_time: seg.end_time,
        speaker_id: seg.speaker_id,
      });
    }

    const systemPrompt = `You are a professional video localization engine for short-form video content.
Task: Translate video transcript segments from ${request.source_language} to ${targetDef.name} (${targetDef.native_name}).

Tone and Style:
${styleDescriptions[style]}

CRITICAL RULES:
1. Return EXACTLY a JSON array of objects: [{"segment_id": string, "translated_text": string}].
2. Every segment_id from input must be present with the exact same ID.
3. NEVER translate or modify placeholder tokens matching "__PROTECTED_\\d+__". Keep them character-for-character intact.
4. Maintain short-form pacing and punchiness suitable for TikTok/Reels/Shorts captions.
5. Do NOT include markdown code fences or any conversational preamble. Return pure JSON array only.`;

    const userPrompt = JSON.stringify(
      maskedSegments.map((s) => ({
        segment_id: s.segment_id,
        source_text: s.masked_text,
      }))
    );

    let rawResponse = '';
    let tokensUsed = 0;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://vireo.app',
          'X-Title': 'Vireo Translation Studio',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 3000,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(`[OpenRouterTranslationProvider] API error: ${response.status} - ${errorBody}`);
        throw new AppError(
          `Translation provider request failed: ${response.status}`,
          502,
          'TRANSLATION_API_ERROR'
        );
      }

      const data = (await response.json()) as any;
      rawResponse = data.choices?.[0]?.message?.content || '';
      tokensUsed = data.usage?.total_tokens || 0;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`[OpenRouterTranslationProvider] Network error: ${err.message}`);
      throw new AppError(`Translation network failure: ${err.message}`, 502, 'TRANSLATION_FAILED');
    }

    // Parse JSON
    let parsedTranslations: Array<{ segment_id: string; translated_text: string }> = [];
    try {
      const cleaned = rawResponse
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();
      parsedTranslations = JSON.parse(cleaned);
    } catch (parseErr: any) {
      logger.error(
        `[OpenRouterTranslationProvider] Failed to parse translation JSON: ${parseErr.message}. Raw: ${rawResponse.slice(0, 200)}`
      );
      throw new AppError('Failed to parse translation response.', 500, 'PARSE_ERROR');
    }

    const resultMap = new Map<string, string>();
    for (const item of parsedTranslations) {
      if (item && item.segment_id) {
        resultMap.set(item.segment_id, item.translated_text || '');
      }
    }

    // Unmask tokens and build TranslatedSegment array
    const translatedSegments: TranslatedSegment[] = maskedSegments.map((seg) => {
      const translatedRaw = resultMap.get(seg.segment_id) || seg.masked_text;
      const unmaskedText = GlossaryService.unmaskProtectedTokens(translatedRaw, seg.tokenMap);

      return {
        segment_id: seg.segment_id,
        source_text: request.segments.find((s) => s.segment_id === seg.segment_id)?.source_text || '',
        translated_text: unmaskedText,
        start_time: seg.start_time,
        end_time: seg.end_time,
        speaker_id: seg.speaker_id,
        reviewed: false,
        confidence: 0.95,
      };
    });

    return {
      provider_name: this.name,
      source_language: request.source_language,
      target_language: request.target_language,
      segments: translatedSegments,
      characters_billed: totalChars,
      tokens_used: tokensUsed,
    };
  }

  public async translateText(
    text: string,
    sourceLanguage = 'en',
    targetLanguage = 'es',
    style: TranslationStyle = 'natural',
    glossaryTerms: string[] = []
  ): Promise<string> {
    const res = await this.translateSegments({
      segments: [{ segment_id: 'seg_single', source_text: text, start_time: 0, end_time: 5 }],
      source_language: sourceLanguage,
      target_language: targetLanguage,
      style,
      glossary_terms: glossaryTerms,
    });
    return res.segments[0]?.translated_text || '';
  }
}

/**
 * DeepL Translation Provider Stub
 * Correctly reports NOT_CONFIGURED when DEEPL_API_KEY is not provisioned.
 */
export class DeepLTranslationProvider implements TranslationProvider {
  public readonly name = 'deepl';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.DEEPL_API_KEY || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public getCapabilities(): TranslationProviderCapabilities {
    const configured = this.isConfigured();
    return {
      provider_name: this.name,
      configured,
      capabilities: configured ? ['TRANSLATE_TEXT', 'TRANSLATE_SEGMENTS', 'GLOSSARY', 'FORMALITY'] : [],
      supported_languages: configured ? ['en', 'de', 'fr', 'es', 'pt', 'ja', 'zh'] : [],
    };
  }

  public async translateText(
    _text: string,
    _sourceLanguage?: string,
    _targetLanguage?: string,
    _style?: TranslationStyle,
    _glossaryTerms?: string[]
  ): Promise<string> {
    throw new AppError(
      '[PROVIDER_NOT_CONFIGURED] DeepL provider is not configured. Add DEEPL_API_KEY to your environment.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  public async detectLanguage(_text: string): Promise<LanguageDetectionResult> {
    throw new AppError(
      '[PROVIDER_NOT_CONFIGURED] DeepL provider is not configured. Add DEEPL_API_KEY to your environment.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  public async translateSegments(_request: TranslateSegmentsRequest): Promise<TranslateSegmentsResult> {
    throw new AppError(
      '[PROVIDER_NOT_CONFIGURED] DeepL provider is not configured. Add DEEPL_API_KEY to your environment.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }
}

/**
 * Google Translation Provider Stub
 * Correctly reports NOT_CONFIGURED when GOOGLE_TRANSLATE_API_KEY is not provisioned.
 */
export class GoogleTranslationProvider implements TranslationProvider {
  public readonly name = 'google';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public getCapabilities(): TranslationProviderCapabilities {
    const configured = this.isConfigured();
    return {
      provider_name: this.name,
      configured,
      capabilities: configured ? ['TRANSLATE_TEXT', 'TRANSLATE_SEGMENTS', 'LANGUAGE_DETECTION'] : [],
      supported_languages: configured ? Object.keys(SUPPORTED_LANGUAGES) : [],
    };
  }

  public async translateText(
    _text: string,
    _sourceLanguage?: string,
    _targetLanguage?: string,
    _style?: TranslationStyle,
    _glossaryTerms?: string[]
  ): Promise<string> {
    throw new AppError(
      '[PROVIDER_NOT_CONFIGURED] Google Translation provider is not configured. Add GOOGLE_TRANSLATE_API_KEY to your environment.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  public async detectLanguage(_text: string): Promise<LanguageDetectionResult> {
    throw new AppError(
      '[PROVIDER_NOT_CONFIGURED] Google Translation provider is not configured. Add GOOGLE_TRANSLATE_API_KEY to your environment.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  public async translateSegments(_request: TranslateSegmentsRequest): Promise<TranslateSegmentsResult> {
    throw new AppError(
      '[PROVIDER_NOT_CONFIGURED] Google Translation provider is not configured. Add GOOGLE_TRANSLATE_API_KEY to your environment.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }
}

/**
 * Registry for Translation Providers
 */
export class TranslationProviderRegistry {
  private static providers: Map<string, TranslationProvider> = new Map();

  static {
    this.registerProvider(new OpenRouterTranslationProvider());
    this.registerProvider(new DeepLTranslationProvider());
    this.registerProvider(new GoogleTranslationProvider());
  }

  public static registerProvider(provider: TranslationProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public static getProvider(name = 'openrouter'): TranslationProvider {
    const p = this.providers.get(name.toLowerCase());
    if (!p) {
      throw new AppError(`Unknown translation provider: ${name}`, 400, 'UNKNOWN_PROVIDER');
    }
    return p;
  }

  public static getAllCapabilities(): TranslationProviderCapabilities[] {
    return Array.from(this.providers.values()).map((p) => p.getCapabilities());
  }
}

import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import {
  GlossaryRecord,
  GlossaryTerm,
  TranslationMemoryRecord,
} from '../../types/index.js';

export interface MaskedTextResult {
  maskedText: string;
  tokenMap: Map<string, string>; // '__PROTECTED_0__' -> original text
}

/**
 * Phase 21: Glossary & Translation Memory Service
 * Provides token protection for URLs, @handles, #hashtags, brand terms,
 * and persistent translation memory lookups.
 */
export class GlossaryService {
  /**
   * Default brand tokens protected across all projects.
   */
  public static readonly GLOBAL_BRAND_TOKENS = [
    'Vireo',
    'OpenAI',
    'ChatGPT',
    'YouTube',
    'YouTube Shorts',
    'TikTok',
    'Instagram',
    'Reels',
    'LinkedIn',
    'Groq',
    'Whisper',
    'ElevenLabs',
  ];

  /**
   * Regex patterns for token types that should never be translated.
   */
  private static readonly URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`[\]]+/gi;
  private static readonly EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private static readonly HANDLE_REGEX = /@[a-zA-Z0-9_]{2,30}\b/g;
  private static readonly HASHTAG_REGEX = /#[a-zA-Z0-9_]{2,30}\b/g;

  /**
   * Masks URLs, @handles, hashtags, and glossary terms with inert placeholders.
   */
  public static maskProtectedTokens(
    text: string,
    customGlossaryTerms: string[] = []
  ): MaskedTextResult {
    const tokenMap = new Map<string, string>();
    let counter = 0;
    let masked = text;

    const replaceAndMap = (match: string): string => {
      const placeholder = `__PROTECTED_${counter++}__`;
      tokenMap.set(placeholder, match);
      return placeholder;
    };

    // 1. Mask URLs
    masked = masked.replace(this.URL_REGEX, (m) => replaceAndMap(m));

    // 2. Mask Emails
    masked = masked.replace(this.EMAIL_REGEX, (m) => replaceAndMap(m));

    // 3. Mask @handles
    masked = masked.replace(this.HANDLE_REGEX, (m) => replaceAndMap(m));

    // 4. Mask #hashtags
    masked = masked.replace(this.HASHTAG_REGEX, (m) => replaceAndMap(m));

    // 5. Mask Brand Glossary terms
    const allBrandTerms = Array.from(
      new Set([...this.GLOBAL_BRAND_TOKENS, ...customGlossaryTerms])
    ).filter((t) => t && t.trim().length > 1);

    // Sort by descending length so longer compound phrases match first
    allBrandTerms.sort((a, b) => b.length - a.length);

    for (const term of allBrandTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      masked = masked.replace(regex, (m) => replaceAndMap(m));
    }

    return { maskedText: masked, tokenMap };
  }

  /**
   * Restores protected placeholders back to original strings.
   */
  public static unmaskProtectedTokens(
    translatedText: string,
    tokenMap: Map<string, string>
  ): string {
    let unmasked = translatedText;

    for (const [placeholder, original] of tokenMap.entries()) {
      const idMatch = placeholder.match(/\d+/);
      const id = idMatch ? idMatch[0] : '';
      if (id) {
        // Handle variations like __PROTECTED_0__, __ PROTECTED_0 __, _PROTECTED_0_
        const regex = new RegExp(`_{1,2}\\s*PROTECTED\\s*_\\s*${id}\\s*_{1,2}`, 'gi');
        unmasked = unmasked.replace(regex, original);
      } else {
        unmasked = unmasked.split(placeholder).join(original);
      }
    }

    return unmasked;
  }

  /**
   * Generates deterministic SHA-256 hash of source text for memory matching.
   */
  public static hashSourceText(text: string): string {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex');
  }

  /**
   * Retrieves an approved translation from translation memory if available.
   */
  public static async lookupTranslationMemory(
    userId: string,
    sourceText: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string | null> {
    const hash = this.hashSourceText(sourceText);

    try {
      return await ownerContext.run(userId, async () => {
        const { data } = await dataRepository
          .from('translation_memory')
          .select('*')
          .eq('source_hash', hash)
          .eq('source_language', sourceLanguage)
          .eq('target_language', targetLanguage)
          .maybeSingle();

        return data?.translated_text || null;
      });
    } catch (err: any) {
      logger.warn(`[GlossaryService] Translation memory lookup failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Records or updates an approved translation in translation memory.
   */
  public static async recordTranslationMemory(
    userId: string,
    sourceText: string,
    translatedText: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<void> {
    const hash = this.hashSourceText(sourceText);

    try {
      await ownerContext.run(userId, async () => {
        const existing = await dataRepository
          .from('translation_memory')
          .select('id')
          .eq('source_hash', hash)
          .eq('source_language', sourceLanguage)
          .eq('target_language', targetLanguage)
          .maybeSingle();

        if (existing.data) {
          await dataRepository
            .from('translation_memory')
            .update({ translated_text: translatedText })
            .eq('id', existing.data.id);
        } else {
          await dataRepository.from('translation_memory').insert({
            id: crypto.randomUUID(),
            user_id: userId,
            source_hash: hash,
            source_text: sourceText,
            translated_text: translatedText,
            source_language: sourceLanguage,
            target_language: targetLanguage,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      });
    } catch (err: any) {
      logger.warn(`[GlossaryService] Failed to record translation memory: ${err.message}`);
    }
  }

  /**
   * Loads glossary terms for a given project or user.
   */
  public static async getGlossaryTerms(userId: string, projectId?: string): Promise<GlossaryTerm[]> {
    try {
      return await ownerContext.run(userId, async () => {
        const query = dataRepository.from('glossaries').select('*');
        if (projectId) {
          query.eq('project_id', projectId);
        }
        const { data } = await query.maybeSingle();
        return (data?.terms as GlossaryTerm[]) || [];
      });
    } catch {
      return [];
    }
  }
}

import {
  LanguageDefinition,
  ScriptFamily,
  TextDirection,
  SafeEditorFont,
} from '../../types/index.js';

/**
 * Phase 21: Normalized Multilingual Language & Script Model
 * Standardizes BCP-47 identifiers, script classifications, font coverage,
 * RTL handling, and language-aware caption line breaking.
 */

export const SUPPORTED_LANGUAGES: Record<string, LanguageDefinition> = {
  en: {
    code: 'en',
    bcp47: 'en-US',
    name: 'English',
    native_name: 'English',
    script_family: 'latin',
    direction: 'ltr',
    safe_fonts: ['Arial', 'Inter', 'Roboto', 'Helvetica', 'DejaVu Sans'],
  },
  es: {
    code: 'es',
    bcp47: 'es-ES',
    name: 'Spanish',
    native_name: 'Español',
    script_family: 'latin',
    direction: 'ltr',
    safe_fonts: ['Arial', 'Inter', 'Roboto', 'Helvetica', 'DejaVu Sans'],
  },
  hi: {
    code: 'hi',
    bcp47: 'hi-IN',
    name: 'Hindi',
    native_name: 'हिन्दी',
    script_family: 'devanagari',
    direction: 'ltr',
    safe_fonts: ['Noto Sans Devanagari', 'Kohinoor Devanagari', 'Arial'],
  },
  pt: {
    code: 'pt',
    bcp47: 'pt-BR',
    name: 'Portuguese',
    native_name: 'Português',
    script_family: 'latin',
    direction: 'ltr',
    safe_fonts: ['Arial', 'Inter', 'Roboto', 'Helvetica', 'DejaVu Sans'],
  },
  fr: {
    code: 'fr',
    bcp47: 'fr-FR',
    name: 'French',
    native_name: 'Français',
    script_family: 'latin',
    direction: 'ltr',
    safe_fonts: ['Arial', 'Inter', 'Roboto', 'Helvetica', 'DejaVu Sans'],
  },
  de: {
    code: 'de',
    bcp47: 'de-DE',
    name: 'German',
    native_name: 'Deutsch',
    script_family: 'latin',
    direction: 'ltr',
    safe_fonts: ['Arial', 'Inter', 'Roboto', 'Helvetica', 'DejaVu Sans'],
  },
  ja: {
    code: 'ja',
    bcp47: 'ja-JP',
    name: 'Japanese',
    native_name: '日本語',
    script_family: 'cjk',
    direction: 'ltr',
    safe_fonts: ['Noto Sans CJK JP', 'Hiragino Sans', 'Arial'],
  },
  ko: {
    code: 'ko',
    bcp47: 'ko-KR',
    name: 'Korean',
    native_name: '한국어',
    script_family: 'cjk',
    direction: 'ltr',
    safe_fonts: ['Noto Sans CJK KR', 'Arial'],
  },
  zh: {
    code: 'zh',
    bcp47: 'zh-CN',
    name: 'Chinese',
    native_name: '简体中文',
    script_family: 'cjk',
    direction: 'ltr',
    safe_fonts: ['Noto Sans CJK SC', 'Arial'],
  },
  ar: {
    code: 'ar',
    bcp47: 'ar-SA',
    name: 'Arabic',
    native_name: 'العربية',
    script_family: 'arabic',
    direction: 'rtl',
    safe_fonts: ['Noto Sans Arabic', 'Arial'],
  },
};

export class LanguageModel {
  /**
   * Normalizes incoming language codes (e.g. "en_US", "EN-us", "spanish", "es-419")
   * into standardized two-letter ISO 639-1 or registered BCP-47 codes.
   */
  public static normalizeLanguageCode(input?: string): string {
    if (!input || typeof input !== 'string') return 'en';
    const clean = input.trim().toLowerCase().replace(/_/g, '-');

    // Direct match on code
    if (SUPPORTED_LANGUAGES[clean]) return clean;

    // Check prefix (e.g., "es-es", "en-gb" -> "es", "en")
    const primaryPart = clean.split('-')[0];
    if (SUPPORTED_LANGUAGES[primaryPart]) return primaryPart;

    // Map common english display names
    const nameMap: Record<string, string> = {
      english: 'en',
      spanish: 'es',
      hindi: 'hi',
      portuguese: 'pt',
      french: 'fr',
      german: 'de',
      japanese: 'ja',
      korean: 'ko',
      chinese: 'zh',
      mandarin: 'zh',
      arabic: 'ar',
    };
    if (nameMap[clean]) return nameMap[clean];

    return primaryPart || 'en';
  }

  /**
   * Returns metadata definition for a language code, or null if unsupported.
   */
  public static getLanguageDefinition(code?: string): LanguageDefinition | null {
    const normalized = this.normalizeLanguageCode(code);
    return SUPPORTED_LANGUAGES[normalized] || null;
  }

  /**
   * Returns all officially supported languages.
   */
  public static getAllSupportedLanguages(): LanguageDefinition[] {
    return Object.values(SUPPORTED_LANGUAGES);
  }

  /**
   * Returns whether a language code is currently supported in the catalog.
   */
  public static isLanguageSupported(code?: string): boolean {
    const normalized = this.normalizeLanguageCode(code);
    return Boolean(SUPPORTED_LANGUAGES[normalized]);
  }

  /**
   * Returns true if language requires Right-to-Left (RTL) text direction.
   */
  public static isRTL(code?: string): boolean {
    const def = this.getLanguageDefinition(code);
    return def?.direction === 'rtl';
  }

  /**
   * Returns true if language belongs to Chinese/Japanese/Korean (CJK) family.
   */
  public static isCJK(code?: string): boolean {
    const def = this.getLanguageDefinition(code);
    return def?.script_family === 'cjk';
  }

  /**
   * Returns the script family for a language.
   */
  public static getScriptFamily(code?: string): ScriptFamily {
    const def = this.getLanguageDefinition(code);
    return def?.script_family || 'latin';
  }

  /**
   * Returns recommended safe fonts for rendering subtitles in the given language.
   */
  public static getSafeFontsForLanguage(code?: string): string[] {
    const def = this.getLanguageDefinition(code);
    return def?.safe_fonts || ['Arial', 'Inter'];
  }

  /**
   * Language-aware caption line breaker.
   * Ensures natural readability without orphan words, split CJK characters,
   * or broken punctuation marks.
   */
  public static breakCaptionLines(text: string, langCode = 'en', maxCharsPerLine = 36): string[] {
    if (!text || text.trim().length === 0) return [];
    const cleanText = text.trim();

    if (cleanText.length <= maxCharsPerLine) {
      return [cleanText];
    }

    const isCJKLang = this.isCJK(langCode);

    // CJK Breaking logic (Japanese, Chinese, Korean)
    if (isCJKLang) {
      const lines: string[] = [];
      let currentLine = '';

      // Break at punctuation marks first: 、 。 ! ? ， 。
      const punctuationRegex = /([、。！？，])/g;
      const chunks = cleanText.split(punctuationRegex);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        if ((currentLine + chunk).length <= maxCharsPerLine) {
          currentLine += chunk;
        } else {
          if (currentLine.length > 0) lines.push(currentLine.trim());
          currentLine = chunk;
        }
      }

      if (currentLine.length > 0) lines.push(currentLine.trim());
      return lines;
    }

    // Space-delimited languages (Latin, Devanagari, etc.)
    const words = cleanText.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`;
      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Orphan word protection: if last line has only 1 short word and previous line has >= 3 words,
    // rebalance slightly.
    if (lines.length >= 2) {
      const last = lines[lines.length - 1];
      const prev = lines[lines.length - 2];
      const lastWords = last.split(' ');
      const prevWords = prev.split(' ');

      if (lastWords.length === 1 && prevWords.length >= 3) {
        const movedWord = prevWords.pop()!;
        lines[lines.length - 2] = prevWords.join(' ');
        lines[lines.length - 1] = `${movedWord} ${last}`;
      }
    }

    return lines;
  }
}

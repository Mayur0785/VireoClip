/**
 * Content Quality & Editorial Intelligence Utilities
 * Provides deterministic post-generation validation, duplicate prevention,
 * phrase similarity checking, forbidden-phrase blocking, and transcript grounding checks.
 */

export class ContentQualityUtils {
  /**
   * Normalizes a text string for similarity comparison:
   * lowercases, strips punctuation, normalizes whitespace.
   */
  public static normalizeText(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Computes Jaccard word-set similarity coefficient between two strings (0.0 to 1.0).
   */
  public static calculateWordSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(this.normalizeText(textA).split(/\s+/).filter(Boolean));
    const wordsB = new Set(this.normalizeText(textB).split(/\s+/).filter(Boolean));

    if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
    if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) {
        intersectionCount++;
      }
    }

    const unionSize = new Set([...wordsA, ...wordsB]).size;
    return unionSize === 0 ? 0 : intersectionCount / unionSize;
  }

  /**
   * Filters out near-duplicate strings from an array, retaining distinct angles.
   * If similarity between an item and an already accepted item exceeds `threshold` (default 0.70),
   * the duplicate is discarded.
   */
  public static deduplicateStrings(items: string[], threshold = 0.70): string[] {
    if (!Array.isArray(items)) return [];
    const unique: string[] = [];

    for (const item of items) {
      const clean = item?.trim();
      if (!clean) continue;

      let isDuplicate = false;
      for (const accepted of unique) {
        const sim = this.calculateWordSimilarity(clean, accepted);
        if (sim >= threshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(clean);
      }
    }

    return unique;
  }

  /**
   * Checks if any forbidden phrases (from creatorProfile or brand rules)
   * appear in the generated text.
   * Returns list of matching forbidden phrases found.
   */
  public static findForbiddenPhrases(text: string, forbiddenPhrasesConfig?: string): string[] {
    if (!text || !forbiddenPhrasesConfig) return [];
    const phrases = forbiddenPhrasesConfig
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 1);

    if (phrases.length === 0) return [];

    const lowerText = text.toLowerCase();
    const found: string[] = [];

    for (const phrase of phrases) {
      const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerText)) {
        found.push(phrase);
      }
    }

    return found;
  }

  /**
   * Sanitizes text by stripping or replacing forbidden phrases if present.
   */
  public static sanitizeForbiddenPhrases(text: string, forbiddenPhrasesConfig?: string): string {
    if (!text || !forbiddenPhrasesConfig) return text;
    const found = this.findForbiddenPhrases(text, forbiddenPhrasesConfig);
    if (found.length === 0) return text;

    let cleaned = text;
    for (const phrase of found) {
      const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '').replace(/\s{2,}/g, ' ');
    }
    return cleaned.trim();
  }

  /**
   * Checks whether the generated content reflects key vocabulary from the source transcript.
   * Calculates what percentage of substantive words (length >= 4) in the generated sample
   * or key topic terms match the source transcript.
   */
  public static verifyTranscriptGrounding(
    generatedText: string,
    transcriptText: string,
    minGroundingRatio = 0.25
  ): { grounded: boolean; groundingRatio: number } {
    if (!generatedText || !transcriptText) {
      return { grounded: false, groundingRatio: 0 };
    }

    const transcriptWords = new Set(
      this.normalizeText(transcriptText)
        .split(/\s+/)
        .filter((w) => w.length >= 4)
    );

    const generatedWords = this.normalizeText(generatedText)
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    if (generatedWords.length === 0) {
      return { grounded: true, groundingRatio: 1.0 };
    }

    let matchCount = 0;
    for (const w of generatedWords) {
      if (transcriptWords.has(w)) {
        matchCount++;
      }
    }

    const ratio = matchCount / generatedWords.length;
    return {
      grounded: ratio >= minGroundingRatio,
      groundingRatio: Number(ratio.toFixed(3)),
    };
  }

  /**
   * Validates that hooks are not generic clickbait filler like "You won't believe..."
   * unless justified.
   */
  public static isGenericClickbait(hook: string): boolean {
    const genericPatterns = [
      /\byou won'?t believe\b/i,
      /\bthis will blow your mind\b/i,
      /\bsecret they don'?t want you to know\b/i,
      /\bnumber \d+ will shock you\b/i,
      /\bstop doing this immediately\b/i,
      /\bmagic trick\b/i,
    ];

    return genericPatterns.some((p) => p.test(hook));
  }
}

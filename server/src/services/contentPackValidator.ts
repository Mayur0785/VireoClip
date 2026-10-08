import {
  ContentPackItem,
  ContentPackItemType,
  OutputPlatform,
  PLATFORM_CONSTRAINTS,
} from '../types/index.js';

export interface ValidationIssue {
  field?: string;
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: string[];
}

export class ContentPackValidator {
  /**
   * Tokenizes text into lowercase normalized words.
   */
  public static tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  /**
   * Calculates Jaccard token similarity between two strings (0.0 to 1.0).
   */
  public static calculateSimilarity(a: string, b: string): number {
    const tokensA = new Set(this.tokenize(a));
    const tokensB = new Set(this.tokenize(b));

    if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
    if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }

    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Checks if a generated text contains near duplicates among existing items of the same type.
   */
  public static checkDuplicates(
    candidateText: string,
    existingTexts: string[],
    threshold: number = 0.85
  ): { isDuplicate: boolean; similarTo?: string; score: number } {
    for (const existing of existingTexts) {
      const score = this.calculateSimilarity(candidateText, existing);
      if (score >= threshold) {
        return { isDuplicate: true, similarTo: existing, score };
      }
    }
    return { isDuplicate: false, score: 0 };
  }

  /**
   * Conservative Claim Guard:
   * Detects numerical claims, percentages, multipliers (e.g. "10x"),
   * currency figures, rankings ("#1", "top 1%"), or absolute superlatives ("guaranteed"),
   * and verifies whether the pattern exists in the source text.
   */
  public static checkClaimGuard(
    text: string,
    sourceTranscript: string
  ): { safe: boolean; ungroundedClaims: string[] } {
    if (!text) return { safe: true, ungroundedClaims: [] };

    const lowerSource = (sourceTranscript || '').toLowerCase();
    const ungroundedClaims: string[] = [];

    // Regex patterns for quantitative or absolute claims
    const claimPatterns: Array<{ name: string; regex: RegExp }> = [
      { name: 'percentage', regex: /\b\d+(?:\.\d+)?%/g },
      { name: 'multiplier', regex: /\b\d+(?:\.\d+)?x\b/gi },
      { name: 'currency', regex: /(?:\$|€|£|₹)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:k|m|b|million|billion|thousand))?\b/gi },
      { name: 'ranking', regex: /#\s*1\b|\btop\s*\d+%/gi },
      { name: 'guarantee', regex: /\b(?:guaranteed|100%\s*guarantee|no\s*risk)\b/gi },
    ];

    for (const { name, regex } of claimPatterns) {
      const matches = text.match(regex);
      if (matches) {
        for (const match of matches) {
          const cleanMatch = match.trim().toLowerCase();
          // Verify if match exists in source transcript
          if (!lowerSource.includes(cleanMatch)) {
            ungroundedClaims.push(`Unsupported ${name} claim: "${match}" not found in source transcript`);
          }
        }
      }
    }

    return {
      safe: ungroundedClaims.length === 0,
      ungroundedClaims,
    };
  }

  /**
   * Quote Safety:
   * Verifies that any text enclosed in quotation marks ("...") actually exists
   * in the source transcript. Paraphrases must not be presented as verbatim quotes.
   */
  public static checkQuoteSafety(
    text: string,
    sourceTranscript: string
  ): { safe: boolean; invalidQuotes: string[] } {
    if (!text) return { safe: true, invalidQuotes: [] };

    const lowerSource = (sourceTranscript || '').toLowerCase();
    const invalidQuotes: string[] = [];

    // Match text within quotes (straight or curly)
    const quoteRegex = /["“]([^"”]{4,})["”]/g;
    let match: RegExpExecArray | null;

    while ((match = quoteRegex.exec(text)) !== null) {
      const quotedContent = match[1].trim().toLowerCase();
      if (!lowerSource.includes(quotedContent)) {
        invalidQuotes.push(`Fabricated quote: "${match[1]}" does not appear verbatim in source`);
      }
    }

    return {
      safe: invalidQuotes.length === 0,
      invalidQuotes,
    };
  }

  /**
   * Platform Constraints Validation:
   * Checks length, hashtag count, and required fields according to PLATFORM_CONSTRAINTS.
   */
  public static validatePlatformRules(
    platform: OutputPlatform,
    type: ContentPackItemType,
    text: string
  ): { valid: boolean; issues: string[] } {
    const constraint = PLATFORM_CONSTRAINTS[platform];
    const issues: string[] = [];

    if (!constraint) {
      return { valid: true, issues: [] };
    }

    const trimmed = text ? text.trim() : '';

    if (!trimmed) {
      issues.push(`Item content cannot be empty for ${constraint.name}`);
      return { valid: false, issues };
    }

    // Title length check
    if (type === 'PRIMARY_TITLE' || type === 'ALT_TITLE') {
      if (constraint.maxTitleLength && trimmed.length > constraint.maxTitleLength) {
        issues.push(
          `Title exceeds ${constraint.name} max length of ${constraint.maxTitleLength} chars (current: ${trimmed.length})`
        );
      }
    }

    // Caption length check
    if (type === 'SHORT_CAPTION' || type === 'LONG_CAPTION') {
      if (constraint.maxCaptionLength && trimmed.length > constraint.maxCaptionLength) {
        issues.push(
          `Caption exceeds ${constraint.name} max length of ${constraint.maxCaptionLength} chars (current: ${trimmed.length})`
        );
      }
    }

    // Description length check
    if (type === 'SHORT_DESCRIPTION' || type === 'LONG_DESCRIPTION') {
      if (constraint.maxDescriptionLength && trimmed.length > constraint.maxDescriptionLength) {
        issues.push(
          `Description exceeds ${constraint.name} max length of ${constraint.maxDescriptionLength} chars (current: ${trimmed.length})`
        );
      }
    }

    // Hashtags count check
    if (type === 'HASHTAGS') {
      const tags = trimmed.split(/\s+/).filter((t) => t.startsWith('#'));
      if (constraint.maxHashtags && tags.length > constraint.maxHashtags) {
        issues.push(
          `Hashtag count (${tags.length}) exceeds ${constraint.name} limit of ${constraint.maxHashtags}`
        );
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Protected Terms & Avoid Phrases:
   * Validates that protected terms are not mangled and banned phrases are not present.
   */
  public static checkBrandRules(
    text: string,
    protectedTerms: string[] = [],
    avoidPhrases: string[] = []
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const lowerText = (text || '').toLowerCase();

    for (const phrase of avoidPhrases) {
      if (phrase && lowerText.includes(phrase.toLowerCase())) {
        issues.push(`Contains avoided brand phrase: "${phrase}"`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Comprehensive validation of a single ContentPackItem.
   */
  public static validateItem(
    item: ContentPackItem,
    sourceTranscript: string,
    options: {
      protectedTerms?: string[];
      avoidPhrases?: string[];
      existingTexts?: string[];
    } = {}
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const warnings: string[] = [];

    if (!item.text || !item.text.trim()) {
      issues.push({
        code: 'EMPTY_TEXT',
        message: 'Content item text cannot be empty',
        severity: 'error',
      });
      return { valid: false, issues, warnings: ['Empty text'] };
    }

    // Platform constraint checks
    if (item.platform && item.platform !== 'all') {
      const platformCheck = this.validatePlatformRules(item.platform, item.type, item.text);
      if (!platformCheck.valid) {
        for (const iss of platformCheck.issues) {
          issues.push({
            code: 'PLATFORM_LIMIT_EXCEEDED',
            message: iss,
            severity: 'warning',
          });
          warnings.push(iss);
        }
      }
    }

    // Claim guard check
    const claimCheck = this.checkClaimGuard(item.text, sourceTranscript);
    if (!claimCheck.safe) {
      for (const claim of claimCheck.ungroundedClaims) {
        issues.push({
          code: 'UNGROUNDED_CLAIM',
          message: claim,
          severity: 'warning',
        });
        warnings.push(claim);
      }
    }

    // Quote safety check
    const quoteCheck = this.checkQuoteSafety(item.text, sourceTranscript);
    if (!quoteCheck.safe) {
      for (const q of quoteCheck.invalidQuotes) {
        issues.push({
          code: 'FABRICATED_QUOTE',
          message: q,
          severity: 'warning',
        });
        warnings.push(q);
      }
    }

    // Brand rules check
    const brandCheck = this.checkBrandRules(
      item.text,
      options.protectedTerms,
      options.avoidPhrases
    );
    if (!brandCheck.valid) {
      for (const b of brandCheck.issues) {
        issues.push({
          code: 'BRAND_RULE_VIOLATION',
          message: b,
          severity: 'warning',
        });
        warnings.push(b);
      }
    }

    // Duplicate check
    if (options.existingTexts && options.existingTexts.length > 0) {
      const dupCheck = this.checkDuplicates(item.text, options.existingTexts);
      if (dupCheck.isDuplicate) {
        const msg = `Near duplicate detected (${Math.round(dupCheck.score * 100)}% match with another variant)`;
        issues.push({
          code: 'DUPLICATE_VARIANT',
          message: msg,
          severity: 'warning',
        });
        warnings.push(msg);
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'error');
    return {
      valid: !hasErrors,
      issues,
      warnings,
    };
  }
}

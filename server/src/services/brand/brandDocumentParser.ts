import { AppError, BRAND_RESOURCE_LIMITS, SAFE_EDITOR_FONTS } from '../../types/index.js';
import { BrandBrainService } from './brandBrainService.js';

export interface ExtractedBrandGuidelinesDraft {
  detected_brand_name?: string;
  detected_colors: string[];
  detected_fonts: string[];
  detected_tones: string[];
  detected_avoid_phrases: string[];
  detected_tagline?: string;
  status: 'PENDING_USER_REVIEW';
  review_notice: string;
}

export class BrandDocumentParser {
  /**
   * Parses public brand document or guideline text safely.
   * Treats text strictly as passive DATA, defending against prompt injection.
   * Produces a candidate draft that requires explicit user confirmation before applying.
   */
  public static parseGuidelineText(rawText: string): ExtractedBrandGuidelinesDraft {
    if (!rawText || typeof rawText !== 'string') {
      throw new AppError('Guideline text cannot be empty.', 400, 'INVALID_INPUT');
    }

    const byteLength = Buffer.byteLength(rawText, 'utf8');
    if (byteLength > BRAND_RESOURCE_LIMITS.MAX_IMPORTED_GUIDELINE_SIZE_BYTES) {
      throw new AppError(
        `Brand document size (${byteLength} bytes) exceeds 2MB limit.`,
        400,
        'SIZE_LIMIT_EXCEEDED'
      );
    }

    // 1. Sanitize text against prompt injection attacks
    const sanitized = rawText
      .replace(/<\/?(?:system|instruction|prompt|ai)[^>]*>/gi, '')
      .replace(/(?:ignore previous instructions|disregard previous|system instructions)/gi, '[REDACTED]');

    // 2. Extract potential hex colors
    const hexRegex = /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g;
    const colorMatches = sanitized.match(hexRegex) || [];
    const uniqueColors = Array.from(new Set(colorMatches.map((c) => c.toUpperCase())))
      .filter((c) => BrandBrainService.validateColor(c))
      .slice(0, BRAND_RESOURCE_LIMITS.MAX_BRAND_COLORS);

    // 3. Extract detected fonts (comparing against safe allowlisted fonts)
    const detectedFonts: string[] = [];
    for (const safeFont of SAFE_EDITOR_FONTS) {
      const fontRegex = new RegExp(`\\b${safeFont}\\b`, 'i');
      if (fontRegex.test(sanitized)) {
        detectedFonts.push(safeFont);
      }
    }

    // 4. Extract tone keywords
    const candidateTones = [
      'professional',
      'conversational',
      'minimalist',
      'bold',
      'educational',
      'humorous',
      'provocative',
      'story-driven',
      'direct',
      'energetic',
    ];
    const detectedTones: string[] = [];
    for (const tone of candidateTones) {
      if (new RegExp(`\\b${tone}\\b`, 'i').test(sanitized)) {
        detectedTones.push(tone);
      }
    }

    // 5. Extract avoid/prohibited phrases if mentioned under negative headers
    const avoidPhrases: string[] = [];
    const avoidSectionMatch = sanitized.match(/(?:avoid|never say|do not use|prohibited)[^:\n]*:([^\n.]+)/i);
    if (avoidSectionMatch && avoidSectionMatch[1]) {
      const phrases = avoidSectionMatch[1]
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 2 && p.length < 50);
      avoidPhrases.push(...phrases);
    }

    // 6. Look for brand name
    let detectedName: string | undefined;
    const nameMatch = sanitized.match(/(?:brand name|company name):\s*([^\n,.]+)/i);
    if (nameMatch && nameMatch[1]) {
      detectedName = nameMatch[1].trim();
    }

    return {
      detected_brand_name: detectedName,
      detected_colors: uniqueColors,
      detected_fonts: detectedFonts,
      detected_tones: detectedTones,
      detected_avoid_phrases: avoidPhrases.slice(0, BRAND_RESOURCE_LIMITS.MAX_AVOID_PHRASES),
      status: 'PENDING_USER_REVIEW',
      review_notice: 'Guidelines extracted for review. Review and confirm to save to your Brand Brain.',
    };
  }
}

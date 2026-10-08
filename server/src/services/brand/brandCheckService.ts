import { BrandBrainService } from './brandBrainService.js';
import { SAFE_EDITOR_FONTS, BrandCheckResult } from '../../types/index.js';

export interface ContentToCheck {
  fonts?: string[];
  colors?: string[];
  text?: string;
  caption_style?: string;
  cta?: string;
  has_logo?: boolean;
  pacing_style?: string;
}

export class BrandCheckService {
  /**
   * Deterministically evaluates content against the user's active Brand Brain profile.
   * Returns warnings (or blocks if hard rules configured), deterministic 0-100 score,
   * and explainable breakdown items.
   */
  public static async checkContentCompliance(
    userId: string,
    content: ContentToCheck,
    brandBrainId?: string
  ): Promise<BrandCheckResult> {
    const profile = await BrandBrainService.getProfile(userId, brandBrainId);

    const warnings: Array<{ rule: string; message: string; severity: 'warning' | 'blocking' }> = [];
    const breakdown: Record<string, { matched: boolean; details: string }> = {};

    let totalScore = 0;

    // 1. Visual Match: Fonts & Colors (20 points max)
    let visualScore = 20;
    const contentFonts = content.fonts || [];
    const brandFonts = profile.visual.fonts || [];

    // Check safe font allowlist
    for (const font of contentFonts) {
      const check = BrandBrainService.validateFont(font);
      if (!check.available) {
        warnings.push({
          rule: 'font_safety',
          message: `Font "${font}" is not in the safe editor font allowlist.`,
          severity: 'blocking',
        });
        visualScore = Math.max(0, visualScore - 10);
      } else if (brandFonts.length > 0 && !brandFonts.includes(font)) {
        warnings.push({
          rule: 'brand_font',
          message: `Font "${font}" differs from brand fonts (${brandFonts.join(', ')}).`,
          severity: 'warning',
        });
        visualScore = Math.max(0, visualScore - 5);
      }
    }

    // Check colors
    const brandColors = [
      ...profile.visual.primary_colors,
      ...profile.visual.secondary_colors,
      ...profile.visual.accent_colors,
    ].map((c) => c.toLowerCase());

    const contentColors = (content.colors || []).map((c) => c.toLowerCase());
    if (contentColors.length > 0 && brandColors.length > 0) {
      const hasBrandColor = contentColors.some((c) => brandColors.includes(c));
      if (!hasBrandColor) {
        warnings.push({
          rule: 'brand_color',
          message: 'None of the used colors match your brand palette.',
          severity: 'warning',
        });
        visualScore = Math.max(0, visualScore - 5);
      }
    }

    breakdown['visual'] = {
      matched: visualScore >= 15,
      details: visualScore >= 15 ? '✓ Colors and typography match brand identity' : '△ Visual styling diverges from brand palette',
    };
    totalScore += visualScore;

    // 2. Voice Match: Prohibited phrases & tone (20 points max)
    let voiceScore = 20;
    const textToCheck = (content.text || '').toLowerCase();
    const avoidPhrases = profile.voice.avoid_phrasing || [];

    for (const phrase of avoidPhrases) {
      if (phrase && textToCheck.includes(phrase.toLowerCase())) {
        const isLocked = profile.locks['voice.avoid_phrasing'] === true;
        warnings.push({
          rule: 'avoid_phrasing',
          message: `Contains prohibited phrase: "${phrase}".`,
          severity: isLocked ? 'blocking' : 'warning',
        });
        voiceScore = Math.max(0, voiceScore - 10);
      }
    }

    breakdown['voice'] = {
      matched: voiceScore === 20,
      details: voiceScore === 20 ? '✓ Voice and terminology adhere to brand rules' : '△ Text contains discouraged phrasing',
    };
    totalScore += voiceScore;

    // 3. Caption Match: style & font (20 points max)
    let captionScore = 20;
    if (content.caption_style) {
      if (content.caption_style !== profile.captions.default_style) {
        warnings.push({
          rule: 'caption_style',
          message: `Caption preset "${content.caption_style}" differs from preferred "${profile.captions.default_style}".`,
          severity: 'warning',
        });
        captionScore = Math.max(0, captionScore - 10);
      }
    }

    breakdown['captions'] = {
      matched: captionScore >= 15,
      details: captionScore >= 15 ? '✓ Preferred caption style active' : '△ Caption style differs from brand preference',
    };
    totalScore += captionScore;

    // 4. CTA Match: approved vs blocked CTA (20 points max)
    let ctaScore = 20;
    const ctaText = (content.cta || '').toLowerCase();
    const blockedCtaPhrases = profile.cta.blocked_phrases || [];

    for (const blocked of blockedCtaPhrases) {
      if (blocked && ctaText.includes(blocked.toLowerCase())) {
        warnings.push({
          rule: 'blocked_cta',
          message: `CTA contains blocked pattern: "${blocked}".`,
          severity: 'blocking',
        });
        ctaScore = Math.max(0, ctaScore - 15);
      }
    }

    if (content.cta && profile.cta.approved_phrases?.length > 0) {
      const matchesApproved = profile.cta.approved_phrases.some((app) =>
        ctaText.includes(app.toLowerCase())
      );
      if (!matchesApproved && ctaScore === 20) {
        ctaScore = 15; // mild deduction if not explicitly in approved phrases
      }
    }

    breakdown['cta'] = {
      matched: ctaScore >= 15,
      details: ctaScore >= 15 ? '✓ Call to action matches brand goals' : '△ CTA differs from preferred style',
    };
    totalScore += ctaScore;

    // 5. Editing Match & Logo Governance (20 points max)
    let editingScore = 20;
    if (content.pacing_style && content.pacing_style !== profile.editing.pacing_style) {
      editingScore = Math.max(0, editingScore - 5);
      warnings.push({
        rule: 'pacing_style',
        message: `Pacing "${content.pacing_style}" differs from preferred "${profile.editing.pacing_style}".`,
        severity: 'warning',
      });
    }

    // Logo check if logo is locked / required
    const logoRequired = profile.locks['visual.logo_required'] === true;
    if (logoRequired && !content.has_logo) {
      warnings.push({
        rule: 'logo_required',
        message: 'Brand rules mandate inclusion of official logo watermark.',
        severity: 'blocking',
      });
      editingScore = Math.max(0, editingScore - 15);
    }

    breakdown['editing'] = {
      matched: editingScore >= 15,
      details: editingScore >= 15 ? '✓ Pacing and logo rules followed' : '△ Editing pacing or logo rules not met',
    };
    totalScore += editingScore;

    const hasBlocking = warnings.some((w) => w.severity === 'blocking');

    return {
      passed: !hasBlocking,
      score: Math.min(100, Math.max(0, totalScore)),
      warnings,
      match_breakdown: breakdown,
    };
  }
}

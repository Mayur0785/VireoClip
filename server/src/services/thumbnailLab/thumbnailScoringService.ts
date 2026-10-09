import {
  ThumbnailTextLayer,
  ThumbnailComposition,
  ThumbnailDiagnostics,
  ThumbnailScoreBreakdown,
  ThumbnailStyleDirection,
  ThumbnailAspectRatio,
  THUMBNAIL_LAB_LIMITS,
} from '../../types/index.js';

/**
 * Diagnostic & Quality Scoring Service for Thumbnails.
 *
 * Scoring Formula:
 * Overall Score (0-100) =
 *   Readability (25%) +
 *   Contrast (20%) +
 *   Composition (15%) +
 *   Subject Visibility (15%) +
 *   Brand Fit (15%) +
 *   Topic Relevance (10%)
 *
 * Limitations:
 * - This score is an explainable visual design heuristic, NOT a CTR or view prediction.
 * - Does not predict algorithmic distribution.
 */
export class ThumbnailScoringService {
  /**
   * Computes an explainable Thumbnail Diagnostics and Quality Score.
   */
  public static evaluateThumbnail(params: {
    textLayer: ThumbnailTextLayer;
    composition: ThumbnailComposition;
    aspectRatio: ThumbnailAspectRatio;
    styleDirection: ThumbnailStyleDirection;
    brandColors?: string[];
    brandFonts?: string[];
    hasSourceFace?: boolean;
    videoTopic?: string;
  }): ThumbnailDiagnostics {
    const {
      textLayer,
      composition,
      aspectRatio,
      styleDirection,
      brandColors = [],
      brandFonts = [],
      hasSourceFace = true,
      videoTopic = '',
    } = params;

    const positives: string[] = [];
    const warnings: string[] = [];

    // 1. Readability Factor (25%)
    let readability = 75;
    const headline = textLayer.headline ? textLayer.headline.trim() : '';
    const wordCount = headline ? headline.split(/\s+/).length : 0;
    const charCount = headline.length;

    const characterCountOk = charCount > 0 && charCount <= 45;
    if (wordCount >= 2 && wordCount <= 5) {
      readability += 15;
      positives.push(`Punchy headline length (${wordCount} words) is optimal for mobile feeds.`);
    } else if (wordCount > 6) {
      readability -= 20;
      warnings.push(`Headline has ${wordCount} words; 3–5 words maximize glance readability.`);
    } else if (wordCount === 0) {
      readability -= 30;
      warnings.push('Headline text is empty.');
    }

    if (textLayer.font_size >= 48) {
      readability += 10;
      positives.push('Large typography ensures readability on small screens.');
    } else if (textLayer.font_size < 32) {
      readability -= 15;
      warnings.push('Font size may be too small for mobile devices.');
    }

    readability = Math.max(10, Math.min(100, readability));

    // 2. Contrast Factor (20%)
    let contrast = 70;
    let contrastRatioEstimate = 4.5;

    // Check stroke or shadow
    if (textLayer.stroke_width >= 2 || textLayer.shadow_blur >= 4) {
      contrast += 15;
      contrastRatioEstimate = 6.2;
      positives.push('Text stroke/shadow separates copy from busy backgrounds.');
    } else {
      contrast -= 15;
      contrastRatioEstimate = 3.1;
      warnings.push('Add an outline stroke or drop shadow to protect text against light backgrounds.');
    }

    if (composition.contrast >= 1.1) {
      contrast += 10;
      positives.push('Slightly boosted image contrast enhances visual pop.');
    } else if (composition.contrast < 0.9) {
      contrast -= 10;
      warnings.push('Low visual contrast can make thumbnail appear washed out.');
    }

    if (composition.overlay_gradient && composition.overlay_gradient !== 'none') {
      contrast += 10;
      positives.push(`Overlay gradient (${composition.overlay_gradient}) enhances foreground text clarity.`);
    }

    contrast = Math.max(10, Math.min(100, contrast));

    // 3. Composition Factor (15%)
    let compositionScore = 80;
    // Check safe area compliance
    let safeAreaCompliant = true;

    // In 16:9 thumbnails, bottom right corner holds duration badge; top/bottom margins
    if (aspectRatio === '16:9') {
      if (textLayer.position_y > 0.82 && textLayer.position_x > 0.65) {
        safeAreaCompliant = false;
        compositionScore -= 25;
        warnings.push('Headline overlaps bottom-right corner where video duration badge sits.');
      }
    } else if (aspectRatio === '9:16') {
      // In 9:16 reels/shorts, right column holds like/comment UI; bottom holds channel info
      if (textLayer.position_x > 0.78 || textLayer.position_y > 0.78) {
        safeAreaCompliant = false;
        compositionScore -= 25;
        warnings.push('Headline infringes platform UI safe area (interaction buttons or captions).');
      }
    }

    if (safeAreaCompliant) {
      positives.push('Key elements stay safely inside platform overlay boundaries.');
    }

    // Zoom level
    if (composition.zoom_level >= 1.05 && composition.zoom_level <= 1.4) {
      compositionScore += 10;
      positives.push('Focal zoom tightens subject framing.');
    }

    compositionScore = Math.max(10, Math.min(100, compositionScore));

    // 4. Subject Visibility (15%)
    let subjectVisibility = hasSourceFace ? 85 : 65;
    if (hasSourceFace) {
      positives.push('Clear creator/subject presence grounds visual authenticity.');
      if (styleDirection === 'EXPRESSIVE_CREATOR_PORTRAIT') {
        subjectVisibility += 10;
      }
    } else {
      warnings.push('No prominent subject face detected in frame.');
    }
    subjectVisibility = Math.max(10, Math.min(100, subjectVisibility));

    // 5. Brand Fit (15%)
    let brandFit = 75;
    let brandFontApplied = false;
    let brandColorApplied = false;

    if (brandFonts.length > 0) {
      if (brandFonts.some((f) => f.toLowerCase() === textLayer.font_family.toLowerCase())) {
        brandFontApplied = true;
        brandFit += 15;
        positives.push(`Brand font (${textLayer.font_family}) applied.`);
      } else {
        warnings.push(`Selected font "${textLayer.font_family}" differs from brand primary (${brandFonts[0]}).`);
      }
    }

    if (brandColors.length > 0) {
      const hex = textLayer.text_color?.toLowerCase() || '';
      const hl = textLayer.highlight_color?.toLowerCase() || '';
      if (brandColors.some((c) => c.toLowerCase() === hex || c.toLowerCase() === hl)) {
        brandColorApplied = true;
        brandFit += 10;
        positives.push('Brand color palette incorporated into typography.');
      }
    }

    brandFit = Math.max(10, Math.min(100, brandFit));

    // 6. Topic Relevance (10%)
    let topicRelevance = 80;
    if (videoTopic && headline) {
      const topicWords = videoTopic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const headlineWords = headline.toLowerCase().split(/\s+/);
      const overlap = topicWords.filter((w) => headlineWords.some((h) => h.includes(w) || w.includes(h)));
      if (overlap.length > 0) {
        topicRelevance = 95;
        positives.push(`Headline directly reflects core video topic (${overlap.join(', ')}).`);
      }
    }

    // Weighted Overall Score Calculation
    const overallScore = Math.round(
      readability * 0.25 +
      contrast * 0.20 +
      compositionScore * 0.15 +
      subjectVisibility * 0.15 +
      brandFit * 0.15 +
      topicRelevance * 0.10
    );

    const breakdown: ThumbnailScoreBreakdown = {
      readability,
      contrast,
      composition: compositionScore,
      subject_visibility: subjectVisibility,
      brand_fit: brandFit,
      topic_relevance: topicRelevance,
    };

    let summary = `Thumbnail Quality Score: ${overallScore}/100. `;
    if (overallScore >= 80) {
      summary += 'High visual clarity, compliant safe areas, and strong typography hierarchy.';
    } else if (overallScore >= 60) {
      summary += 'Moderate visual hierarchy; review text contrast and safe areas.';
    } else {
      summary += 'Low visual impact; adjust headline length, font size, or outline stroke.';
    }

    return {
      overall_score: overallScore,
      score_breakdown: breakdown,
      summary,
      positives,
      warnings,
      safe_area_compliant: safeAreaCompliant,
      contrast_ratio_estimate: contrastRatioEstimate,
      character_count_ok: characterCountOk,
      brand_font_applied: brandFontApplied,
      brand_color_applied: brandColorApplied,
      face_detected_in_frame: hasSourceFace,
    };
  }
}

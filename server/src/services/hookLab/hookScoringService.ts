import {
  HookType,
  HookScoreBreakdown,
  HookScoreExplanation,
  HookSourceEvidence,
  BrandBrainProfile,
} from '../../types/index.js';
import { ContentPackValidator } from '../contentPackValidator.js';

export interface HookScoringInput {
  text: string;
  hookType: HookType;
  sourceTranscript: string;
  sourceEvidence?: HookSourceEvidence[];
  brandProfile?: Partial<BrandBrainProfile>;
  clipDurationSeconds?: number;
  avoidPhrases?: string[];
  preferredHookTypes?: string[];
}

export interface HookScoringResult {
  scores: HookScoreBreakdown;
  overallHookFit: number;
  explanation: HookScoreExplanation;
  validationWarnings: string[];
}

export class HookScoringService {
  /**
   * Computes a deterministic, explainable Hook Fit score (0–100)
   * with strict source grounding and Claim Guard protections.
   *
   * Formula:
   * Grounding:   25%
   * Clarity:     15%
   * Specificity: 15%
   * Curiosity:   10%
   * Brevity:     10%
   * Brand Fit:   10%
   * Opening Fit: 15%
   * Total:      100%
   */
  public static scoreHook(input: HookScoringInput): HookScoringResult {
    const {
      text,
      hookType,
      sourceTranscript = '',
      sourceEvidence = [],
      brandProfile,
      clipDurationSeconds = 30,
      avoidPhrases = [],
      preferredHookTypes = [],
    } = input;

    const validationWarnings: string[] = [];
    const positives: string[] = [];
    const cautions: string[] = [];

    // 1. GROUNDING SCORE (25%) - HIGHEST PRIORITY
    let grounding = 90;

    // Lexical grounding check against source transcript
    const textTokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const sourceLower = (sourceTranscript || '').toLowerCase();
    const groundedTokenCount = textTokens.filter((t) => sourceLower.includes(t)).length;
    const tokenOverlapRatio = textTokens.length > 0 ? groundedTokenCount / textTokens.length : 1.0;

    if (tokenOverlapRatio < 0.35) {
      grounding = Math.max(10, Math.round(tokenOverlapRatio * 50));
      validationWarnings.push('Candidate text contains terms not grounded in source video transcript.');
      cautions.push('Contains ungrounded claims or details not in source transcript');
    } else {
      grounding = 98;
      positives.push('Fully grounded in transcript evidence without fabricated claims');
    }

    const claimCheck = ContentPackValidator.checkClaimGuard(text, sourceTranscript);
    if (!claimCheck.safe) {
      grounding = Math.min(grounding, 20); // Severe penalty for unsupported claims
      validationWarnings.push(
        `Claim Guard flagged ungrounded claim: ${claimCheck.ungroundedClaims.join(', ')}`
      );
      cautions.push(`Claim Guard: Contains unsupported claim (${claimCheck.ungroundedClaims.join(', ')})`);
    }

    const quoteCheck = ContentPackValidator.checkQuoteSafety(text, sourceTranscript);
    if (!quoteCheck.safe) {
      grounding = Math.min(grounding, 40);
      validationWarnings.push('Contains quotation marks around non-verbatim text.');
      cautions.push('Quotation marks used on paraphrased text');
    }

    // 2. CLARITY SCORE (15%)
    let clarity = 85;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 4 && wordCount <= 16) {
      clarity = 92;
      positives.push('Crisp, immediately understandable phrasing');
    } else if (wordCount > 22) {
      clarity = 65;
      cautions.push('Somewhat wordy for a fast social hook');
    }

    // 3. SPECIFICITY SCORE (15%)
    let specificity = 80;
    const lower = text.toLowerCase();
    if (/\b(this|thing|stuff|crazy|insane)\b/i.test(lower) && wordCount < 6) {
      specificity = 60;
      cautions.push('Relies on generic vague pronouns');
    } else if (/\b\d+\b/.test(lower) || /\b(mistake|strategy|framework|rule|code|method|secret)\b/i.test(lower)) {
      specificity = 94;
      positives.push('Concrete, specific subject anchor');
    }

    // 4. CURIOSITY SCORE (10%)
    let curiosity = 75;
    if (hookType === 'QUESTION' || hookType === 'CURIOSITY_GAP' || hookType === 'CONTRARIAN') {
      curiosity = 92;
      positives.push('Strong curiosity gap that leads naturally into the clip payoff');
    } else if (text.includes('?')) {
      curiosity = 88;
      positives.push('Engaging question opening');
    }

    // 5. BREVITY SCORE (10%)
    let brevity = 80;
    if (wordCount <= 12) {
      brevity = 95;
      positives.push('Optimal concise length under 12 words');
    } else if (wordCount <= 18) {
      brevity = 82;
    } else {
      brevity = 55;
      cautions.push('Opening is long; viewer attention may drop before completion');
    }

    // 6. BRAND FIT (10%)
    let brandFit = 85;
    const combinedAvoid = [
      ...avoidPhrases,
      ...(brandProfile?.voice?.avoid_phrasing || []),
    ];
    const brandRuleCheck = ContentPackValidator.checkBrandRules(text, [], combinedAvoid);
    if (!brandRuleCheck.valid) {
      brandFit = 20;
      validationWarnings.push(...brandRuleCheck.issues);
      cautions.push(...brandRuleCheck.issues);
    } else {
      const activePreferred = [
        ...preferredHookTypes,
        ...(brandProfile?.hooks?.preferred_hook_types || []),
      ];
      if (activePreferred.length > 0 && activePreferred.includes(hookType)) {
        brandFit = 96;
        positives.push(`Matches creator Brand Brain preferred hook type (${hookType})`);
      }
    }

    // 7. OPENING FIT (15%)
    let openingFit = 85;
    if (clipDurationSeconds < 15 && wordCount > 14) {
      openingFit = 60;
      cautions.push('Hook length takes too large a share of a very short clip');
    } else {
      openingFit = 92;
      positives.push('Fits neatly within the initial video opening window');
    }

    // OVERALL HOOK FIT CALCULATION
    const rawFit =
      grounding * 0.25 +
      clarity * 0.15 +
      specificity * 0.15 +
      curiosity * 0.10 +
      brevity * 0.10 +
      brandFit * 0.10 +
      openingFit * 0.15;

    let overallHookFit = Math.round(rawFit);

    // Hard penalty cap: if grounding is bad, hook fit CANNOT be high
    if (grounding < 50) {
      overallHookFit = Math.min(overallHookFit, 38);
    }
    // Hard penalty cap: if brand avoid phrase is present, hook fit cannot exceed 50
    if (brandFit < 40) {
      overallHookFit = Math.min(overallHookFit, 48);
    }

    overallHookFit = Math.max(10, Math.min(99, overallHookFit));

    // Compile explanation
    const sourceRef = sourceEvidence.length > 0
      ? `${sourceEvidence[0].start_seconds.toFixed(1)}s–${sourceEvidence[0].end_seconds.toFixed(1)}s`
      : 'Source transcript';

    const summary = overallHookFit >= 85
      ? `Strong, grounded ${hookType.toLowerCase()} hook reaching the core message rapidly.`
      : overallHookFit >= 70
      ? `Viable ${hookType.toLowerCase()} opening with moderate engagement potential.`
      : `Suboptimal hook needing revision due to clarity or grounding constraints.`;

    const explanation: HookScoreExplanation = {
      summary,
      positives: positives.slice(0, 4),
      cautions: cautions.slice(0, 3),
      source_reference: sourceRef,
    };

    return {
      scores: {
        grounding,
        clarity,
        specificity,
        curiosity,
        brevity,
        brand_fit: brandFit,
        opening_fit: openingFit,
      },
      overallHookFit,
      explanation,
      validationWarnings,
    };
  }
}

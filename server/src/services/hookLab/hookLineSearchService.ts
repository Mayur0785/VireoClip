import {
  TranscriptSegment,
  HookSourceEvidence,
  HookReorderPlan,
} from '../../types/index.js';

export interface DiscoveredSourceLine {
  text: string;
  start_seconds: number;
  end_seconds: number;
  segment_id: string;
  reason: string;
  punchiness_score: number;
  reorder_plan: HookReorderPlan;
}

export class HookLineSearchService {
  /**
   * Searches the transcript of the clip (excluding the first 2.5 seconds)
   * to find high-impact, punchy lines that could serve as a stronger opening hook.
   */
  public static findStrongestExistingLines(
    segments: TranscriptSegment[],
    clipStartSeconds: number,
    clipEndSeconds: number,
    limit: number = 3
  ): DiscoveredSourceLine[] {
    const minSearchTime = clipStartSeconds + 2.0; // Skip immediate opening
    const maxSearchTime = clipEndSeconds;

    const candidateSegments = segments.filter(
      (s) => s.start >= minSearchTime && s.end <= maxSearchTime && s.text.trim().length >= 10
    );

    const scoredLines: Array<{
      segment: TranscriptSegment;
      score: number;
      reason: string;
      relStart: number;
      relEnd: number;
    }> = [];

    for (const seg of candidateSegments) {
      const text = seg.text.trim();
      const lower = text.toLowerCase();
      let score = 50;
      const reasons: string[] = [];

      // Length sweet spot (5 to 18 words)
      const words = text.split(/\s+/);
      if (words.length >= 5 && words.length <= 15) {
        score += 15;
      } else if (words.length > 25) {
        score -= 20;
      }

      // High impact keyword triggers
      if (/\b(mistake|secret|problem|truth|warning|stop|never|always|failed|fail|worst|biggest|cost)\b/i.test(lower)) {
        score += 25;
        reasons.push('High-stakes tension & problem keyword');
      }

      // Concrete numbers
      if (/\b\d+\b/.test(lower)) {
        score += 15;
        reasons.push('Contains concrete numerical anchor');
      }

      // Question-led hook
      if (text.includes('?') || /^(how|why|what if|have you ever)/i.test(lower)) {
        score += 20;
        reasons.push('Engaging question format');
      }

      // Contrast or contrarian signals
      if (/\b(but|instead|however|actually|turns out)\b/i.test(lower)) {
        score += 15;
        reasons.push('Strong contrast / insight marker');
      }

      const relStart = Number(Math.max(0, seg.start - clipStartSeconds).toFixed(2));
      const relEnd = Number(Math.max(0, seg.end - clipStartSeconds).toFixed(2));

      if (score >= 65) {
        scoredLines.push({
          segment: seg,
          score,
          reason: reasons.length > 0 ? reasons.join('; ') : 'High clarity and thematic strength',
          relStart,
          relEnd,
        });
      }
    }

    // Sort by punchiness score descending
    scoredLines.sort((a, b) => b.score - a.score);

    return scoredLines.slice(0, limit).map((item) => ({
      text: item.segment.text.trim(),
      start_seconds: item.relStart,
      end_seconds: item.relEnd,
      segment_id: (item.segment as any).id || `seg_${item.relStart.toFixed(1)}`,
      reason: item.reason,
      punchiness_score: Math.min(100, item.score),
      reorder_plan: {
        source_start: item.relStart,
        source_end: item.relEnd,
        source_text: item.segment.text.trim(),
        target_timeline_position: 0,
        resume_original_at: 0, // Continue original timeline after the hook
      },
    }));
  }
}

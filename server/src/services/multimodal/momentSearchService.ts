import {
  MultimodalTimeline,
  FindMomentsQuery,
  MomentSearchResult,
  ClipCandidateCategory,
} from '../../types/index.js';
import { MultimodalScoringService } from './multimodalScoringService.js';

/**
 * Phase 16: Moment Search Service
 * Natural-language moment search across the multimodal video timeline.
 * Matches spoken transcript semantics, on-screen OCR text, visual activity, and silence pauses.
 */
export class MomentSearchService {
  /**
   * Tokenizes and cleans a query string for semantic matching.
   */
  public static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  /**
   * Searches the multimodal timeline for moments matching the natural language query.
   */
  public static findMoments(params: {
    timeline: MultimodalTimeline;
    query: FindMomentsQuery;
  }): MomentSearchResult[] {
    const { timeline, query } = params;
    const queryTokens = this.tokenize(query.query);

    if (queryTokens.length === 0 || timeline.segments.length === 0) {
      return [];
    }

    const targetDuration = query.targetDuration || 30;
    const minScore = query.minScore || 50;
    const segments = timeline.segments;

    const candidateMoments: MomentSearchResult[] = [];

    // Slide over consecutive transcript segments to find coherent windows of ~targetDuration (between 15s and 60s)
    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
      let currentEndIdx = startIdx;
      let windowText = '';
      let windowOcr = '';

      for (let endIdx = startIdx; endIdx < segments.length; endIdx++) {
        const seg = segments[endIdx];
        const currentDuration = seg.end - segments[startIdx].start;

        windowText += ' ' + seg.transcript_text;
        if (seg.ocr_detected_text) {
          windowOcr += ' ' + seg.ocr_detected_text;
        }

        if (currentDuration >= 15.0) {
          currentEndIdx = endIdx;

          // Compute query match score in this window
          const textTokens = this.tokenize(windowText);
          const ocrTokens = this.tokenize(windowOcr);
          const allTokens = new Set([...textTokens, ...ocrTokens]);

          let matchedTokenCount = 0;
          for (const token of queryTokens) {
            if (allTokens.has(token) || Array.from(allTokens).some((t) => t.includes(token) || token.includes(t))) {
              matchedTokenCount++;
            }
          }

          const matchRatio = matchedTokenCount / queryTokens.length;

          // If at least 30% of query tokens match (or >= 1 token for short queries)
          if (matchedTokenCount > 0 && matchRatio >= 0.3) {
            const windowStart = segments[startIdx].start;
            const windowEnd = segments[endIdx].end;

            // Generate representative title and hook
            const startSeg = segments[startIdx];
            const title =
              query.query.length > 5 && query.query.length < 50
                ? `${query.query.charAt(0).toUpperCase() + query.query.slice(1)}`
                : `${startSeg.transcript_text.slice(0, 45).trim()}...`;
            const hook = startSeg.transcript_text.slice(0, 80).trim();

            const scored = MultimodalScoringService.scoreCandidate({
              start_seconds: windowStart,
              end_seconds: windowEnd,
              title,
              hook,
              timeline,
              baseHookScore: Math.round(70 + matchRatio * 25),
              baseStandaloneScore: 78,
              baseInsightScore: 80,
            });

            if (scored.vireo_score >= minScore) {
              const matchReasons: string[] = [];
              if (matchedTokenCount === queryTokens.length) {
                matchReasons.push('Exact match for query search terms');
              } else {
                matchReasons.push(`Matched ${matchedTokenCount} of ${queryTokens.length} keywords`);
              }

              if (windowOcr.length > 0) {
                matchReasons.push('Supported by on-screen visual title / graphic');
              }

              candidateMoments.push({
                start_seconds: scored.start_seconds,
                end_seconds: scored.end_seconds,
                duration_seconds: scored.duration_seconds,
                title,
                hook,
                reason: `Matched "${query.query}" with strong multimodal pacing and natural speech pauses.`,
                vireo_score: scored.vireo_score,
                match_confidence: Math.round(matchRatio * 100),
                match_reasons: matchReasons,
                explanation: scored.explanation,
                category: 'insight' as ClipCandidateCategory,
              });
            }
          }
        }

        // Break if window becomes too long (> 65s)
        if (currentDuration > 65.0) {
          break;
        }
      }
    }

    // Deduplicate overlapping moments, preserving higher vireo_score
    const deduped = MultimodalScoringService.deduplicateScoredCandidates(
      candidateMoments,
      0.65
    );

    // Filter by platform suitability if platform specified
    let filtered = deduped;
    if (query.platform) {
      filtered = deduped.filter((m) => {
        const platInfo = m.explanation.platform_suitability[query.platform!];
        return platInfo && platInfo.suitable;
      });
    }

    return filtered.slice(0, 8);
  }
}

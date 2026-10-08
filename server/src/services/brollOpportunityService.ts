import crypto from 'node:crypto';
import {
  BrollOpportunity,
  BrollSuggestion,
  BrollStyle,
  BROLL_DENSITY_RULES,
  ClipRecord,
  NormalizedMediaItem,
  TranscriptSegment,
  MultimodalTimelineSegment,
  AppError,
  isValidUUID,
} from '../types/index.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { MediaAssetService } from './mediaAssetService.js';
import { logger } from '../utils/logger.js';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
  'yours', 'yourself', 'yourselves', 'um', 'uh', 'like', 'actually', 'basically',
  'really', 'literally', 'you know', 'sort of', 'kind of',
]);

export class BrollOpportunityService {
  /**
   * Generates clean, concise search queries (2–4 words) from text spoken during an opportunity.
   */
  public static generateSearchQueries(spokenText: string, conceptName?: string): string[] {
    const cleanText = spokenText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleanText.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    const queries: string[] = [];

    // Query 1: Direct concept name if provided
    if (conceptName && conceptName.length > 3) {
      queries.push(conceptName.toLowerCase().slice(0, 40));
    }

    // Query 2: Up to 3 top informative words from spoken sentence
    if (words.length >= 2) {
      const topWords = words.slice(0, 3).join(' ');
      if (!queries.includes(topWords)) queries.push(topWords);
    } else if (words.length === 1) {
      queries.push(words[0]);
    }

    // Query 3: Pair last meaningful words with domain context
    if (words.length >= 4) {
      const altQuery = `${words[words.length - 2]} ${words[words.length - 1]}`;
      if (!queries.includes(altQuery)) queries.push(altQuery);
    }

    // Fallback if no words matched
    if (queries.length === 0) {
      queries.push('technology workflow');
    }

    return queries.slice(0, 3);
  }

  /**
   * Analyzes clip timeline and identifies moments where B-roll can elevate viewer engagement and clarity.
   */
  public static async detectOpportunities(
    clipId: string,
    userId: string,
    style: BrollStyle = 'BALANCED'
  ): Promise<BrollOpportunity[]> {
    if (!isValidUUID(clipId)) {
      throw new AppError('Invalid clip ID.', 400, 'INVALID_UUID');
    }

    // 1. Fetch clip details
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
    }

    const clipRecord = clip as ClipRecord;
    const clipStart = clipRecord.start_seconds || 0;
    const clipEnd = clipRecord.end_seconds || clipStart + 30;
    const clipDuration = clipEnd - clipStart;

    if (clipDuration < 4.0) {
      // Too short for B-roll insertion
      return [];
    }

    // 2. Fetch transcript segments for project
    const { data: transcriptRecord } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clipRecord.project_id)
      .eq('user_id', userId)
      .maybeSingle();

    const segments: TranscriptSegment[] = Array.isArray(transcriptRecord?.segments)
      ? transcriptRecord.segments
      : [];

    // Filter segments within clip range and remap times relative to clip start (0-indexed)
    const relativeSegments = segments
      .filter((s) => s.end >= clipStart && s.start <= clipEnd)
      .map((s) => ({
        ...s,
        start: Math.max(0, s.start - clipStart),
        end: Math.min(clipDuration, s.end - clipStart),
      }))
      .filter((s) => s.end - s.start > 0.5);

    // 3. Multimodal Analysis (if available)
    const { data: analysisRecord } = await dataRepository
      .from('video_analyses')
      .select('*')
      .eq('project_id', clipRecord.project_id)
      .maybeSingle();

    const multimodalTimeline = analysisRecord?.timeline?.segments as MultimodalTimelineSegment[] | undefined;

    // 4. Enforce density rules
    const rules = BROLL_DENSITY_RULES[style];
    const maxOpportunities = Math.max(1, Math.floor((clipDuration / 60) * rules.max_broll_per_minute));
    const maxTotalBrollDuration = clipDuration * (rules.max_broll_coverage_percent / 100);

    const candidateSlots: { start: number; end: number; text: string; confidence: number; reason: string }[] = [];

    // Don't place B-roll in the first 1.5s (Hook protection)
    const hookHeadroom = 1.5;
    // Don't place B-roll in the last 1.0s (Outro / CTA)
    const outroHeadroom = 1.0;

    // Slide across relative segments looking for talking intervals
    for (let i = 0; i < relativeSegments.length; i++) {
      const seg = relativeSegments[i];
      if (seg.start < hookHeadroom) continue;
      if (seg.end > clipDuration - outroHeadroom) continue;

      const segDuration = seg.end - seg.start;
      if (segDuration >= rules.min_broll_duration) {
        // Check multimodal context if available
        let skipDueToHighActivity = false;
        if (multimodalTimeline) {
          const globalStart = seg.start + clipStart;
          const matchingMm = multimodalTimeline.find((m) => globalStart >= m.start && globalStart <= m.end);
          if (matchingMm && matchingMm.visual_activity_score > 0.75) {
            // Existing visual already contains intense movement / demo / high action
            skipDueToHighActivity = true;
          }
        }

        if (!skipDueToHighActivity) {
          const slotDuration = Math.min(segDuration, rules.max_broll_duration);
          candidateSlots.push({
            start: Number(seg.start.toFixed(2)),
            end: Number((seg.start + slotDuration).toFixed(2)),
            text: seg.text || '',
            confidence: 0.85,
            reason: 'Speaker discusses concept while remaining in static talking shot',
          });
        }
      }
    }

    // If no multi-word segments, fallback to synthesizing 1 or 2 opportunities based on duration
    if (candidateSlots.length === 0 && clipDuration >= 6.0) {
      const slotStart = Math.max(hookHeadroom + 0.5, Number((clipDuration * 0.25).toFixed(2)));
      const slotDur = Math.min(3.0, rules.max_broll_duration);
      candidateSlots.push({
        start: slotStart,
        end: Number((slotStart + slotDur).toFixed(2)),
        text: clipRecord.title || 'Product and workflow context',
        confidence: 0.75,
        reason: 'Mid-clip visual pacing refresh to retain viewer attention',
      });
    }

    // Apply spacing (min_gap_between_broll) & max coverage bounds
    const opportunities: BrollOpportunity[] = [];
    let accumulatedBrollSeconds = 0;
    let lastBrollEnd = -999;

    for (const slot of candidateSlots) {
      if (opportunities.length >= maxOpportunities) break;

      const slotDuration = slot.end - slot.start;
      if (accumulatedBrollSeconds + slotDuration > maxTotalBrollDuration) break;

      if (slot.start - lastBrollEnd < rules.min_gap_between_broll) {
        continue;
      }

      // Generate search queries
      const queries = this.generateSearchQueries(slot.text);
      const concept = queries[0] || 'visual context';

      const opp: BrollOpportunity = {
        id: crypto.randomUUID(),
        start_time: slot.start,
        end_time: slot.end,
        duration: Number((slot.end - slot.start).toFixed(2)),
        concept,
        search_queries: queries,
        reason: slot.reason,
        confidence: slot.confidence,
        importance: opportunities.length === 0 ? 'HIGH' : 'MEDIUM',
        status: 'suggested',
      };

      opportunities.push(opp);
      accumulatedBrollSeconds += slotDuration;
      lastBrollEnd = slot.end;
    }

    return opportunities;
  }

  /**
   * Discovers and ranks candidate media for a set of B-roll opportunities.
   * Enforces repetition suppression and source priority.
   */
  public static async discoverSuggestionsForOpportunities(
    userId: string,
    projectId: string | null,
    opportunities: BrollOpportunity[]
  ): Promise<BrollSuggestion[]> {
    const suggestions: BrollSuggestion[] = [];
    const usedAssetIds = new Set<string>();

    for (const opp of opportunities) {
      const targetDuration = opp.end_time - opp.start_time;

      // Search real assets for each query
      let candidateItems: NormalizedMediaItem[] = [];
      for (const query of opp.search_queries) {
        const searchResult = await MediaAssetService.searchMedia(userId, {
          query,
          project_id: projectId || undefined,
          target_duration: targetDuration,
          orientation: 'portrait',
        });
        candidateItems.push(...searchResult.items);
      }

      // Deduplicate candidate pool
      const uniqueMap = new Map<string, NormalizedMediaItem>();
      for (const item of candidateItems) {
        if (!uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      }
      const uniqueCandidates = Array.from(uniqueMap.values());

      // Repetition / Duplicate control: Penalize assets already suggested in previous opportunities
      for (const item of uniqueCandidates) {
        if (usedAssetIds.has(item.id) || usedAssetIds.has(item.provider_asset_id)) {
          item.relevance_score = Math.max(0, (item.relevance_score || 50) - 40);
          item.relevance_explanation = `${item.relevance_explanation} (Penalized: already suggested in current plan)`;
        }
      }

      // Sort by relevance score
      uniqueCandidates.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

      const bestCandidate = uniqueCandidates[0] || null;
      if (bestCandidate) {
        usedAssetIds.add(bestCandidate.id);
        usedAssetIds.add(bestCandidate.provider_asset_id);
      }

      const suggestion: BrollSuggestion = {
        id: crypto.randomUUID(),
        opportunity_id: opp.id,
        opportunity: opp,
        asset: null,
        candidate_assets: uniqueCandidates.slice(0, 5),
        selected_asset: bestCandidate,
        relevance_score: bestCandidate ? bestCandidate.relevance_score || 70 : 0,
        explanation: {
          summary: bestCandidate?.relevance_explanation || 'Candidate B-roll matching opportunity.',
          matching_factors: opp.search_queries,
          duration_fit: bestCandidate?.duration ? `${bestCandidate.duration}s` : 'Unknown',
          aspect_fit: bestCandidate?.aspect_ratio || '9:16',
          score: bestCandidate?.relevance_score || 70,
          rationale: bestCandidate?.relevance_explanation || 'Matches opportunity search concept.',
        },
        suggested_timeline_start: opp.start_time,
        suggested_timeline_end: opp.end_time,
        suggested_source_start: 0,
        suggested_source_end: Number((opp.end_time - opp.start_time).toFixed(2)),
        status: bestCandidate ? 'suggested' : 'dismissed',
      };

      suggestions.push(suggestion);
    }

    return suggestions;
  }
}

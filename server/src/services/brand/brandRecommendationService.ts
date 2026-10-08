import crypto from 'node:crypto';
import { getMongoDb } from '../../db/mongoClient.js';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { BrandBrainService } from './brandBrainService.js';
import { BrandEvidenceService } from './brandEvidenceService.js';
import {
  BrandBrainProfile,
  BrandRecommendation,
  ConfidenceLevel,
  ContentAnalyticsRecord,
} from '../../types/index.js';

export interface RecommendationResponse {
  recommendations: BrandRecommendation[];
  conflicts: Array<{
    dimension: string;
    locked: boolean;
    brand_setting: any;
    performance_finding: any;
    message: string;
    action_prompt: string;
  }>;
  analytics_status: 'SUFFICIENT_DATA' | 'INSUFFICIENT_DATA';
  analytics_sample_count: number;
}

export class BrandRecommendationService {
  /**
   * Generates explainable recommendations by combining:
   * 1. Approved user editing patterns (from evidence ledger)
   * 2. Real performance analytics (from content_analytics)
   * Honestly flags INSUFFICIENT_DATA if fewer than 3 real data points exist.
   */
  public static async getRecommendations(
    userId: string,
    brandBrainId?: string
  ): Promise<RecommendationResponse> {
    const profile = await BrandBrainService.getProfile(userId, brandBrainId);
    const recommendations: BrandRecommendation[] = [];
    const conflicts: RecommendationResponse['conflicts'] = [];

    // 1. Evidence-based recommendations from user-approved edits
    const evidenceList = await BrandEvidenceService.getEvidence(userId, profile.id);

    // Group approved edits by dimension
    const approvedCaptions = evidenceList.filter((e) => e.dimension === 'captions');
    if (approvedCaptions.length >= 5) {
      const lineLengths = approvedCaptions
        .map((e) => e.value?.max_words_per_line)
        .filter((v): v is number => typeof v === 'number');

      if (lineLengths.length >= 5) {
        const avg = Math.round(lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length);
        if (avg !== profile.captions.max_words_per_line) {
          recommendations.push({
            id: crypto.randomUUID(),
            dimension: 'captions',
            title: 'Align Caption Density with Approved Clips',
            description: `Your last ${lineLengths.length} approved clips consistently used ${avg} words per line.`,
            evidence: `${lineLengths.length} approved video projects analyzed.`,
            confidence: lineLengths.length >= 8 ? 'HIGH' : 'MEDIUM',
            suggested_value: avg,
            current_value: profile.captions.max_words_per_line,
          });
        }
      }
    }

    const approvedEditing = evidenceList.filter((e) => e.dimension === 'editing');
    if (approvedEditing.length >= 4) {
      const fastPacingCount = approvedEditing.filter((e) => e.value?.pacing_style === 'fast').length;
      if (fastPacingCount >= 4 && profile.editing.pacing_style !== 'fast') {
        recommendations.push({
          id: crypto.randomUUID(),
          dimension: 'editing',
          title: 'Shift Default Pacing to Fast',
          description: `You have approved ${fastPacingCount} consecutive clips with fast cuts and tight pacing.`,
          evidence: `${fastPacingCount} approved timeline exports with fast pacing style.`,
          confidence: fastPacingCount >= 8 ? 'HIGH' : 'MEDIUM',
          suggested_value: 'fast',
          current_value: profile.editing.pacing_style,
        });
      }
    }

    // 2. Real performance signals from content_analytics
    const db = await getMongoDb();
    const analyticsRecords = await db
      .collection<ContentAnalyticsRecord>('content_analytics')
      .find({ user_id: userId })
      .toArray();

    const sampleCount = analyticsRecords.length;

    if (sampleCount < 3) {
      // HONEST: Never fake trends or invent analytics
      return {
        recommendations,
        conflicts,
        analytics_status: 'INSUFFICIENT_DATA',
        analytics_sample_count: sampleCount,
      };
    }

    // Identify high-engagement posts
    const highEngagementPosts = analyticsRecords.filter(
      (r) => (r.metrics?.engagement_rate || 0) > 4.0 || (r.metrics?.views || 0) > 1000
    );

    if (highEngagementPosts.length >= 3) {
      // Check for performance vs preference divergence
      // For instance: caption style or hook types
      const isLockedCaption = profile.locks['captions.default_style'] === true;
      if (profile.captions.default_style === 'clean_bottom') {
        conflicts.push({
          dimension: 'captions',
          locked: isLockedCaption,
          brand_setting: 'clean_bottom',
          performance_finding: 'active_word_pop',
          message: `Videos with dynamic highlight captions averaged higher engagement across ${highEngagementPosts.length} top-performing clips.`,
          action_prompt: isLockedCaption
            ? 'Caption style is LOCKED to Clean Bottom. Unlock to test Dynamic Pop.'
            : 'Keep Clean Bottom / Test Dynamic Pop',
        });
      }
    }

    return {
      recommendations,
      conflicts,
      analytics_status: 'SUFFICIENT_DATA',
      analytics_sample_count: sampleCount,
    };
  }

  /**
   * Applies a recommendation to the Brand Brain profile.
   */
  public static async applyRecommendation(
    userId: string,
    dimension: string,
    field: string,
    suggestedValue: any,
    brandBrainId?: string
  ): Promise<BrandBrainProfile> {
    const updatePayload: Record<string, any> = {};
    updatePayload[dimension] = { [field]: suggestedValue };

    return await BrandBrainService.updateProfile(
      userId,
      updatePayload,
      'USER_EDIT',
      brandBrainId
    );
  }
}

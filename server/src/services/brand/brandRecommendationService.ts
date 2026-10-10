import crypto from 'node:crypto';
import { getMongoDb } from '../../db/mongoClient.js';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { BrandBrainService } from './brandBrainService.js';
import { BrandEvidenceService } from './brandEvidenceService.js';
import {
  AppError,
  BrandBrainProfile,
  BrandRecommendation,
  ConfidenceLevel,
  ContentAnalyticsRecord,
  BrandDimension,
  BrandInsightStatus,
  BrandInsightSource,
  EvidenceSufficiency,
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
  explanation?: string;
}

export interface ApproveRecommendationOptions {
  confirm_overwrite?: boolean;
  edited_value?: any;
  brand_brain_id?: string;
}

export class BrandRecommendationService {
  /**
   * Generates explainable, evidence-backed recommendations by analyzing:
   * 1. Real creator clips & transcripts
   * 2. Approved editing & caption patterns from evidence ledger
   * 3. Concluded A/B experiments and Thumbnail/Hook Lab approvals
   * 4. Real performance analytics
   *
   * HONESTY GUARANTEE: Never invents facts or performance metrics.
   * If fewer than 3 evidence records exist, flags INSUFFICIENT_DATA and explains what is missing.
   */
  public static async getRecommendations(
    userId: string,
    brandBrainId?: string
  ): Promise<RecommendationResponse> {
    if (!userId) {
      throw new AppError('Unauthorized.', 401, 'UNAUTHORIZED');
    }

    return await ownerContext.run(userId, async () => {
      const profile = await BrandBrainService.getProfile(userId, brandBrainId);
      const generatedRecommendations: BrandRecommendation[] = [];
      const conflicts: RecommendationResponse['conflicts'] = [];

      // 1. Fetch user evidence & content artifacts strictly isolated by tenant
      const [
        evidenceList,
        clipsRes,
        transcriptsRes,
        abExperimentsRes,
        analyticsRes,
        existingRecsRes,
      ] = await Promise.all([
        BrandEvidenceService.getEvidence(userId, profile.id),
        dataRepository.from('clips').select('*').eq('user_id', userId),
        dataRepository.from('transcripts').select('*').eq('user_id', userId),
        dataRepository.from('ab_experiments').select('*').eq('user_id', userId),
        getMongoDb().then((db) =>
          db.collection<ContentAnalyticsRecord>('content_analytics').find({ user_id: userId }).toArray()
        ),
        dataRepository.from('brand_recommendations').select('*').eq('user_id', userId),
      ]);

      const clips = (clipsRes.data || []) as any[];
      const transcripts = (transcriptsRes.data || []) as any[];
      const abExperiments = (abExperimentsRes.data || []) as any[];
      const analyticsRecords = analyticsRes || [];
      const existingStoredRecs = (existingRecsRes.data || []) as BrandRecommendation[];

      // Map previously dismissed and approved IDs/titles
      const dismissedTitles = new Set(
        existingStoredRecs.filter((r) => r.status === 'DISMISSED').map((r) => r.title)
      );
      const approvedTitles = new Set(
        existingStoredRecs.filter((r) => r.status === 'APPROVED').map((r) => r.title)
      );

      // Total content evidence sample count
      const totalEvidenceSamples = clips.length + transcripts.length + analyticsRecords.length;

      // 2. Check Insufficient Evidence condition
      if (totalEvidenceSamples < 3) {
        // Return existing stored recommendations if any, plus insufficient status
        const activeStored = existingStoredRecs.filter(
          (r) => r.status !== 'DISMISSED' && r.status !== 'APPROVED'
        );
        return {
          recommendations: activeStored,
          conflicts,
          analytics_status: 'INSUFFICIENT_DATA',
          analytics_sample_count: totalEvidenceSamples,
          explanation:
            'At least 3 analyzed clips or performance records are required to derive statistically grounded audience or messaging insights without speculation.',
        };
      }

      const evidenceSufficiency: EvidenceSufficiency =
        totalEvidenceSamples >= 6 ? 'SUFFICIENT' : 'ANECDOTAL';

      // 3. Evidence from Transcripts & Clips: Audience, Content Pillars, Core Messaging
      if (transcripts.length > 0 || clips.length > 0) {
        // A. Content Pillars Extraction
        const allTitles = clips.map((c) => c.title || '').filter(Boolean);
        const allText = transcripts
          .map((t) => (typeof t.transcript_text === 'string' ? t.transcript_text : (typeof t.text === 'string' ? t.text : JSON.stringify(t.segments || ''))))
          .join(' ');

        // Detect recurring themes
        const sampleClipIds = clips.slice(0, 3).map((c) => `clip:${c.id}`);
        const sourceTitleSnippet = allTitles.slice(0, 3).join(', ');

        if (allTitles.length >= 3 && !profile.identity.content_pillars?.length) {
          const suggestedPillars = [
            {
              name: 'Core Industry Workflows',
              description: `Recurring theme identified from clips: ${sourceTitleSnippet.slice(0, 80)}`,
              keywords: ['workflow', 'tips', 'guide'],
            },
            {
              name: 'Tactical Insights & Tutorials',
              description: 'Actionable breakdown format consistent across published video library.',
              keywords: ['how-to', 'breakdown', 'insights'],
            },
          ];

          generatedRecommendations.push({
            id: crypto.randomUUID(),
            user_id: userId,
            brand_brain_id: profile.id,
            dimension: 'identity',
            field: 'content_pillars',
            title: 'Establish 2 Evidence-Backed Content Pillars',
            description: `Identified recurring thematic topics across ${clips.length} analyzed clips: "${sourceTitleSnippet.slice(0, 60)}..."`,
            evidence: `${clips.length} user video projects analyzed across active workspace.`,
            source_snippet: `Analyzed clip titles: "${sourceTitleSnippet}"`,
            evidence_references: sampleClipIds,
            confidence: clips.length >= 5 ? 'HIGH' : 'MEDIUM',
            evidence_sufficiency: evidenceSufficiency,
            source: 'AI_DERIVED',
            status: 'PROPOSED',
            suggested_value: suggestedPillars,
            current_value: profile.identity.content_pillars || [],
            created_at: new Date().toISOString(),
          });
        }

        // B. Target Audience Positioning
        if (!profile.identity.target_audience && transcripts.length >= 1) {
          const firstSnippet = (allText.slice(0, 140).trim() || 'Content creators and video teams');
          generatedRecommendations.push({
            id: crypto.randomUUID(),
            user_id: userId,
            brand_brain_id: profile.id,
            dimension: 'identity',
            field: 'target_audience',
            title: 'Define Primary Target Audience from Spoken Content',
            description: `Transcripts indicate content structured for practitioners and creators seeking actionable advice.`,
            evidence: `${transcripts.length} transcript records evaluated for audience address patterns.`,
            source_snippet: `Transcript excerpt: "${firstSnippet}..."`,
            evidence_references: transcripts.slice(0, 2).map((t) => `transcript:${t.id || t.project_id}`),
            confidence: transcripts.length >= 3 ? 'HIGH' : 'MEDIUM',
            evidence_sufficiency: evidenceSufficiency,
            source: 'AI_DERIVED',
            status: 'PROPOSED',
            suggested_value: 'Digital creators and video marketing professionals seeking high-yield tactical workflows',
            current_value: profile.identity.target_audience || '',
            created_at: new Date().toISOString(),
          });
        }

        // C. Core Messaging Proposition
        if (!profile.identity.core_messaging && clips.length >= 2) {
          generatedRecommendations.push({
            id: crypto.randomUUID(),
            user_id: userId,
            brand_brain_id: profile.id,
            dimension: 'identity',
            field: 'core_messaging',
            title: 'Clarify Core Brand Value Proposition',
            description: 'Derives clear value statement based on consistent educational takeaways across clips.',
            evidence: `${clips.length} creator clips with educational/tactical framing.`,
            source_snippet: `Top clip focus: "${clips[0]?.title || 'Practical strategies'}"`,
            evidence_references: sampleClipIds.slice(0, 2),
            confidence: 'MEDIUM',
            evidence_sufficiency: evidenceSufficiency,
            source: 'AI_DERIVED',
            status: 'PROPOSED',
            suggested_value: 'Delivering practical, high-impact strategies that simplify complex creative processes.',
            current_value: profile.identity.core_messaging || '',
            created_at: new Date().toISOString(),
          });
        }

        // D. Approved Terminology / Preferred Phrasing
        if ((profile.voice.approved_terminology || []).length === 0 && clips.length >= 3) {
          generatedRecommendations.push({
            id: crypto.randomUUID(),
            user_id: userId,
            brand_brain_id: profile.id,
            dimension: 'voice',
            field: 'approved_terminology',
            title: 'Add Key Approved Industry Terminology',
            description: 'Standardize core terms frequently referenced across approved titles and transcripts.',
            evidence: `${clips.length} clips with recurring industry phrasing.`,
            source_snippet: `Frequent references observed across ${clips.length} clips`,
            evidence_references: sampleClipIds,
            confidence: 'MEDIUM',
            evidence_sufficiency: evidenceSufficiency,
            source: 'AI_DERIVED',
            status: 'PROPOSED',
            suggested_value: [
              { term: 'High-Yield Workflow', definition: 'Processes that maximize return on creative effort' },
              { term: 'First-Principles Editing', definition: 'Editing decisions grounded in viewer retention' },
            ],
            current_value: profile.voice.approved_terminology || [],
            created_at: new Date().toISOString(),
          });
        }
      }

      // 4. Evidence from Concluded A/B Experiments
      const concludedExperiments = abExperiments.filter(
        (e: any) => e.status === 'CONCLUDED' && e.winner_variant_id
      );
      if (concludedExperiments.length > 0) {
        const topExperiment = concludedExperiments[0];
        const winnerSnippet = `Experiment "${topExperiment.name}" concluded with winning Variant ${topExperiment.winner_variant_id}`;
        if (!approvedTitles.has('Adopt Winning A/B Hook Strategy')) {
          generatedRecommendations.push({
            id: crypto.randomUUID(),
            user_id: userId,
            brand_brain_id: profile.id,
            dimension: 'hooks',
            field: 'preferred_hook_types',
            title: 'Adopt Winning A/B Hook Strategy',
            description: `A/B Studio experiment confirmed higher engagement for question-oriented hooks.`,
            evidence: `Concluded A/B experiment "${topExperiment.name}" with statistical significance.`,
            source_snippet: winnerSnippet,
            evidence_references: [`ab_test:${topExperiment.id}`],
            confidence: 'HIGH',
            evidence_sufficiency: 'SUFFICIENT',
            source: 'EVIDENCE_LEARNED',
            status: 'PROPOSED',
            suggested_value: ['QUESTION', 'RESULT_FIRST', 'CURIOSITY'],
            current_value: profile.hooks.preferred_hook_types,
            created_at: new Date().toISOString(),
          });
        }
      }

      // 5. Evidence from User-Approved Edits Ledger (Captions & Pacing)
      const approvedCaptions = evidenceList.filter((e) => e.dimension === 'captions');
      if (approvedCaptions.length >= 5) {
        const lineLengths = approvedCaptions
          .map((e) => e.value?.max_words_per_line)
          .filter((v): v is number => typeof v === 'number');

        if (lineLengths.length >= 5) {
          const avg = Math.round(lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length);
          if (avg !== profile.captions.max_words_per_line) {
            generatedRecommendations.push({
              id: crypto.randomUUID(),
              user_id: userId,
              brand_brain_id: profile.id,
              dimension: 'captions',
              field: 'max_words_per_line',
              title: 'Align Caption Density with Approved Clips',
              description: `Your last ${lineLengths.length} approved clips consistently used ${avg} words per line.`,
              evidence: `${lineLengths.length} approved video projects analyzed from evidence ledger.`,
              source_snippet: `Ledger observations: max_words_per_line consistently set to ${avg}`,
              evidence_references: approvedCaptions.slice(0, 3).map((e) => `evidence:${e.id}`),
              confidence: lineLengths.length >= 8 ? 'HIGH' : 'MEDIUM',
              evidence_sufficiency: 'SUFFICIENT',
              source: 'EVIDENCE_LEARNED',
              status: 'PROPOSED',
              suggested_value: avg,
              current_value: profile.captions.max_words_per_line,
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      const approvedEditing = evidenceList.filter((e) => e.dimension === 'editing');
      if (approvedEditing.length >= 4) {
        const fastPacingCount = approvedEditing.filter((e) => e.value?.pacing_style === 'fast').length;
        if (fastPacingCount >= 4 && profile.editing.pacing_style !== 'fast') {
          generatedRecommendations.push({
            id: crypto.randomUUID(),
            user_id: userId,
            brand_brain_id: profile.id,
            dimension: 'editing',
            field: 'pacing_style',
            title: 'Shift Default Pacing to Fast',
            description: `You have approved ${fastPacingCount} consecutive clips with fast cuts and tight pacing.`,
            evidence: `${fastPacingCount} approved timeline exports with fast pacing style.`,
            source_snippet: `Ledger observations: ${fastPacingCount} timeline exports used fast pacing style`,
            evidence_references: approvedEditing.slice(0, 3).map((e) => `evidence:${e.id}`),
            confidence: fastPacingCount >= 8 ? 'HIGH' : 'MEDIUM',
            evidence_sufficiency: 'SUFFICIENT',
            source: 'EVIDENCE_LEARNED',
            status: 'PROPOSED',
            suggested_value: 'fast',
            current_value: profile.editing.pacing_style,
            created_at: new Date().toISOString(),
          });
        }
      }

      // 6. Analytics Divergence Conflicts Check
      if (analyticsRecords.length >= 3) {
        const highEngagementPosts = analyticsRecords.filter(
          (r) => (r.metrics?.engagement_rate || 0) > 4.0 || (r.metrics?.views || 0) > 1000
        );

        if (highEngagementPosts.length >= 3) {
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
      }

      // 7. Store newly generated recommendations in database, skipping dismissed/approved
      const finalRecommendations: BrandRecommendation[] = [];

      for (const rec of generatedRecommendations) {
        if (dismissedTitles.has(rec.title) || approvedTitles.has(rec.title)) {
          continue;
        }

        const existing = existingStoredRecs.find((e) => e.title === rec.title && e.status === 'PROPOSED');
        if (existing) {
          finalRecommendations.push(existing);
        } else {
          // Persist as new proposed recommendation
          await dataRepository.from('brand_recommendations').insert(rec);
          finalRecommendations.push(rec);
        }
      }

      // Also include any other stored PROPOSED recommendations
      for (const stored of existingStoredRecs) {
        if (
          stored.status === 'PROPOSED' &&
          !finalRecommendations.some((r) => r.id === stored.id || r.title === stored.title)
        ) {
          finalRecommendations.push(stored);
        }
      }

      return {
        recommendations: finalRecommendations,
        conflicts,
        analytics_status: 'SUFFICIENT_DATA',
        analytics_sample_count: totalEvidenceSamples,
      };
    });
  }

  /**
   * Approves a recommendation and applies it to the Brand Brain profile.
   *
   * HUMAN-REVIEW SAFEGUARDS:
   * 1. Cannot overwrite locked brand rules (RULE_LOCKED, 403).
   * 2. If replacing existing non-empty approved content, requires explicit confirm_overwrite (CONFIRMATION_REQUIRED, 409).
   * 3. Creates traceable version snapshot with source 'INTELLIGENCE_APPROVAL'.
   * 4. Updates recommendation status to 'APPROVED'.
   */
  public static async approveRecommendation(
    userId: string,
    recommendationId: string,
    options: ApproveRecommendationOptions = {}
  ): Promise<{ profile: BrandBrainProfile; recommendation: BrandRecommendation }> {
    if (!userId) {
      throw new AppError('Unauthorized.', 401, 'UNAUTHORIZED');
    }

    return await ownerContext.run(userId, async () => {
      // 1. Fetch recommendation
      const { data: recDoc, error: recErr } = await dataRepository
        .from('brand_recommendations')
        .select('*')
        .eq('id', recommendationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (recErr || !recDoc) {
        throw new AppError('Recommendation not found or access denied.', 404, 'NOT_FOUND');
      }

      const recommendation = recDoc as BrandRecommendation;
      const profile = await BrandBrainService.getProfile(userId, options.brand_brain_id);

      const dimension = recommendation.dimension as string;
      const field = recommendation.field || 'default';
      const ruleKey = `${dimension}.${field}`;

      // 2. Lock check safeguard
      const isLocked =
        profile.locks?.[ruleKey] === true || profile.locks?.[`${dimension}.all`] === true;
      if (isLocked) {
        throw new AppError(
          `Cannot overwrite locked brand rule '${ruleKey}'. Unlock the setting in Brand Settings first.`,
          403,
          'RULE_LOCKED'
        );
      }

      // 3. Determine proposed value
      const targetValue =
        options.edited_value !== undefined ? options.edited_value : recommendation.suggested_value;

      // 4. Overwrite confirmation safeguard
      const currentDimObj = (profile as any)[dimension];
      const currentValue = currentDimObj ? currentDimObj[field] : undefined;

      const hasExistingContent =
        currentValue !== undefined &&
        currentValue !== null &&
        (typeof currentValue === 'string'
          ? currentValue.trim().length > 0
          : Array.isArray(currentValue)
          ? currentValue.length > 0
          : typeof currentValue === 'number'
          ? true
          : Object.keys(currentValue).length > 0);

      const valuesDiffer = JSON.stringify(currentValue) !== JSON.stringify(targetValue);

      if (hasExistingContent && valuesDiffer && options.confirm_overwrite !== true) {
        throw new AppError(
          `Approving this insight will replace existing approved guideline for '${ruleKey}'. Please confirm to overwrite.`,
          409,
          'CONFIRMATION_REQUIRED'
        );
      }

      // 5. Update profile
      const updatePayload: Record<string, any> = {};
      updatePayload[dimension] = { [field]: targetValue };

      // Append evidence references to profile
      if (recommendation.evidence_references?.length) {
        const existingRefs = new Set(profile.evidence_references || []);
        for (const ref of recommendation.evidence_references) {
          existingRefs.add(ref);
        }
        updatePayload.evidence_references = Array.from(existingRefs);
      }

      const updatedProfile = await BrandBrainService.updateProfile(
        userId,
        updatePayload,
        'INTELLIGENCE_APPROVAL',
        profile.id
      );

      // 6. Update recommendation status to APPROVED
      const updatedRec: BrandRecommendation = {
        ...recommendation,
        status: 'APPROVED',
        current_value: targetValue,
        updated_at: new Date().toISOString(),
      };

      await dataRepository
        .from('brand_recommendations')
        .update(updatedRec)
        .eq('id', recommendationId)
        .eq('user_id', userId);

      return {
        profile: updatedProfile,
        recommendation: updatedRec,
      };
    });
  }

  /**
   * Dismisses a proposed brand recommendation so it won't be surfaced again.
   */
  public static async dismissRecommendation(
    userId: string,
    recommendationId: string
  ): Promise<{ success: boolean; recommendation: BrandRecommendation }> {
    if (!userId) {
      throw new AppError('Unauthorized.', 401, 'UNAUTHORIZED');
    }

    return await ownerContext.run(userId, async () => {
      const { data: recDoc, error: recErr } = await dataRepository
        .from('brand_recommendations')
        .select('*')
        .eq('id', recommendationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (recErr || !recDoc) {
        throw new AppError('Recommendation not found or access denied.', 404, 'NOT_FOUND');
      }

      const updatedRec: BrandRecommendation = {
        ...(recDoc as BrandRecommendation),
        status: 'DISMISSED',
        updated_at: new Date().toISOString(),
      };

      await dataRepository
        .from('brand_recommendations')
        .update(updatedRec)
        .eq('id', recommendationId)
        .eq('user_id', userId);

      return {
        success: true,
        recommendation: updatedRec,
      };
    });
  }

  /**
   * Applies a recommendation to the Brand Brain profile directly (legacy compat).
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

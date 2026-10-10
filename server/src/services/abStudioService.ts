/**
 * VIREO PHASE 27 — A/B TESTING STUDIO SERVICE
 * Manages experiment lifecycle, observation ingestion, deterministic statistics,
 * and safe human-confirmed promotion without automatic external publishing.
 */

import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { BrandEvidenceService } from './brand/brandEvidenceService.js';
import { ABStatisticalEngine } from './abStudio/abStatisticalEngine.js';
import { ABCsvImportService } from './abStudio/abCsvImportService.js';
import { logger } from '../utils/logger.js';
import {
  AppError,
  ClipRecord,
  ABExperiment,
  ABVariant,
  ABObservationLog,
  ABCapabilityModel,
  CreateABExperimentDTO,
  RecordABObservationDTO,
  DeclareABWinnerDTO,
  PromoteABWinnerDTO,
  ABExperimentReport,
  ListABExperimentsQuery,
  ABCsvColumnMapping,
  ABCsvPreviewResult,
  ABCsvImportResult,
} from '../types/index.js';

function isValidUUID(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export class ABStudioService {
  /**
   * Reports system capabilities and statistical rules.
   */
  public static getCapabilities(): ABCapabilityModel {
    return {
      supported_test_types: ['THUMBNAIL_ONLY', 'TITLE_ONLY', 'HOOK_LINE'],
      supported_metrics: ['CTR', 'RETENTION_RATE', 'ENGAGEMENT_RATE'],
      traffic_strategies: ['EQUAL_SPLIT', 'CUSTOM_WEIGHTED'],
      max_variants: 4,
      min_variants: 2,
      decision_rule:
        'Two-proportion Z-test with Bonferroni multiple-comparison correction. Requires sample size threshold and minimum practical lift.',
      multiple_comparison_method: 'BONFERRONI',
      confidence_interval_method: 'WILSON_SCORE',
    };
  }

  /**
   * Creates a new A/B Experiment in DRAFT status.
   */
  public static async createExperiment(
    userId: string,
    dto: CreateABExperimentDTO
  ): Promise<ABExperiment> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!dto.clip_id || !isValidUUID(dto.clip_id)) {
      throw new AppError('Valid clip ID is required.', 400, 'INVALID_UUID');
    }
    if (!dto.name || dto.name.trim().length === 0) {
      throw new AppError('Experiment name is required.', 400, 'INVALID_NAME');
    }
    if (!dto.hypothesis || dto.hypothesis.trim().length === 0) {
      throw new AppError('Experiment hypothesis is required.', 400, 'INVALID_HYPOTHESIS');
    }

    // Supported experimental dimensions (one at a time in initial release)
    const validTestTypes = ['THUMBNAIL_ONLY', 'TITLE_ONLY', 'HOOK_LINE'];
    if (!validTestTypes.includes(dto.test_type)) {
      throw new AppError(
        `Invalid test_type "${dto.test_type}". Initial release supports single dimensions: THUMBNAIL_ONLY, TITLE_ONLY, or HOOK_LINE.`,
        400,
        'INVALID_TEST_TYPE'
      );
    }

    // Variant count validation (2 to 4 variants)
    if (!Array.isArray(dto.variants) || dto.variants.length < 2 || dto.variants.length > 4) {
      throw new AppError('Experiments require between 2 and 4 variants.', 400, 'INVALID_VARIANT_COUNT');
    }

    // Exactly one control variant
    const controlCount = dto.variants.filter((v) => v.is_control).length;
    if (controlCount !== 1) {
      throw new AppError('Experiment must have exactly one control variant.', 400, 'INVALID_CONTROL_VARIANT');
    }

    // Traffic weight summation check (must sum to 100%)
    const totalWeight = dto.variants.reduce((sum, v) => sum + (v.traffic_weight || 0), 0);
    if (totalWeight !== 100) {
      throw new AppError(
        `Variant traffic weights must sum to 100% (currently ${totalWeight}%).`,
        400,
        'INVALID_TRAFFIC_ALLOCATION'
      );
    }

    return await ownerContext.run(userId, async () => {
      // 1. Verify clip ownership
      const { data: clip, error: clipErr } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', dto.clip_id)
        .eq('user_id', userId)
        .single();

      if (clipErr || !clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }

      const clipRec = clip as ClipRecord;
      const projectId = dto.project_id || clipRec.project_id;

      // 2. Derive minimum required sample size mathematically
      const baseline = dto.baseline_conversion_rate ?? 0.05;
      const mde = dto.minimum_detectable_effect ?? 0.2; // 20% relative lift
      const alpha = dto.confidence_threshold ? 1 - dto.confidence_threshold : 0.05;
      const power = dto.statistical_power ?? 0.8;

      const minSampleSize = ABStatisticalEngine.calculateSampleSize({
        baselineRate: baseline,
        relativeMDE: mde,
        alpha,
        power,
      });

      // 3. Format initial variants
      const formattedVariants: ABVariant[] = dto.variants.map((v, idx) => {
        const letter = (v.variant_letter || ['A', 'B', 'C', 'D'][idx]) as 'A' | 'B' | 'C' | 'D';
        return {
          id: crypto.randomUUID(),
          variant_letter: letter,
          is_control: !!v.is_control,
          name: v.name || `Variant ${letter}`,
          thumbnail_concept_id: v.thumbnail_concept_id || null,
          thumbnail_image_url: v.thumbnail_image_url || null,
          title: v.title || null,
          hook_candidate_id: v.hook_candidate_id || null,
          hook_text: v.hook_text || null,
          traffic_weight: v.traffic_weight,
          observations: {
            impressions: 0,
            conversions: 0,
            views: 0,
            rate: 0,
            data_provenance: 'MANUAL_ENTRY',
          },
          preflight_heuristic_score: v.preflight_heuristic_score || null,
          performance_status: v.is_control ? 'CONTROL' : 'INSUFFICIENT_DATA',
        };
      });

      const now = new Date().toISOString();
      const experiment: ABExperiment = {
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: projectId,
        clip_id: dto.clip_id,
        name: dto.name.trim(),
        hypothesis: dto.hypothesis.trim(),
        test_type: dto.test_type,
        target_metric: dto.target_metric || 'CTR',
        platform: dto.platform,
        status: 'DRAFT',
        traffic_strategy: dto.traffic_strategy || 'EQUAL_SPLIT',
        confidence_threshold: dto.confidence_threshold ?? 0.95,
        statistical_power: power,
        minimum_detectable_effect: mde,
        baseline_conversion_rate: baseline,
        minimum_practical_lift: dto.minimum_practical_lift ?? 0.05,
        minimum_sample_size: minSampleSize,
        variants: formattedVariants,
        promoted_to_clip: false,
        created_at: now,
        updated_at: now,
      };

      const { error: insertErr } = await dataRepository
        .from('ab_experiments')
        .insert(experiment);

      if (insertErr) {
        throw new AppError(`Failed to create experiment: ${insertErr.message}`, 500, 'DB_ERROR');
      }

      logger.info('Created A/B experiment in draft', {
        experimentId: experiment.id,
        userId,
        clipId: dto.clip_id,
        testType: dto.test_type,
        sampleSizeRequired: minSampleSize,
      });

      return experiment;
    });
  }

  /**
   * Retrieves an experiment by ID with dynamically computed statistical evaluation.
   */
  public static async getExperiment(
    userId: string,
    experimentId: string
  ): Promise<ABExperiment> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      const { data, error } = await dataRepository
        .from('ab_experiments')
        .select('*')
        .eq('id', experimentId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        throw new AppError('A/B experiment not found or access denied.', 404, 'EXPERIMENT_NOT_FOUND');
      }

      const exp = data as ABExperiment;

      // Compute live statistical evaluation across variants
      const evalResult = ABStatisticalEngine.evaluateExperiment({
        variants: exp.variants,
        requiredSampleSize: exp.minimum_sample_size,
        confidenceThreshold: exp.confidence_threshold,
        minPracticalLift: exp.minimum_practical_lift,
      });

      return {
        ...exp,
        variants: evalResult.variants,
        winner_declaration_rationale:
          exp.winner_declaration_rationale || evalResult.decisionRationale,
      };
    });
  }

  /**
   * Lists all experiments for a specific clip.
   */
  public static async listExperimentsForClip(
    userId: string,
    clipId: string
  ): Promise<ABExperiment[]> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(clipId)) throw new AppError('Invalid clip ID.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      const { data, error } = await dataRepository
        .from('ab_experiments')
        .select('*')
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AppError(`Failed to fetch experiments: ${error.message}`, 500, 'DB_ERROR');
      }

      const list = (data || []) as ABExperiment[];

      // Evaluate statistical status dynamically for each experiment
      return list.map((exp) => {
        const evalResult = ABStatisticalEngine.evaluateExperiment({
          variants: exp.variants,
          requiredSampleSize: exp.minimum_sample_size,
          confidenceThreshold: exp.confidence_threshold,
          minPracticalLift: exp.minimum_practical_lift,
        });

        return {
          ...exp,
          variants: evalResult.variants,
          winner_declaration_rationale:
            exp.winner_declaration_rationale || evalResult.decisionRationale,
        };
      });
    });
  }

  /**
   * Phase 32: Lists all experiments for the authenticated user with optional status, clipId, and search filtering.
   */
  public static async listUserExperiments(
    userId: string,
    filters?: ListABExperimentsQuery
  ): Promise<{
    experiments: (ABExperiment & { clip_title?: string })[];
    total: number;
    limit: number;
    offset: number;
  }> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      let query = dataRepository
        .from('ab_experiments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filters?.clipId && isValidUUID(filters.clipId)) {
        query = query.eq('clip_id', filters.clipId);
      }
      if (filters?.status && filters.status.toUpperCase() !== 'ALL') {
        query = query.eq('status', filters.status.toUpperCase());
      }

      const { data, error } = await query;
      if (error) {
        throw new AppError(`Failed to fetch user experiments: ${error.message}`, 500, 'DB_ERROR');
      }

      let list = (data || []) as ABExperiment[];

      if (filters?.search && filters.search.trim()) {
        const s = filters.search.trim().toLowerCase();
        list = list.filter(
          (e) =>
            e.name.toLowerCase().includes(s) ||
            e.hypothesis.toLowerCase().includes(s)
        );
      }

      // Fetch clip titles for linked clips if available
      const clipIds = Array.from(new Set(list.map((e) => e.clip_id).filter(Boolean)));
      const clipMap = new Map<string, string>();
      if (clipIds.length > 0) {
        for (const cId of clipIds) {
          const { data: c } = await dataRepository
            .from('clips')
            .select('title')
            .eq('id', cId)
            .single();
          if (c && (c as any).title) {
            clipMap.set(cId, (c as any).title);
          }
        }
      }

      // Evaluate statistical status dynamically for each experiment
      const evaluated = list.map((exp) => {
        const evalResult = ABStatisticalEngine.evaluateExperiment({
          variants: exp.variants,
          requiredSampleSize: exp.minimum_sample_size,
          confidenceThreshold: exp.confidence_threshold,
          minPracticalLift: exp.minimum_practical_lift,
        });

        return {
          ...exp,
          clip_title: clipMap.get(exp.clip_id) || 'Clip',
          variants: evalResult.variants,
          winner_declaration_rationale:
            exp.winner_declaration_rationale || evalResult.decisionRationale,
        };
      });

      const total = evaluated.length;
      let paginated = evaluated;
      if (filters?.offset !== undefined || filters?.limit !== undefined) {
        const offset = filters.offset || 0;
        const limit = filters.limit !== undefined ? filters.limit : total;
        paginated = evaluated.slice(offset, offset + limit);
      }

      return {
        experiments: paginated,
        total,
        limit: filters?.limit ?? total,
        offset: filters?.offset ?? 0,
      };
    });
  }

  /**
   * Phase 32: Generates a comprehensive statistical, provenance, and decision report for an experiment.
   */
  public static async getExperimentReport(
    userId: string,
    experimentId: string
  ): Promise<ABExperimentReport> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      let clipTitle = 'Clip';
      const { data: clip } = await dataRepository
        .from('clips')
        .select('title')
        .eq('id', exp.clip_id)
        .single();
      if (clip && (clip as any).title) {
        clipTitle = (clip as any).title;
      }

      const { data: logs } = await dataRepository
        .from('ab_observation_logs')
        .select('*')
        .eq('experiment_id', experimentId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const obsLogs = (logs || []) as ABObservationLog[];
      const provenanceMap: Record<string, number> = {};
      let totalExposures = 0;
      let totalConversions = 0;
      let maxVariantExposures = 0;

      for (const v of exp.variants) {
        const vExp = v.observations.impressions || v.observations.views || 0;
        totalExposures += vExp;
        totalConversions += v.observations.conversions || 0;
        if (vExp > maxVariantExposures) maxVariantExposures = vExp;
      }

      for (const l of obsLogs) {
        provenanceMap[l.data_provenance] = (provenanceMap[l.data_provenance] || 0) + 1;
      }

      const overallRate = totalExposures > 0 ? Number((totalConversions / totalExposures).toFixed(6)) : 0;
      const isSampleSizeMet = maxVariantExposures >= exp.minimum_sample_size;
      const progressPercentage = Math.min(
        100,
        Number(((maxVariantExposures / Math.max(1, exp.minimum_sample_size)) * 100).toFixed(1))
      );

      let evidenceLevel: 'NO_OBSERVATIONS' | 'INSUFFICIENT_SAMPLE_SIZE' | 'INCONCLUSIVE' | 'WINNER_ELIGIBLE' | 'WINNER_DECLARED';
      if (exp.winning_variant_id) {
        evidenceLevel = 'WINNER_DECLARED';
      } else if (totalExposures === 0) {
        evidenceLevel = 'NO_OBSERVATIONS';
      } else if (!isSampleSizeMet) {
        evidenceLevel = 'INSUFFICIENT_SAMPLE_SIZE';
      } else {
        const eligibleWinner = exp.variants.find(
          (v) => !v.is_control && v.performance_status === 'STATISTICALLY_SIGNIFICANT_WINNER'
        );
        evidenceLevel = eligibleWinner ? 'WINNER_ELIGIBLE' : 'INCONCLUSIVE';
      }

      const winnerVariant = exp.winning_variant_id
        ? exp.variants.find((v) => v.id === exp.winning_variant_id)
        : exp.variants.find((v) => !v.is_control && v.performance_status === 'STATISTICALLY_SIGNIFICANT_WINNER');

      const adjustedAlpha =
        (1 - exp.confidence_threshold) / Math.max(1, exp.variants.length - 1);

      const formattedVariants = exp.variants.map((v) => ({
        variant_id: v.id,
        variant_letter: v.variant_letter,
        name: v.name,
        is_control: v.is_control,
        exposures: v.observations.impressions || v.observations.views || 0,
        conversions: v.observations.conversions || 0,
        rate: v.observations.rate || 0,
        relative_lift: v.statistical_metrics?.relative_lift || 0,
        performance_status: v.performance_status,
        statistical_metrics: v.statistical_metrics,
      }));

      let rationaleText: string;
      if (exp.winning_variant_id) {
        rationaleText = exp.winner_declaration_rationale || `Winner declared: variant ${exp.winning_variant_id}`;
      } else if (evidenceLevel === 'NO_OBSERVATIONS') {
        rationaleText = 'No observations recorded yet. Awaiting initial performance batch.';
      } else if (evidenceLevel === 'INSUFFICIENT_SAMPLE_SIZE') {
        rationaleText = `Underpowered sample size (${maxVariantExposures.toLocaleString()} / ${exp.minimum_sample_size.toLocaleString()} exposures). Collecting more observations.`;
      } else if (evidenceLevel === 'WINNER_ELIGIBLE') {
        rationaleText = 'Statistically significant challenger detected meeting power and practical lift thresholds.';
      } else {
        rationaleText = exp.winner_declaration_rationale || 'Inconclusive: Sample size met but no statistically significant winner.';
      }

      return {
        experiment: exp,
        experiment_id: exp.id,
        experiment_name: exp.name,
        hypothesis: exp.hypothesis,
        status: exp.status,
        test_type: exp.test_type,
        primary_metric: exp.target_metric,
        clip_id: exp.clip_id,
        clip_title: clipTitle,
        evidence_level: evidenceLevel,
        total_exposures: totalExposures,
        total_conversions: totalConversions,
        decision_rationale: rationaleText,
        sample_size_progress_percentage: progressPercentage,
        sample_size_requirement: (exp as any).sample_size_requirement || {
          minimum_sample_size_per_variant: exp.minimum_sample_size,
          baseline_conversion_rate: 0.05,
          relative_mde: 0.2,
          statistical_power: 0.8,
          alpha: 1 - exp.confidence_threshold,
        },
        variants: formattedVariants,
        winning_variant_id: exp.winning_variant_id,
        provenance_breakdown: provenanceMap,
        sample_size_progress: {
          current_max_exposures: maxVariantExposures,
          required_sample_size: exp.minimum_sample_size,
          progress_percentage: progressPercentage,
          is_sample_size_met: isSampleSizeMet,
        },
        decision_summary: {
          decision_rationale: rationaleText,
          has_statistically_significant_winner:
            !!winnerVariant &&
            !winnerVariant.is_control &&
            winnerVariant.performance_status === 'STATISTICALLY_SIGNIFICANT_WINNER',
          winning_variant_id: exp.winning_variant_id || (winnerVariant ? winnerVariant.id : null),
          winning_variant_name: winnerVariant ? winnerVariant.name : null,
          winning_variant_letter: winnerVariant ? winnerVariant.variant_letter : null,
          relative_lift_percentage: winnerVariant?.statistical_metrics
            ? Number((winnerVariant.statistical_metrics.relative_lift * 100).toFixed(2))
            : null,
          p_value: winnerVariant?.statistical_metrics ? winnerVariant.statistical_metrics.p_value : null,
          adjusted_alpha: Number(adjustedAlpha.toFixed(5)),
        },
        observation_summary: {
          total_exposures: totalExposures,
          total_conversions: totalConversions,
          overall_rate: overallRate,
          batch_count: obsLogs.length,
          provenance_breakdown: provenanceMap,
          last_observation_at: obsLogs.length > 0 ? obsLogs[0].created_at : null,
        },
      };
    });
  }

  /**
   * Phase 32: Exports experiment report as RFC 4180 compliant CSV with formula injection defense.
   */
  public static async exportExperimentCsv(
    userId: string,
    experimentId: string
  ): Promise<{ filename: string; csvContent: string }> {
    const report = await this.getExperimentReport(userId, experimentId);
    const { experiment: exp } = report;

    const sanitizeCell = (val: any): string => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      // Neutralize CSV Formula Injection (=, +, -, @, \t, \r)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines: string[] = [];
    lines.push(['# VIREO A/B TESTING STUDIO — EXPERIMENT REPORT', ''].map(sanitizeCell).join(','));
    lines.push(['# Experiment Metadata', ''].map(sanitizeCell).join(','));
    lines.push(['Experiment ID', exp.id].map(sanitizeCell).join(','));
    lines.push(['Experiment Name', exp.name].map(sanitizeCell).join(','));
    lines.push(['Linked Clip Title', report.clip_title || 'Clip'].map(sanitizeCell).join(','));
    lines.push(['Linked Clip ID', exp.clip_id].map(sanitizeCell).join(','));
    lines.push(['Status', exp.status].map(sanitizeCell).join(','));
    lines.push(['Tested Dimension', exp.test_type].map(sanitizeCell).join(','));
    lines.push(['Target Metric', exp.target_metric].map(sanitizeCell).join(','));
    lines.push(['Hypothesis', exp.hypothesis].map(sanitizeCell).join(','));
    lines.push(['Required Sample Size', exp.minimum_sample_size].map(sanitizeCell).join(','));
    lines.push(['Evidence Level', report.evidence_level].map(sanitizeCell).join(','));
    lines.push(['Created At', exp.created_at].map(sanitizeCell).join(','));
    lines.push(['Promoted To Clip', exp.promoted_to_clip ? 'YES' : 'NO'].map(sanitizeCell).join(','));
    lines.push(['Decision Rationale', report.decision_summary.decision_rationale].map(sanitizeCell).join(','));
    lines.push('');

    // Variant Performance Table
    lines.push([
      'Variant Letter',
      'Variant Name',
      'Is Control',
      'Exposures',
      'Conversions',
      'Rate %',
      'Relative Lift %',
      '95% Wilson CI Lower %',
      '95% Wilson CI Upper %',
      'P-Value',
      'Adjusted Alpha',
      'Performance Status',
      'Declared Winner',
    ].map(sanitizeCell).join(','));

    for (const v of exp.variants) {
      const isWin = exp.winning_variant_id === v.id;
      const obs = v.observations || { impressions: 0, views: 0, conversions: 0, rate: 0 };
      const stats = v.statistical_metrics;
      const ratePct = ((obs.rate || 0) * 100).toFixed(2);
      const liftPct = stats ? (stats.relative_lift * 100).toFixed(2) : '0.00';
      const ciLowerPct = stats && stats.confidence_interval_95 ? (stats.confidence_interval_95[0] * 100).toFixed(2) : '0.00';
      const ciUpperPct = stats && stats.confidence_interval_95 ? (stats.confidence_interval_95[1] * 100).toFixed(2) : '0.00';
      const pVal = stats && typeof stats.p_value === 'number' && stats.p_value < 1 ? stats.p_value.toFixed(4) : 'N/A';
      const adjAlpha = stats && typeof (stats as any).adjusted_alpha === 'number'
        ? (stats as any).adjusted_alpha.toFixed(4)
        : stats && typeof (stats as any).bonferroni_adjusted_alpha === 'number'
        ? (stats as any).bonferroni_adjusted_alpha.toFixed(4)
        : 'N/A';

      lines.push([
        v.variant_letter,
        v.name,
        v.is_control ? 'TRUE' : 'FALSE',
        obs.impressions || obs.views || 0,
        obs.conversions || 0,
        ratePct,
        v.is_control ? '0.00' : liftPct,
        ciLowerPct,
        ciUpperPct,
        pVal,
        adjAlpha,
        v.performance_status,
        isWin ? 'TRUE' : 'FALSE',
      ].map(sanitizeCell).join(','));
    }

    const safeName = exp.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 30);
    const filename = `vireo_ab_experiment_${safeName}_${exp.id.slice(0, 8)}.csv`;

    return {
      filename,
      csvContent: lines.join('\r\n'),
    };
  }

  /**
   * Starts an experiment (transitions DRAFT or PAUSED -> ACTIVE).
   */
  public static async startExperiment(
    userId: string,
    experimentId: string
  ): Promise<ABExperiment> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      if (exp.status === 'CONCLUDED' || exp.status === 'CANCELLED') {
        throw new AppError(
          `Cannot start experiment in terminal state "${exp.status}".`,
          409,
          'INVALID_STATE_TRANSITION'
        );
      }

      const now = new Date().toISOString();
      const updates: Partial<ABExperiment> = {
        status: 'ACTIVE',
        started_at: exp.started_at || now,
        updated_at: now,
      };

      const { data: updated, error } = await dataRepository
        .from('ab_experiments')
        .update(updates)
        .eq('id', experimentId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error || !updated) {
        throw new AppError('Failed to activate experiment.', 500, 'DB_ERROR');
      }

      logger.info('A/B experiment started', { experimentId, userId });
      return updated as ABExperiment;
    });
  }

  /**
   * Pauses an ACTIVE experiment.
   */
  public static async pauseExperiment(
    userId: string,
    experimentId: string
  ): Promise<ABExperiment> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      if (exp.status !== 'ACTIVE') {
        throw new AppError('Only active experiments can be paused.', 409, 'EXPERIMENT_NOT_ACTIVE');
      }

      const now = new Date().toISOString();
      const { data: updated, error } = await dataRepository
        .from('ab_experiments')
        .update({ status: 'PAUSED', updated_at: now })
        .eq('id', experimentId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error || !updated) {
        throw new AppError('Failed to pause experiment.', 500, 'DB_ERROR');
      }

      logger.info('A/B experiment paused', { experimentId, userId });
      return updated as ABExperiment;
    });
  }

  /**
   * Records observed performance batch with idempotency and data provenance.
   */
  public static async recordObservation(
    userId: string,
    experimentId: string,
    dto: RecordABObservationDTO
  ): Promise<ABExperiment> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');
    if (!dto.variant_id || !isValidUUID(dto.variant_id)) {
      throw new AppError('Valid variant ID is required.', 400, 'INVALID_UUID');
    }

    const exposures = Math.floor(dto.exposures);
    const conversions = Math.floor(dto.conversions);

    if (!Number.isFinite(exposures) || exposures <= 0) {
      throw new AppError('Exposures (denominator) must be a positive integer greater than zero.', 400, 'INVALID_EXPOSURES');
    }
    if (!Number.isFinite(conversions) || conversions < 0) {
      throw new AppError('Conversions (numerator) must be a non-negative integer.', 400, 'INVALID_CONVERSIONS');
    }
    if (conversions > exposures) {
      throw new AppError('Conversions cannot exceed exposures.', 400, 'INVALID_OBSERVATION_RATIO');
    }

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      if (exp.status !== 'ACTIVE') {
        throw new AppError('Observations can only be recorded for active experiments.', 409, 'EXPERIMENT_NOT_ACTIVE');
      }

      const targetVariant = exp.variants.find((v) => v.id === dto.variant_id);
      if (!targetVariant) {
        throw new AppError('Target variant not found in experiment.', 404, 'VARIANT_NOT_FOUND');
      }

      // 1. Generate stable idempotency key
      const now = new Date().toISOString();
      const periodStart = dto.period_start || now;
      const periodEnd = dto.period_end || now;
      const idempotencyKey =
        dto.idempotency_key ||
        crypto
          .createHash('sha256')
          .update(`${userId}:${experimentId}:${dto.variant_id}:${periodStart}:${periodEnd}:${exposures}:${conversions}`)
          .digest('hex');

      // 2. Check for duplicate observation log
      const { data: existingLog } = await dataRepository
        .from('ab_observation_logs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', userId)
        .single();

      if (existingLog) {
        logger.info('Duplicate observation batch skipped idempotently', {
          idempotencyKey,
          experimentId,
        });
        return exp;
      }

      // 3. Persist raw observation log
      const provenance = dto.data_provenance || 'MANUAL_ENTRY';
      const logRecord: ABObservationLog = {
        id: crypto.randomUUID(),
        experiment_id: experimentId,
        variant_id: dto.variant_id,
        user_id: userId,
        data_provenance: provenance,
        metric_type: exp.target_metric,
        exposures,
        conversions,
        source_label: dto.source_label,
        period_start: periodStart,
        period_end: periodEnd,
        idempotency_key: idempotencyKey,
        created_at: now,
      };

      await dataRepository.from('ab_observation_logs').insert(logRecord);

      // 4. Update variant cumulative observations
      const updatedVariants = exp.variants.map((v) => {
        if (v.id !== dto.variant_id) return v;

        const isViewMetric = exp.target_metric === 'RETENTION_RATE' || exp.target_metric === 'ENGAGEMENT_RATE';
        const newImpressions = isViewMetric ? v.observations.impressions : v.observations.impressions + exposures;
        const newViews = isViewMetric ? v.observations.views + exposures : v.observations.views;
        const newConversions = v.observations.conversions + conversions;
        const denom = isViewMetric ? newViews : newImpressions;
        const newRate = denom > 0 ? Number((newConversions / denom).toFixed(6)) : 0;

        return {
          ...v,
          observations: {
            impressions: newImpressions,
            conversions: newConversions,
            views: newViews,
            rate: newRate,
            data_provenance: provenance,
            last_observation_at: now,
          },
        };
      });

      // 5. Evaluate updated statistical metrics
      const evalResult = ABStatisticalEngine.evaluateExperiment({
        variants: updatedVariants,
        requiredSampleSize: exp.minimum_sample_size,
        confidenceThreshold: exp.confidence_threshold,
        minPracticalLift: exp.minimum_practical_lift,
      });

      const { data: updatedExp, error: updateErr } = await dataRepository
        .from('ab_experiments')
        .update({
          variants: evalResult.variants,
          winning_variant_id: evalResult.recommendedWinnerId,
          winner_declaration_rationale: evalResult.decisionRationale,
          updated_at: now,
        })
        .eq('id', experimentId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateErr || !updatedExp) {
        throw new AppError('Failed to update experiment observations.', 500, 'DB_ERROR');
      }

      return updatedExp as ABExperiment;
    });
  }

  /**
   * Explicit human signoff declaring a winner and concluding the test.
   */
  public static async declareWinner(
    userId: string,
    experimentId: string,
    dto: DeclareABWinnerDTO
  ): Promise<ABExperiment> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');
    if (!dto.variant_id || !isValidUUID(dto.variant_id)) {
      throw new AppError('Valid variant ID is required.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      const targetVariant = exp.variants.find((v) => v.id === dto.variant_id);
      if (!targetVariant) {
        throw new AppError('Target variant not found in experiment.', 404, 'VARIANT_NOT_FOUND');
      }

      // Check statistical defense unless explicit force_override is confirmed
      if (
        targetVariant.performance_status !== 'STATISTICALLY_SIGNIFICANT_WINNER' &&
        !dto.force_override
      ) {
        throw new AppError(
          `Variant "${targetVariant.name}" is not statistically significant (Status: ${targetVariant.performance_status}). Pass force_override: true to sign off manually.`,
          400,
          'INSUFFICIENT_STATISTICAL_EVIDENCE'
        );
      }

      const now = new Date().toISOString();
      const rationale =
        dto.rationale ||
        (targetVariant.statistical_metrics
          ? `Declared winner with +${(targetVariant.statistical_metrics.relative_lift * 100).toFixed(1)}% lift (p=${targetVariant.statistical_metrics.p_value.toFixed(4)})`
          : 'Manually declared winner by creator.');

      const { data: concluded, error } = await dataRepository
        .from('ab_experiments')
        .update({
          status: 'CONCLUDED',
          winning_variant_id: dto.variant_id,
          winner_declared_at: now,
          winner_declared_by: userId,
          winner_declaration_rationale: rationale,
          concluded_at: now,
          updated_at: now,
        })
        .eq('id', experimentId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error || !concluded) {
        throw new AppError('Failed to conclude experiment and declare winner.', 500, 'DB_ERROR');
      }

      logger.info('A/B experiment winner declared', {
        experimentId,
        winnerId: dto.variant_id,
        userId,
      });

      return concluded as ABExperiment;
    });
  }

  /**
   * Promotes the declared winning variant to the clip, Thumbnail Lab, and Brand Brain.
   * Strictly requires explicit confirmation. Idempotent against double promotion.
   * NEVER triggers external publishing or mutates accepted Autopilot runs.
   */
  public static async promoteWinner(
    userId: string,
    experimentId: string,
    dto: PromoteABWinnerDTO
  ): Promise<{
    experiment: ABExperiment;
    promotedTo: string[];
    brandEvidenceId?: string;
  }> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');
    if (!dto.confirm_promotion) {
      throw new AppError(
        'Explicit confirmation is required to promote winning asset (confirm_promotion: true).',
        400,
        'CONFIRMATION_REQUIRED'
      );
    }

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      if (exp.status !== 'CONCLUDED' || !exp.winning_variant_id) {
        throw new AppError(
          'Experiment must be concluded with a declared winner before promoting.',
          409,
          'NO_WINNER_DECLARED'
        );
      }

      // Idempotency: If already promoted, return cleanly without duplicating actions
      if (exp.promoted_to_clip) {
        logger.info('Winner already promoted, skipping duplicate promotion', { experimentId });
        return {
          experiment: exp,
          promotedTo: ['ALREADY_PROMOTED'],
          brandEvidenceId: exp.brand_brain_evidence_id || undefined,
        };
      }

      const winner = exp.variants.find((v) => v.id === exp.winning_variant_id);
      if (!winner) {
        throw new AppError('Winning variant record not found in experiment.', 404, 'WINNER_NOT_FOUND');
      }

      const promotedTo: string[] = [];
      const now = new Date().toISOString();

      // 1. Promote Title to Clip (if TITLE_ONLY test and title present)
      if (exp.test_type === 'TITLE_ONLY' && winner.title) {
        await dataRepository
          .from('clips')
          .update({ title: winner.title, updated_at: now })
          .eq('id', exp.clip_id)
          .eq('user_id', userId);
        promotedTo.push('CLIP_TITLE');
      }

      // 2. Promote Thumbnail to Thumbnail Lab Session (if THUMBNAIL_ONLY test)
      if (exp.test_type === 'THUMBNAIL_ONLY' && winner.thumbnail_concept_id) {
        const { data: sessions } = await dataRepository
          .from('thumbnail_lab_sessions')
          .select('*')
          .eq('clip_id', exp.clip_id)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (sessions && sessions.length > 0) {
          await dataRepository
            .from('thumbnail_lab_sessions')
            .update({
              approved_concept_id: winner.thumbnail_concept_id,
              status: 'APPROVED',
              updated_at: now,
            })
            .eq('id', sessions[0].id)
            .eq('user_id', userId);
          promotedTo.push('THUMBNAIL_LAB_SESSION');
        }
      }

      // 3. Promote Opening Hook to Hook Lab Session (if HOOK_LINE test)
      if (exp.test_type === 'HOOK_LINE' && winner.hook_candidate_id) {
        const { data: hookSessions } = await dataRepository
          .from('hook_lab_sessions')
          .select('*')
          .eq('clip_id', exp.clip_id)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (hookSessions && hookSessions.length > 0) {
          await dataRepository
            .from('hook_lab_sessions')
            .update({
              applied_hook_candidate_id: winner.hook_candidate_id,
              status: 'APPROVED',
              updated_at: now,
            })
            .eq('id', hookSessions[0].id)
            .eq('user_id', userId);
          promotedTo.push('HOOK_LAB_SESSION');
        }
      }

      // 4. Record learned evidence in Brand Brain
      let evidenceRecordId: string | undefined;
      try {
        const { data: brandProfiles } = await dataRepository
          .from('brand_brain_profiles')
          .select('*')
          .eq('user_id', userId)
          .limit(1);

        if (brandProfiles && brandProfiles.length > 0) {
          const profile = brandProfiles[0];
          const dimension =
            exp.test_type === 'THUMBNAIL_ONLY'
              ? 'visual'
              : exp.test_type === 'HOOK_LINE'
              ? 'hooks'
              : 'voice';

          const evidence = await BrandEvidenceService.recordEvidence({
            userId,
            brandBrainId: profile.id,
            dimension,
            sourceType: 'AB_STUDIO',
            sourceId: exp.id,
            value: {
              experiment_id: exp.id,
              test_type: exp.test_type,
              target_metric: exp.target_metric,
              winning_variant_name: winner.name,
              observed_lift: winner.statistical_metrics?.relative_lift || 0,
              conversion_rate: winner.observations.rate,
              title_pattern: winner.title || undefined,
              hook_text: winner.hook_text || undefined,
            },
            weight: 1.5, // High confidence empirical evidence
          });

          if (evidence) {
            evidenceRecordId = evidence.id;
            promotedTo.push('BRAND_BRAIN_EVIDENCE');
          }
        }
      } catch (err) {
        logger.warn('Brand brain evidence recording skipped during promotion', { err });
      }

      // 5. Atomically mark experiment promoted
      const { data: updatedExp, error: markErr } = await dataRepository
        .from('ab_experiments')
        .update({
          promoted_to_clip: true,
          winner_promoted_at: now,
          brand_brain_evidence_id: evidenceRecordId || null,
          updated_at: now,
        })
        .eq('id', experimentId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (markErr || !updatedExp) {
        throw new AppError('Failed to finalize experiment promotion status.', 500, 'DB_ERROR');
      }

      logger.info('A/B experiment winner promoted safely', {
        experimentId,
        promotedTo,
        evidenceRecordId,
      });

      return {
        experiment: updatedExp as ABExperiment,
        promotedTo,
        brandEvidenceId: evidenceRecordId,
      };
    });
  }

  /**
   * Deletes a DRAFT or CANCELLED experiment.
   */
  public static async deleteExperiment(
    userId: string,
    experimentId: string
  ): Promise<boolean> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!isValidUUID(experimentId)) throw new AppError('Invalid experiment ID.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      const exp = await this.getExperiment(userId, experimentId);

      if (exp.status !== 'DRAFT' && exp.status !== 'CANCELLED') {
        throw new AppError(
          `Cannot delete experiment in "${exp.status}" status. Only DRAFT or CANCELLED experiments can be deleted.`,
          409,
          'CANNOT_DELETE_ACTIVE_EXPERIMENT'
        );
      }

      await dataRepository
        .from('ab_observation_logs')
        .delete()
        .eq('experiment_id', experimentId)
        .eq('user_id', userId);

      await dataRepository
        .from('ab_experiments')
        .delete()
        .eq('id', experimentId)
        .eq('user_id', userId);

      logger.info('Deleted A/B experiment', { experimentId, userId });
      return true;
    });
  }

  /**
   * Phase 33: Previews CSV analytics import for an experiment.
   */
  public static async previewCsvImport(
    userId: string,
    experimentId: string,
    csvContent: string,
    userMapping?: Partial<ABCsvColumnMapping>
  ): Promise<ABCsvPreviewResult> {
    return await ABCsvImportService.previewImport(userId, experimentId, csvContent, userMapping);
  }

  /**
   * Phase 33: Executes CSV analytics import for an experiment and recalculates statistical report.
   */
  public static async executeCsvImport(
    userId: string,
    experimentId: string,
    csvContent: string,
    userMapping?: Partial<ABCsvColumnMapping>
  ): Promise<ABCsvImportResult> {
    const result = await ABCsvImportService.executeImport(userId, experimentId, csvContent, userMapping);
    try {
      const report = await this.getExperimentReport(userId, experimentId);
      result.report = report;
    } catch {
      // report generation fallback
    }
    return result;
  }
}

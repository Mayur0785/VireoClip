import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { ABStatisticalEngine } from '../services/abStudio/abStatisticalEngine.js';
import { ABStudioService } from '../services/abStudioService.js';
import {
  ABExperiment,
  CreateABExperimentDTO,
  RecordABObservationDTO,
} from '../types/index.js';

describe('Phase 27 — Vireo A/B Testing Studio Test Suite', () => {
  let db: any;
  const testUserId = crypto.randomUUID();
  const unauthorizedUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testClipId = crypto.randomUUID();
  const thumbnailSessionId = crypto.randomUUID();
  const thumbnailConceptAId = crypto.randomUUID();
  const thumbnailConceptBId = crypto.randomUUID();

  before(async () => {
    // Mongo Ping / Connect
    for (let i = 0; i < 3; i++) {
      try {
        db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Seed test project, clip, and Thumbnail Lab session
    await ownerContext.run(testUserId, async () => {
      await dataRepository.from('projects').insert({
        id: testProjectId,
        user_id: testUserId,
        title: 'A/B Studio Seed Project',
        video_status: 'completed',
        source_type: 'upload',
      });

      await dataRepository.from('brand_brain_profiles').insert({
        id: crypto.randomUUID(),
        user_id: testUserId,
        status: 'active',
      });

      const { error: clipErr } = await dataRepository.from('clips').insert({
        id: testClipId,
        user_id: testUserId,
        project_id: testProjectId,
        title: 'Original Control Title',
        start_seconds: 0,
        end_seconds: 45,
        duration_seconds: 45,
        aspect_ratio: '16:9',
        crop_mode: 'center',
        render_status: 'ready',
      });
      if (clipErr) {
        throw new Error(`Failed to seed clip: ${clipErr.message}`);
      }

      await dataRepository.from('thumbnail_lab_sessions').insert({
        id: thumbnailSessionId,
        user_id: testUserId,
        project_id: testProjectId,
        clip_id: testClipId,
        status: 'READY',
        aspect_ratio: '16:9',
      });

      await dataRepository.from('thumbnail_concepts').insert({
        id: thumbnailConceptAId,
        user_id: testUserId,
        thumbnail_session_id: thumbnailSessionId,
        title: 'Concept A Cover',
        aspect_ratio: '16:9',
        style_direction: 'MINIMAL_PREMIUM',
        status: 'GENERATED',
      });

      await dataRepository.from('thumbnail_concepts').insert({
        id: thumbnailConceptBId,
        user_id: testUserId,
        thumbnail_session_id: thumbnailSessionId,
        title: 'Concept B Cover',
        aspect_ratio: '16:9',
        style_direction: 'BOLD_TYPOGRAPHY',
        status: 'GENERATED',
      });

      // Seed Brand Brain Profile
      await dataRepository.from('brand_brain_profiles').insert({
        id: crypto.randomUUID(),
        user_id: testUserId,
        brand_name: 'Studio Brand',
        status: 'active',
        version: 1,
      });
    });
  });

  after(async () => {
    if (db) {
      await ownerContext.run(testUserId, async () => {
        await dataRepository.from('ab_observation_logs').delete().eq('user_id', testUserId);
        await dataRepository.from('ab_experiments').delete().eq('user_id', testUserId);
        await dataRepository.from('thumbnail_concepts').delete().eq('user_id', testUserId);
        await dataRepository.from('thumbnail_lab_sessions').delete().eq('user_id', testUserId);
        await dataRepository.from('clips').delete().eq('id', testClipId);
        await dataRepository.from('projects').delete().eq('id', testProjectId);
        await dataRepository.from('brand_brain_profiles').delete().eq('user_id', testUserId);
        await dataRepository.from('brand_evidence').delete().eq('user_id', testUserId);
      });
    }
  });

  // ==========================================================================
  // 1. STATISTICAL ENGINE MATHEMATICAL VERIFICATION
  // ==========================================================================
  describe('1. ABStatisticalEngine Mathematical Verification', () => {
    it('1.1 computes exact sample size benchmark for baseline 5%, relative MDE 20%, alpha 0.05, power 80%', () => {
      const sampleSize = ABStatisticalEngine.calculateSampleSize({
        baselineRate: 0.05,
        relativeMDE: 0.20,
        alpha: 0.05,
        power: 0.80,
      });

      // Independently verified pooled formula standard yields 8,158
      assert.equal(sampleSize, 8158, 'Sample size must equal exactly 8,158 exposures per variant');
    });

    it('1.2 evaluates Two-Proportion Z-Test: significant positive lift benchmark', () => {
      // Control: 100/2000 (5%), Challenger: 160/2000 (8%) -> +60% relative lift
      const res = ABStatisticalEngine.evaluateTwoProportionZTest(100, 2000, 160, 2000);

      assert.equal(res.controlRate, 0.05);
      assert.equal(res.challengerRate, 0.08);
      assert.equal(res.relativeLift, 0.60);
      assert.ok(res.zScore > 3.8 && res.zScore < 3.9, `zScore ${res.zScore} should be approx 3.85`);
      assert.ok(res.pValue < 0.001, `pValue ${res.pValue} should be < 0.001`);
      assert.equal(res.successFailureConditionMet, true);
    });

    it('1.3 evaluates Two-Proportion Z-Test: inconclusive benchmark', () => {
      // Control: 100/2000 (5%), Challenger: 105/2000 (5.25%) -> +5% relative lift
      const res = ABStatisticalEngine.evaluateTwoProportionZTest(100, 2000, 105, 2000);

      assert.equal(res.controlRate, 0.05);
      assert.equal(res.challengerRate, 0.0525);
      assert.ok(res.zScore < 0.5, `zScore ${res.zScore} should be approx 0.36`);
      assert.ok(res.pValue > 0.5, `pValue ${res.pValue} should be approx 0.72`);
      assert.equal(res.successFailureConditionMet, true);
    });

    it('1.4 handles edge case: zero denominators safely without throwing or NaN', () => {
      const res = ABStatisticalEngine.evaluateTwoProportionZTest(0, 0, 0, 0);

      assert.equal(res.controlRate, 0);
      assert.equal(res.challengerRate, 0);
      assert.equal(res.relativeLift, 0);
      assert.equal(res.zScore, 0);
      assert.equal(res.pValue, 1.0);
      assert.equal(res.successFailureConditionMet, false);
    });

    it('1.5 detects success-failure condition violation when np < 5', () => {
      // 3/50 conversions -> np = 3 < 5
      const res = ABStatisticalEngine.evaluateTwoProportionZTest(3, 50, 4, 50);
      assert.equal(res.successFailureConditionMet, false, 'Should flag np < 5 as violation');
    });

    it('1.6 calculates Wilson score descriptive uncertainty intervals bounded in [0, 1]', () => {
      const interval = ABStatisticalEngine.calculateWilsonInterval(100, 2000, 0.95);
      assert.ok(interval[0] >= 0 && interval[0] <= interval[1]);
      assert.ok(interval[1] <= 1);
      // For 100/2000 (5%), 95% Wilson CI is roughly [4.12%, 6.06%]
      assert.ok(interval[0] > 0.038 && interval[0] < 0.043);
      assert.ok(interval[1] > 0.058 && interval[1] < 0.063);
    });

    it('1.7 applies Bonferroni correction for multi-challenger comparisons', () => {
      const controlVariant: any = {
        id: 'var-a',
        variant_letter: 'A',
        is_control: true,
        name: 'Control',
        traffic_weight: 34,
        observations: { impressions: 10000, conversions: 500, views: 0, rate: 0.05, data_provenance: 'MANUAL_ENTRY' },
        performance_status: 'CONTROL',
      };
      const challengerB: any = {
        id: 'var-b',
        variant_letter: 'B',
        is_control: false,
        name: 'Challenger B',
        traffic_weight: 33,
        // Lift with p-value ~ 0.03 (would pass alpha=0.05, but should fail adjusted alpha=0.025)
        observations: { impressions: 10000, conversions: 560, views: 0, rate: 0.056, data_provenance: 'MANUAL_ENTRY' },
        performance_status: 'INCONCLUSIVE',
      };
      const challengerC: any = {
        id: 'var-c',
        variant_letter: 'C',
        is_control: false,
        name: 'Challenger C',
        traffic_weight: 33,
        // High lift: 700/10000 (7.0%) -> p < 0.001
        observations: { impressions: 10000, conversions: 700, views: 0, rate: 0.07, data_provenance: 'MANUAL_ENTRY' },
        performance_status: 'INCONCLUSIVE',
      };

      const evalRes = ABStatisticalEngine.evaluateExperiment({
        variants: [controlVariant, challengerB, challengerC],
        requiredSampleSize: 8000,
        confidenceThreshold: 0.95,
        minPracticalLift: 0.05,
      });

      // 2 challengers against 1 control -> adjusted alpha = 0.05 / 2 = 0.025
      const evalChallengerB = evalRes.variants.find((v) => v.id === 'var-b');
      const evalChallengerC = evalRes.variants.find((v) => v.id === 'var-c');

      assert.equal(evalChallengerB?.statistical_metrics?.adjusted_alpha, 0.025);
      assert.equal(evalChallengerC?.statistical_metrics?.adjusted_alpha, 0.025);
      assert.equal(evalRes.recommendedWinnerId, 'var-c', 'Challenger C should be selected winner');
    });
  });

  // ==========================================================================
  // 2. LIFECYCLE, VALIDATION & TENANT ISOLATION
  // ==========================================================================
  describe('2. Experiment Lifecycle, Validation & Tenant Isolation', () => {
    let experimentId = '';
    let variantAId = '';
    let variantBId = '';

    it('2.1 rejects experiment creation with invalid dimension or invalid variants', async () => {
      // Rejects missing variants
      await assert.rejects(
        async () => {
          await ABStudioService.createExperiment(testUserId, {
            clip_id: testClipId,
            name: 'Bad Exp',
            hypothesis: 'Hypothesis',
            test_type: 'THUMBNAIL_ONLY',
            variants: [],
          });
        },
        /between 2 and 4 variants/,
        'Should reject < 2 variants'
      );

      // Rejects traffic allocation not summing to 100%
      await assert.rejects(
        async () => {
          await ABStudioService.createExperiment(testUserId, {
            clip_id: testClipId,
            name: 'Bad Traffic',
            hypothesis: 'Hypothesis',
            test_type: 'TITLE_ONLY',
            variants: [
              { variant_letter: 'A', is_control: true, name: 'Control', traffic_weight: 50 },
              { variant_letter: 'B', is_control: false, name: 'Challenger', traffic_weight: 40 },
            ],
          });
        },
        /Variant traffic weights must sum to 100%/,
        'Should reject non-100% traffic allocation'
      );
    });

    it('2.2 successfully creates a single-dimension Title experiment in DRAFT status', async () => {
      const exp = await ABStudioService.createExperiment(testUserId, {
        clip_id: testClipId,
        project_id: testProjectId,
        name: 'Title Hook Test 1',
        hypothesis: 'Question headline will achieve higher CTR than standard headline.',
        test_type: 'TITLE_ONLY',
        target_metric: 'CTR',
        variants: [
          {
            variant_letter: 'A',
            is_control: true,
            name: 'Variant A (Control)',
            title: 'Original Control Title',
            traffic_weight: 50,
          },
          {
            variant_letter: 'B',
            is_control: false,
            name: 'Variant B (Challenger)',
            title: 'Are You Making This Massive AI Video Error?',
            traffic_weight: 50,
          },
        ],
      });

      assert.ok(exp.id);
      assert.equal(exp.status, 'DRAFT');
      assert.equal(exp.test_type, 'TITLE_ONLY');
      assert.equal(exp.minimum_sample_size, 8158);
      assert.equal(exp.variants.length, 2);

      experimentId = exp.id;
      variantAId = exp.variants[0].id;
      variantBId = exp.variants[1].id;
    });

    it('2.3 enforces tenant isolation: unauthorized user cannot access or start experiment', async () => {
      await assert.rejects(
        async () => {
          await ABStudioService.getExperiment(unauthorizedUserId, experimentId);
        },
        /not found or access denied/,
        'Unauthorized user must receive 404/denied'
      );

      await assert.rejects(
        async () => {
          await ABStudioService.startExperiment(unauthorizedUserId, experimentId);
        },
        /not found or access denied/,
        'Unauthorized user cannot start experiment'
      );
    });

    it('2.4 activates experiment (DRAFT -> ACTIVE) and pauses it (ACTIVE -> PAUSED)', async () => {
      const active = await ABStudioService.startExperiment(testUserId, experimentId);
      assert.equal(active.status, 'ACTIVE');
      assert.ok(active.started_at);

      const paused = await ABStudioService.pauseExperiment(testUserId, experimentId);
      assert.equal(paused.status, 'PAUSED');

      // Resume
      const resumed = await ABStudioService.startExperiment(testUserId, experimentId);
      assert.equal(resumed.status, 'ACTIVE');
    });

    // ========================================================================
    // 3. OBSERVATION INGESTION & IDEMPOTENCY
    // ========================================================================
    it('3.1 rejects invalid observation counts (conversions > exposures or negative)', async () => {
      await assert.rejects(
        async () => {
          await ABStudioService.recordObservation(testUserId, experimentId, {
            variant_id: variantAId,
            exposures: 100,
            conversions: 105, // conversions > exposures
          });
        },
        /Conversions cannot exceed exposures/,
        'Must reject conversions > exposures'
      );

      await assert.rejects(
        async () => {
          await ABStudioService.recordObservation(testUserId, experimentId, {
            variant_id: variantAId,
            exposures: -50,
            conversions: 10,
          });
        },
        /positive integer greater than zero/,
        'Must reject negative exposures'
      );
    });

    it('3.2 records observations and deduplicates duplicate batches via idempotency key', async () => {
      const batch: RecordABObservationDTO = {
        variant_id: variantAId,
        exposures: 5000,
        conversions: 250, // 5%
        data_provenance: 'MANUAL_ENTRY',
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-10-05T00:00:00Z',
      };

      // First submission
      const updated1 = await ABStudioService.recordObservation(testUserId, experimentId, batch);
      const varA1 = updated1.variants.find((v) => v.id === variantAId);
      assert.equal(varA1?.observations.impressions, 5000);
      assert.equal(varA1?.observations.conversions, 250);

      // Re-submitting identical payload should be skipped idempotently
      const updated2 = await ABStudioService.recordObservation(testUserId, experimentId, batch);
      const varA2 = updated2.variants.find((v) => v.id === variantAId);
      assert.equal(varA2?.observations.impressions, 5000, 'Impression count must not double count');
      assert.equal(varA2?.observations.conversions, 250, 'Conversion count must not double count');
    });

    it('3.3 accumulates observations to reach statistical significance for Challenger', async () => {
      // Add more observations to Control to meet sample size (> 8,158)
      await ABStudioService.recordObservation(testUserId, experimentId, {
        variant_id: variantAId,
        exposures: 4000,
        conversions: 200, // total control: 9000 exposures, 450 conversions (5.0%)
        period_start: '2026-10-06T00:00:00Z',
        period_end: '2026-10-10T00:00:00Z',
      });

      // Add observations for Challenger B (> 8,158, with 7.5% conversion -> significant lift)
      const afterB = await ABStudioService.recordObservation(testUserId, experimentId, {
        variant_id: variantBId,
        exposures: 9000,
        conversions: 675, // 7.5% conversion rate (+50% lift over 5.0%)
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-10-10T00:00:00Z',
      });

      const varB = afterB.variants.find((v) => v.id === variantBId);
      assert.equal(varB?.performance_status, 'STATISTICALLY_SIGNIFICANT_WINNER');
      assert.ok(varB?.statistical_metrics?.is_statistically_significant);
      assert.ok(varB?.statistical_metrics?.has_practical_significance);
      assert.equal(afterB.winning_variant_id, variantBId);
    });

    // ========================================================================
    // 4. WINNER DECLARATION & SAFE HUMAN PROMOTION
    // ========================================================================
    it('4.1 concludes experiment upon declaring winner', async () => {
      const concluded = await ABStudioService.declareWinner(testUserId, experimentId, {
        variant_id: variantBId,
        rationale: 'Challenger title demonstrated 50% lift with p < 0.001.',
      });

      assert.equal(concluded.status, 'CONCLUDED');
      assert.equal(concluded.winning_variant_id, variantBId);
      assert.ok(concluded.winner_declared_at);
      assert.equal(concluded.promoted_to_clip, false);
    });

    it('4.2 blocks promotion when explicit confirmation is false', async () => {
      await assert.rejects(
        async () => {
          await ABStudioService.promoteWinner(testUserId, experimentId, {
            confirm_promotion: false,
          });
        },
        /Explicit confirmation is required/,
        'Should require confirm_promotion: true'
      );
    });

    it('4.3 safely promotes winner: updates clip title, records Brand Brain evidence, zero publishing', async () => {
      const res = await ABStudioService.promoteWinner(testUserId, experimentId, {
        confirm_promotion: true,
      });

      assert.equal(res.experiment.promoted_to_clip, true);
      assert.ok(res.promotedTo.includes('CLIP_TITLE'));

      await ownerContext.run(testUserId, async () => {
        // 1. Verify clip title was updated in database
        const { data: updatedClip } = await dataRepository
          .from('clips')
          .select('*')
          .eq('id', testClipId)
          .single();
        assert.equal(
          (updatedClip as any).title,
          'Are You Making This Massive AI Video Error?',
          'Clip title must be updated with winning variant title'
        );

        // 2. Verify Brand Brain learned evidence record
        const { data: evidence } = await dataRepository
          .from('brand_evidence')
          .select('*')
          .eq('user_id', testUserId);
        assert.ok((evidence || []).length > 0, 'Brand evidence must be recorded');

        // 3. Verify zero published posts or background publishing jobs were created
        const { data: posts } = await dataRepository
          .from('published_posts')
          .select('*')
          .eq('user_id', testUserId);
        assert.equal((posts || []).length, 0, 'Must not publish externally');
      });

      // 4. Verify re-promotion idempotency (calling again does not duplicate)
      const res2 = await ABStudioService.promoteWinner(testUserId, experimentId, {
        confirm_promotion: true,
      });
      assert.deepEqual(res2.promotedTo, ['ALREADY_PROMOTED']);
    });
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});


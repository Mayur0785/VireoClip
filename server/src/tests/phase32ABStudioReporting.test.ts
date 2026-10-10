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

describe('Phase 32 — Vireo Experiment History & Reporting Test Suite', () => {
  let db: any;
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const projectAId = crypto.randomUUID();
  const clipAId = crypto.randomUUID();
  const clipBId = crypto.randomUUID();

  let experimentDraftId: string;
  let experimentActiveId: string;
  let experimentConcludedId: string;
  let userBExperimentId: string;

  before(async () => {
    // Mongo ping / connect
    for (let i = 0; i < 3; i++) {
      try {
        db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Seed User A's project & clip
    await ownerContext.run(userA, async () => {
      await dataRepository.from('projects').insert({
        id: projectAId,
        user_id: userA,
        title: 'Phase 32 Test Project',
        video_status: 'completed',
        source_type: 'upload',
      });

      await dataRepository.from('brand_brain_profiles').insert({
        id: crypto.randomUUID(),
        user_id: userA,
        status: 'active',
      });

      await dataRepository.from('clips').insert({
        id: clipAId,
        user_id: userA,
        project_id: projectAId,
        title: 'Phase 32 Seed Clip for User A',
        start_seconds: 0,
        end_seconds: 40,
        duration_seconds: 40,
        status: 'ready',
      });
    });

    // Seed User B's project & clip
    await ownerContext.run(userB, async () => {
      const projB = crypto.randomUUID();
      await dataRepository.from('projects').insert({
        id: projB,
        user_id: userB,
        title: 'User B Isolated Project',
        video_status: 'completed',
        source_type: 'upload',
      });

      await dataRepository.from('clips').insert({
        id: clipBId,
        user_id: userB,
        project_id: projB,
        title: 'Phase 32 Seed Clip for User B',
        start_seconds: 0,
        end_seconds: 30,
        duration_seconds: 30,
        status: 'ready',
      });
    });

    // Create experiments for User A
    // 1. DRAFT experiment
    const exp1 = await ABStudioService.createExperiment(userA, {
      clip_id: clipAId,
      name: 'Alpha Title Experiment',
      hypothesis: 'Hypothesis that variant B will increase CTR by 20%',
      test_type: 'TITLE_ONLY',
      target_metric: 'CTR',
      variants: [
        { variant_letter: 'A', name: 'Original Title', is_control: true, traffic_weight: 50 },
        { variant_letter: 'B', name: 'Punchy Question Title', is_control: false, traffic_weight: 50 },
      ],
    });
    experimentDraftId = exp1.id;

    // 2. ACTIVE experiment with partial observations
    const exp2 = await ABStudioService.createExperiment(userA, {
      clip_id: clipAId,
      name: 'Beta Thumbnail Experiment',
      hypothesis: 'High contrast thumbnail increases CTR',
      test_type: 'THUMBNAIL_ONLY',
      target_metric: 'CTR',
      variants: [
        { variant_letter: 'A', name: 'Muted Frame', is_control: true, traffic_weight: 50 },
        { variant_letter: 'B', name: 'Vibrant Frame', is_control: false, traffic_weight: 50 },
      ],
    });
    await ABStudioService.startExperiment(userA, exp2.id);
    const varAId = exp2.variants.find((v) => v.variant_letter === 'A')!.id;
    const varBId = exp2.variants.find((v) => v.variant_letter === 'B')!.id;

    // Log underpowered observations
    await ABStudioService.recordObservation(userA, exp2.id, {
      variant_id: varAId,
      exposures: 1200,
      conversions: 60,
      data_provenance: 'MANUAL_ENTRY',
      source_label: 'Manual Batch 1',
    });
    await ABStudioService.recordObservation(userA, exp2.id, {
      variant_id: varBId,
      exposures: 1200,
      conversions: 84,
      data_provenance: 'CSV_IMPORT',
      source_label: 'Import Batch 1',
    });
    experimentActiveId = exp2.id;

    // 3. CONCLUDED experiment with winner
    const exp3 = await ABStudioService.createExperiment(userA, {
      clip_id: clipAId,
      name: 'Gamma Hook Line Test',
      hypothesis: 'Curiosity question hook outperforms statement hook',
      test_type: 'HOOK_LINE',
      target_metric: 'CTR',
      variants: [
        { variant_letter: 'A', name: 'Statement Hook', is_control: true, traffic_weight: 50 },
        { variant_letter: 'B', name: 'Question Hook', is_control: false, traffic_weight: 50 },
      ],
    });
    await ABStudioService.startExperiment(userA, exp3.id);
    const var3A = exp3.variants.find((v) => v.variant_letter === 'A')!.id;
    const var3B = exp3.variants.find((v) => v.variant_letter === 'B')!.id;

    // Add powered observations (>= 8,158)
    await ABStudioService.recordObservation(userA, exp3.id, {
      variant_id: var3A,
      exposures: 9000,
      conversions: 450, // 5.0%
      data_provenance: 'PLATFORM_ANALYTICS_SYNC',
    });
    await ABStudioService.recordObservation(userA, exp3.id, {
      variant_id: var3B,
      exposures: 9000,
      conversions: 630, // 7.0% -> +40% relative lift, p < 0.001
      data_provenance: 'PLATFORM_ANALYTICS_SYNC',
    });

    await ABStudioService.declareWinner(userA, exp3.id, {
      variant_id: var3B,
      rationale: 'Winner declared: Statistically significant outperformance meeting power and MDE criteria',
    });
    experimentConcludedId = exp3.id;

    // Create an experiment for User B
    const expB = await ABStudioService.createExperiment(userB, {
      clip_id: clipBId,
      name: 'Secret User B Experiment',
      hypothesis: 'Confidential hypothesis',
      test_type: 'TITLE_ONLY',
      variants: [
        { variant_letter: 'A', name: 'UA', is_control: true, traffic_weight: 50 },
        { variant_letter: 'B', name: 'UB', is_control: false, traffic_weight: 50 },
      ],
    });
    userBExperimentId = expB.id;
  });

  after(async () => {
    // Clean up only our test records
    if (db) {
      await db.collection('ab_experiments').deleteMany({
        id: { $in: [experimentDraftId, experimentActiveId, experimentConcludedId, userBExperimentId] },
      });
      await db.collection('ab_observations').deleteMany({
        experiment_id: { $in: [experimentDraftId, experimentActiveId, experimentConcludedId, userBExperimentId] },
      });
      await db.collection('clips').deleteMany({
        id: { $in: [clipAId, clipBId] },
      });
      await db.collection('projects').deleteMany({
        id: { $in: [projectAId] },
      });
    }
  });

  describe('1. Experiment History Listing & Multi-Tenant Isolation', () => {
    it('lists all experiments owned by the authenticated user with linked clip metadata', async () => {
      const res = await ABStudioService.listUserExperiments(userA);
      assert.ok(res.experiments.length >= 3, 'User A should see at least 3 experiments');
      assert.strictEqual(res.total, res.experiments.length);

      const expIds = res.experiments.map((e) => e.id);
      assert.ok(expIds.includes(experimentDraftId), 'Should include draft experiment');
      assert.ok(expIds.includes(experimentActiveId), 'Should include active experiment');
      assert.ok(expIds.includes(experimentConcludedId), 'Should include concluded experiment');

      // Verify linked clip title was resolved
      const foundExp = res.experiments.find((e) => e.id === experimentDraftId);
      assert.strictEqual(foundExp?.clip_title, 'Phase 32 Seed Clip for User A');
    });

    it('strictly isolates experiments across tenants; user A never sees user B data', async () => {
      const resA = await ABStudioService.listUserExperiments(userA);
      const resB = await ABStudioService.listUserExperiments(userB);

      const idsA = resA.experiments.map((e) => e.id);
      const idsB = resB.experiments.map((e) => e.id);

      assert.ok(!idsA.includes(userBExperimentId), 'User A must not see User B experiment');
      assert.ok(idsB.includes(userBExperimentId), 'User B must see their own experiment');
      assert.ok(!idsB.includes(experimentDraftId), 'User B must not see User A draft');
    });

    it('rejects cross-user access attempts to getExperiment, report, and export', async () => {
      await assert.rejects(
        async () => {
          await ABStudioService.getExperiment(userA, userBExperimentId);
        },
        /not found|access denied/i
      );

      await assert.rejects(
        async () => {
          await ABStudioService.getExperimentReport(userA, userBExperimentId);
        },
        /not found|access denied/i
      );

      await assert.rejects(
        async () => {
          await ABStudioService.exportExperimentCsv(userA, userBExperimentId);
        },
        /not found|access denied/i
      );
    });
  });

  describe('2. Filtering and Search Capabilities', () => {
    it('filters experiments accurately by status', async () => {
      const draftRes = await ABStudioService.listUserExperiments(userA, { status: 'DRAFT' });
      assert.ok(draftRes.experiments.every((e) => e.status === 'DRAFT'));
      assert.ok(draftRes.experiments.some((e) => e.id === experimentDraftId));
      assert.ok(!draftRes.experiments.some((e) => e.id === experimentActiveId));

      const activeRes = await ABStudioService.listUserExperiments(userA, { status: 'ACTIVE' });
      assert.ok(activeRes.experiments.every((e) => e.status === 'ACTIVE'));
      assert.ok(activeRes.experiments.some((e) => e.id === experimentActiveId));

      const concludedRes = await ABStudioService.listUserExperiments(userA, { status: 'CONCLUDED' });
      assert.ok(concludedRes.experiments.every((e) => e.status === 'CONCLUDED'));
      assert.ok(concludedRes.experiments.some((e) => e.id === experimentConcludedId));
    });

    it('searches experiments by name or hypothesis keywords', async () => {
      const searchTitle = await ABStudioService.listUserExperiments(userA, { search: 'Alpha Title' });
      assert.strictEqual(searchTitle.experiments.length, 1);
      assert.strictEqual(searchTitle.experiments[0].id, experimentDraftId);

      const searchHypo = await ABStudioService.listUserExperiments(userA, { search: 'contrast' });
      assert.strictEqual(searchHypo.experiments.length, 1);
      assert.strictEqual(searchHypo.experiments[0].id, experimentActiveId);

      const searchEmpty = await ABStudioService.listUserExperiments(userA, { search: 'NonExistentXYZ99' });
      assert.strictEqual(searchEmpty.experiments.length, 0);
    });

    it('supports pagination with limit and offset', async () => {
      const page1 = await ABStudioService.listUserExperiments(userA, { limit: 1, offset: 0 });
      assert.strictEqual(page1.experiments.length, 1);
      assert.ok(page1.total >= 3);

      const page2 = await ABStudioService.listUserExperiments(userA, { limit: 1, offset: 1 });
      assert.strictEqual(page2.experiments.length, 1);
      assert.notStrictEqual(page1.experiments[0].id, page2.experiments[0].id);
    });
  });

  describe('3. Results & Reports (Evidence Level Distinctions)', () => {
    it('correctly classifies an experiment with no observations as NO_OBSERVATIONS', async () => {
      const report = await ABStudioService.getExperimentReport(userA, experimentDraftId);
      assert.strictEqual(report.evidence_level, 'NO_OBSERVATIONS');
      assert.strictEqual(report.total_exposures, 0);
      assert.strictEqual(report.total_conversions, 0);
      assert.strictEqual(report.sample_size_progress_percentage, 0);
      assert.match(report.decision_rationale, /No observations recorded/i);
    });

    it('correctly classifies an experiment with partial observations as INSUFFICIENT_SAMPLE_SIZE', async () => {
      const report = await ABStudioService.getExperimentReport(userA, experimentActiveId);
      assert.strictEqual(report.evidence_level, 'INSUFFICIENT_SAMPLE_SIZE');
      assert.strictEqual(report.total_exposures, 2400);
      assert.strictEqual(report.total_conversions, 144);
      assert.ok(report.sample_size_progress_percentage < 100);
      assert.match(report.decision_rationale, /Underpowered/i);

      // Verify data provenance breakdown
      assert.strictEqual(report.provenance_breakdown.MANUAL_ENTRY, 1);
      assert.strictEqual(report.provenance_breakdown.CSV_IMPORT, 1);
    });

    it('correctly classifies a concluded experiment with a confirmed winner as WINNER_DECLARED', async () => {
      const report = await ABStudioService.getExperimentReport(userA, experimentConcludedId);
      assert.strictEqual(report.evidence_level, 'WINNER_DECLARED');
      assert.ok(report.winning_variant_id);
      assert.ok(report.total_exposures >= 16316);
      assert.strictEqual(report.sample_size_progress_percentage, 100);
      assert.match(report.decision_rationale, /Winner declared/i);

      const winVar = report.variants.find((v) => v.variant_id === report.winning_variant_id);
      assert.ok(winVar, 'Winning variant must exist in report variants');
      assert.strictEqual(winVar?.performance_status, 'STATISTICALLY_SIGNIFICANT_WINNER');
      assert.strictEqual(winVar?.variant_letter, 'B');
      assert.ok(winVar?.statistical_metrics?.p_value! < 0.05);
    });

    it('preserves the benchmark sample size calculation of 8,158 for default parameters', () => {
      const minSample = ABStatisticalEngine.calculateSampleSize({
        baselineRate: 0.05,
        relativeMDE: 0.20,
        alpha: 0.05,
        power: 0.80,
      });

      assert.strictEqual(
        minSample,
        8158,
        'Default benchmark must equal 8,158 exposures per variant'
      );
    });
  });

  describe('4. CSV Export Security & RFC 4180 Escaping', () => {
    it('exports well-formed RFC 4180 CSV containing experiment metadata and metrics', async () => {
      const exportResult = await ABStudioService.exportExperimentCsv(userA, experimentConcludedId);
      assert.ok(exportResult.filename.startsWith('vireo_ab_experiment_'));
      assert.ok(exportResult.filename.endsWith('.csv'));

      const csv = exportResult.csvContent;
      assert.ok(csv.includes('VIREO A/B TESTING STUDIO — EXPERIMENT REPORT'));
      assert.ok(csv.includes('Gamma Hook Line Test'));
      assert.ok(csv.includes('Variant Letter,Variant Name,Is Control'));
      assert.ok(csv.includes('Statement Hook'));
      assert.ok(csv.includes('Question Hook'));
      assert.ok(csv.includes('WINNER'));
    });

    it('sanitizes formula injection attacks (=, +, -, @) safely', async () => {
      // Create an experiment with formula injection attempt in name and variants
      const maliciousExp = await ABStudioService.createExperiment(userA, {
        clip_id: clipAId,
        name: '=cmd|"/C calc"!A0',
        hypothesis: '+2+5',
        test_type: 'TITLE_ONLY',
        variants: [
          { variant_letter: 'A', name: '@SUM(1,2)', is_control: true, traffic_weight: 50 },
          { variant_letter: 'B', name: '-10+20', is_control: false, traffic_weight: 50 },
        ],
      });

      try {
        const exported = await ABStudioService.exportExperimentCsv(userA, maliciousExp.id);
        const lines = exported.csvContent.split(/\r?\n/);

        // Verify that cells starting with =, +, -, @ were sanitized with leading single quote
        const expNameLine = lines.find((l) => l.includes('Experiment Name'));
        assert.ok(expNameLine, 'Experiment name row must exist');
        assert.ok(expNameLine.includes("'=cmd"), 'Dangerous formula must be neutralized');

        const hypoLine = lines.find((l) => l.includes('Hypothesis'));
        assert.ok(hypoLine, 'Hypothesis row must exist');
        assert.ok(hypoLine.includes("'+2+5"), 'Dangerous plus formula must be neutralized');

        const varALine = lines.find((l) => l.includes('@SUM'));
        assert.ok(varALine, 'Variant A line must exist');
        assert.ok(varALine.includes("'@SUM"), 'Dangerous @ formula must be neutralized');

        const varBLine = lines.find((l) => l.includes('-10+20'));
        assert.ok(varBLine, 'Variant B line must exist');
        assert.ok(varBLine.includes("'-10+20"), 'Dangerous - formula must be neutralized');
      } finally {
        await db.collection('ab_experiments').deleteOne({ id: maliciousExp.id });
      }
    });
  });

  describe('5. State Invariance & Safety Invariants', () => {
    it('ensures draft experiments remain strictly in DRAFT status during listing and reporting', async () => {
      const expBefore = await ABStudioService.getExperiment(userA, experimentDraftId);
      assert.strictEqual(expBefore.status, 'DRAFT');

      await ABStudioService.listUserExperiments(userA);
      await ABStudioService.getExperimentReport(userA, experimentDraftId);
      await ABStudioService.exportExperimentCsv(userA, experimentDraftId);

      const expAfter = await ABStudioService.getExperiment(userA, experimentDraftId);
      assert.strictEqual(expAfter.status, 'DRAFT', 'Draft experiment state must remain unchanged');
    });
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});


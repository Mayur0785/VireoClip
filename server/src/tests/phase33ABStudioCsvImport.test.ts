import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { ABStudioService } from '../services/abStudioService.js';
import { ABCsvImportService } from '../services/abStudio/abCsvImportService.js';
import {
  ABExperiment,
  CreateABExperimentDTO,
} from '../types/index.js';

describe('Phase 33 — Vireo A/B Studio CSV Analytics Import Test Suite', () => {
  let db: any;
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const projectAId = crypto.randomUUID();
  const clipAId = crypto.randomUUID();

  let activeExperimentId: string;
  let draftExperimentId: string;
  let variantAId: string;
  let variantBId: string;

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
        title: 'Phase 33 Test Project',
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
        title: 'Phase 33 Test Clip',
        start_seconds: 0,
        end_seconds: 45,
        duration_seconds: 45,
        aspect_ratio: '16:9',
        crop_mode: 'center',
        render_status: 'ready',
      });

      // Create Active experiment with 2 variants
      const exp1 = await ABStudioService.createExperiment(userA, {
        clip_id: clipAId,
        project_id: projectAId,
        name: 'CSV Import Test Active Exp',
        hypothesis: 'Testing platform analytics ingestion',
        test_type: 'TITLE_ONLY',
        variants: [
          { variant_letter: 'A', is_control: true, name: 'Original Title', traffic_weight: 50 },
          { variant_letter: 'B', is_control: false, name: 'Challenger Title', traffic_weight: 50 },
        ],
      });
      activeExperimentId = exp1.id;
      variantAId = exp1.variants[0].id;
      variantBId = exp1.variants[1].id;

      // Start the experiment so it is ACTIVE
      await ABStudioService.startExperiment(userA, activeExperimentId);

      // Create a DRAFT experiment
      const exp2 = await ABStudioService.createExperiment(userA, {
        clip_id: clipAId,
        project_id: projectAId,
        name: 'CSV Import Draft Exp',
        hypothesis: 'Draft state preservation check',
        test_type: 'TITLE_ONLY',
        variants: [
          { variant_letter: 'A', is_control: true, name: 'Draft A', traffic_weight: 50 },
          { variant_letter: 'B', is_control: false, name: 'Draft B', traffic_weight: 50 },
        ],
      });
      draftExperimentId = exp2.id;
    });
  });

  after(async () => {
    // Cleanup seeded records
    if (db) {
      await db.collection('ab_observation_logs').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('ab_experiments').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('clips').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('projects').deleteMany({ user_id: { $in: [userA, userB] } });
      await db.collection('brand_brain_profiles').deleteMany({ user_id: { $in: [userA, userB] } });
    }
  });

  it('1. Valid CSV import previews and imports standard platform rows accurately', async () => {
    const csvData = [
      'variant,impressions,clicks,date,source',
      'A,1000,50,2026-03-01T00:00:00.000Z,YouTube Analytics',
      'B,1000,75,2026-03-01T00:00:00.000Z,YouTube Analytics',
    ].join('\n');

    // 1. Preview
    const preview = await ABStudioService.previewCsvImport(userA, activeExperimentId, csvData);
    assert.equal(preview.total_rows, 2);
    assert.equal(preview.valid_rows_count, 2);
    assert.equal(preview.invalid_rows_count, 0);
    assert.equal(preview.duplicate_rows_count, 0);
    assert.equal(preview.can_import, true);
    assert.equal(preview.variant_summary.length, 2);

    // 2. Execute
    const result = await ABStudioService.executeCsvImport(userA, activeExperimentId, csvData);
    assert.equal(result.total_rows, 2);
    assert.equal(result.imported_count, 2);
    assert.equal(result.duplicate_count, 0);
    assert.equal(result.rejected_count, 0);
    assert.equal(result.row_errors.length, 0);

    const varA = result.updated_experiment.variants.find((v) => v.variant_letter === 'A')!;
    const varB = result.updated_experiment.variants.find((v) => v.variant_letter === 'B')!;
    assert.equal(varA.observations.impressions, 1000);
    assert.equal(varA.observations.conversions, 50);
    assert.equal(varA.observations.data_provenance, 'CSV_IMPORT');
    assert.equal(varB.observations.impressions, 1000);
    assert.equal(varB.observations.conversions, 75);
    assert.equal(varB.observations.data_provenance, 'CSV_IMPORT');
  });

  it('2. Missing required headers and empty CSVs are caught with descriptive errors', async () => {
    // Empty CSV
    await assert.rejects(
      async () => {
        await ABStudioService.previewCsvImport(userA, activeExperimentId, '');
      },
      (err: any) => {
        assert.equal(err.code, 'EMPTY_CSV');
        return true;
      }
    );

    // Only headers, no data
    await assert.rejects(
      async () => {
        await ABStudioService.previewCsvImport(userA, activeExperimentId, 'variant,impressions,clicks');
      },
      (err: any) => {
        assert.equal(err.code, 'INSUFFICIENT_CSV_ROWS');
        return true;
      }
    );

    // Missing required columns (e.g. only variant and date)
    const preview = await ABStudioService.previewCsvImport(
      userA,
      activeExperimentId,
      'variant,date\nA,2026-03-01'
    );
    assert.equal(preview.can_import, false);
    assert.ok(preview.validation_errors.length > 0);
  });

  it('3. Invalid numeric values (negative numbers, clicks > impressions, missing numbers) are rejected', async () => {
    const invalidCsv = [
      'variant,impressions,clicks',
      'A,-500,20', // Negative impressions
      'B,100,-10', // Negative clicks
      'A,100,150', // Conversions > exposures
      'B,,20', // Missing exposures
      'A,500,', // Missing conversions
      'B,not_a_number,10', // Non-numeric
    ].join('\n');

    const preview = await ABStudioService.previewCsvImport(userA, activeExperimentId, invalidCsv);
    assert.equal(preview.total_rows, 6);
    assert.equal(preview.valid_rows_count, 0);
    assert.equal(preview.invalid_rows_count, 6);
    assert.equal(preview.can_import, false);

    // Ensure missing values are NOT treated as zeros
    const missingExpRow = preview.sample_preview.find((r) => r.row_number === 5);
    assert.ok(missingExpRow?.error?.includes('Missing exposures value'));
  });

  it('4. Unknown variants are reported per row without terminating execution of other rows', async () => {
    const csvWithUnknown = [
      'variant,impressions,clicks',
      'A,100,5',
      'Z,100,5', // Variant Z doesn't exist
      'B,100,5',
    ].join('\n');

    const preview = await ABStudioService.previewCsvImport(userA, activeExperimentId, csvWithUnknown);
    assert.equal(preview.total_rows, 3);
    assert.equal(preview.valid_rows_count, 2);
    assert.equal(preview.invalid_rows_count, 1);

    const unknownRow = preview.sample_preview.find((r) => r.row_number === 3);
    assert.equal(unknownRow?.status, 'INVALID');
    assert.ok(unknownRow?.error?.includes('Unknown variant identifier'));
  });

  it('5. Repeated imports are idempotent: importing the same source data twice skips duplicates', async () => {
    const idempotentCsv = [
      'variant,impressions,clicks,date',
      'A,2500,125,2026-03-05T12:00:00.000Z',
      'B,2500,175,2026-03-05T12:00:00.000Z',
    ].join('\n');

    // First import
    const firstRes = await ABStudioService.executeCsvImport(userA, activeExperimentId, idempotentCsv);
    assert.equal(firstRes.imported_count, 2);
    assert.equal(firstRes.duplicate_count, 0);

    const impressionsBefore = firstRes.updated_experiment.variants[0].observations.impressions;

    // Second import with identical data
    const secondRes = await ABStudioService.executeCsvImport(userA, activeExperimentId, idempotentCsv);
    assert.equal(secondRes.imported_count, 0);
    assert.equal(secondRes.duplicate_count, 2);
    assert.equal(secondRes.skipped_count, 2);

    // Cumulative observations must NOT double count
    const impressionsAfter = secondRes.updated_experiment.variants[0].observations.impressions;
    assert.equal(impressionsAfter, impressionsBefore);
  });

  it('6. In-batch deduplication skips identical records within the same CSV file', async () => {
    const inBatchDuplicateCsv = [
      'variant,impressions,clicks,date',
      'A,300,15,2026-03-06T08:00:00.000Z',
      'A,300,15,2026-03-06T08:00:00.000Z', // identical row in same batch
    ].join('\n');

    const preview = await ABStudioService.previewCsvImport(userA, activeExperimentId, inBatchDuplicateCsv);
    assert.equal(preview.total_rows, 2);
    assert.equal(preview.valid_rows_count, 1);
    assert.equal(preview.duplicate_rows_count, 1);

    const exec = await ABStudioService.executeCsvImport(userA, activeExperimentId, inBatchDuplicateCsv);
    assert.equal(exec.imported_count, 1);
    assert.equal(exec.duplicate_count, 1);
  });

  it('7. Partial import failures: valid rows succeed while invalid rows are rejected with row errors', async () => {
    const mixedCsv = [
      'variant,impressions,clicks,date',
      'A,400,20,2026-03-07T00:00:00.000Z', // Valid
      'B,100,500,2026-03-07T00:00:00.000Z', // Invalid: clicks > impressions
      'B,400,30,2026-03-07T00:00:00.000Z', // Valid
    ].join('\n');

    const exec = await ABStudioService.executeCsvImport(userA, activeExperimentId, mixedCsv);
    assert.equal(exec.total_rows, 3);
    assert.equal(exec.imported_count, 2);
    assert.equal(exec.rejected_count, 1);
    assert.equal(exec.row_errors.length, 1);
    assert.equal(exec.row_errors[0].row_number, 3);
    assert.ok(exec.row_errors[0].error.includes('cannot exceed exposures'));
  });

  it('8. Tenant isolation: unauthorized user cannot preview or import into another user experiment', async () => {
    const csv = 'variant,impressions,clicks\nA,100,5';

    // User B tries to preview User A's experiment
    await assert.rejects(
      async () => {
        await ABStudioService.previewCsvImport(userB, activeExperimentId, csv);
      },
      (err: any) => {
        assert.equal(err.code, 'EXPERIMENT_NOT_FOUND');
        return true;
      }
    );

    // User B tries to execute import on User A's experiment
    await assert.rejects(
      async () => {
        await ABStudioService.executeCsvImport(userB, activeExperimentId, csv);
      },
      (err: any) => {
        assert.equal(err.code, 'EXPERIMENT_NOT_FOUND');
        return true;
      }
    );
  });

  it('9. File size limits (2MB) and row count limits (2000 rows) are strictly enforced', async () => {
    // Generate oversized content > 2MB (300,000 * 8 bytes = 2.4 MB)
    const bigContent = 'variant,impressions,clicks\n' + 'A,100,5\n'.repeat(300000);
    await assert.rejects(
      async () => {
        await ABStudioService.previewCsvImport(userA, activeExperimentId, bigContent);
      },
      (err: any) => {
        assert.equal(err.code, 'FILE_TOO_LARGE');
        return true;
      }
    );

    // Generate row count > 2000 rows
    const manyRowsContent = 'variant,impressions,clicks\n' + 'A,100,5\n'.repeat(2500);
    await assert.rejects(
      async () => {
        await ABStudioService.previewCsvImport(userA, activeExperimentId, manyRowsContent);
      },
      (err: any) => {
        assert.equal(err.code, 'ROW_LIMIT_EXCEEDED');
        return true;
      }
    );
  });

  it('10. CSV Formula Injection defense: cells starting with =, +, -, @ are sanitized', async () => {
    const injectionCsv = [
      'variant,impressions,clicks,source',
      'A,500,25,"=cmd|\' /C calc\'!A0"',
      'B,500,35,"=HYPERLINK(""http://attacker.com"")"',
    ].join('\n');

    const preview = await ABStudioService.previewCsvImport(userA, activeExperimentId, injectionCsv);
    assert.equal(preview.valid_rows_count, 2);

    // Ensure leading formula characters are stripped / sanitized
    const row1Source = preview.sample_preview[0].source_label;
    assert.ok(!row1Source?.startsWith('='));
    assert.ok(!row1Source?.startsWith('+'));
    assert.ok(!row1Source?.startsWith('-'));
    assert.ok(!row1Source?.startsWith('@'));
  });

  it('11. Statistical report dynamically recalculates after CSV import and tracks CSV_IMPORT provenance', async () => {
    const reportBefore = await ABStudioService.getExperimentReport(userA, activeExperimentId);
    const exposuresBefore = reportBefore.total_exposures;

    const freshCsv = [
      'variant,impressions,clicks,date',
      'A,5000,250,2026-03-08T00:00:00.000Z',
      'B,5000,450,2026-03-08T00:00:00.000Z',
    ].join('\n');

    const res = await ABStudioService.executeCsvImport(userA, activeExperimentId, freshCsv);
    assert.equal(res.imported_count, 2);

    const reportAfter = await ABStudioService.getExperimentReport(userA, activeExperimentId);
    assert.equal(reportAfter.total_exposures, exposuresBefore + 10000);
    assert.ok(reportAfter.provenance_breakdown['CSV_IMPORT'] > 0);
  });

  it('12. Draft experiments cannot record observations; draft state is preserved', async () => {
    const testCsv = 'variant,impressions,clicks\nA,1000,50\nB,1000,70';

    // Preview on DRAFT experiment should succeed with warning and can_import = false
    const preview = await ABStudioService.previewCsvImport(userA, draftExperimentId, testCsv);
    assert.equal(preview.can_import, false);
    assert.ok(preview.validation_errors.some((e) => e.includes('DRAFT')));

    // Attempting to execute import on DRAFT experiment must reject with 409 EXPERIMENT_NOT_ACTIVE
    await assert.rejects(
      async () => {
        await ABStudioService.executeCsvImport(userA, draftExperimentId, testCsv);
      },
      (err: any) => {
        assert.equal(err.code, 'EXPERIMENT_NOT_ACTIVE');
        return true;
      }
    );

    // Verify draft experiment remains in DRAFT status
    const draftExp = await ABStudioService.getExperiment(userA, draftExperimentId);
    assert.equal(draftExp.status, 'DRAFT');
    assert.equal(draftExp.variants[0].observations.impressions, 0);
  });

  it('13. CSV import never automatically promotes a variant or triggers external publishing', async () => {
    // Large powered data that meets statistical significance
    const poweredCsv = [
      'variant,impressions,clicks,date',
      'A,10000,500,2026-03-09T00:00:00.000Z',
      'B,10000,900,2026-03-09T00:00:00.000Z',
    ].join('\n');

    const res = await ABStudioService.executeCsvImport(userA, activeExperimentId, poweredCsv);
    assert.equal(res.imported_count, 2);

    // The experiment must remain ACTIVE (not auto-concluded or auto-promoted)
    assert.equal(res.updated_experiment.status, 'ACTIVE');
    assert.equal(res.updated_experiment.promoted_to_clip, false);
    assert.ok(!res.updated_experiment.winning_variant_id);

    // Clip in database must NOT be changed
    await ownerContext.run(userA, async () => {
      const { data: clipRec } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', clipAId)
        .eq('user_id', userA)
        .single();
      assert.equal((clipRec as any).title, 'Phase 33 Test Clip');
    });
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});


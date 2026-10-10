/**
 * VIREO PHASE 33 — A/B STUDIO CSV ANALYTICS IMPORT SERVICE
 * Handles RFC-4180 parsing, column auto-mapping, row-level validation,
 * SHA-256 deduplication, formula injection protection, and statistical re-evaluation.
 */

import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { ABStatisticalEngine } from './abStatisticalEngine.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  ABExperiment,
  ABVariant,
  ABObservationLog,
  ABCsvColumnMapping,
  ABCsvRowPreview,
  ABCsvPreviewResult,
  ABCsvImportResult,
} from '../../types/index.js';

const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB limit
const MAX_ROW_COUNT = 2000; // Limit processing to prevent resource exhaustion

export class ABCsvImportService {
  /**
   * Neutralizes formula injection characters (=, +, -, @, \t, \r) from text cells.
   */
  public static sanitizeCell(val: string): string {
    if (!val) return '';
    let str = val.trim();
    // Neutralize spreadsheet formula triggers, but preserve numeric signs (e.g. -500, +25)
    if (/^[=+\-@\t\r]/.test(str)) {
      if (/^[+\-]\d/.test(str)) {
        return str;
      }
      str = str.replace(/^[=+\-@\t\r]+/, '');
    }
    return str.trim();
  }

  /**
   * RFC-4180 compliant CSV parser that supports multiline values, escaped quotes,
   * BOM stripping, and delimiter detection (, ; \t).
   */
  public static parseCsv(csvContent: string): { headers: string[]; rows: string[][] } {
    if (!csvContent || typeof csvContent !== 'string') {
      throw new AppError('CSV content is required and must be text.', 400, 'EMPTY_CSV');
    }

    if (csvContent.length > MAX_CSV_SIZE_BYTES) {
      throw new AppError(
        `CSV content exceeds maximum allowed size of 2MB (${(csvContent.length / 1024 / 1024).toFixed(2)}MB).`,
        400,
        'FILE_TOO_LARGE'
      );
    }

    // Strip UTF-8 BOM if present
    const cleanContent = csvContent.replace(/^\uFEFF/, '');
    if (!cleanContent.trim()) {
      throw new AppError('CSV file is empty.', 400, 'EMPTY_CSV');
    }

    // Detect delimiter from first non-empty line
    const firstLine = cleanContent.split(/\r\n|\n|\r/)[0] || '';
    let delimiter = ',';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    if (semicolonCount > commaCount && semicolonCount > tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semicolonCount) {
      delimiter = '\t';
    }

    // Robust tokenization conforming to RFC 4180
    const records: string[][] = [];
    let currentRecord: string[] = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;

    while (i < cleanContent.length) {
      const char = cleanContent[i];
      const nextChar = cleanContent[i + 1];

      if (insideQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote: "" -> "
            currentField += '"';
            i += 2;
            continue;
          } else {
            // Closing quote
            insideQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += char;
          i++;
          continue;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
          i++;
          continue;
        } else if (char === delimiter) {
          currentRecord.push(currentField);
          currentField = '';
          i++;
          continue;
        } else if (char === '\r') {
          if (nextChar === '\n') {
            i++; // skip \n of \r\n
          }
          currentRecord.push(currentField);
          records.push(currentRecord);
          currentRecord = [];
          currentField = '';
          i++;
          continue;
        } else if (char === '\n') {
          currentRecord.push(currentField);
          records.push(currentRecord);
          currentRecord = [];
          currentField = '';
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      }
    }

    // Push trailing record if any
    if (currentField.length > 0 || currentRecord.length > 0) {
      currentRecord.push(currentField);
      records.push(currentRecord);
    }

    // Filter out completely blank lines
    const nonEmptyRecords = records.filter(
      (rec) => rec.length > 0 && rec.some((cell) => cell.trim().length > 0)
    );

    if (nonEmptyRecords.length === 0) {
      throw new AppError('CSV does not contain any valid records.', 400, 'EMPTY_CSV');
    }

    if (nonEmptyRecords.length === 1) {
      throw new AppError(
        'CSV must contain at least one header row and one data row.',
        400,
        'INSUFFICIENT_CSV_ROWS'
      );
    }

    if (nonEmptyRecords.length - 1 > MAX_ROW_COUNT) {
      throw new AppError(
        `CSV exceeds maximum limit of ${MAX_ROW_COUNT} rows (${nonEmptyRecords.length - 1} rows provided).`,
        400,
        'ROW_LIMIT_EXCEEDED'
      );
    }

    const rawHeaders = nonEmptyRecords[0].map((h) => this.sanitizeCell(h));
    const dataRows = nonEmptyRecords.slice(1);

    return {
      headers: rawHeaders,
      rows: dataRows,
    };
  }

  /**
   * Auto-detects standard platform column names for variant, exposures, conversions, timestamps, etc.
   */
  public static detectColumnMapping(
    headers: string[],
    userMapping?: Partial<ABCsvColumnMapping>
  ): ABCsvColumnMapping {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    const normalizedHeaders = headers.map((h) => ({
      original: h,
      norm: normalize(h),
    }));

    const findMatch = (candidates: string[]): string | undefined => {
      for (const cand of candidates) {
        const found = normalizedHeaders.find((nh) => nh.norm === cand || nh.norm.includes(cand));
        if (found) return found.original;
      }
      return undefined;
    };

    // Candidate keywords for auto-detection
    const variantCandidates = [
      'variantletter',
      'variantid',
      'variantname',
      'varianttag',
      'variant',
      'arm',
      'version',
      'creative',
      'option',
      'letter',
    ];
    const exposuresCandidates = [
      'exposures',
      'impressions',
      'views',
      'samplesize',
      'traffic',
      'totalexposures',
      'impressionscount',
      'viewscount',
    ];
    const conversionsCandidates = [
      'conversions',
      'clicks',
      'completions',
      'engagements',
      'actions',
      'goals',
      'conversionscount',
      'clickscount',
      'events',
    ];
    const timestampCandidates = [
      'date',
      'timestamp',
      'periodstart',
      'starttime',
      'startdate',
      'datetime',
      'time',
      'createdat',
    ];
    const periodEndCandidates = ['periodend', 'endtime', 'enddate', 'until'];
    const sourceCandidates = ['source', 'sourcelabel', 'platform', 'channel', 'notes'];

    const detectedVariant =
      userMapping?.variant_column || findMatch(variantCandidates) || headers[0] || '';
    const detectedExposures =
      userMapping?.exposures_column ||
      findMatch(exposuresCandidates) ||
      headers.find((h) => h !== detectedVariant) ||
      '';
    const detectedConversions =
      userMapping?.conversions_column ||
      findMatch(conversionsCandidates) ||
      headers.find((h) => h !== detectedVariant && h !== detectedExposures) ||
      '';
    const detectedTimestamp = userMapping?.timestamp_column || findMatch(timestampCandidates);
    const detectedPeriodEnd = userMapping?.period_end_column || findMatch(periodEndCandidates);
    const detectedSource = userMapping?.source_column || findMatch(sourceCandidates);

    return {
      variant_column: detectedVariant,
      exposures_column: detectedExposures,
      conversions_column: detectedConversions,
      timestamp_column: detectedTimestamp,
      period_end_column: detectedPeriodEnd,
      source_column: detectedSource,
    };
  }

  /**
   * Resolves a raw variant cell value to an experiment variant.
   */
  public static resolveVariant(
    rawVal: string,
    variants: ABVariant[]
  ): ABVariant | null {
    if (!rawVal) return null;
    const clean = rawVal.trim().toUpperCase();

    // 1. Direct letter match ('A', 'B', 'C', 'D')
    const letterMatch = variants.find((v) => v.variant_letter === clean);
    if (letterMatch) return letterMatch;

    // 2. Exact or substring match for "Variant A", "Variant B"
    const variantPrefixMatch = variants.find(
      (v) =>
        clean === `VARIANT ${v.variant_letter}` ||
        clean === `VARIANT_${v.variant_letter}` ||
        clean === `V${v.variant_letter}`
    );
    if (variantPrefixMatch) return variantPrefixMatch;

    // 3. Match by UUID variant_id
    const idMatch = variants.find((v) => v.id.toLowerCase() === rawVal.trim().toLowerCase());
    if (idMatch) return idMatch;

    // 4. Case-insensitive name match
    const nameMatch = variants.find(
      (v) => v.name.trim().toLowerCase() === rawVal.trim().toLowerCase()
    );
    if (nameMatch) return nameMatch;

    // 5. Control keyword match
    if (clean === 'CONTROL' || clean === 'CONTROL VARIANT') {
      const ctrl = variants.find((v) => v.is_control);
      if (ctrl) return ctrl;
    }

    return null;
  }

  /**
   * Generates a stable SHA-256 deduplication key for an observation row.
   */
  public static computeIdempotencyKey(
    userId: string,
    experimentId: string,
    variantId: string,
    periodStart: string,
    periodEnd: string,
    exposures: number,
    conversions: number
  ): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${experimentId}:${variantId}:${periodStart}:${periodEnd}:${exposures}:${conversions}`)
      .digest('hex');
  }

  /**
   * Previews CSV import: parses, maps columns, dry-run validates every row,
   * detects duplicates, and summarizes variant data.
   */
  public static async previewImport(
    userId: string,
    experimentId: string,
    csvContent: string,
    userMapping?: Partial<ABCsvColumnMapping>
  ): Promise<ABCsvPreviewResult> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!experimentId) throw new AppError('Experiment ID is required.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      // 1. Fetch experiment and verify tenant ownership
      const { data: expData, error: expErr } = await dataRepository
        .from('ab_experiments')
        .select('*')
        .eq('id', experimentId)
        .eq('user_id', userId)
        .single();

      if (expErr || !expData) {
        throw new AppError('Experiment not found or access denied.', 404, 'EXPERIMENT_NOT_FOUND');
      }

      const experiment = expData as ABExperiment;

      // 2. Parse CSV
      const { headers, rows } = this.parseCsv(csvContent);
      const mapping = this.detectColumnMapping(headers, userMapping);

      const validationErrors: string[] = [];
      if (!mapping.variant_column || !headers.includes(mapping.variant_column)) {
        validationErrors.push('Missing required column mapping for Variant Identifier.');
      }
      if (!mapping.exposures_column || !headers.includes(mapping.exposures_column)) {
        validationErrors.push('Missing required column mapping for Exposures (Impressions/Views).');
      }
      if (!mapping.conversions_column || !headers.includes(mapping.conversions_column)) {
        validationErrors.push('Missing required column mapping for Conversions (Clicks/Completions).');
      }

      const varColIdx = headers.indexOf(mapping.variant_column);
      const expColIdx = headers.indexOf(mapping.exposures_column);
      const convColIdx = headers.indexOf(mapping.conversions_column);
      const timeColIdx = mapping.timestamp_column ? headers.indexOf(mapping.timestamp_column) : -1;
      const endColIdx = mapping.period_end_column ? headers.indexOf(mapping.period_end_column) : -1;
      const srcColIdx = mapping.source_column ? headers.indexOf(mapping.source_column) : -1;

      // 3. Preload existing idempotency keys for this experiment to detect duplicates
      const { data: existingLogs } = await dataRepository
        .from('ab_observation_logs')
        .select('idempotency_key')
        .eq('experiment_id', experimentId)
        .eq('user_id', userId);

      const existingKeysSet = new Set<string>(
        (existingLogs || []).map((l: any) => l.idempotency_key).filter(Boolean)
      );

      const inBatchKeysSet = new Set<string>();

      const previewRows: ABCsvRowPreview[] = [];
      let validCount = 0;
      let invalidCount = 0;
      let duplicateCount = 0;

      const variantAggregates = new Map<
        string,
        { exposures: number; conversions: number; rows: number }
      >();
      for (const v of experiment.variants) {
        variantAggregates.set(v.id, { exposures: 0, conversions: 0, rows: 0 });
      }

      const nowIso = new Date().toISOString();

      // 4. Validate each row
      rows.forEach((rowCells, idx) => {
        const rowNumber = idx + 2; // 1-based index, account for header
        const rawRowObj: Record<string, string> = {};
        headers.forEach((h, hIdx) => {
          rawRowObj[h] = rowCells[hIdx] !== undefined ? rowCells[hIdx] : '';
        });

        const rawVariant = varColIdx >= 0 ? this.sanitizeCell(rowCells[varColIdx] || '') : '';
        const rawExposures = expColIdx >= 0 ? this.sanitizeCell(rowCells[expColIdx] || '') : '';
        const rawConversions = convColIdx >= 0 ? this.sanitizeCell(rowCells[convColIdx] || '') : '';
        const rawTime = timeColIdx >= 0 ? this.sanitizeCell(rowCells[timeColIdx] || '') : '';
        const rawEnd = endColIdx >= 0 ? this.sanitizeCell(rowCells[endColIdx] || '') : '';
        const rawSource = srcColIdx >= 0 ? this.sanitizeCell(rowCells[srcColIdx] || '') : 'CSV_IMPORT';

        // Variant resolution
        const matchedVariant = this.resolveVariant(rawVariant, experiment.variants);
        if (!matchedVariant) {
          invalidCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'INVALID',
            error: rawVariant
              ? `Unknown variant identifier: "${rawVariant}". Must match one of: ${experiment.variants
                  .map((v) => `${v.variant_letter} (${v.name})`)
                  .join(', ')}.`
              : 'Missing variant identifier.',
          });
          return;
        }

        // Exposures (denominator) check
        if (rawExposures === '' || rawExposures === null || rawExposures === undefined) {
          invalidCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'INVALID',
            error: 'Missing exposures value. Missing values are not treated as zeros.',
          });
          return;
        }

        const exposuresNum = Number(rawExposures);
        if (!Number.isFinite(exposuresNum) || isNaN(exposuresNum) || exposuresNum <= 0) {
          invalidCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'INVALID',
            error: `Exposures must be a positive integer greater than zero (received "${rawExposures}").`,
          });
          return;
        }

        // Conversions (numerator) check
        if (rawConversions === '' || rawConversions === null || rawConversions === undefined) {
          invalidCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'INVALID',
            error: 'Missing conversions value. Missing values are not treated as zeros.',
          });
          return;
        }

        const conversionsNum = Number(rawConversions);
        if (!Number.isFinite(conversionsNum) || isNaN(conversionsNum) || conversionsNum < 0) {
          invalidCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'INVALID',
            error: `Conversions must be a non-negative integer (received "${rawConversions}").`,
          });
          return;
        }

        if (conversionsNum > exposuresNum) {
          invalidCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'INVALID',
            error: `Conversions (${conversionsNum}) cannot exceed exposures (${exposuresNum}).`,
          });
          return;
        }

        // Timestamp validation
        let periodStart = nowIso;
        if (rawTime) {
          const parsedDate = new Date(rawTime);
          if (isNaN(parsedDate.getTime())) {
            invalidCount++;
            previewRows.push({
              row_number: rowNumber,
              raw_data: rawRowObj,
              status: 'INVALID',
              error: `Invalid date/timestamp format: "${rawTime}".`,
            });
            return;
          }
          periodStart = parsedDate.toISOString();
        }

        let periodEnd = periodStart;
        if (rawEnd) {
          const parsedEnd = new Date(rawEnd);
          if (isNaN(parsedEnd.getTime())) {
            invalidCount++;
            previewRows.push({
              row_number: rowNumber,
              raw_data: rawRowObj,
              status: 'INVALID',
              error: `Invalid period end timestamp: "${rawEnd}".`,
            });
            return;
          }
          periodEnd = parsedEnd.toISOString();
        }

        const exposuresInt = Math.floor(exposuresNum);
        const conversionsInt = Math.floor(conversionsNum);

        // Deduplication key
        const idempKey = this.computeIdempotencyKey(
          userId,
          experimentId,
          matchedVariant.id,
          periodStart,
          periodEnd,
          exposuresInt,
          conversionsInt
        );

        if (existingKeysSet.has(idempKey) || inBatchKeysSet.has(idempKey)) {
          duplicateCount++;
          previewRows.push({
            row_number: rowNumber,
            raw_data: rawRowObj,
            status: 'DUPLICATE',
            variant_letter: matchedVariant.variant_letter,
            variant_id: matchedVariant.id,
            variant_name: matchedVariant.name,
            exposures: exposuresInt,
            conversions: conversionsInt,
            period_start: periodStart,
            period_end: periodEnd,
            source_label: rawSource,
            error: 'Duplicate observation detected. This row will be skipped to prevent double-counting.',
          });
          return;
        }

        inBatchKeysSet.add(idempKey);
        validCount++;

        // Accumulate valid preview totals
        const agg = variantAggregates.get(matchedVariant.id);
        if (agg) {
          agg.exposures += exposuresInt;
          agg.conversions += conversionsInt;
          agg.rows += 1;
        }

        previewRows.push({
          row_number: rowNumber,
          raw_data: rawRowObj,
          status: 'VALID',
          variant_letter: matchedVariant.variant_letter,
          variant_id: matchedVariant.id,
          variant_name: matchedVariant.name,
          exposures: exposuresInt,
          conversions: conversionsInt,
          period_start: periodStart,
          period_end: periodEnd,
          source_label: rawSource,
        });
      });

      // Status check warning
      if (experiment.status === 'DRAFT') {
        validationErrors.push(
          'Experiment is currently in DRAFT status. Observations can only be recorded for ACTIVE experiments. You must start the experiment before importing.'
        );
      } else if (experiment.status === 'CONCLUDED' || experiment.status === 'CANCELLED') {
        validationErrors.push(
          `Experiment is in terminal status "${experiment.status}". No new observations can be imported.`
        );
      }

      const variantSummary = experiment.variants.map((v) => {
        const agg = variantAggregates.get(v.id) || { exposures: 0, conversions: 0, rows: 0 };
        return {
          variant_id: v.id,
          variant_letter: v.variant_letter,
          name: v.name,
          valid_rows: agg.rows,
          total_exposures: agg.exposures,
          total_conversions: agg.conversions,
        };
      });

      const canImport =
        experiment.status === 'ACTIVE' &&
        validCount > 0 &&
        validationErrors.filter((e) => !e.includes('DRAFT')).length === 0;

      return {
        experiment_id: experiment.id,
        experiment_name: experiment.name,
        experiment_status: experiment.status,
        headers,
        detected_mapping: mapping,
        total_rows: rows.length,
        valid_rows_count: validCount,
        invalid_rows_count: invalidCount,
        duplicate_rows_count: duplicateCount,
        sample_preview: previewRows.slice(0, 30), // first 30 rows for visual inspection
        variant_summary: variantSummary,
        can_import: canImport,
        validation_errors: validationErrors,
      };
    });
  }

  /**
   * Executes CSV import: ingests valid observation batches with 'CSV_IMPORT' provenance,
   * skips duplicates idempotently, updates cumulative variant stats, and re-evaluates statistics.
   */
  public static async executeImport(
    userId: string,
    experimentId: string,
    csvContent: string,
    userMapping?: Partial<ABCsvColumnMapping>
  ): Promise<ABCsvImportResult> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!experimentId) throw new AppError('Experiment ID is required.', 400, 'INVALID_UUID');

    return await ownerContext.run(userId, async () => {
      // 1. Fetch experiment and verify tenant ownership
      const { data: expData, error: expErr } = await dataRepository
        .from('ab_experiments')
        .select('*')
        .eq('id', experimentId)
        .eq('user_id', userId)
        .single();

      if (expErr || !expData) {
        throw new AppError('Experiment not found or access denied.', 404, 'EXPERIMENT_NOT_FOUND');
      }

      const experiment = expData as ABExperiment;

      // Ensure experiment is active
      if (experiment.status !== 'ACTIVE') {
        throw new AppError(
          `Observations can only be recorded for ACTIVE experiments (current status: ${experiment.status}). Draft experiments must be explicitly started by the creator first.`,
          409,
          'EXPERIMENT_NOT_ACTIVE'
        );
      }

      // 2. Parse and map CSV
      const { headers, rows } = this.parseCsv(csvContent);
      const mapping = this.detectColumnMapping(headers, userMapping);

      const varColIdx = headers.indexOf(mapping.variant_column);
      const expColIdx = headers.indexOf(mapping.exposures_column);
      const convColIdx = headers.indexOf(mapping.conversions_column);
      const timeColIdx = mapping.timestamp_column ? headers.indexOf(mapping.timestamp_column) : -1;
      const endColIdx = mapping.period_end_column ? headers.indexOf(mapping.period_end_column) : -1;
      const srcColIdx = mapping.source_column ? headers.indexOf(mapping.source_column) : -1;

      if (varColIdx < 0 || expColIdx < 0 || convColIdx < 0) {
        throw new AppError(
          'Missing required columns in CSV (variant, exposures, conversions).',
          400,
          'INVALID_CSV_HEADERS'
        );
      }

      // 3. Preload existing idempotency keys
      const { data: existingLogs } = await dataRepository
        .from('ab_observation_logs')
        .select('idempotency_key')
        .eq('experiment_id', experimentId)
        .eq('user_id', userId);

      const existingKeysSet = new Set<string>(
        (existingLogs || []).map((l: any) => l.idempotency_key).filter(Boolean)
      );

      const inBatchKeysSet = new Set<string>();

      let importedCount = 0;
      let duplicateCount = 0;
      let rejectedCount = 0;
      const rowErrors: Array<{ row_number: number; error: string; raw_data?: Record<string, string> }> = [];

      const newLogsToInsert: ABObservationLog[] = [];
      const deltaByVariantId = new Map<string, { exposures: number; conversions: number }>();
      for (const v of experiment.variants) {
        deltaByVariantId.set(v.id, { exposures: 0, conversions: 0 });
      }

      const nowIso = new Date().toISOString();

      // 4. Validate and construct logs
      rows.forEach((rowCells, idx) => {
        const rowNumber = idx + 2;
        const rawRowObj: Record<string, string> = {};
        headers.forEach((h, hIdx) => {
          rawRowObj[h] = rowCells[hIdx] !== undefined ? rowCells[hIdx] : '';
        });

        const rawVariant = this.sanitizeCell(rowCells[varColIdx] || '');
        const rawExposures = this.sanitizeCell(rowCells[expColIdx] || '');
        const rawConversions = this.sanitizeCell(rowCells[convColIdx] || '');
        const rawTime = timeColIdx >= 0 ? this.sanitizeCell(rowCells[timeColIdx] || '') : '';
        const rawEnd = endColIdx >= 0 ? this.sanitizeCell(rowCells[endColIdx] || '') : '';
        const rawSource = srcColIdx >= 0 ? this.sanitizeCell(rowCells[srcColIdx] || '') : 'CSV_IMPORT';

        const matchedVariant = this.resolveVariant(rawVariant, experiment.variants);
        if (!matchedVariant) {
          rejectedCount++;
          rowErrors.push({
            row_number: rowNumber,
            error: `Unknown variant identifier "${rawVariant}".`,
            raw_data: rawRowObj,
          });
          return;
        }

        const exposuresNum = Number(rawExposures);
        if (!Number.isFinite(exposuresNum) || isNaN(exposuresNum) || exposuresNum <= 0) {
          rejectedCount++;
          rowErrors.push({
            row_number: rowNumber,
            error: `Exposures must be a positive integer greater than zero (received "${rawExposures}").`,
            raw_data: rawRowObj,
          });
          return;
        }

        const conversionsNum = Number(rawConversions);
        if (!Number.isFinite(conversionsNum) || isNaN(conversionsNum) || conversionsNum < 0) {
          rejectedCount++;
          rowErrors.push({
            row_number: rowNumber,
            error: `Conversions must be a non-negative integer (received "${rawConversions}").`,
            raw_data: rawRowObj,
          });
          return;
        }

        if (conversionsNum > exposuresNum) {
          rejectedCount++;
          rowErrors.push({
            row_number: rowNumber,
            error: `Conversions (${conversionsNum}) cannot exceed exposures (${exposuresNum}).`,
            raw_data: rawRowObj,
          });
          return;
        }

        let periodStart = nowIso;
        if (rawTime) {
          const parsed = new Date(rawTime);
          if (isNaN(parsed.getTime())) {
            rejectedCount++;
            rowErrors.push({
              row_number: rowNumber,
              error: `Invalid date format "${rawTime}".`,
              raw_data: rawRowObj,
            });
            return;
          }
          periodStart = parsed.toISOString();
        }

        let periodEnd = periodStart;
        if (rawEnd) {
          const parsedEnd = new Date(rawEnd);
          if (isNaN(parsedEnd.getTime())) {
            rejectedCount++;
            rowErrors.push({
              row_number: rowNumber,
              error: `Invalid period end date format "${rawEnd}".`,
              raw_data: rawRowObj,
            });
            return;
          }
          periodEnd = parsedEnd.toISOString();
        }

        const exposuresInt = Math.floor(exposuresNum);
        const conversionsInt = Math.floor(conversionsNum);

        const idempKey = this.computeIdempotencyKey(
          userId,
          experimentId,
          matchedVariant.id,
          periodStart,
          periodEnd,
          exposuresInt,
          conversionsInt
        );

        if (existingKeysSet.has(idempKey) || inBatchKeysSet.has(idempKey)) {
          duplicateCount++;
          return;
        }

        inBatchKeysSet.add(idempKey);
        importedCount++;

        const delta = deltaByVariantId.get(matchedVariant.id);
        if (delta) {
          delta.exposures += exposuresInt;
          delta.conversions += conversionsInt;
        }

        newLogsToInsert.push({
          id: crypto.randomUUID(),
          experiment_id: experimentId,
          variant_id: matchedVariant.id,
          user_id: userId,
          data_provenance: 'CSV_IMPORT',
          metric_type: experiment.target_metric,
          exposures: exposuresInt,
          conversions: conversionsInt,
          source_label: rawSource || 'CSV_IMPORT',
          period_start: periodStart,
          period_end: periodEnd,
          idempotency_key: idempKey,
          created_at: nowIso,
        });
      });

      // 5. If any valid logs exist, persist them and update cumulative metrics
      let updatedExperiment = experiment;
      if (newLogsToInsert.length > 0) {
        // Insert logs
        await dataRepository.from('ab_observation_logs').insert(newLogsToInsert);

        // Update cumulative observations on variants
        const updatedVariants = experiment.variants.map((v) => {
          const delta = deltaByVariantId.get(v.id) || { exposures: 0, conversions: 0 };
          if (delta.exposures === 0 && delta.conversions === 0) {
            return v;
          }

          const isViewMetric =
            experiment.target_metric === 'RETENTION_RATE' ||
            experiment.target_metric === 'ENGAGEMENT_RATE';

          const newImpressions = isViewMetric
            ? v.observations.impressions
            : v.observations.impressions + delta.exposures;
          const newViews = isViewMetric
            ? v.observations.views + delta.exposures
            : v.observations.views;
          const newConversions = v.observations.conversions + delta.conversions;
          const denom = isViewMetric ? newViews : newImpressions;
          const newRate = denom > 0 ? Number((newConversions / denom).toFixed(6)) : 0;

          return {
            ...v,
            observations: {
              impressions: newImpressions,
              conversions: newConversions,
              views: newViews,
              rate: newRate,
              data_provenance: 'CSV_IMPORT' as const,
              last_observation_at: nowIso,
            },
          };
        });

        // Evaluate updated statistical metrics
        const evalResult = ABStatisticalEngine.evaluateExperiment({
          variants: updatedVariants,
          requiredSampleSize: experiment.minimum_sample_size,
          confidenceThreshold: experiment.confidence_threshold,
          minPracticalLift: experiment.minimum_practical_lift,
        });

        // Persist updated experiment in DB
        const { data: savedExp, error: updateErr } = await dataRepository
          .from('ab_experiments')
          .update({
            variants: evalResult.variants,
            updated_at: nowIso,
          })
          .eq('id', experimentId)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (updateErr || !savedExp) {
          throw new AppError(
            `Failed to update experiment with imported observations: ${updateErr?.message || 'DB_ERROR'}`,
            500,
            'DB_ERROR'
          );
        }

        updatedExperiment = {
          ...(savedExp as ABExperiment),
          variants: evalResult.variants,
          winner_declaration_rationale:
            (savedExp as ABExperiment).winner_declaration_rationale || evalResult.decisionRationale,
        };

        logger.info('CSV Analytics imported successfully', {
          experimentId,
          userId,
          importedCount,
          duplicateCount,
          rejectedCount,
        });
      }

      const summary = `CSV Import complete: ${importedCount} rows imported, ${duplicateCount} duplicate rows skipped, ${rejectedCount} invalid rows rejected.`;

      return {
        experiment_id: experimentId,
        total_rows: rows.length,
        imported_count: importedCount,
        duplicate_count: duplicateCount,
        rejected_count: rejectedCount,
        skipped_count: duplicateCount,
        row_errors: rowErrors,
        updated_experiment: updatedExperiment,
        summary,
      };
    });
  }
}

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  ArrowRight,
  Database,
  Info,
  FileText,
} from 'lucide-react';
import {
  ABExperiment,
  ABCsvColumnMapping,
  ABCsvPreviewResult,
  ABCsvImportResult,
} from '../../types';
import { abStudioService } from '../../services/abStudioService';

export interface ABCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Experiment currently targeted; if null, user can select from available experiments */
  experiment: ABExperiment | null;
  /** Available user experiments for selection if experiment is null */
  availableExperiments?: ABExperiment[];
  onImportSuccess?: (result: ABCsvImportResult) => void;
}

export const ABCsvImportModal: React.FC<ABCsvImportModalProps> = ({
  isOpen,
  onClose,
  experiment: propExperiment,
  availableExperiments = [],
  onImportSuccess,
}) => {
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>(
    propExperiment ? propExperiment.id : ''
  );
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [inputMode, setInputMode] = useState<'FILE' | 'PASTE'>('FILE');

  // Preview state
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<ABCsvPreviewResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Partial<ABCsvColumnMapping>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Execution state
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ABCsvImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentExperiment =
    propExperiment ||
    availableExperiments.find((e) => e.id === selectedExperimentId) ||
    null;

  useEffect(() => {
    if (propExperiment) {
      setSelectedExperimentId(propExperiment.id);
    } else if (availableExperiments.length > 0 && !selectedExperimentId) {
      const active = availableExperiments.find((e) => e.status === 'ACTIVE');
      setSelectedExperimentId(active ? active.id : availableExperiments[0].id);
    }
  }, [propExperiment, availableExperiments, selectedExperimentId]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setImportResult(null);
      setImportError(null);
      setPreviewError(null);
    }
  }, [isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setPreviewError('Please select a valid .csv file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPreviewError('File exceeds maximum size of 2MB.');
      return;
    }

    setFileName(file.name);
    setPreviewError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      runPreview(text, {});
    };
    reader.onerror = () => {
      setPreviewError('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handlePasteChange = (text: string) => {
    setCsvContent(text);
    setFileName('Pasted CSV Content');
    if (text.trim().length > 0) {
      runPreview(text, columnMapping);
    } else {
      setPreviewData(null);
    }
  };

  const runPreview = async (
    contentToPreview: string,
    mappingToUse: Partial<ABCsvColumnMapping>
  ) => {
    if (!selectedExperimentId) {
      setPreviewError('Please select a target experiment first.');
      return;
    }
    if (!contentToPreview.trim()) {
      return;
    }

    try {
      setIsPreviewLoading(true);
      setPreviewError(null);
      const res = await abStudioService.previewCsvImport(
        selectedExperimentId,
        contentToPreview,
        mappingToUse
      );
      setPreviewData(res);
      setColumnMapping(res.detected_mapping);
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to preview CSV import.');
      setPreviewData(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleMappingChange = (key: keyof ABCsvColumnMapping, value: string) => {
    const updated = { ...columnMapping, [key]: value };
    setColumnMapping(updated);
    if (csvContent) {
      runPreview(csvContent, updated);
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedExperimentId || !csvContent) return;

    try {
      setIsImporting(true);
      setImportError(null);
      const res = await abStudioService.executeCsvImport(
        selectedExperimentId,
        csvContent,
        columnMapping
      );
      setImportResult(res);
      if (onImportSuccess) {
        onImportSuccess(res);
      }
    } catch (err: any) {
      setImportError(err.message || 'Failed to execute CSV import.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-950/60 border border-orange-500/30 text-orange-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                Import Analytics Observations
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400">
                  CSV Import
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Ingest real performance observations from YouTube, TikTok, or Meta exports without altering draft states or fabricating data.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Experiment Selector (if not locked to one) */}
          <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
            <label className="text-xs font-semibold text-neutral-300 block">
              Target Experiment
            </label>
            {propExperiment ? (
              <div className="flex items-center justify-between text-xs text-neutral-200 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                <span className="font-semibold text-orange-400">{propExperiment.name}</span>
                <span className="text-neutral-400">
                  Status: <strong className="text-neutral-200">{propExperiment.status}</strong> • Metric:{' '}
                  <strong className="text-neutral-200">{propExperiment.target_metric}</strong>
                </span>
              </div>
            ) : (
              <select
                value={selectedExperimentId}
                onChange={(e) => {
                  setSelectedExperimentId(e.target.value);
                  if (csvContent) {
                    runPreview(csvContent, columnMapping);
                  }
                }}
                className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
              >
                {availableExperiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.name} ({exp.status} • {exp.target_metric})
                  </option>
                ))}
              </select>
            )}

            {currentExperiment && currentExperiment.status === 'DRAFT' && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/30 text-amber-300 text-xs mt-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Notice:</strong> This experiment is currently in{' '}
                  <span className="font-mono uppercase font-bold">DRAFT</span> status. Observations
                  can only be recorded for ACTIVE experiments. You can preview validation now, but
                  you must start the experiment before importing observations.
                </div>
              </div>
            )}
          </div>

          {/* Success State */}
          {importResult && (
            <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-4">
              <div className="flex items-center gap-3 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
                <div>
                  <h3 className="font-bold text-sm text-neutral-100">
                    Import Completed Successfully
                  </h3>
                  <p className="text-xs text-emerald-300/80 mt-0.5">{importResult.summary}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800">
                  <div className="text-xs text-neutral-400">Total Rows</div>
                  <div className="text-lg font-bold text-neutral-200">{importResult.total_rows}</div>
                </div>
                <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-emerald-500/30">
                  <div className="text-xs text-emerald-400">Imported</div>
                  <div className="text-lg font-bold text-emerald-300">{importResult.imported_count}</div>
                </div>
                <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-amber-500/30">
                  <div className="text-xs text-amber-400">Duplicates Skipped</div>
                  <div className="text-lg font-bold text-amber-300">{importResult.duplicate_count}</div>
                </div>
                <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-red-500/30">
                  <div className="text-xs text-red-400">Rejected</div>
                  <div className="text-lg font-bold text-red-300">{importResult.rejected_count}</div>
                </div>
              </div>

              {importResult.row_errors.length > 0 && (
                <div className="bg-neutral-950/60 p-3 rounded-lg border border-neutral-800 space-y-1.5">
                  <div className="text-xs font-semibold text-red-400">Rejected Row Reasons:</div>
                  <ul className="text-[11px] text-neutral-400 space-y-1 max-h-28 overflow-y-auto">
                    {importResult.row_errors.map((err, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="text-neutral-500 font-mono">Row {err.row_number}:</span>
                        <span className="text-red-300">{err.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setImportResult(null);
                    setCsvContent('');
                    setFileName('');
                    setPreviewData(null);
                  }}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg transition"
                >
                  Import Another File
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Import Form (if not in completed state) */}
          {!importResult && (
            <>
              {/* Input Mode Selector */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInputMode('FILE')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      inputMode === 'FILE'
                        ? 'bg-orange-600 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload CSV File
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('PASTE')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      inputMode === 'PASTE'
                        ? 'bg-orange-600 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Paste CSV Data
                  </button>
                </div>
                {fileName && (
                  <span className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-orange-400" />
                    {fileName}
                  </span>
                )}
              </div>

              {/* Upload Dropzone or Paste Text Area */}
              {inputMode === 'FILE' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-neutral-800 hover:border-orange-500/50 hover:bg-neutral-800/30 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="p-3 bg-neutral-800 rounded-full text-neutral-400 group-hover:text-orange-400 group-hover:scale-110 transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-semibold text-neutral-200">
                    Click to select or drag and drop a CSV file
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Supports comma, semicolon, or tab-delimited exports • Max 2MB / 2,000 rows
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={csvContent}
                    onChange={(e) => handlePasteChange(e.target.value)}
                    placeholder="variant,exposures,conversions&#10;A,1000,50&#10;B,1000,75"
                    className="w-full bg-neutral-950 font-mono text-xs text-neutral-200 p-3 rounded-xl border border-neutral-800 focus:outline-none focus:border-orange-500"
                  />
                  <div className="text-[11px] text-neutral-500 flex justify-between">
                    <span>Paste raw CSV data with headers.</span>
                    <span>{csvContent.length} characters</span>
                  </div>
                </div>
              )}

              {/* Preview Error Banner */}
              {previewError && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{previewError}</span>
                </div>
              )}

              {/* Loading Indicator */}
              {isPreviewLoading && (
                <div className="p-6 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
                  Analyzing CSV and validating rows...
                </div>
              )}

              {/* Preview Result Content */}
              {previewData && !isPreviewLoading && (
                <div className="space-y-5 pt-2 border-t border-neutral-800">
                  {/* Column Mapping Section */}
                  <div className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-orange-400" />
                        Column Mapping
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        {previewData.headers.length} headers detected
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                          Variant Identifier <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={columnMapping.variant_column || ''}
                          onChange={(e) => handleMappingChange('variant_column', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                        >
                          {previewData.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                          Exposures (Denominator) <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={columnMapping.exposures_column || ''}
                          onChange={(e) => handleMappingChange('exposures_column', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                        >
                          {previewData.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                          Conversions (Numerator) <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={columnMapping.conversions_column || ''}
                          onChange={(e) => handleMappingChange('conversions_column', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                        >
                          {previewData.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-neutral-950/60 p-2.5 rounded-xl border border-neutral-800 text-center">
                      <div className="text-[11px] text-neutral-400">Total Rows</div>
                      <div className="text-base font-bold text-neutral-100">{previewData.total_rows}</div>
                    </div>
                    <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/30 text-center">
                      <div className="text-[11px] text-emerald-400">Valid Rows</div>
                      <div className="text-base font-bold text-emerald-300">
                        {previewData.valid_rows_count}
                      </div>
                    </div>
                    <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/30 text-center">
                      <div className="text-[11px] text-amber-400">Duplicates</div>
                      <div className="text-base font-bold text-amber-300">
                        {previewData.duplicate_rows_count}
                      </div>
                    </div>
                    <div className="bg-red-950/30 p-2.5 rounded-xl border border-red-500/30 text-center">
                      <div className="text-[11px] text-red-400">Invalid Rows</div>
                      <div className="text-base font-bold text-red-300">
                        {previewData.invalid_rows_count}
                      </div>
                    </div>
                  </div>

                  {/* Variant Summary Cards */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-neutral-300">
                      Variant Aggregates Preview
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {previewData.variant_summary.map((v) => {
                        const impliedCtr =
                          v.total_exposures > 0
                            ? ((v.total_conversions / v.total_exposures) * 100).toFixed(2)
                            : '0.00';
                        return (
                          <div
                            key={v.variant_id}
                            className="p-2.5 bg-neutral-950/60 rounded-xl border border-neutral-800 text-xs"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-orange-400">Variant {v.variant_letter}</span>
                              <span className="text-[10px] text-neutral-500">{v.valid_rows} rows</span>
                            </div>
                            <div className="text-[11px] text-neutral-400 truncate">{v.name}</div>
                            <div className="mt-2 text-[11px] text-neutral-300 flex justify-between">
                              <span>Exposures:</span>
                              <strong>{v.total_exposures.toLocaleString()}</strong>
                            </div>
                            <div className="text-[11px] text-neutral-300 flex justify-between">
                              <span>Conversions:</span>
                              <strong>{v.total_conversions.toLocaleString()}</strong>
                            </div>
                            <div className="text-[11px] text-neutral-300 flex justify-between pt-1 border-t border-neutral-800/80 mt-1">
                              <span>Batch CTR:</span>
                              <strong className="text-orange-300">{impliedCtr}%</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview Rows Table */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                      <span>Row-Level Inspection Preview</span>
                      <span className="text-[11px] text-neutral-500">
                        Showing first {previewData.sample_preview.length} rows
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-48 overflow-y-auto border border-neutral-800 rounded-xl">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-neutral-950 sticky top-0 text-neutral-400 border-b border-neutral-800">
                          <tr>
                            <th className="py-1.5 px-3">#</th>
                            <th className="py-1.5 px-3">Status</th>
                            <th className="py-1.5 px-3">Variant</th>
                            <th className="py-1.5 px-3">Exposures</th>
                            <th className="py-1.5 px-3">Conversions</th>
                            <th className="py-1.5 px-3">Notes / Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                          {previewData.sample_preview.map((row) => (
                            <tr key={row.row_number} className="hover:bg-neutral-800/20">
                              <td className="py-1.5 px-3 font-mono text-neutral-500">
                                {row.row_number}
                              </td>
                              <td className="py-1.5 px-3">
                                {row.status === 'VALID' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                                    VALID
                                  </span>
                                )}
                                {row.status === 'DUPLICATE' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/60 text-amber-400 border border-amber-500/30">
                                    DUPLICATE
                                  </span>
                                )}
                                {row.status === 'INVALID' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950/60 text-red-400 border border-red-500/30">
                                    INVALID
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-3 font-semibold">
                                {row.variant_letter || '—'}
                              </td>
                              <td className="py-1.5 px-3 font-mono">
                                {row.exposures !== undefined ? row.exposures.toLocaleString() : '—'}
                              </td>
                              <td className="py-1.5 px-3 font-mono">
                                {row.conversions !== undefined ? row.conversions.toLocaleString() : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-neutral-400 max-w-xs truncate">
                                {row.error ? (
                                  <span className="text-red-400">{row.error}</span>
                                ) : (
                                  <span className="text-neutral-500">Ready to import</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Error Banner */}
              {importError && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!importResult && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 shrink-0 bg-neutral-950/80">
            <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-neutral-400" />
              <span>Imported rows are saved as CSV_IMPORT provenance and re-evaluated immediately.</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={
                  !previewData ||
                  !previewData.can_import ||
                  isImporting ||
                  previewData.valid_rows_count === 0
                }
                className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shadow-lg shadow-orange-950/50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <span>Confirm Import ({previewData ? previewData.valid_rows_count : 0} rows)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

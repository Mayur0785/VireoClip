import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Search,
  Download,
  FileText,
  RefreshCw,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Image as ImageIcon,
  Type,
  Mic,
  Clock,
  ShieldCheck,
  X,
  Database,
  Upload,
} from 'lucide-react';
import {
  ABExperiment,
  ABExperimentStatus,
  ABExperimentReport,
  ABEvidenceLevel,
} from '../../types';
import { abStudioService } from '../../services/abStudioService';
import { ABCsvImportModal } from './ABCsvImportModal';

export interface ABExperimentHistoryProps {
  /** Optional filter for a specific clip */
  clipId?: string;
  /** Callback when an experiment is chosen to open in studio */
  onSelectExperiment?: (experimentId: string, clipId: string) => void;
}

export const ABExperimentHistory: React.FC<ABExperimentHistoryProps> = ({
  clipId,
  onSelectExperiment,
}) => {
  const [experiments, setExperiments] = useState<ABExperiment[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<ABExperimentStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Report Modal state
  const [reportModalExperimentId, setReportModalExperimentId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ABExperimentReport | null>(null);
  const [isReportLoading, setIsReportLoading] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Export state
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // CSV Import state
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState<boolean>(false);
  const [csvImportTargetExperiment, setCsvImportTargetExperiment] = useState<ABExperiment | null>(null);

  const fetchExperiments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const query = {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
        limit: 100,
        offset: 0,
      };

      const res = await abStudioService.listUserExperiments(query);
      let list = res.experiments || [];
      if (clipId) {
        list = list.filter((exp) => exp.clip_id === clipId);
      }
      setExperiments(list);
      setTotalCount(res.total || list.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load experiment history.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery, clipId]);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  const handleOpenReport = async (expId: string) => {
    setReportModalExperimentId(expId);
    setIsReportLoading(true);
    setReportError(null);
    try {
      const data = await abStudioService.getExperimentReport(expId);
      setReportData(data);
    } catch (err: any) {
      setReportError(err.message || 'Failed to generate experiment report.');
    } finally {
      setIsReportLoading(false);
    }
  };

  const handleCloseReport = () => {
    setReportModalExperimentId(null);
    setReportData(null);
    setReportError(null);
  };

  const handleExportCsv = async (expId: string, expName: string) => {
    try {
      setExportingId(expId);
      setError(null);
      await abStudioService.downloadExperimentCsv(expId);
      setExportSuccess(`CSV Report for "${expName}" downloaded successfully.`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to export CSV report.');
    } finally {
      setExportingId(null);
    }
  };

  // Helper for evidence level badges
  const renderEvidenceBadge = (level?: ABEvidenceLevel) => {
    switch (level) {
      case 'WINNER_DECLARED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Trophy className="w-3 h-3" /> Winner Declared
          </span>
        );
      case 'WINNER_ELIGIBLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Sparkles className="w-3 h-3" /> Winner Eligible (Sig. Lift)
          </span>
        );
      case 'INSUFFICIENT_SAMPLE_SIZE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
            <AlertTriangle className="w-3 h-3" /> Underpowered Sample
          </span>
        );
      case 'INCONCLUSIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
            <HelpCircle className="w-3 h-3" /> Inconclusive
          </span>
        );
      case 'NO_OBSERVATIONS':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-500 border border-neutral-700">
            <Clock className="w-3 h-3" /> No Data Recorded
          </span>
        );
    }
  };

  const renderStatusBadge = (status: ABExperimentStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
            ACTIVE
          </span>
        );
      case 'PAUSED':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-950/60 text-amber-400 border border-amber-800">
            PAUSED
          </span>
        );
      case 'CONCLUDED':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-950/60 text-blue-400 border border-blue-800">
            CONCLUDED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-neutral-900 text-neutral-500 border border-neutral-800">
            CANCELLED
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
            DRAFT
          </span>
        );
    }
  };

  // Derive summary metrics
  const activeCount = experiments.filter((e) => e.status === 'ACTIVE').length;
  const concludedCount = experiments.filter((e) => e.status === 'CONCLUDED').length;
  const winnerCount = experiments.filter((e) => !!e.winning_variant_id).length;

  return (
    <div className="space-y-6">
      {/* Top Header & Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400">Total Experiments</div>
          <div className="text-2xl font-bold text-white mt-1">{totalCount}</div>
        </div>
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400">Running Active</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400">Concluded</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{concludedCount}</div>
        </div>
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400">Winners Declared</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{winnerCount}</div>
        </div>
      </div>

      {/* Success Notification */}
      {exportSuccess && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{exportSuccess}</span>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'ACTIVE', 'DRAFT', 'PAUSED', 'CONCLUDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === st
                  ? 'bg-orange-600 text-white shadow-sm shadow-orange-900/50'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Input & Refresh */}
        <div className="flex items-center gap-2 flex-1 md:max-w-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search experiments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>
          <button
            onClick={() => {
              setCsvImportTargetExperiment(null);
              setIsCsvImportModalOpen(true);
            }}
            title="Import Platform Analytics CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 text-orange-400 hover:text-white hover:bg-neutral-700 text-xs font-medium border border-neutral-700 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>
          <button
            onClick={fetchExperiments}
            disabled={isLoading}
            title="Refresh list"
            className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content List / States */}
      {isLoading ? (
        <div className="p-12 text-center text-neutral-400 text-xs bg-neutral-900/50 border border-neutral-800 rounded-2xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-400 mb-2" />
          Loading experiments history...
        </div>
      ) : error ? (
        <div className="p-6 bg-red-950/30 border border-red-500/30 rounded-2xl text-center space-y-3">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
          <p className="text-xs text-red-300">{error}</p>
          <button
            onClick={fetchExperiments}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      ) : experiments.length === 0 ? (
        <div className="p-12 text-center bg-neutral-900/50 border border-neutral-800 rounded-2xl max-w-lg mx-auto">
          <FlaskConical className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No Experiments Found</h3>
          <p className="text-xs text-neutral-400 mb-4">
            {searchQuery || statusFilter !== 'ALL'
              ? 'No experiments match your search criteria. Try resetting filters.'
              : 'You have not created any A/B experiments yet. Open a clip in the editor to start testing.'}
          </p>
          {(searchQuery || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => {
            const totalObs = exp.variants.reduce(
              (acc, v) => acc + (v.observations.impressions || v.observations.views || 0),
              0
            );
            const minSampleSize = (exp as any).sample_size_requirement?.minimum_sample_size_per_variant || exp.minimum_sample_size || 8158;
            const maxVariantObs = Math.max(
              ...exp.variants.map((v) => v.observations.impressions || v.observations.views || 0),
              0
            );
            const sampleProgressPct = Math.min(
              100,
              Math.round((maxVariantObs / minSampleSize) * 100)
            );

            // Determine evidence level
            let evidenceLevel: ABEvidenceLevel = 'NO_OBSERVATIONS';
            if (exp.winning_variant_id) {
              evidenceLevel = 'WINNER_DECLARED';
            } else if (totalObs === 0) {
              evidenceLevel = 'NO_OBSERVATIONS';
            } else if (maxVariantObs < minSampleSize) {
              evidenceLevel = 'INSUFFICIENT_SAMPLE_SIZE';
            } else {
              const eligibleChallenger = exp.variants.find((v) => {
                if (v.is_control || !v.statistical_metrics) return false;
                const m = v.statistical_metrics;
                const alphaThreshold = m.adjusted_alpha ?? (m as any).bonferroni_adjusted_alpha ?? 0.05;
                const reqMde = (exp as any).sample_size_requirement?.relative_mde || exp.minimum_practical_lift || 0.05;
                return (
                  m.p_value < alphaThreshold &&
                  m.relative_lift >= reqMde
                );
              });
              evidenceLevel = eligibleChallenger ? 'WINNER_ELIGIBLE' : 'INCONCLUSIVE';
            }

            return (
              <div
                key={exp.id}
                className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition rounded-2xl p-5 space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-white truncate">{exp.name}</h3>
                      {renderStatusBadge(exp.status)}
                      {renderEvidenceBadge(evidenceLevel)}
                      <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 flex items-center gap-1">
                        {exp.test_type === 'THUMBNAIL_ONLY' && <ImageIcon className="w-3 h-3 text-orange-400" />}
                        {exp.test_type === 'TITLE_ONLY' && <Type className="w-3 h-3 text-blue-400" />}
                        {exp.test_type === 'HOOK_LINE' && <Mic className="w-3 h-3 text-emerald-400" />}
                        {exp.test_type}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-300 italic">
                      &ldquo;{exp.hypothesis}&rdquo;
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-500 pt-1">
                      {(exp as any).clip_title && (
                        <span className="text-neutral-400">
                          Linked Clip: <span className="text-neutral-300 font-medium">{(exp as any).clip_title}</span>
                        </span>
                      )}
                      <span>
                        Target: <span className="text-neutral-300 font-medium">{exp.target_metric}</span>
                      </span>
                      <span>
                        Updated: {new Date(exp.updated_at || exp.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleExportCsv(exp.id, exp.name)}
                      disabled={exportingId === exp.id}
                      title="Download RFC-4180 CSV report"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 transition"
                    >
                      <Download className={`w-3.5 h-3.5 ${exportingId === exp.id ? 'animate-bounce text-orange-400' : ''}`} />
                      <span>{exportingId === exp.id ? 'Exporting...' : 'Export CSV'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenReport(exp.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg border border-neutral-700 transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>Report</span>
                    </button>

                    {exp.status === 'ACTIVE' && (
                      <button
                        onClick={() => {
                          setCsvImportTargetExperiment(exp);
                          setIsCsvImportModalOpen(true);
                        }}
                        title="Import CSV observations into this experiment"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-orange-400 text-xs font-medium rounded-lg border border-neutral-700 transition"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Import CSV</span>
                      </button>
                    )}

                    {onSelectExperiment && (
                      <button
                        onClick={() => onSelectExperiment(exp.id, exp.clip_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition shadow-md shadow-orange-950/40"
                      >
                        <span>Open Studio</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sample Size Progress Meter */}
                <div className="bg-neutral-950/60 rounded-xl p-3 border border-neutral-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">
                      Sample Size Progress (Benchmark: {minSampleSize.toLocaleString()} exposures/variant)
                    </span>
                    <span className="text-neutral-300 font-mono font-medium">
                      {maxVariantObs.toLocaleString()} / {minSampleSize.toLocaleString()} ({sampleProgressPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        sampleProgressPct >= 100 ? 'bg-emerald-500' : 'bg-orange-500'
                      }`}
                      style={{ width: `${sampleProgressPct}%` }}
                    />
                  </div>
                </div>

                {/* Variant Compact Performance Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                  {exp.variants.map((v) => {
                    const isWin = exp.winning_variant_id === v.id;
                    const obs = v.observations;
                    const stats = v.statistical_metrics;
                    const ctrPct = ((obs.rate || 0) * 100).toFixed(2);
                    const liftPct = stats ? (stats.relative_lift * 100).toFixed(1) : '0.0';

                    return (
                      <div
                        key={v.id}
                        className={`p-2.5 rounded-xl border text-xs ${
                          isWin
                            ? 'bg-emerald-950/20 border-emerald-500/50'
                            : 'bg-neutral-950/40 border-neutral-800/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
                                v.is_control
                                  ? 'bg-neutral-800 text-neutral-300'
                                  : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                              }`}
                            >
                              {v.variant_letter}
                            </span>
                            <span className="font-medium text-white truncate" title={v.name}>
                              {v.name}
                            </span>
                          </div>
                          {isWin && <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1.5">
                          <span>CTR: <strong className="text-white font-mono">{ctrPct}%</strong></span>
                          <span>
                            Lift:{' '}
                            <strong
                              className={`font-mono ${
                                v.is_control
                                  ? 'text-neutral-500'
                                  : Number(liftPct) > 0
                                  ? 'text-emerald-400'
                                  : Number(liftPct) < 0
                                  ? 'text-red-400'
                                  : 'text-neutral-400'
                              }`}
                            >
                              {v.is_control ? 'Base' : `${Number(liftPct) >= 0 ? '+' : ''}${liftPct}%`}
                            </strong>
                          </span>
                        </div>

                        <div className="text-[10px] text-neutral-500 mt-1">
                          {(obs.impressions || obs.views || 0).toLocaleString()} exp · {obs.conversions || 0} clicks
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed Report Modal */}
      {reportModalExperimentId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900/95 backdrop-blur-xs z-10">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-400" />
                <h2 className="text-base font-semibold text-white">Statistical Experiment Report</h2>
              </div>
              <button
                onClick={handleCloseReport}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 flex-1">
              {isReportLoading ? (
                <div className="p-12 text-center text-neutral-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-400 mb-2" />
                  Generating statistical report...
                </div>
              ) : reportError ? (
                <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs text-center">
                  {reportError}
                </div>
              ) : reportData ? (
                <>
                  {/* Executive Overview */}
                  <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-white">{reportData.experiment_name}</h3>
                        <p className="text-xs text-neutral-300 italic mt-0.5">
                          &ldquo;{reportData.hypothesis}&rdquo;
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {renderStatusBadge(reportData.status)}
                        {renderEvidenceBadge(reportData.evidence_level)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs border-t border-neutral-800/60">
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Tested Dimension</span>
                        <span className="font-semibold text-neutral-200">{reportData.test_type}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Primary Metric</span>
                        <span className="font-semibold text-neutral-200">{reportData.primary_metric}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Total Exposures</span>
                        <span className="font-mono font-semibold text-neutral-200">
                          {reportData.total_exposures.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Total Conversions</span>
                        <span className="font-mono font-semibold text-neutral-200">
                          {reportData.total_conversions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Decision Rule & Evidence Banner */}
                  <div
                    className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                      reportData.evidence_level === 'WINNER_DECLARED'
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                        : reportData.evidence_level === 'WINNER_ELIGIBLE'
                        ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
                        : reportData.evidence_level === 'INSUFFICIENT_SAMPLE_SIZE'
                        ? 'bg-yellow-950/20 border-yellow-500/30 text-yellow-300'
                        : 'bg-neutral-950/40 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Statistical Evaluation Rationale</span>
                    </div>
                    <p className="leading-relaxed">{reportData.decision_rationale}</p>
                  </div>

                  {/* Sample Size Benchmark Card */}
                  <div className="bg-neutral-950/40 border border-neutral-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">Power & Sample Size Benchmark</span>
                      <span className="text-neutral-400">
                        Target:{' '}
                        <strong className="text-neutral-200 font-mono">
                          {reportData.sample_size_requirement.minimum_sample_size_per_variant.toLocaleString()}
                        </strong>{' '}
                        exposures/variant
                      </span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          reportData.sample_size_progress_percentage >= 100
                            ? 'bg-emerald-500'
                            : 'bg-orange-500'
                        }`}
                        style={{ width: `${reportData.sample_size_progress_percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                      <span>Baseline: {(reportData.sample_size_requirement.baseline_conversion_rate * 100).toFixed(1)}%</span>
                      <span>Rel. MDE: {(reportData.sample_size_requirement.relative_mde * 100).toFixed(1)}%</span>
                      <span>Power: {(reportData.sample_size_requirement.statistical_power * 100).toFixed(0)}%</span>
                      <span>Alpha: {reportData.sample_size_requirement.alpha}</span>
                      <span>Progress: {reportData.sample_size_progress_percentage}%</span>
                    </div>
                  </div>

                  {/* Full Variant Statistical Comparison Table */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Variant Comparison Matrix
                    </h4>
                    <div className="border border-neutral-800 rounded-xl overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-950/80 text-neutral-400 border-b border-neutral-800">
                          <tr>
                            <th className="p-3">Variant</th>
                            <th className="p-3">Exposures</th>
                            <th className="p-3">Clicks</th>
                            <th className="p-3">CTR</th>
                            <th className="p-3">Lift</th>
                            <th className="p-3">95% Wilson CI</th>
                            <th className="p-3">p-value</th>
                            <th className="p-3">Adj. Alpha</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          {reportData.variants.map((v) => {
                            const isWin = reportData.winning_variant_id === v.variant_id;
                            const stats = v.statistical_metrics;
                            const pVal = stats && stats.p_value < 1 ? stats.p_value.toFixed(4) : 'N/A';
                            const adjA = stats ? (stats.adjusted_alpha ?? (stats as any).bonferroni_adjusted_alpha ?? 0.05).toFixed(4) : 'N/A';
                            const ciStr = stats
                              ? `[${(stats.confidence_interval_95[0] * 100).toFixed(2)}%, ${(
                                  stats.confidence_interval_95[1] * 100
                                ).toFixed(2)}%]`
                              : 'N/A';

                            return (
                              <tr
                                key={v.variant_id}
                                className={isWin ? 'bg-emerald-950/20' : 'hover:bg-neutral-800/40'}
                              >
                                <td className="p-3 font-medium text-white flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-neutral-800 text-neutral-300 flex items-center justify-center font-bold text-[10px]">
                                    {v.variant_letter}
                                  </span>
                                  <span>{v.name}</span>
                                  {v.is_control && (
                                    <span className="text-[10px] text-neutral-500 font-normal">(Ctrl)</span>
                                  )}
                                  {isWin && <Trophy className="w-3.5 h-3.5 text-emerald-400" />}
                                </td>
                                <td className="p-3 font-mono text-neutral-300">{v.exposures.toLocaleString()}</td>
                                <td className="p-3 font-mono text-neutral-300">{v.conversions.toLocaleString()}</td>
                                <td className="p-3 font-mono text-white font-semibold">
                                  {(v.rate * 100).toFixed(2)}%
                                </td>
                                <td
                                  className={`p-3 font-mono font-semibold ${
                                    v.is_control
                                      ? 'text-neutral-500'
                                      : v.relative_lift > 0
                                      ? 'text-emerald-400'
                                      : v.relative_lift < 0
                                      ? 'text-red-400'
                                      : 'text-neutral-400'
                                  }`}
                                >
                                  {v.is_control
                                    ? '0.00%'
                                    : `${v.relative_lift >= 0 ? '+' : ''}${(v.relative_lift * 100).toFixed(2)}%`}
                                </td>
                                <td className="p-3 font-mono text-neutral-400 text-[11px]">{ciStr}</td>
                                <td className="p-3 font-mono text-neutral-300">{pVal}</td>
                                <td className="p-3 font-mono text-neutral-400">{adjA}</td>
                                <td className="p-3 font-medium">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] ${
                                      v.performance_status === 'STATISTICALLY_SIGNIFICANT_WINNER'
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                        : v.performance_status === 'UNDERPERFORMING'
                                        ? 'bg-red-950 text-red-400 border border-red-800'
                                        : 'bg-neutral-800 text-neutral-400'
                                    }`}
                                  >
                                    {v.performance_status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Provenance & Data Ingestion Breakdown */}
                  <div className="bg-neutral-950/40 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                      <Database className="w-4 h-4 text-orange-400" />
                      <span>Data Provenance & Audit Trail</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                        <span className="text-neutral-500 text-[10px] block">Manual Entry Observations</span>
                        <span className="font-semibold text-white">
                          {reportData.provenance_breakdown.MANUAL_ENTRY || 0} batches
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                        <span className="text-neutral-500 text-[10px] block">CSV Bulk Imports</span>
                        <span className="font-semibold text-white">
                          {reportData.provenance_breakdown.CSV_IMPORT || 0} batches
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                        <span className="text-neutral-500 text-[10px] block">Platform Analytics Sync</span>
                        <span className="font-semibold text-white">
                          {reportData.provenance_breakdown.PLATFORM_ANALYTICS_SYNC || 0} batches
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-800 flex items-center justify-between bg-neutral-900/95 sticky bottom-0">
              <span className="text-[11px] text-neutral-500">
                Calculations powered by two-proportion z-score & Bonferroni multiple comparison adjustment.
              </span>
              <div className="flex items-center gap-2">
                {reportData && (
                  <button
                    onClick={() => handleExportCsv(reportData.experiment_id, reportData.experiment_name)}
                    disabled={exportingId === reportData.experiment_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium border border-neutral-700 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Download CSV Report</span>
                  </button>
                )}
                <button
                  onClick={handleCloseReport}
                  className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Analytics Import Modal */}
      <ABCsvImportModal
        isOpen={isCsvImportModalOpen}
        onClose={() => setIsCsvImportModalOpen(false)}
        experiment={csvImportTargetExperiment}
        availableExperiments={experiments}
        onImportSuccess={async () => {
          await fetchExperiments();
        }}
      />
    </div>
  );
};

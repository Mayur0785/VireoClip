import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Zap,
  Lock,
  Unlock,
  RotateCw,
  Check,
  Play,
  Scissors,
  ArrowRight,
  AlertCircle,
  TrendingUp,
  Edit2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import {
  HookLabSession,
  HookCandidate,
} from '../../types';
import { hookLabService } from '../../services/hookLabService';

export interface HookLabWorkspaceProps {
  clipId: string;
  projectId?: string;
  editorProjectId?: string;
  clipTitle?: string;
  clipDurationSeconds?: number;
  onApplyToEditor?: (result: any) => void;
  onEditorProjectUpdated?: () => void;
  onClose?: () => void;
}

export const HookLabWorkspace: React.FC<HookLabWorkspaceProps> = ({
  clipId,
  projectId,
  editorProjectId,
  clipTitle,
  clipDurationSeconds,
  onApplyToEditor,
  onEditorProjectUpdated,
  onClose,
}) => {
  const [session, setSession] = useState<HookLabSession | null>(null);
  const [candidates, setCandidates] = useState<HookCandidate[]>([]);
  const [existingLines, setExistingLines] = useState<any[]>([]);
  const [analyticsAdvisory, setAnalyticsAdvisory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [userInstruction, setUserInstruction] = useState<string>('');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ url: string; candidate: HookCandidate } | null>(null);
  const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);
  const snapshotsRef = useRef<Record<string, any>>({});

  const loadSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const sess = await hookLabService.createOrGetSession(clipId, {
        project_id: projectId,
        opening_window_sec: 3.0,
      });
      setSession(sess);

      const fullData = await hookLabService.getSession(sess.id);
      setCandidates(fullData.candidates);

      // Load lines and analytics in background
      hookLabService.getExistingLines(sess.id).then(setExistingLines).catch(() => {});
      hookLabService.getAnalyticsAdvisory().then(setAnalyticsAdvisory).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Hook Lab session.');
    } finally {
      setIsLoading(false);
    }
  }, [clipId, projectId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleGenerate = async (instruction?: string) => {
    if (!session) return;
    try {
      setIsGenerating(true);
      setError(null);
      const generated = await hookLabService.generateCandidates(session.id, {
        user_instruction: instruction || userInstruction,
      });
      setCandidates(generated);
      setActionSuccess('Generated source-grounded hook options!');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to generate hook candidates.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleLock = async (candidate: HookCandidate) => {
    if (!session) return;
    try {
      const updated = await hookLabService.updateCandidate(session.id, candidate.id, {
        locked: !candidate.locked,
      });
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err: any) {
      setError(err.message || 'Failed to update lock state.');
    }
  };

  const handleSaveEdit = async (candidateId: string) => {
    if (!session || !editedText.trim()) return;
    try {
      const updated = await hookLabService.updateCandidate(session.id, candidateId, {
        text: editedText.trim(),
      });
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingCandidateId(null);
      setActionSuccess('Hook updated and re-scored!');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to save hook edit.');
    }
  };

  const handleRegenerateItem = async (candidateId: string) => {
    if (!session) return;
    try {
      const updated = await hookLabService.regenerateCandidate(
        session.id,
        candidateId,
        userInstruction
      );
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate hook candidate.');
    }
  };

  const handleApplyToEditor = async (candidate: HookCandidate) => {
    if (!session || !editorProjectId) {
      setError('No active editor project available to apply hook.');
      return;
    }
    try {
      const result = await hookLabService.applyToEditor(session.id, candidate.id, editorProjectId);
      if (result.previousProjectSnapshot) {
        snapshotsRef.current[candidate.id] = result.previousProjectSnapshot;
      }
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, applied: true, status: 'APPLIED' } : c))
      );
      setActionSuccess(`Applied to editor: ${result.appliedOperations.join(', ')}`);
      if (onApplyToEditor) onApplyToEditor(result);
      if (onEditorProjectUpdated) onEditorProjectUpdated();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to apply hook to editor.');
    }
  };

  const handleRevertApply = async (candidate: HookCandidate) => {
    if (!session || !editorProjectId) {
      setError('No active editor project available to revert.');
      return;
    }
    try {
      const snapshot = snapshotsRef.current[candidate.id];
      const result = await hookLabService.revertApply(session.id, candidate.id, editorProjectId, snapshot);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, applied: false, status: 'GENERATED' } : c))
      );
      setActionSuccess('Reverted hook application in editor.');
      if (onApplyToEditor) onApplyToEditor(result);
      if (onEditorProjectUpdated) onEditorProjectUpdated();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to revert hook in editor.');
    }
  };

  const handleApprove = async (candidate: HookCandidate) => {
    if (!session) return;
    try {
      const approved = await hookLabService.approveCandidate(session.id, candidate.id);
      setCandidates((prev) => prev.map((c) => (c.id === approved.id ? approved : c)));
      setActionSuccess('Hook approved and Brand Brain evidence recorded!');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to approve hook.');
    }
  };

  const handlePreview = async (candidate: HookCandidate) => {
    if (!session) return;
    try {
      const preview = await hookLabService.renderPreview(session.id, candidate.id);
      setPreviewData({ url: preview.previewUrl, candidate });
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview snippet.');
    }
  };

  const recommendedCandidate = candidates.length > 0 ? candidates[0] : null;
  const alternateCandidates = candidates.length > 1 ? candidates.slice(1) : [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-neutral-400 space-y-3">
        <RotateCw className="w-6 h-6 animate-spin text-purple-400" />
        <p className="text-sm">Analyzing opening moments and transcript signals...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 rounded-xl overflow-hidden border border-neutral-800">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-neutral-800/80 bg-neutral-900/40 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
              Hook Lab
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Opening Intelligence
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Source-grounded openings and non-destructive editor enhancements
              {clipTitle && (
                <span className="ml-2 text-neutral-500">
                  • Clip: <strong className="text-neutral-300 font-medium">{clipTitle}</strong>
                  {clipDurationSeconds ? ` (${Math.round(clipDurationSeconds)}s)` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Analytics Advisory Signal */}
        <div className="flex items-center space-x-3">
          {analyticsAdvisory && (
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs border border-neutral-800 bg-neutral-900/80 text-neutral-400">
              <TrendingUp className="w-3.5 h-3.5 text-neutral-400" />
              <span>
                {analyticsAdvisory.status === 'INSUFFICIENT_DATA'
                  ? `Analytics: ${analyticsAdvisory.sample_count}/3 clips`
                  : 'Historical Advisory Active'}
              </span>
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-300 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="text-rose-300 font-bold ml-2">×</button>
        </div>
      )}
      {actionSuccess && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 1. Opening Analysis Diagnostic Panel */}
        {session && (
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5 text-purple-400" />
                Current Opening Diagnostics (0–{session.opening_window.end_seconds}s)
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-neutral-500">Current Hook Fit:</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">
                  {session.analysis.current_hook_score ?? 50}/100
                </span>
              </div>
            </div>

            {/* Current Hook Text */}
            <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80">
              <p className="text-xs text-neutral-400 mb-1 font-mono">
                Source: {session.analysis.current_hook_source}
              </p>
              <p className="text-sm font-medium text-neutral-200 italic">
                "{session.analysis.current_hook_text || 'No clear spoken opening or hook detected'}"
              </p>
            </div>

            {/* Latency & Diagnostics Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs px-2.5 py-1 rounded-md border font-medium ${
                  session.analysis.latency_label === 'FAST'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : session.analysis.latency_label === 'MODERATE'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                Speech Latency: {session.analysis.time_to_first_meaningful_speech_sec}s ({session.analysis.latency_label})
              </span>

              {session.analysis.issues.map((iss, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  ⚠️ {iss.replace(/_/g, ' ')}
                </span>
              ))}

              {session.analysis.strengths.map((str, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  ✓ {str.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 2. Source-First Reordering / Strongest Existing Lines */}
        {existingLines.length > 0 && (
          <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Stronger Existing Lines Discovered Later in Video
              </span>
              <span className="text-xs text-indigo-300/70">Source-First Non-Destructive Move</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {existingLines.map((line, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-indigo-500/20 bg-neutral-900/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-indigo-300">
                      {line.start_seconds}s – {line.end_seconds}s
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                      Impact: {line.punchiness_score}/100
                    </span>
                  </div>
                  <p className="text-xs font-medium text-neutral-200">"{line.text}"</p>
                  <p className="text-[11px] text-neutral-400">{line.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Instruction & "Make It Stronger" Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Generate & Refine Hooks
            </label>
            <div className="flex items-center space-x-1.5 text-xs text-neutral-500">
              <span>Quick directives:</span>
              {['Shorter', 'More direct', 'More curiosity', 'No questions'].map((pill) => (
                <button
                  key={pill}
                  onClick={() => {
                    setUserInstruction(pill);
                    handleGenerate(pill);
                  }}
                  className="px-2 py-0.5 rounded border border-neutral-800 hover:border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white transition-colors"
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={userInstruction}
              onChange={(e) => setUserInstruction(e.target.value)}
              placeholder="e.g. Punchier, emphasize the mistake, keep under 8 words..."
              className="flex-1 px-4 py-2 text-xs rounded-lg bg-neutral-900 border border-neutral-800 focus:border-purple-500 focus:outline-none text-white placeholder-neutral-500"
            />
            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-lg shadow-purple-600/20"
            >
              {isGenerating ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate Hooks
            </button>
          </div>
        </div>

        {/* 4. Prominent Recommended Hook Candidate */}
        {recommendedCandidate && (
          <div className="p-5 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/20 via-neutral-900/60 to-neutral-950 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold tracking-wide">
                  RECOMMENDED HOOK
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                  {recommendedCandidate.hook_type} • {recommendedCandidate.delivery_mode}
                </span>
                {recommendedCandidate.locked && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>

              {/* Hook Fit Score Badge */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() =>
                    setExpandedScoreId(expandedScoreId === recommendedCandidate.id ? null : recommendedCandidate.id)
                  }
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                >
                  Score Breakdown
                  {expandedScoreId === recommendedCandidate.id ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                <div className="w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/40 flex items-center justify-center font-bold text-sm text-purple-300">
                  {recommendedCandidate.overall_hook_fit}
                </div>
              </div>
            </div>

            {/* Hook Text Display / Inline Edit */}
            {editingCandidateId === recommendedCandidate.id ? (
              <div className="space-y-2">
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full p-3 rounded-lg bg-neutral-900 border border-purple-500/40 text-sm text-white focus:outline-none"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingCandidateId(null)}
                    className="text-xs px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveEdit(recommendedCandidate.id)}
                    className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium"
                  >
                    Save & Re-Score
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-base font-semibold text-white tracking-tight leading-relaxed">
                "{recommendedCandidate.text}"
              </p>
            )}

            {/* Explanation Summary */}
            <p className="text-xs text-neutral-400">{recommendedCandidate.explanation.summary}</p>

            {/* Score Breakdown Drawer */}
            {expandedScoreId === recommendedCandidate.id && (
              <div className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800/80 space-y-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-neutral-400">
                  <div>Grounding: <span className="font-bold text-white">{recommendedCandidate.scores.grounding}%</span></div>
                  <div>Clarity: <span className="font-bold text-white">{recommendedCandidate.scores.clarity}%</span></div>
                  <div>Specificity: <span className="font-bold text-white">{recommendedCandidate.scores.specificity}%</span></div>
                  <div>Curiosity: <span className="font-bold text-white">{recommendedCandidate.scores.curiosity}%</span></div>
                  <div>Brevity: <span className="font-bold text-white">{recommendedCandidate.scores.brevity}%</span></div>
                  <div>Brand Fit: <span className="font-bold text-white">{recommendedCandidate.scores.brand_fit}%</span></div>
                  <div>Opening Fit: <span className="font-bold text-white">{recommendedCandidate.scores.opening_fit}%</span></div>
                </div>
                {recommendedCandidate.explanation.positives.length > 0 && (
                  <div className="text-emerald-400 space-y-0.5 mt-2">
                    {recommendedCandidate.explanation.positives.map((pos, idx) => (
                      <div key={idx}>+ {pos}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800/60">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleToggleLock(recommendedCandidate)}
                  className={`p-2 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                    recommendedCandidate.locked
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-neutral-800 hover:bg-neutral-800 text-neutral-400'
                  }`}
                  title={recommendedCandidate.locked ? 'Unlock' : 'Lock'}
                >
                  {recommendedCandidate.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => {
                    setEditingCandidateId(recommendedCandidate.id);
                    setEditedText(recommendedCandidate.text);
                  }}
                  className="p-2 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-xs"
                  title="Edit text"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleRegenerateItem(recommendedCandidate.id)}
                  disabled={recommendedCandidate.locked}
                  className="p-2 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-xs disabled:opacity-40"
                  title="Regenerate"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePreview(recommendedCandidate)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-xs text-neutral-200 flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Preview
                </button>

                {editorProjectId && (
                  recommendedCandidate.applied ? (
                    <button
                      onClick={() => handleRevertApply(recommendedCandidate)}
                      className="px-4 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-medium text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Revert Apply
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApplyToEditor(recommendedCandidate)}
                      className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-purple-600/20"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Apply to Editor
                    </button>
                  )
                )}

                <button
                  onClick={() => handleApprove(recommendedCandidate)}
                  className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                    recommendedCandidate.approved
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'border border-neutral-700 hover:bg-neutral-800 text-neutral-300'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {recommendedCandidate.approved ? 'Approved' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. Alternative Candidates Grid */}
        {alternateCandidates.length > 0 && (
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Alternative Angles & Variants
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alternateCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                      {cand.hook_type}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-neutral-300">Fit: {cand.overall_hook_fit}</span>
                      <button
                        onClick={() => handleToggleLock(cand)}
                        className={`p-1 rounded ${cand.locked ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'}`}
                      >
                        {cand.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-neutral-200">"{cand.text}"</p>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-xs text-neutral-400">
                    <span className="text-[11px] font-mono">{cand.delivery_mode}</span>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePreview(cand)}
                        className="px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-800 text-neutral-300"
                      >
                        Preview
                      </button>
                      {editorProjectId && (
                        cand.applied ? (
                          <button
                            onClick={() => handleRevertApply(cand)}
                            className="px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium"
                          >
                            Revert
                          </button>
                        ) : (
                          <button
                            onClick={() => handleApplyToEditor(cand)}
                            className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium"
                          >
                            Apply
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Opening Hook Preview</h3>
              <button
                onClick={() => setPreviewData(null)}
                className="text-neutral-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-96 flex items-center justify-center border border-neutral-800">
              <video
                src={previewData.url}
                controls
                autoPlay
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-xs text-neutral-300 italic text-center">
              "{previewData.candidate.text}"
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewData(null)}
                className="text-xs px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

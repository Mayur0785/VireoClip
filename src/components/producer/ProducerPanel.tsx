import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Layers,
  Volume2,
  Type,
  Video,
  Scissors,
  ArrowRight,
  RefreshCw,
  Eye,
  Sliders,
  Send,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ProducerEditPlan,
  ProducerMode,
  OutputPlatform,
  RenderedClip,
} from '../../types';
import { producerService } from '../../services/producerService';

export interface ProducerPanelProps {
  clipId: string;
  clip: RenderedClip;
  onPlanApplied?: (updatedClip: RenderedClip) => void;
}

const PLATFORMS: Array<{ id: OutputPlatform; label: string; icon: string }> = [
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'instagram', label: 'Reels', icon: '📸' },
  { id: 'shorts', label: 'Shorts', icon: '⚡' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'x', label: 'X (Twitter)', icon: '🐦' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
];

const MODES: Array<{ id: ProducerMode; label: string; desc: string }> = [
  { id: 'LIGHT', label: 'Light Polish', desc: 'Subtle edge trims, clean subtitles, natural breathing room.' },
  { id: 'BALANCED', label: 'Balanced (Recommended)', desc: 'Cut dead air > 1s, hook banner, kinetic captions, subtle climax punch-in.' },
  { id: 'AGGRESSIVE', label: 'Aggressive Viral', desc: 'Tight TikTok pacing, cuts pauses > 0.6s, bold captions, dynamic zooms.' },
];

export const ProducerPanel: React.FC<ProducerPanelProps> = ({
  clipId,
  clip,
  onPlanApplied,
}) => {
  // Generator form state
  const [selectedMode, setSelectedMode] = useState<ProducerMode>('BALANCED');
  const [selectedPlatform, setSelectedPlatform] = useState<OutputPlatform>('tiktok');
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [revisionPrompt, setRevisionPrompt] = useState<string>('');

  // Plans state
  const [plans, setPlans] = useState<ProducerEditPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<ProducerEditPlan | null>(null);
  const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRevising, setIsRevising] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // Status / Feedback messages
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(true);

  // Load plans on mount
  useEffect(() => {
    loadPlans();
  }, [clipId]);

  const loadPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const fetched = await producerService.getPlans(clipId);
      setPlans(fetched);
      if (fetched.length > 0) {
        setCurrentPlan(fetched[0]);
      }
    } catch (err: any) {
      console.error('Failed to load producer plans:', err);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setFeedback(null);
    try {
      const newPlan = await producerService.generatePlan(clipId, {
        mode: selectedMode,
        target_platform: selectedPlatform,
        instruction: userPrompt.trim() || undefined,
      });
      setPlans((prev) => [newPlan, ...prev]);
      setCurrentPlan(newPlan);
      setFeedback({ type: 'success', message: `Generated new Producer plan (Score: ${newPlan.scores.after.overall}/100)` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate plan.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleOperation = async (operationId: string) => {
    if (!currentPlan) return;

    const updatedOps = currentPlan.operations.map((op) =>
      op.id === operationId ? { ...op, enabled: !op.enabled } : op
    );

    // Optimistically update local view
    setCurrentPlan({
      ...currentPlan,
      operations: updatedOps,
    });

    try {
      const targetOp = updatedOps.find((o) => o.id === operationId);
      const revised = await producerService.revisePlan(clipId, currentPlan.id, {
        operation_overrides: [
          {
            id: operationId,
            enabled: Boolean(targetOp?.enabled),
          },
        ],
      });
      setPlans((prev) => [revised, ...prev]);
      setCurrentPlan(revised);
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Failed to update operation toggle.' });
    }
  };

  const handleRevisePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPlan || !revisionPrompt.trim()) return;

    setIsRevising(true);
    setFeedback(null);
    try {
      const revised = await producerService.revisePlan(clipId, currentPlan.id, {
        instruction: revisionPrompt.trim(),
      });
      setPlans((prev) => [revised, ...prev]);
      setCurrentPlan(revised);
      setRevisionPrompt('');
      setFeedback({ type: 'success', message: 'Producer adjusted the plan based on your feedback!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to revise plan.' });
    } finally {
      setIsRevising(false);
    }
  };

  const handlePreviewPlan = async () => {
    if (!currentPlan) return;
    setIsPreviewing(true);
    setFeedback(null);
    try {
      const res = await producerService.previewPlan(clipId, currentPlan.id);
      setPreviewUrl(res.previewUrl);
      setShowPreviewModal(true);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Preview rendering failed.' });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyPlan = async () => {
    if (!currentPlan) return;
    setIsApplying(true);
    setFeedback(null);
    try {
      const res = await producerService.applyPlan(clipId, currentPlan.id);
      setFeedback({ type: 'success', message: 'Plan applied successfully! Render job started in background.' });
      if (onPlanApplied) {
        onPlanApplied(res.clip);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply plan.' });
    } finally {
      setIsApplying(false);
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'INTRO_TRIM':
      case 'OUTRO_TRIM':
      case 'TRIM':
        return <Scissors className="w-4 h-4 text-emerald-400" />;
      case 'REMOVE_RANGE':
        return <Scissors className="w-4 h-4 text-amber-400" />;
      case 'REFRAME':
        return <Video className="w-4 h-4 text-blue-400" />;
      case 'HOOK_TEXT':
      case 'TEXT_OVERLAY':
        return <Type className="w-4 h-4 text-purple-400" />;
      case 'CAPTION_STYLE':
      case 'CAPTION_EMPHASIS':
        return <Type className="w-4 h-4 text-cyan-400" />;
      case 'NORMALIZE_AUDIO':
      case 'AUDIO_FADE':
        return <Volume2 className="w-4 h-4 text-indigo-400" />;
      case 'PUNCH_IN':
        return <Sparkles className="w-4 h-4 text-rose-400" />;
      default:
        return <Sliders className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-blue-900/40 border border-purple-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-inner">
              <Wand2 className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Vireo Producer
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                  AI AGENT
                </span>
              </h2>
              <p className="text-xs text-gray-300 mt-0.5">
                Automatic short-form director: dead-space tightening, hook banners, kinetic subtitles & climax punch-ins.
              </p>
            </div>
          </div>

          {currentPlan ? (
            <div className="text-right flex flex-col items-end gap-1">
              <div className="text-xs text-gray-400">
                {clip.title ? `${clip.title} • ` : ''}Plan Version
              </div>
              {plans.length > 1 ? (
                <select
                  value={currentPlan.id}
                  onChange={(e) => {
                    const sel = plans.find((p) => p.id === e.target.value);
                    if (sel) setCurrentPlan(sel);
                  }}
                  className="bg-purple-950/60 border border-purple-500/40 text-purple-200 text-xs rounded-lg px-2 py-1 font-medium focus:outline-none"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      v{p.version} • {p.mode}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm font-semibold text-purple-200">
                  v{currentPlan.version} • {currentPlan.mode}
                </div>
              )}
            </div>
          ) : isLoadingPlans ? (
            <div className="text-xs text-purple-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading plans...
            </div>
          ) : null}
        </div>
      </div>

      {/* Notifications */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Generator Controls */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-lg backdrop-blur-sm">
        <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-purple-400" />
          Director Parameters
        </div>

        {/* Platform Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Target Platform</label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlatform(p.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex flex-col items-center gap-1 border ${
                  selectedPlatform === p.id
                    ? 'bg-purple-600/30 border-purple-500 text-white shadow-md shadow-purple-900/30'
                    : 'bg-gray-800/60 border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-base">{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Editing Aggressiveness</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMode(m.id)}
                className={`p-3 rounded-xl text-left border transition-all ${
                  selectedMode === m.id
                    ? 'bg-gradient-to-b from-purple-950/60 to-purple-900/30 border-purple-500 text-white shadow-lg'
                    : 'bg-gray-800/40 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:bg-gray-800/80'
                }`}
              >
                <div className="font-semibold text-xs text-purple-200">{m.label}</div>
                <div className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Optional Custom Creator Instructions */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Custom Instructions <span className="text-gray-500">(Optional)</span>
          </label>
          <input
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="e.g. Cut dead air, add bold yellow captions, punch in on key moment..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Generate Button */}
        <button
          type="button"
          onClick={handleGeneratePlan}
          disabled={isGenerating}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:via-indigo-500 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              Directing & Synthesizing Edit Plan...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-purple-200" />
              Generate Producer Edit Plan
            </>
          )}
        </button>
      </div>

      {/* Plan Details & Review */}
      {currentPlan && (
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 space-y-5 shadow-xl">
          {/* Top Plan Overview & Scores */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                  v{currentPlan.version}
                </span>
                <h3 className="text-sm font-bold text-white">{currentPlan.title}</h3>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Estimated duration:{' '}
                <span className="font-semibold text-emerald-400">
                  {currentPlan.estimated_duration}s
                </span>{' '}
                (down from {currentPlan.original_duration}s,{' '}
                <span className="text-emerald-400">
                  -{(currentPlan.original_duration - currentPlan.estimated_duration).toFixed(1)}s dead air
                </span>
                )
              </p>
            </div>

            {/* Score Comparison Badge */}
            <div className="flex items-center gap-3 bg-gray-950/80 border border-purple-500/30 rounded-xl px-4 py-2.5 shadow-inner">
              <div className="text-center">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Before</div>
                <div className="text-sm font-bold text-gray-300">{currentPlan.scores.before.overall}</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              <div className="text-center">
                <div className="text-[10px] text-purple-300 uppercase tracking-wider">After Edit</div>
                <div className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-300">
                  {currentPlan.scores.after.overall}
                </div>
              </div>
              <div className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                +{currentPlan.scores.delta} pts
              </div>
            </div>
          </div>

          {/* Metric Breakdown Bars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: 'Hook Energy', val: currentPlan.scores.after.hook, color: 'bg-emerald-500' },
              { label: 'Pacing Flow', val: currentPlan.scores.after.pacing, color: 'bg-amber-500' },
              { label: 'Audio Clarity', val: currentPlan.scores.after.audio, color: 'bg-blue-500' },
              { label: 'Visual Punch', val: currentPlan.scores.after.visual, color: 'bg-purple-500' },
            ].map((m, idx) => (
              <div key={idx} className="bg-gray-950/60 border border-gray-800/80 rounded-xl p-2.5">
                <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                  <span>{m.label}</span>
                  <span className="font-semibold text-white">{m.val}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${m.color} rounded-full`} style={{ width: `${m.val}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Explainability Section */}
          <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-purple-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                Producer Editorial Decision Log
              </span>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-[11px] text-purple-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {showDetails ? 'Hide' : 'Show Details'}
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{currentPlan.explanation.summary}</p>
            {showDetails && (
              <ul className="space-y-1.5 pt-2 text-[11px] text-gray-300 list-disc list-inside">
                {currentPlan.explanation.key_decisions.map((dec, dIdx) => (
                  <li key={dIdx} className="leading-snug">{dec}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Operations List with Interactive Checkbox Toggles */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              Planned Edits ({currentPlan.operations.filter((o) => o.enabled).length} Active)
            </div>

            <div className="space-y-2">
              {currentPlan.operations.map((op) => (
                <div
                  key={op.id}
                  onClick={() => handleToggleOperation(op.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                    op.enabled
                      ? 'bg-gray-950/80 border-gray-700/80 hover:border-purple-500/60'
                      : 'bg-gray-950/30 border-gray-800/40 opacity-50 hover:opacity-75'
                  }`}
                >
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={op.enabled}
                      onChange={() => {}} // Handled by parent click
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-gray-900 border-gray-700 cursor-pointer"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getOperationIcon(op.type)}
                      <span className="text-xs font-semibold text-white truncate">{op.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                        {op.type}
                      </span>
                      <span className="text-[10px] text-purple-300 ml-auto font-mono">
                        {Math.round(op.confidence * 100)}% match
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{op.description}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 italic">{op.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revision Prompt Input */}
          <form onSubmit={handleRevisePrompt} className="pt-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Ask Producer to Adjust This Plan
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={revisionPrompt}
                onChange={(e) => setRevisionPrompt(e.target.value)}
                placeholder="e.g. Don't cut the pauses in the middle, make captions bold..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={isRevising || !revisionPrompt.trim()}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isRevising ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Revise
              </button>
            </div>
          </form>

          {/* Action Buttons: Preview & Apply */}
          <div className="flex items-center gap-3 pt-3 border-t border-gray-800">
            <button
              type="button"
              onClick={handlePreviewPlan}
              disabled={isPreviewing}
              className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold border border-gray-700 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPreviewing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  Rendering 720p Preview...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-purple-300" />
                  Preview Producer Edits
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleApplyPlan}
              disabled={isApplying}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Applying Plan...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Approve & Apply Edits
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Preview Player Modal */}
      {showPreviewModal && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-purple-400" />
                Producer Edit Preview
              </h4>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-gray-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[500px] mx-auto flex items-center justify-center">
              <video
                src={previewUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  handleApplyPlan();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Approve & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

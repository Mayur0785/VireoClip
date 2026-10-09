import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Layers,
  Wand2,
  Flame,
  Image as ImageIcon,
  Share2,
  ShieldCheck,
  Check,
} from 'lucide-react';
import {
  AutopilotRunRecord,
  AutopilotStepResult,
  AutopilotStepName,
} from '../../types';
import { autopilotService } from '../../services/autopilotService';

export interface AutopilotWorkspaceProps {
  clipId: string;
  projectId: string;
  clipTitle: string;
  clipDurationSeconds?: number;
  onOpenPublish?: (handoff: Record<string, any>) => void;
}

export const AutopilotWorkspace: React.FC<AutopilotWorkspaceProps> = ({
  clipId,
  projectId: _projectId,
  clipTitle,
  clipDurationSeconds: _clipDurationSeconds,
  onOpenPublish,
}) => {
  const [run, setRun] = useState<AutopilotRunRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [executing, setExecuting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [producerMode, setProducerMode] = useState<'LIGHT' | 'BALANCED' | 'AGGRESSIVE'>('BALANCED');
  const [targetPlatform, setTargetPlatform] = useState<'tiktok' | 'youtube' | 'instagram' | 'shorts'>('tiktok');
  const [userInstruction, setUserInstruction] = useState<string>('');

  const initialMountDone = React.useRef(false);

  const loadRun = useCallback(async (isUserAction = false) => {
    try {
      setLoading(true);
      setError(null);

      // 1. Check for existing runs belonging to this clip
      const existingRuns = await autopilotService.getRunsForClip(clipId).catch(() => []);

      // Selection rule:
      // - Prioritize the latest run that is COMPLETED, RUNNING, or APPROVED.
      // - Otherwise, reuse an active/unfailed PENDING run matching current settings if available.
      // - If no appropriate existing run exists, create a new one.
      const completedOrActive = existingRuns.find(
        (r) => r.status === 'COMPLETED' || r.status === 'APPROVED' || r.status === 'RUNNING'
      );

      const matchingPending = existingRuns.find((r) => {
        if (r.status !== 'PENDING') return false;
        if (!r.settings) return true;
        const matchesPlatform = !targetPlatform || r.settings.target_platform === targetPlatform;
        const matchesMode = !producerMode || r.settings.producer_mode === producerMode;
        return matchesPlatform && matchesMode;
      });

      const reusableRun = completedOrActive || matchingPending;

      if (reusableRun && !isUserAction) {
        setRun(reusableRun);
        // Sync control settings with the loaded run
        if (reusableRun.settings) {
          if (reusableRun.settings.producer_mode) setProducerMode(reusableRun.settings.producer_mode);
          if (
            reusableRun.settings.target_platform === 'tiktok' ||
            reusableRun.settings.target_platform === 'youtube' ||
            reusableRun.settings.target_platform === 'instagram' ||
            reusableRun.settings.target_platform === 'shorts'
          ) {
            setTargetPlatform(reusableRun.settings.target_platform);
          }
          if (reusableRun.settings.user_instruction !== undefined) setUserInstruction(reusableRun.settings.user_instruction || '');
        }
        return;
      }

      // 2. Initialize a new Autopilot run only when needed
      const newRun = await autopilotService.createRun(clipId, {
        producer_mode: producerMode,
        target_platform: targetPlatform,
        user_instruction: userInstruction || undefined,
        auto_select_highest_scoring_thumbnail: true,
      });
      setRun(newRun);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Autopilot run.');
    } finally {
      setLoading(false);
    }
  }, [clipId, producerMode, targetPlatform, userInstruction]);

  useEffect(() => {
    if (!initialMountDone.current) {
      initialMountDone.current = true;
      loadRun(false);
    }
  }, [loadRun]);

  const handleStartPipeline = async () => {
    if (!run) return;
    try {
      setExecuting(true);
      setError(null);
      const updated = await autopilotService.executeRun(run.id);
      setRun(updated);
    } catch (err: any) {
      setError(err.message || 'Autopilot pipeline failed.');
      // Refresh state to see which step failed
      if (run) {
        const fresh = await autopilotService.getRun(run.id).catch(() => null);
        if (fresh) setRun(fresh);
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleRetryStep = async (step: AutopilotStepName) => {
    if (!run) return;
    try {
      setExecuting(true);
      setError(null);
      const updated = await autopilotService.retryStep(run.id, step);
      setRun(updated);
    } catch (err: any) {
      setError(err.message || `Failed to retry step ${step}.`);
    } finally {
      setExecuting(false);
    }
  };

  const handleApprove = async () => {
    if (!run) return;
    try {
      setExecuting(true);
      setError(null);
      const result = await autopilotService.approveRun(run.id);
      setRun(result.run);
      if (onOpenPublish && result.publishing_handoff) {
        onOpenPublish(result.publishing_handoff);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve Autopilot package.');
    } finally {
      setExecuting(false);
    }
  };

  const getStepIcon = (name: AutopilotStepName) => {
    switch (name) {
      case 'PRODUCER':
        return <Wand2 className="w-4 h-4 text-purple-400" />;
      case 'HOOK_LAB':
        return <Flame className="w-4 h-4 text-amber-400" />;
      case 'THUMBNAIL_LAB':
        return <ImageIcon className="w-4 h-4 text-rose-400" />;
      case 'CONTENT_PACK':
        return <Layers className="w-4 h-4 text-blue-400" />;
      case 'APPROVAL':
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getStatusBadge = (status: AutopilotStepResult['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded-full animate-pulse">
            <div className="w-2.5 h-2.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" /> In Progress
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" /> Blocked
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" /> Ready
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center text-neutral-400">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Initializing Autopilot Orchestrator...</p>
      </div>
    );
  }

  const isPipelineCompleted = run?.status === 'COMPLETED';
  const isApproved = run?.status === 'APPROVED';

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-y-auto p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-neutral-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold rounded">
              Phase 26
            </span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Full Pipeline Autopilot
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            End-to-end orchestration: Producer Director → Hook Lab → Thumbnail Lab → Content Pack → Human Review Gate
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isPipelineCompleted && !isApproved && (
            <button
              onClick={handleStartPipeline}
              disabled={executing}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-2 transition"
            >
              {executing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Start Autopilot Run
                </>
              )}
            </button>
          )}

          {isPipelineCompleted && !isApproved && (
            <button
              onClick={handleApprove}
              disabled={executing}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-2 transition"
            >
              <Check className="w-3.5 h-3.5" />
              Approve for Publishing
            </button>
          )}

          {isApproved && (
            <button
              onClick={() => onOpenPublish && run?.publishing_handoff && onOpenPublish(run.publishing_handoff)}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-2 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              Open Publishing Composer
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-lg text-xs text-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Settings Grid */}
      {!executing && run?.status === 'PENDING' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-300">Producer Editing Mode</label>
            <select
              value={producerMode}
              onChange={(e) => setProducerMode(e.target.value as any)}
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg p-2 text-xs"
            >
              <option value="LIGHT">LIGHT (Conservative / Podcasts)</option>
              <option value="BALANCED">BALANCED (Shorts / Reels - Recommended)</option>
              <option value="AGGRESSIVE">AGGRESSIVE (Viral Fast-Paced)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-300">Target Social Platform</label>
            <select
              value={targetPlatform}
              onChange={(e) => setTargetPlatform(e.target.value as any)}
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg p-2 text-xs"
            >
              <option value="tiktok">TikTok (9:16)</option>
              <option value="shorts">YouTube Shorts (9:16)</option>
              <option value="instagram">Instagram Reels (9:16)</option>
              <option value="youtube">YouTube (16:9)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-300">Creative Direction / Instruction</label>
            <input
              type="text"
              placeholder="e.g. Focus on the core business insight..."
              value={userInstruction}
              onChange={(e) => setUserInstruction(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg p-2 text-xs"
            />
          </div>
        </div>
      )}

      {/* Orchestration Stage Pipeline */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
          Pipeline Execution Stages
        </h3>

        <div className="space-y-3">
          {run?.steps.map((step, idx) => (
            <div
              key={step.step}
              className={`p-4 rounded-xl border transition ${
                step.status === 'RUNNING'
                  ? 'bg-neutral-900 border-sky-500/50 shadow-md ring-1 ring-sky-500/20'
                  : step.status === 'COMPLETED'
                  ? 'bg-neutral-900/60 border-neutral-800'
                  : step.status === 'FAILED'
                  ? 'bg-red-950/20 border-red-500/40'
                  : 'bg-neutral-900/30 border-neutral-800/60 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-800 text-xs font-bold text-neutral-300">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {getStepIcon(step.step)}
                    <span className="text-sm font-semibold text-white">
                      {step.step.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(step.status)}
                  {step.status === 'FAILED' && step.retry_eligible && (
                    <button
                      onClick={() => handleRetryStep(step.step)}
                      disabled={executing}
                      className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded border border-neutral-700 flex items-center gap-1 transition"
                    >
                      <RotateCcw className="w-3 h-3" /> Retry Step
                    </button>
                  )}
                  {step.step === 'APPROVAL' && isPipelineCompleted && !isApproved && (
                    <button
                      onClick={handleApprove}
                      disabled={executing}
                      className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition"
                    >
                      <Check className="w-3 h-3" />
                      Approve for Publishing
                    </button>
                  )}
                  {step.step === 'APPROVAL' && isApproved && onOpenPublish && Boolean(run?.publishing_handoff) && (
                    <button
                      onClick={() => onOpenPublish(run!.publishing_handoff!)}
                      className="px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition"
                    >
                      <Share2 className="w-3 h-3" />
                      Publish
                    </button>
                  )}
                </div>
              </div>

              {step.output_summary && (
                <div className="mt-2.5 pl-9 text-xs text-neutral-300 leading-relaxed">
                  {step.output_summary}
                </div>
              )}

              {step.error && (
                <div className="mt-2.5 pl-9 text-xs text-red-300 leading-relaxed font-mono">
                  Error: {step.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Review & Outputs Summary */}
      {(isPipelineCompleted || isApproved) && (
        <div className="p-5 bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Deliverables Ready for Review
            </h4>
            <span className="text-xs text-neutral-400">
              Source Video: {clipTitle}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {run?.hook_selection_rationale && (
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg space-y-1">
                <span className="font-semibold text-amber-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" /> Selected Hook
                </span>
                <p className="text-neutral-300 leading-relaxed">
                  {run.hook_selection_rationale}
                </p>
              </div>
            )}

            {run?.thumbnail_selection_rationale && (
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg space-y-1">
                <span className="font-semibold text-rose-400 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" /> Selected Thumbnail
                </span>
                <p className="text-neutral-300 leading-relaxed">
                  {run.thumbnail_selection_rationale}
                </p>
              </div>
            )}

            {run?.content_pack_id && (
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg space-y-1">
                <span className="font-semibold text-blue-400 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Content Pack
                </span>
                <p className="text-neutral-300 leading-relaxed">
                  Multi-platform copy package assembled and grounded against transcript.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

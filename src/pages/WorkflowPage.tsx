import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Layers,
  Search,
  RotateCcw,
  Sparkles,
  ExternalLink,
  FileText,
  Video,
  Image as ImageIcon,
  ShieldCheck,
  AlertTriangle,
  Send,
  Plus,
  X,
  History,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { workflowService } from '../services/workflowService';
import { ContentWorkflowRecord, WorkflowState } from '../types';

const STATE_COLUMNS: Array<{ id: WorkflowState; label: string; tone: string; description: string }> = [
  { id: 'PLANNED', label: 'Planned / Idea', tone: 'bg-zinc-100 text-zinc-700 border-zinc-200', description: 'Concepts, prompts, or draft clips planned for production' },
  { id: 'IN_PREPARATION', label: 'In Preparation', tone: 'bg-blue-50 text-blue-700 border-blue-200', description: 'Generating clips, hooks, thumbnails, and copy' },
  { id: 'READY_FOR_REVIEW', label: 'Ready for Review', tone: 'bg-purple-50 text-purple-700 border-purple-200', description: 'All creative artifacts ready for editorial check' },
  { id: 'AWAITING_APPROVAL', label: 'Awaiting Approval', tone: 'bg-amber-50 text-amber-700 border-amber-200', description: 'Passed review, pending creator or manager sign-off' },
  { id: 'APPROVED', label: 'Approved', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', description: 'Human approved and queued for distribution' },
  { id: 'PUBLISHED', label: 'Published', tone: 'bg-teal-50 text-teal-800 border-teal-200', description: 'Confirmed live publishing record on target platforms' },
];

export const WorkflowPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<ContentWorkflowRecord[]>([]);
  const [stateCounts, setStateCounts] = useState<Record<WorkflowState, number>>({
    PLANNED: 0,
    IN_PREPARATION: 0,
    READY_FOR_REVIEW: 0,
    AWAITING_APPROVAL: 0,
    APPROVED: 0,
    PUBLISHED: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<WorkflowState | 'ALL'>('ALL');
  const [activeWorkflow, setActiveWorkflow] = useState<ContentWorkflowRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await workflowService.listWorkflows({
        state: selectedState === 'ALL' ? undefined : selectedState,
        search: search.trim() || undefined,
      });
      setWorkflows(res.workflows);
      setStateCounts(res.state_counts);
    } catch (err: any) {
      setError(err?.message || 'Failed to load content workflows.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, [selectedState]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWorkflows();
  };

  const handleOpenDetail = (wf: ContentWorkflowRecord) => {
    setActiveWorkflow(wf);
    setIsDetailOpen(true);
    setActionMessage(null);
    setRevisionNotes('');
    setApprovalNotes('');
  };

  const handleTransition = async (targetState: WorkflowState) => {
    if (!activeWorkflow) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const updated = await workflowService.transitionWorkflow(activeWorkflow.id, targetState, {
        expectedVersion: activeWorkflow.version,
      });
      setActiveWorkflow(updated);
      setActionMessage({ type: 'success', text: `Successfully moved to ${targetState.replace(/_/g, ' ')}.` });
      await fetchWorkflows();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Transition failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!activeWorkflow) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const updated = await workflowService.approveWorkflow(activeWorkflow.id, approvalNotes.trim() || undefined);
      setActiveWorkflow(updated);
      setActionMessage({ type: 'success', text: 'Content approved successfully.' });
      setApprovalNotes('');
      await fetchWorkflows();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Approval failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevisions = async () => {
    if (!activeWorkflow) return;
    if (!revisionNotes.trim()) {
      setActionMessage({ type: 'error', text: 'Please specify the revisions needed.' });
      return;
    }
    try {
      setActionLoading(true);
      setActionMessage(null);
      const updated = await workflowService.requestRevisions(activeWorkflow.id, revisionNotes.trim());
      setActiveWorkflow(updated);
      setActionMessage({ type: 'success', text: 'Content returned to preparation for revisions.' });
      setRevisionNotes('');
      await fetchWorkflows();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Revision request failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-vireo-green">Content Lifecycle & Automation</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
            Content Workflows
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track video content from ideation and preparation through review, human approval, and published verification.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-white p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode('board')}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                viewMode === 'board' ? 'bg-[#eaf3eb] text-vireo-green font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pipeline Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                viewMode === 'list' ? 'bg-[#eaf3eb] text-vireo-green font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              List View
            </button>
          </div>
          <button
            onClick={() => fetchWorkflows()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-cream"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* State Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setSelectedState('ALL')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            selectedState === 'ALL'
              ? 'bg-forest text-white'
              : 'bg-white border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          All Stages ({Object.values(stateCounts).reduce((a, b) => a + b, 0)})
        </button>
        {STATE_COLUMNS.map((col) => (
          <button
            key={col.id}
            onClick={() => setSelectedState(col.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedState === col.id
                ? 'bg-forest text-white'
                : 'bg-white border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {col.label} ({stateCounts[col.id] || 0})
          </button>
        ))}
      </div>

      {/* Search and Filters Bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search content or clip title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-white py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:border-vireo-green focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90"
        >
          Filter
        </button>
      </form>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border bg-white/60">
          <div className="text-center">
            <RefreshCw className="mx-auto size-6 animate-spin text-vireo-green" />
            <p className="mt-2 text-sm text-muted-foreground">Loading content workflows...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-red-500" />
          <h3 className="mt-2 text-sm font-semibold text-red-800">Unable to load workflows</h3>
          <p className="mt-1 text-xs text-red-600">{error}</p>
          <button
            onClick={() => fetchWorkflows()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
          <Layers className="mx-auto size-12 text-muted-foreground/40" />
          <h3 className="mt-4 text-base font-semibold text-foreground">No content items found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedState !== 'ALL'
              ? `No content currently in ${selectedState.replace(/_/g, ' ')}. Try selecting 'All Stages'.`
              : 'Create a video clip to begin automatic workflow tracking.'}
          </p>
          <Link
            to="/projects/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-clay px-5 py-2.5 text-sm font-semibold text-white shadow-clay hover:bg-[#c93f1e]"
          >
            <Plus className="size-4" /> Clip a Video
          </Link>
        </div>
      ) : viewMode === 'board' ? (
        /* Kanban Pipeline View */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-6 overflow-x-auto pb-4">
          {STATE_COLUMNS.map((col) => {
            const colWorkflows = workflows.filter((w) => w.current_state === col.id);
            return (
              <div key={col.id} className="flex min-w-[240px] flex-col rounded-2xl border border-border bg-white/70 p-3 shadow-2xs">
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{col.label}</h3>
                    <p className="text-[10px] text-muted-foreground truncate" title={col.description}>
                      {col.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-foreground">
                    {colWorkflows.length}
                  </span>
                </div>

                {/* Column Items */}
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                  {colWorkflows.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/60 text-center text-[11px] text-muted-foreground/60">
                      Empty
                    </div>
                  ) : (
                    colWorkflows.map((wf) => {
                      const completedCount = wf.checklist.filter((c) => c.completed).length;
                      return (
                        <div
                          key={wf.id}
                          onClick={() => handleOpenDetail(wf)}
                          className="group cursor-pointer rounded-xl border border-border bg-white p-3.5 shadow-2xs transition-all hover:border-vireo-green hover:shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-vireo-green">
                              {wf.title}
                            </h4>
                          </div>

                          {/* Artifact Badges */}
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {wf.artifacts.clip && (
                              <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                <Video className="size-3 text-vireo-green" />
                                Clip {wf.artifacts.clip.status}
                              </span>
                            )}
                            {wf.artifacts.content_pack && (
                              <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                <FileText className="size-3 text-purple-600" />
                                Pack ({wf.artifacts.content_pack.items_count})
                              </span>
                            )}
                            {wf.artifacts.hook_lab && (
                              <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                <Sparkles className="size-3 text-amber-600" />
                                Hook
                              </span>
                            )}
                            {wf.artifacts.thumbnail_lab && (
                              <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                <ImageIcon className="size-3 text-blue-600" />
                                Thumb
                              </span>
                            )}
                            {wf.artifacts.publishing?.status === 'published' && (
                              <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                                <Send className="size-3" />
                                Published
                              </span>
                            )}
                          </div>

                          {/* Progress indicator */}
                          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2">
                            <span className="inline-flex items-center gap-1">
                              <CheckSquare className="size-3" />
                              {completedCount}/{wf.checklist.length} ready
                            </span>
                            <span className="text-[10px] text-vireo-green font-medium group-hover:underline">
                              Inspect →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-2xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-cream/40 text-xs font-semibold text-muted-foreground">
                <th className="py-3 px-4">Content Title</th>
                <th className="py-3 px-4">Workflow State</th>
                <th className="py-3 px-4">Artifacts Ready</th>
                <th className="py-3 px-4">Readiness Progress</th>
                <th className="py-3 px-4">Human Approval</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {workflows.map((wf) => {
                const completedCount = wf.checklist.filter((c) => c.completed).length;
                return (
                  <tr key={wf.id} className="hover:bg-cream/20 transition-colors">
                    <td className="py-3 px-4 font-semibold text-foreground">
                      <button onClick={() => handleOpenDetail(wf)} className="hover:text-vireo-green text-left">
                        {wf.title}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-foreground">
                        {wf.current_state.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {wf.artifacts.clip && <span title="Clip Ready"><Video className="size-3.5 text-vireo-green" /></span>}
                        {wf.artifacts.content_pack && <span title="Content Pack"><FileText className="size-3.5 text-purple-600" /></span>}
                        {wf.artifacts.hook_lab && <span title="Hook Lab"><Sparkles className="size-3.5 text-amber-600" /></span>}
                        {wf.artifacts.thumbnail_lab && <span title="Thumbnail Lab"><ImageIcon className="size-3.5 text-blue-600" /></span>}
                        {wf.artifacts.publishing?.status === 'published' && <span title="Published"><Send className="size-3.5 text-teal-600" /></span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full bg-vireo-green rounded-full"
                            style={{ width: `${(completedCount / (wf.checklist.length || 1)) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {completedCount}/{wf.checklist.length}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {wf.approved_at ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <ShieldCheck className="size-3.5 text-emerald-600" /> Approved
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenDetail(wf)}
                        className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-cream"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over Detail Drawer */}
      {isDetailOpen && activeWorkflow && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-forest/30 backdrop-blur-xs flex justify-end">
          <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-foreground">
                  {activeWorkflow.current_state.replace(/_/g, ' ')}
                </span>
                <h2 className="mt-1 font-display text-xl font-semibold text-foreground">
                  {activeWorkflow.title}
                </h2>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-cream hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {actionMessage && (
                <div
                  className={`rounded-xl p-3.5 text-xs font-medium ${
                    actionMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {actionMessage.text}
                </div>
              )}

              {/* Outstanding Missing Blockers */}
              {activeWorkflow.missing_prerequisites.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                    <AlertTriangle className="size-4 text-amber-600" />
                    Outstanding Prerequisites
                  </div>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-amber-800">
                    {activeWorkflow.missing_prerequisites.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Readiness Checklist */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">
                  Readiness Criteria & Gates
                </h3>
                <div className="space-y-2.5">
                  {activeWorkflow.checklist.map((task) => (
                    <div
                      key={task.task_key}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${
                        task.completed ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-white'
                      }`}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                      ) : (
                        <Clock className="size-4 shrink-0 text-zinc-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-foreground">{task.label}</h4>
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              task.completed ? 'text-emerald-700' : 'text-zinc-500'
                            }`}
                          >
                            {task.completed ? 'Complete' : 'Required'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                        {task.details && (
                          <p className="mt-1 text-[11px] font-medium text-foreground/80">{task.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Studio Artifacts */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">
                  Studio Artifacts & Links
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {activeWorkflow.clip_id ? (
                    <>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit`}
                        className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-cream/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Video className="size-4 text-vireo-green" />
                          <span className="text-xs font-semibold">Clip Editor</span>
                        </div>
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </Link>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit?tab=content_pack`}
                        className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-cream/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-purple-600" />
                          <span className="text-xs font-semibold">Content Pack</span>
                        </div>
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </Link>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit?tab=hook_lab`}
                        className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-cream/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-4 text-amber-600" />
                          <span className="text-xs font-semibold">Hook Lab</span>
                        </div>
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </Link>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit?tab=thumbnail_lab`}
                        className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-cream/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ImageIcon className="size-4 text-blue-600" />
                          <span className="text-xs font-semibold">Thumbnail Lab</span>
                        </div>
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </Link>
                    </>
                  ) : null}
                  <Link
                    to="/brand"
                    className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-cream/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-emerald-600" />
                      <span className="text-xs font-semibold">Brand Brain</span>
                    </div>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                  <Link
                    to="/ab-testing"
                    className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-cream/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-orange-600" />
                      <span className="text-xs font-semibold">A/B Studio</span>
                    </div>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                </div>
              </div>

              {/* Human Approval Sign-off or Revision Request */}
              {['READY_FOR_REVIEW', 'AWAITING_APPROVAL'].includes(activeWorkflow.current_state) && (
                <div className="rounded-xl border border-border bg-cream/30 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Human Review Gate
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Content cannot be published without explicit approval sign-off.
                  </p>
                  <div>
                    <input
                      type="text"
                      placeholder="Optional approval notes..."
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs placeholder:text-muted-foreground/60 focus:border-vireo-green focus:outline-none"
                    />
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <ShieldCheck className="mr-1.5 inline size-3.5" />
                        Approve Content
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-3">
                    <p className="text-xs font-semibold text-foreground mb-1">Need Changes?</p>
                    <input
                      type="text"
                      placeholder="Specify requested revisions..."
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs placeholder:text-muted-foreground/60 focus:border-vireo-green focus:outline-none"
                    />
                    <button
                      onClick={handleRequestRevisions}
                      disabled={actionLoading || !revisionNotes.trim()}
                      className="mt-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-cream disabled:opacity-50"
                    >
                      <RotateCcw className="mr-1.5 inline size-3" />
                      Send Back for Revisions
                    </button>
                  </div>
                </div>
              )}

              {/* State Transitions Actions */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">
                  Move to Next Stage
                </h3>
                <div className="flex flex-wrap gap-2">
                  {activeWorkflow.can_transition_to.map((target) => (
                    <button
                      key={target}
                      onClick={() => handleTransition(target)}
                      disabled={actionLoading}
                      className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest/90 disabled:opacity-50"
                    >
                      Move to {target.replace(/_/g, ' ')} →
                    </button>
                  ))}
                  {activeWorkflow.can_transition_to.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {activeWorkflow.current_state === 'PUBLISHED'
                        ? 'This content has been published live.'
                        : 'Complete outstanding prerequisites above to advance stage.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Audit Trail Timeline */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-1.5">
                  <History className="size-3.5" />
                  Audit Trail History
                </h3>
                <div className="space-y-2 border-l-2 border-border ml-2 pl-3">
                  {activeWorkflow.audit_trail.slice().reverse().map((entry) => (
                    <div key={entry.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {entry.from_state} → {entry.to_state}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Action: <span className="font-medium text-foreground">{entry.action}</span>
                        {entry.notes ? ` — "${entry.notes}"` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

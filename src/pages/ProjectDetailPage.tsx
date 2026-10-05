import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Pencil,
  Video,
  Link2,
  FileCheck2,
  FileText,
  Calendar,
  Loader2,
  RefreshCw,
  Sparkles,
  Volume2,
  Clock,
  Globe,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  CircleCheck,
  SlidersHorizontal,
  RotateCcw,
  Film,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { StatusBadge, isProcessing } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { projectService } from '../services/projectService';
import { backendRequest } from '../services/backendClient';
import { Project, ContentOutput, OutputPlatform, Transcript, GenerationOverrides } from '../types';
import { useAuth } from '../context/AuthContext';
import { CreatorPersonaCard } from '../components/react-bits/CreatorPersonaCard';
import { GenerationProgress } from '../components/react-bits/GenerationProgress';
import { SpotlightCard } from '../components/react-bits/SpotlightCard';
import { QuotaExceededModal } from '../components/QuotaExceededModal';
import { ClipWorkspace } from '../components/clips/ClipWorkspace';

interface TabConfig {
  key: OutputPlatform;
  label: string;
  groups: Array<{ type: ContentOutput['content_type']; label: string }>;
}

const TABS: TabConfig[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    groups: [
      { type: 'title', label: 'Title ideas (High CTR)' },
      { type: 'description', label: 'Video description' },
      { type: 'chapters', label: 'Timestamped chapters' },
      { type: 'keywords', label: 'SEO keywords & tags' },
    ],
  },
  {
    key: 'instagram',
    label: 'Instagram',
    groups: [
      { type: 'hook', label: 'Reel & carousel hooks' },
      { type: 'caption', label: 'Feed caption' },
      { type: 'hashtags', label: 'Curated hashtags' },
    ],
  },
  {
    key: 'shorts',
    label: 'Shorts / Reels',
    groups: [{ type: 'moment', label: 'Best moments & clip cut-points' }],
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    groups: [
      { type: 'hook', label: 'Opening hooks' },
      { type: 'caption', label: 'Video caption' },
      { type: 'moment', label: 'Clip idea' },
    ],
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    groups: [{ type: 'post', label: 'Thought leadership post' }],
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    groups: [
      { type: 'post', label: 'Standalone post' },
      { type: 'thread', label: 'Thread structure & hooks' },
    ],
  },
];

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { creatorProfile } = useAuth();
  const [project, setProject] = useState<Project | undefined>(() =>
    id ? projectService.getProject(id) : undefined
  );
  const [outputs, setOutputs] = useState<ContentOutput[]>(() =>
    id ? projectService.getOutputs(id) : []
  );
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [isLoading, setIsLoading] = useState(!project);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingPlatform, setGeneratingPlatform] = useState<OutputPlatform | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Quota error state
  const [quotaError, setQuotaError] = useState<{
    remaining_minutes?: number;
    requested_minutes?: number;
    limit_minutes?: number;
    reset_date?: string;
  } | null>(null);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);

  // Video-level persona tuning state (only applies to this project)
  const [showTuning, setShowTuning] = useState(false);
  const [tuningTone, setTuningTone] = useState('');
  const [tuningLanguage, setTuningLanguage] = useState('');
  const [tuningInstructions, setTuningInstructions] = useState('');
  const [tuningCTA, setTuningCTA] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<'clips' | 'content' | 'transcript'>('clips');

  const hasTuningOverrides = Boolean(tuningTone || tuningLanguage || tuningInstructions || tuningCTA);

  useEffect(() => {
    let active = true;
    setVideoPreviewUrl(null);
    if (project?.source_type !== 'upload' || !project.source_url) return;
    backendRequest<{ signedUrl: string }>(`/projects/${project.id}/source-preview-url`).then((data) => {
      if (active) setVideoPreviewUrl(data.signedUrl || null);
    }).catch(() => { if (active) setVideoPreviewUrl(null); });
    return () => { active = false; };
  }, [project?.source_type, project?.source_url]);

  const handleGenerateContent = async (targetPlatform?: OutputPlatform) => {
    if (!id) return;
    setIsGenerating(true);
    setGeneratingPlatform(targetPlatform || null);
    setGenerationError(null);

    const overrides: GenerationOverrides | undefined = (tuningTone || tuningLanguage || tuningCTA)
      ? {
          overrideTone: tuningTone || undefined,
          overrideLanguage: tuningLanguage || undefined,
          overrideCTA: tuningCTA || undefined,
        }
      : undefined;

    try {
      await projectService.generateContent(
        id,
        targetPlatform,
        tuningInstructions.trim() || undefined,
        overrides
      );
      await refreshData();
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to generate content. Please try again.');
    } finally {
      setIsGenerating(false);
      setGeneratingPlatform(null);
    }
  };

  const refreshData = async () => {
    if (!id) return;
    const p = await projectService.fetchProject(id);
    const o = projectService.getOutputs(id);
    if (p) setProject(p);
    setOutputs(o);

    // Only query transcript if project has reached a transcribed/completed milestone
    const currentStatus = p?.video_status || p?.status;
    if (currentStatus === 'transcribed' || currentStatus === 'completed' || currentStatus === 'complete' || currentStatus === 'generating') {
      const t = await projectService.fetchTranscript(id);
      if (t) setTranscript(t);

      // Load current content outputs from the backend
      const realOutputs = await projectService.fetchContentOutputs(id);
      if (realOutputs) setOutputs(realOutputs);
    } else {
      setTranscript(null);
    }

    setIsLoading(false);
  };

  // Initial load & updates listener
  useEffect(() => {
    refreshData();

    const handleUpdate = () => refreshData();
    window.addEventListener('vireo_project_updated', handleUpdate);

    return () => {
      window.removeEventListener('vireo_project_updated', handleUpdate);
    };
  }, [id]);

  const hasAttemptedAutoStart = useRef(false);

  // Auto-start processing once when newly uploaded
  useEffect(() => {
    if (!project || !id || hasAttemptedAutoStart.current) return;
    const currentStatus = project.video_status || project.status;
    if (currentStatus === 'uploaded' && project.source_type === 'upload' && project.source_url) {
      hasAttemptedAutoStart.current = true;
      projectService.startProcessing(id).catch((err: any) => {
        if (err.status === 403 || err.error_code === 'QUOTA_EXCEEDED') {
          setQuotaError({
            remaining_minutes: err.remaining_minutes,
            requested_minutes: err.requested_minutes,
            limit_minutes: err.limit_minutes,
            reset_date: err.reset_date,
          });
          setIsQuotaModalOpen(true);
        } else if (err.message) {
          setActionError(err.message);
        }
        console.warn('Auto-start processing notice:', err.message);
      });
    }
  }, [id, project?.video_status, project?.status, project?.source_type, project?.source_url]);

  // Polling loop while processing or transcribing or generating
  useEffect(() => {
    if (!id || !project) return;
    const currentStatus = project.video_status || project.status;
    const active = isProcessing(currentStatus) && project.source_type !== 'url';

    if (!active) return;

    const interval = setInterval(() => {
      refreshData();
    }, 2500);

    return () => clearInterval(interval);
  }, [id, project?.video_status, project?.status]);

  const handleRetryProcessing = async () => {
    if (!id) return;
    setIsRetrying(true);
    setActionError(null);
    setQuotaError(null);
    try {
      await projectService.startProcessing(id);
      await refreshData();
    } catch (err: any) {
      if (err.status === 403 || err.error_code === 'QUOTA_EXCEEDED') {
        setQuotaError({
          remaining_minutes: err.remaining_minutes,
          requested_minutes: err.requested_minutes,
          limit_minutes: err.limit_minutes,
          reset_date: err.reset_date,
        });
        setIsQuotaModalOpen(true);
      } else {
        setActionError(err.message || 'Failed to start processing.');
      }
    } finally {
      setIsRetrying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-12">
        <LoadingState
          message="Loading project details…"
          description="Fetching video record."
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-muted-foreground text-sm">Project not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard">Back to Studio</Link>
        </Button>
      </div>
    );
  }

  const isUrl = project.source_type === 'url';
  const statusVal = project.video_status || project.status;
  const isUploaded = statusVal === 'uploaded';
  const hasOutputs = outputs && outputs.length > 0;

  return (
    <div className="space-y-6 pt-4">
      {/* Back Link */}
      <Link
        to="/history"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        <span>Back to Projects</span>
      </Link>

      {/* Project Header */}
      <div className="flex flex-col items-start gap-5 rounded-2xl bg-white p-5 shadow-soft border border-border sm:flex-row sm:items-center md:p-6">
        <div className="grid aspect-video w-full shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eaf3eb] text-vireo-green sm:w-48">{videoPreviewUrl?<video src={videoPreviewUrl} controls preload="metadata" aria-label={`Preview ${project.title}`} className="h-full w-full object-cover"/>:<Video className="size-9" />}</div>
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight md:text-3xl font-display text-foreground">
              {project.title}
            </h1>
            <StatusBadge status={statusVal} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              <span>
                Created on{' '}
                {new Date(project.created_at).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium">
              {isUrl ? (
                <>
                  <Link2 className="size-3.5" />
                  <span>External URL</span>
                </>
              ) : (
                <>
                  <Video className="size-3.5" />
                  <span>Direct Upload</span>
                </>
              )}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" className="sm:ml-auto" asChild>
          <Link to="/projects/new">New Project</Link>
        </Button>
      </div>

      {isUrl && !['transcribed','completed','complete'].includes(statusVal) && (
        <div className="rounded-2xl border border-[#f2dacd] bg-[#fff6f0] p-5 text-sm text-[#813d22]">
          Video URL processing is not available for this project. Upload the video file to create a transcript and content kit.
          <Link to="/projects/new" className="ml-2 font-semibold underline">Upload a video</Link>
        </div>
      )}

      {/* Quota Exceeded Modal & Alert */}
      {quotaError && (
        <QuotaExceededModal
          isOpen={isQuotaModalOpen}
          onClose={() => setIsQuotaModalOpen(false)}
          limitMinutes={quotaError.limit_minutes ?? 15}
          remainingMinutes={quotaError.remaining_minutes ?? 0}
          requestedMinutes={quotaError.requested_minutes}
          resetDate={quotaError.reset_date}
        />
      )}

      {quotaError && (
        <div className="rounded-2xl border border-clay/40 bg-clay/5 p-6 text-center space-y-3">
          <div className="size-10 rounded-xl bg-clay/15 text-clay mx-auto flex items-center justify-center">
            <Clock className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-base text-foreground font-display">
              Monthly Processing Limit Reached
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
              You have <span className="font-semibold text-foreground">{quotaError.remaining_minutes ?? 0} minutes</span> remaining in your plan this month.
              {quotaError.requested_minutes ? (
                <> This video requires an estimated <span className="font-semibold text-foreground">~{quotaError.requested_minutes.toFixed(1)} minutes</span>.</>
              ) : null}
              {quotaError.reset_date && (
                <span className="block mt-1 font-mono text-clay text-xs">
                  Resets on {new Date(quotaError.reset_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} (UTC).
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setIsQuotaModalOpen(true)}>
              View Quota Details
            </Button>
            <Button variant="clay" size="sm" onClick={handleRetryProcessing} disabled={isRetrying}>
              Check Again
            </Button>
          </div>
        </div>
      )}

      {/* Failed State */}
      {statusVal === 'failed' ? (
        <div className="card-soft p-8 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="w-12 h-12 rounded-2xl bg-destructive/15 text-destructive mx-auto flex items-center justify-center">
            <RefreshCw className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-lg text-foreground font-display">Video Processing Failed</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              {actionError || 'The video processing or transcription failed. Please verify your video audio or try again.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="clay"
              disabled={isRetrying}
              onClick={handleRetryProcessing}
            >
              {isRetrying ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Retrying Processing…
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-1.5" />
                  Retry Processing
                </>
              )}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/projects/new">Try New Video</Link>
            </Button>
          </div>
        </div>
      ) : (
        /* Video Uploaded / Processing / Transcribed State */
        <div className="space-y-6">
          {/* Main Video / Processing Card */}
          {!['transcribed','completed','complete'].includes(statusVal) && <div className="card-soft p-6 md:p-8 space-y-6 bg-card border-border/80">
            <div><h2 className="font-display text-2xl font-semibold">Processing Your Video</h2><p className="mt-1 text-sm text-muted-foreground">Your video moves through each stage automatically. You can return to this page later.</p></div>
            <div className="grid grid-cols-2 gap-3 border-b border-border pb-6 sm:grid-cols-5">{[
              { key:'uploaded', label:'Uploaded', icon:UploadCloud },
              { key:'processing', label:'Processing', icon:Video },
              { key:'transcribing', label:'Transcribing', icon:Volume2 },
              { key:'generating', label:'Generating', icon:Sparkles },
              { key:'complete', label:'Complete', icon:CircleCheck },
            ].map((step,index)=>{const current=['uploading','uploaded','queued','processing','transcribing','analyzing','generating','transcribed','complete','completed'].indexOf(statusVal);const stage=[1,3,4,6,8][index];const done=current>stage;const active=current===stage || (index===1&&statusVal==='queued') || (index===3&&statusVal==='analyzing');return <div key={step.key} className="text-center"><span className={`mx-auto grid size-10 place-items-center rounded-full border ${done?'border-vireo-green bg-vireo-green text-white':active?'border-clay bg-clay text-white':'border-border bg-[#f7f8f7] text-muted-foreground'}`}><step.icon className="size-5"/></span><p className="mt-2 text-sm font-semibold">{step.label}</p><p className="text-xs text-muted-foreground">{done?'Complete':active?'In progress':'Pending'}</p></div>})}</div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    statusVal === 'transcribed'
                      ? 'bg-sage/15 text-sage'
                      : isProcessing(statusVal)
                      ? 'bg-clay/15 text-clay'
                      : 'bg-sage/15 text-sage'
                  }`}
                >
                  {isProcessing(statusVal) ? (
                    <Loader2 className="size-6 animate-spin" />
                  ) : statusVal === 'transcribed' ? (
                    <Sparkles className="size-6 text-clay" />
                  ) : (
                    <FileCheck2 className="size-6" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold font-display text-foreground">
                    {statusVal === 'transcribed'
                      ? 'Transcription complete'
                      : statusVal === 'transcribing'
                      ? 'Transcribing audio…'
                      : statusVal === 'processing'
                      ? 'Processing video…'
                      : isUploaded
                      ? 'Video uploaded successfully'
                      : isUrl
                      ? 'Video URL linked'
                      : 'Video uploading'}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {statusVal === 'transcribed'
                      ? 'Audio transcribed and ready for content generation.'
                      : statusVal === 'transcribing'
                      ? 'Extracting speech and generating timestamped segments.'
                      : statusVal === 'processing'
                      ? 'Retrieving media from private storage.'
                      : isUploaded
                      ? 'Stored securely in private storage.'
                      : isUrl
                      ? 'External video source registered.'
                      : 'File is being transferred to storage.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isUploaded && !isProcessing(statusVal) && (
                  <Button
                    size="sm"
                    variant="clay"
                    disabled={isRetrying}
                    onClick={handleRetryProcessing}
                  >
                    {isRetrying ? (
                      <Loader2 className="size-3.5 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="size-3.5 mr-1" />
                    )}
                    {isRetrying ? 'Starting…' : 'Start Processing'}
                  </Button>
                )}
              </div>
            </div>

            {/* Error Banner if processing failed to start */}
            {actionError && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <span className="font-semibold text-destructive">Processing error:</span>{' '}
                    <span className="text-foreground">{actionError}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Processing Banner if currently active */}
            {isProcessing(statusVal) && (
              <div className="p-4 rounded-xl bg-accent/20 border border-accent/40 flex items-center gap-3">
                <Loader2 className="size-5 text-accent-foreground animate-spin shrink-0" />
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-foreground">Pipeline in progress:</span>{' '}
                  <span className="text-muted-foreground">
                    {statusVal === 'transcribing'
                      ? 'Running Whisper transcription on audio track...'
                      : 'Preparing media and validating file structure...'}
                  </span>
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Source Type
                </span>
                <p className="text-sm font-medium text-foreground capitalize flex items-center gap-1.5">
                  {isUrl ? <Link2 className="size-3.5 text-clay" /> : <Video className="size-3.5 text-sage" />}
                  {project.source_type || (isUrl ? 'URL' : 'Upload')}
                </p>
              </div>

              {!isUrl && project.source_url && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Original File
                  </span>
                  <p className="text-sm font-medium text-foreground truncate" title={project.source_url.split('/').pop() || 'video.mp4'}>
                    {project.source_url.split('/').pop() || 'video.mp4'}
                  </p>
                </div>
              )}


              {isUrl && project.source_url && (
                <div className="rounded-2xl bg-cream/60 p-4 border border-border/60 space-y-1 sm:col-span-2 md:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Link2 className="size-3 text-muted-foreground" />
                    External Source
                  </span>
                  <p className="text-xs font-mono text-clay break-all truncate">
                    {project.source_url}
                  </p>
                </div>
              )}
            </div>

            {/* Notes / Context */}
            {project.notes && (
              <div className="rounded-2xl bg-cream/40 p-4 border border-border/60 space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <FileText className="size-3.5" />
                  Creator notes & context
                </span>
                <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {project.notes}
                </p>
              </div>
            )}
          </div>}

          {!['transcribed','completed','complete'].includes(statusVal) && (
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="card-soft p-6">
                <h2 className="font-display text-xl font-semibold">Live Activity</h2>
                <div className="mt-5 space-y-5">
                  {[
                    { label: 'Video uploaded', ready: !['uploading'].includes(statusVal) },
                    { label: 'Video processing', ready: ['processing','transcribing','analyzing','generating'].includes(statusVal) },
                    { label: 'Audio transcription', ready: ['transcribing','analyzing','generating'].includes(statusVal) },
                    { label: 'Content generation', ready: ['generating'].includes(statusVal) },
                  ].map((event) => <div key={event.label} className="flex items-center gap-3"><span className={`grid size-7 place-items-center rounded-full ${event.ready?'bg-[#e3f1e6] text-vireo-green':'bg-[#f2f3f3] text-muted-foreground'}`}>{event.ready?<Check className="size-4"/>:<Clock className="size-4"/>}</span><span className="text-sm font-medium">{event.label}</span><span className="ml-auto text-xs text-muted-foreground">{event.ready?'Started':'Pending'}</span></div>)}
                </div>
              </section>
              <section className="card-soft p-6">
                <h2 className="font-display text-xl font-semibold">Transcript & Content</h2>
                <div className="mt-5 space-y-3 rounded-xl border border-border bg-[#fafbf9] p-5"><div className="h-3 w-4/5 animate-pulse rounded bg-[#e9eeea]"/><div className="h-3 w-full animate-pulse rounded bg-[#e9eeea]"/><div className="h-3 w-2/3 animate-pulse rounded bg-[#e9eeea]"/></div>
                <p className="mt-4 text-sm text-muted-foreground">Transcript and generated drafts will appear when each step is ready.</p>
              </section>
            </div>
          )}

          {/* Phase 10: Primary Workspace Navigation (Clips / Content Kit / Transcript) */}
          {transcript && (
            <div className="space-y-6 pt-2">
              <div className="flex border-b border-border/80 gap-6">
                <button
                  onClick={() => setWorkspaceTab('clips')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                    workspaceTab === 'clips'
                      ? 'border-clay text-foreground font-display'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Film className="size-4 text-clay" />
                  <span>Clips</span>
                  <span className="rounded-full bg-clay/10 text-clay text-[11px] font-mono px-2 py-0.5 font-bold">
                    Primary
                  </span>
                </button>

                <button
                  onClick={() => setWorkspaceTab('content')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                    workspaceTab === 'content'
                      ? 'border-clay text-foreground font-display'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="size-4 text-sage" />
                  <span>Content Kit</span>
                  {hasOutputs && (
                    <span className="rounded-full bg-sage/10 text-sage text-[11px] font-mono px-2 py-0.5 font-bold">
                      {outputs.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setWorkspaceTab('transcript')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                    workspaceTab === 'transcript'
                      ? 'border-clay text-foreground font-display'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span>Transcript</span>
                </button>
              </div>

              {/* Tab 1: Clips Workspace (Primary Default) */}
              {workspaceTab === 'clips' && (
                <div className="animate-in fade-in duration-200">
                  <ClipWorkspace
                    projectId={project.id}
                    transcript={transcript}
                    videoPreviewUrl={videoPreviewUrl}
                  />
                </div>
              )}

              {/* Tab 2: Transcript View */}
              {workspaceTab === 'transcript' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <CreatorPersonaCard
                    profile={creatorProfile}
                    hasOverrides={hasTuningOverrides}
                  />
                  <TranscriptSection transcript={transcript} />
                </div>
              )}

              {/* Tab 3: Content Kit View */}
              {workspaceTab === 'content' && (
                <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold font-display text-foreground flex items-center gap-2">
                  <Sparkles className="size-5 text-clay" />
                  <span>Platform Content</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Repurpose video transcript into platform-native content kits for YouTube, Instagram, Shorts/Reels, TikTok, LinkedIn, and X.
                </p>
              </div>

              {transcript ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant={hasTuningOverrides ? 'clay' : 'outline'}
                    size="sm"
                    onClick={() => setShowTuning(!showTuning)}
                    className="gap-1.5"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    <span>{hasTuningOverrides ? 'Tuned for video' : 'Tune Persona'}</span>
                    {showTuning ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </Button>

                  <Button
                    variant="clay"
                    size="sm"
                    onClick={() => handleGenerateContent()}
                    disabled={isGenerating}
                    className="shadow-clay"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                        <span>Generating Content Kits...</span>
                      </>
                    ) : hasOutputs ? (
                      <>
                        <RefreshCw className="size-3.5 mr-1.5" />
                        <span>Regenerate All Kits</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 mr-1.5" />
                        <span>Generate Content Kits</span>
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Video-Level Persona Tuning Expandable AI Control Surface */}
            {transcript && showTuning && (
              <SpotlightCard
                spotlightColor="rgba(192, 98, 62, 0.12)"
                className="p-5 md:p-6 border-clay/30 bg-cream/50 animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/50 pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-clay/15 text-clay">
                      <SlidersHorizontal className="size-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold font-display text-foreground">
                        AI Control Surface — Customize for this video
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        {hasTuningOverrides
                          ? 'Only applies to this project · Does not modify your saved creator profile'
                          : 'Currently using your saved creator profile defaults'}
                      </p>
                    </div>
                  </div>

                  {hasTuningOverrides && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTuningTone('');
                        setTuningLanguage('');
                        setTuningCTA('');
                        setTuningInstructions('');
                      }}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground self-start sm:self-auto"
                    >
                      <RotateCcw className="size-3 mr-1" /> Reset to defaults
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3 pt-3">
                  <Input
                    label="Tone Override"
                    placeholder="e.g. Sarcastic, high-energy, contrarian"
                    value={tuningTone}
                    onChange={(e) => setTuningTone(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                  <Input
                    label="Language Override"
                    placeholder="e.g. Spanish, German, French"
                    value={tuningLanguage}
                    onChange={(e) => setTuningLanguage(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                  <Input
                    label="Call to Action (CTA) Override"
                    placeholder="e.g. Download the free checklist link below"
                    value={tuningCTA}
                    onChange={(e) => setTuningCTA(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>

                <div className="pt-3">
                  <Textarea
                    label="Specific Video Directives"
                    placeholder="e.g. Emphasize the second tip about cold emails; make the LinkedIn post sound like an engineering postmortem."
                    value={tuningInstructions}
                    onChange={(e) => setTuningInstructions(e.target.value)}
                    rows={2}
                    className="rounded-xl text-xs"
                  />
                </div>
              </SpotlightCard>
            )}

            {generationError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center justify-between">
                <span>{generationError}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGenerationError(null)}
                  className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* If transcript is not available yet, honestly communicate waiting state */}
            {!transcript && !hasOutputs && (
              <div className="card-soft p-6 sm:p-8 text-center space-y-3 border-dashed border-border/80 bg-cream/30">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                  <FileText className="size-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">Waiting for Transcript</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                    AI content generation requires a real video transcript. Once transcription is completed, you can generate drafts for YouTube, Instagram, Shorts/Reels, TikTok, LinkedIn, and X.
                  </p>
                </div>
              </div>
            )}

            {/* If transcript is ready but no outputs yet */}
            {transcript && !hasOutputs && !isGenerating && (
              <div className="card-soft p-6 text-center space-y-3 bg-cream/40">
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Transcript is ready! Click "Generate Content Kits" to create platform-specific content packages for this project.
                </p>
              </div>
            )}

            {/* Loading state during generation */}
            {isGenerating && (
              <GenerationProgress
                platformName={generatingPlatform ? generatingPlatform.toUpperCase() : undefined}
              />
            )}

            {hasOutputs && (
              <Workspace
                outputs={outputs}
                projectId={project.id}
                onRefresh={refreshData}
                onRegeneratePlatform={(p) => handleGenerateContent(p)}
                isGenerating={isGenerating}
                generatingPlatform={generatingPlatform}
              />
            )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function TranscriptSection({ transcript }: { transcript: Transcript }) {
  const [copied, setCopied] = useState(false);
  const [showSegments, setShowSegments] = useState(true);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(transcript.transcript_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="card-soft p-6 md:p-8 space-y-6 bg-card border-border/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-clay/15 text-clay flex items-center justify-center shrink-0">
            <Volume2 className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold font-display text-foreground">
              Video Transcript
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <Globe className="size-3" />
                <span className="uppercase">{transcript.language || 'en'}</span>
              </span>
              {transcript.duration_seconds !== null && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{formatTimestamp(transcript.duration_seconds)}</span>
                  </span>
                </>
              )}
              {transcript.segments && transcript.segments.length > 0 && (
                <>
                  <span>•</span>
                  <span>{transcript.segments.length} segments</span>
                </>
              )}
              <span>•</span><span>{transcript.transcript_text.trim().split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyAll}
            className="text-xs"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-sage mr-1.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5 mr-1.5" />
                Copy Full Transcript
              </>
            )}
          </Button>

          {transcript.segments && transcript.segments.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSegments(!showSegments)}
              className="text-xs"
            >
              {showSegments ? (
                <>
                  <ChevronUp className="size-3.5 mr-1" />
                  Hide Timestamps
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5 mr-1" />
                  Show Timestamps
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Timestamped Segments */}
      {showSegments && transcript.segments && transcript.segments.length > 0 ? (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {transcript.segments.map((seg, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl bg-cream/40 border border-border/40 hover:bg-cream/70 transition-colors"
            >
              <span className="font-mono text-xs font-semibold text-clay px-2 py-0.5 rounded-md bg-clay/10 shrink-0 select-all">
                {formatTimestamp(seg.start)}
              </span>
              <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed flex-1">
                {seg.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        /* Full text fallback */
        <div className="rounded-2xl bg-cream/30 p-4 border border-border/60 max-h-80 overflow-y-auto">
          <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {transcript.transcript_text}
          </p>
        </div>
      )}
    </div>
  );
}

function Workspace({
  outputs,
  projectId,
  onRefresh,
  onRegeneratePlatform,
  isGenerating,
  generatingPlatform,
}: {
  outputs: ContentOutput[];
  projectId: string;
  onRefresh: () => void;
  onRegeneratePlatform?: (platform: OutputPlatform) => void;
  isGenerating?: boolean;
  generatingPlatform?: OutputPlatform | null;
}) {
  const [activeTab, setActiveTab] = useState<OutputPlatform>('youtube');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const tabOutputs = outputs.filter((o) => o.platform === activeTab);
  const tabConfig = TABS.find((t) => t.key === activeTab)!;
  const isPlatformGenerating = isGenerating && generatingPlatform === activeTab;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const startEdit = (out: ContentOutput) => {
    setEditingId(out.id);
    setDraft(out.content);
  };

  const saveEdit = async (outputId: string) => {
    setIsSavingEdit(true);
    try {
      await projectService.updateOutputContentAsync(outputId, projectId, draft);
      setEditingId(null);
      onRefresh();
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div key={projectId} className="space-y-5">
      {/* Platform Navigation Tabs and Platform Regenerate Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div role="tablist" aria-label="Content platforms" className="flex max-w-full gap-1.5 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            const count = outputs.filter((o) => o.platform === tab.key).length;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                id={`tab-${tab.key}`}
                aria-controls={`panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-clay text-clay-foreground shadow-clay'
                    : 'text-muted-foreground hover:text-foreground hover:bg-cream/60'
                }`}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20' : 'bg-muted'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {onRegeneratePlatform && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegeneratePlatform(activeTab)}
            disabled={isGenerating}
            className="text-xs h-8"
          >
            {isPlatformGenerating ? (
              <>
                <Loader2 className="size-3 animate-spin mr-1" />
                <span>Regenerating {tabConfig.label}...</span>
              </>
            ) : isGenerating ? (
              <>
                <Loader2 className="size-3 animate-spin mr-1" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="size-3 mr-1" />
                <span>Regenerate {tabConfig.label}</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Tab Group Content */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="space-y-6">
        {tabOutputs.length===0 && <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center"><Sparkles className="mx-auto size-6 text-clay"/><p className="mt-3 font-semibold">No {tabConfig.label} content yet</p><p className="mt-1 text-sm text-muted-foreground">Generate this platform’s content to see drafts here.</p></div>}
        {tabConfig.groups.map((group) => {
          const items = tabOutputs.filter((o) => o.content_type === group.type);
          if (items.length === 0) return null;

          return (
            <div key={group.type} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-3">
                {items.map((item) => {
                  const isEditing = editingId === item.id;
                  const isCopied = copiedId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="card-soft p-4 sm:p-5 transition-all hover:border-border/80 group"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <Textarea
                            rows={item.content.length > 200 ? 8 : 4}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="clay"
                              onClick={() => saveEdit(item.id)}
                              disabled={isSavingEdit}
                            >
                              {isSavingEdit ? (
                                <>
                                  <Loader2 className="size-3 animate-spin mr-1" />
                                  <span>Saving...</span>
                                </>
                              ) : (
                                <span>Save changes</span>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-sans">
                            {item.content}
                          </p>
                          <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                            <span className="text-muted-foreground capitalize">
                              {item.content_type}
                            </span>
                            <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(item)}
                                className="h-7 px-2 text-xs"
                              >
                                <Pencil className="size-3 mr-1" />
                                <span>Edit</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(item.content, item.id)}
                                className="h-7 px-2 text-xs"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="size-3 mr-1 text-sage" />
                                    <span className="text-sage">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3 mr-1" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

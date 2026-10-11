import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  Link2,
  FolderOpen,
  Play,
  Pause,
  Film,
  Sparkles,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Download,
  Share2,
  SlidersHorizontal,
  Square,
  Volume2,
  Globe,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  CheckSquare,
  Search,
} from 'lucide-react';
import hookThumbnail from '../../assets/creators/creator-1.jpg';
import momentThumbnail from '../../assets/creators/creator-2.jpg';
import { projectService } from '../../services/projectService';
import { uploadVideoFile, validateVideoFile } from '../../services/storageService';
import { clipService } from '../../services/clipService';
import { clipRenderService } from '../../services/clipRenderService';
import { backendRequest } from '../../services/backendClient';
import { useAuth } from '../../context/AuthContext';
import { Project, ClipCandidate, RenderedClip } from '../../types';
import { PublishModal } from '../PublishModal';

export type WorkflowState =
  | 'no_source'
  | 'source_selected'
  | 'processing'
  | 'clips_ready'
  | 'exporting'
  | 'error';

export type AspectRatioOption = '9:16' | '1:1' | '16:9';
export type DurationPref = 'auto' | '15-30' | '30-60' | '60-90';
export type CaptionLang = 'auto' | 'en' | 'es' | 'fr' | 'de' | 'hi';
export type ClipCountPref = 'auto' | '3' | '5';

interface SelectedSource {
  type: 'file' | 'url' | 'project';
  file?: File;
  url?: string;
  projectId?: string;
  title: string;
  duration?: number;
  thumbnailUrl?: string | null;
  fileSizeFormatted?: string;
}

interface HomeClippingWorkflowProps {
  existingProjects: Project[];
  onRefreshProjects: () => void;
  onScrollToProjects?: () => void;
}

const STORAGE_KEY = 'vireo_home_active_workflow';

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function getYouTubeThumbnail(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId = '';
    if (parsed.hostname.includes('youtube.com')) {
      videoId = parsed.searchParams.get('v') || '';
    } else if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.slice(1);
    }
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {
    return null;
  }
  return null;
}

export const HomeClippingWorkflow: React.FC<HomeClippingWorkflowProps> = ({
  existingProjects,
  onRefreshProjects,
  onScrollToProjects,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Workflow State Machine
  const [workflowState, setWorkflowState] = useState<WorkflowState>('no_source');

  // Source selection state
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState('');
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isBrowseModalOpen, setIsBrowseModalOpen] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');

  // Configuration options state
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('9:16');
  const [durationPref, setDurationPref] = useState<DurationPref>('auto');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionLang, setCaptionLang] = useState<CaptionLang>('auto');
  const [clipCount, setClipCount] = useState<ClipCountPref>('auto');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Processing & Job state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectStatus, setActiveProjectStatus] = useState<string>('idle');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [processingStageMessage, setProcessingStageMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Results state
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [renderedClips, setRenderedClips] = useState<RenderedClip[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [activePreviewClipId, setActivePreviewClipId] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [sourceVideoStreamingUrl, setSourceVideoStreamingUrl] = useState<string | null>(null);
  const [clipSignedPreviewUrls, setClipSignedPreviewUrls] = useState<Record<string, string>>({});

  // Export & Publish modal state
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [isExportingClipId, setIsExportingClipId] = useState<string | null>(null);
  const [publishingClip, setPublishingClip] = useState<RenderedClip | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Persistence Recovery: Check localStorage on Mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (!savedRaw) return;
      const saved = JSON.parse(savedRaw);
      if (saved && saved.projectId && Date.now() - (saved.timestamp || 0) < 24 * 60 * 60 * 1000) {
        setActiveProjectId(saved.projectId);
        if (saved.aspectRatio) setAspectRatio(saved.aspectRatio);
        if (saved.durationPref) setDurationPref(saved.durationPref);
        if (saved.captionsEnabled !== undefined) setCaptionsEnabled(saved.captionsEnabled);
        if (saved.captionLang) setCaptionLang(saved.captionLang);
        if (saved.customInstructions) setCustomInstructions(saved.customInstructions);

        // Fetch project and restore state
        projectService.fetchProject(saved.projectId).then((proj) => {
          if (!proj) return;
          const status = proj.video_status || proj.status;
          setSelectedSource({
            type: (proj.source_type as any) || 'upload',
            projectId: proj.id,
            title: proj.title,
            thumbnailUrl: null,
          });

          if (['uploading', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(status)) {
            setWorkflowState('processing');
            setActiveProjectStatus(status);
          } else if (['completed', 'transcribed'].includes(status)) {
            loadResults(proj.id);
          } else if (status === 'failed') {
            setWorkflowState('error');
            setErrorMessage('Previous clipping job failed. You can retry processing.');
          }
        }).catch(() => {
          localStorage.removeItem(STORAGE_KEY);
        });
      }
    } catch {
      // Local storage parse error ignored
    }
  }, []);

  // Update local storage when active project ID changes
  useEffect(() => {
    if (activeProjectId && workflowState !== 'no_source') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          projectId: activeProjectId,
          aspectRatio,
          durationPref,
          captionsEnabled,
          captionLang,
          customInstructions,
          timestamp: Date.now(),
        })
      );
    } else if (workflowState === 'no_source') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeProjectId, workflowState, aspectRatio, durationPref, captionsEnabled, captionLang, customInstructions]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (localVideoPreviewUrl) {
        URL.revokeObjectURL(localVideoPreviewUrl);
      }
    };
  }, [localVideoPreviewUrl]);

  // 2. Fetch project source preview URL whenever active project changes
  useEffect(() => {
    let isMounted = true;
    if (!activeProjectId) {
      setSourceVideoStreamingUrl(null);
      return;
    }
    backendRequest<{ signedUrl: string }>(`/projects/${activeProjectId}/source-preview-url`)
      .then((data) => {
        if (isMounted && data?.signedUrl) {
          setSourceVideoStreamingUrl(data.signedUrl);
        }
      })
      .catch(() => {
        if (isMounted) setSourceVideoStreamingUrl(null);
      });
    return () => {
      isMounted = false;
    };
  }, [activeProjectId]);

  // 3. Polling Loop while in 'processing' state
  useEffect(() => {
    if (workflowState !== 'processing' || !activeProjectId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const proj = await projectService.fetchProject(activeProjectId);
        if (!proj || !isMounted) return;

        const status = proj.video_status || proj.status;
        setActiveProjectStatus(status);

        if (status === 'queued') {
          setProcessingStageMessage('Job queued in processing pipeline...');
        } else if (status === 'processing' || status === 'transcribing') {
          setProcessingStageMessage('Transcribing video speech with Whisper AI...');
        } else if (status === 'analyzing') {
          setProcessingStageMessage('Analyzing transcript and ranking viral hooks...');
        } else if (status === 'generating') {
          setProcessingStageMessage('Generating clips and applying smart aspect framing...');
        } else if (status === 'completed' || status === 'transcribed') {
          // If transcribed, automatically run AI clip analysis if candidates don't exist yet
          clearInterval(interval);
          setProcessingStageMessage('Finishing clip generation...');
          await handlePostProcessingReady(activeProjectId);
        } else if (status === 'failed') {
          clearInterval(interval);
          setWorkflowState('error');
          setErrorMessage('Processing failed on the server. Please check your video or retry.');
        }
      } catch (err: any) {
        // Polling failure, will retry next interval
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [workflowState, activeProjectId]);

  const loadResults = async (projectId: string) => {
    try {
      const [candData, clipsData] = await Promise.all([
        clipService.getClipCandidates(projectId).catch(() => []),
        clipRenderService.getProjectClips(projectId).catch(() => []),
      ]);

      setCandidates(candData || []);
      setRenderedClips(clipsData || []);

      if ((candData && candData.length > 0) || (clipsData && clipsData.length > 0)) {
        setWorkflowState('clips_ready');
        // Pre-select the top clip for preview
        const firstId = clipsData?.[0]?.id || candData?.[0]?.id || null;
        if (firstId) {
          setActivePreviewClipId(firstId);
        }
      } else {
        // If completed but no candidates yet, stay in source selected so user can analyze
        setWorkflowState('source_selected');
      }
    } catch {
      setWorkflowState('source_selected');
    }
  };

  const handlePostProcessingReady = async (projectId: string) => {
    try {
      // Check if candidates already exist
      const existingCandidates = await clipService.getClipCandidates(projectId).catch(() => []);
      if (existingCandidates.length === 0) {
        // Trigger clip analysis
        setProcessingStageMessage('Extracting viral clip moments...');
        const promptText = [
          durationPref !== 'auto' ? `Duration preference: ${durationPref} seconds.` : '',
          customInstructions.trim(),
        ].filter(Boolean).join(' ');

        await clipService.analyzeClips(projectId, promptText || undefined);
      }
      await loadResults(projectId);
      onRefreshProjects();
    } catch (err: any) {
      setWorkflowState('error');
      setErrorMessage(err.message || 'Failed to extract viral clips.');
    }
  };

  // -------------------------------------------------------------
  // SOURCE SELECTION HANDLERS
  // -------------------------------------------------------------

  const handlePickFile = (file?: File) => {
    if (!file) return;

    // Validate using storageService rules
    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Please select a valid video file.');
      setWorkflowState('error');
      return;
    }

    if (localVideoPreviewUrl) {
      URL.revokeObjectURL(localVideoPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalVideoPreviewUrl(objectUrl);
    setErrorMessage(null);
    setUrlValidationError(null);

    const source: SelectedSource = {
      type: 'file',
      file,
      title: file.name.replace(/\.[^.]+$/, ''),
      fileSizeFormatted: formatBytes(file.size),
      thumbnailUrl: null,
    };

    // Load duration from offscreen video element
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      source.duration = tempVideo.duration;
      setSelectedSource({ ...source });
    };
    tempVideo.src = objectUrl;

    setSelectedSource(source);
    setWorkflowState('source_selected');
  };

  const handleUrlSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUrlValidationError(null);
    setErrorMessage(null);

    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setUrlValidationError('Please paste a supported video URL.');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported.');
      }
    } catch {
      setUrlValidationError('Please enter a valid HTTP or HTTPS video URL.');
      return;
    }

    // Determine title and thumbnail
    const ytThumb = getYouTubeThumbnail(trimmed);
    let title = 'Imported Video';
    if (parsedUrl.hostname.includes('youtube') || parsedUrl.hostname.includes('youtu.be')) {
      title = 'YouTube Video';
    } else {
      const pathName = parsedUrl.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
      if (pathName) title = decodeURIComponent(pathName);
    }

    setSelectedSource({
      type: 'url',
      url: trimmed,
      title,
      thumbnailUrl: ytThumb,
    });
    setWorkflowState('source_selected');
  };

  const handleSelectExistingProject = (proj: Project) => {
    setIsBrowseModalOpen(false);
    setErrorMessage(null);
    setActiveProjectId(proj.id);

    // If previous job has an audio language configured in its notes, restore it
    const notesText = (proj.notes || (proj as any).description || '') as string;
    if (notesText) {
      const match = notesText.match(/\[Captions:\s*([^\]]+)\]/i);
      if (match && match[1]) {
        const lang = match[1].trim();
        if (['auto', 'en', 'es', 'fr', 'de', 'hi'].includes(lang)) {
          setCaptionLang(lang as CaptionLang);
        }
      }
    }

    const status = proj.video_status || proj.status;
    setSelectedSource({
      type: 'project',
      projectId: proj.id,
      title: proj.title,
      thumbnailUrl: null,
    });

    if (['uploading', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(status)) {
      setWorkflowState('processing');
      setActiveProjectStatus(status);
    } else if (['completed', 'transcribed'].includes(status)) {
      loadResults(proj.id);
    } else {
      setWorkflowState('source_selected');
    }
  };

  const handleReplaceSource = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (localVideoPreviewUrl) {
      URL.revokeObjectURL(localVideoPreviewUrl);
      setLocalVideoPreviewUrl(null);
    }
    setSelectedSource(null);
    setActiveProjectId(null);
    setInputUrl('');
    setErrorMessage(null);
    setUrlValidationError(null);
    setCandidates([]);
    setRenderedClips([]);
    setSelectedClipIds(new Set());
    setActivePreviewClipId(null);
    setIsPlayingPreview(false);
    setWorkflowState('no_source');
    localStorage.removeItem(STORAGE_KEY);
  };

  // -------------------------------------------------------------
  // GENERATE CLIPS PIPELINE EXECUTION
  // -------------------------------------------------------------

  const handleGenerateClips = async () => {
    if (isSubmitting || !selectedSource) return;

    if (!user) {
      setErrorMessage('Please sign in to generate clips with AI.');
      setWorkflowState('error');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let projectId = selectedSource.projectId;

      // 1. Direct File Upload Flow
      if (selectedSource.type === 'file' && selectedSource.file) {
        projectId = crypto.randomUUID();
        setActiveProjectId(projectId);
        setWorkflowState('processing');
        setActiveProjectStatus('uploading');
        setUploadProgress(0);
        setProcessingStageMessage('Uploading video to high-speed storage...');

        const notes = [
          `[Aspect: ${aspectRatio}]`,
          `[Duration: ${durationPref}]`,
          `[Captions: ${captionsEnabled ? captionLang : 'off'}]`,
          `[Clips: ${clipCount}]`,
          customInstructions.trim(),
        ].filter(Boolean).join(' ');

        // Create project record in DB
        await projectService.createProjectAsync({
          id: projectId,
          userId: user.id,
          title: selectedSource.title,
          sourceType: 'upload',
          videoStatus: 'uploading',
          notes,
        });

        // Upload to storage with byte progress
        await uploadVideoFile({
          file: selectedSource.file,
          projectId,
          onProgress: (pct) => setUploadProgress(pct),
          signal: abortController.signal,
        });

        setUploadProgress(100);
        setProcessingStageMessage('Starting AI transcription & video analysis...');

        // Start backend processing
        await projectService.startProcessing(projectId);
        setActiveProjectStatus('processing');
        onRefreshProjects();
      }
      // 2. URL Ingestion Flow
      else if (selectedSource.type === 'url' && selectedSource.url) {
        setWorkflowState('processing');
        setActiveProjectStatus('uploading');
        setProcessingStageMessage('Ingesting and analyzing media from URL...');

        const notes = [
          `[Aspect: ${aspectRatio}]`,
          `[Duration: ${durationPref}]`,
          `[Captions: ${captionsEnabled ? captionLang : 'off'}]`,
          `[Clips: ${clipCount}]`,
          customInstructions.trim(),
        ].filter(Boolean).join(' ');

        const proj = await projectService.ingestProjectUrlAsync({
          url: selectedSource.url,
          title: selectedSource.title,
          notes,
        });

        projectId = proj.id;
        setActiveProjectId(projectId);
        setProcessingStageMessage('Queuing video for AI transcription...');

        await projectService.startProcessing(projectId);
        setActiveProjectStatus('processing');
        onRefreshProjects();
      }
      // 3. Existing Project Flow
      else if (selectedSource.type === 'project' && projectId) {
        setWorkflowState('processing');
        const proj = await projectService.fetchProject(projectId);
        const currentStatus = proj?.video_status || proj?.status || 'idle';

        if (['completed', 'transcribed'].includes(currentStatus)) {
          // Project already transcribed, directly trigger AI clip analysis
          setProcessingStageMessage('Analyzing speech patterns and finding viral moments...');
          await handlePostProcessingReady(projectId);
        } else {
          // Start or resume processing
          setProcessingStageMessage('Processing video with AI...');
          await projectService.startProcessing(projectId);
          setActiveProjectStatus('processing');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('cancelled')) {
        setErrorMessage('Upload was cancelled.');
      } else {
        setErrorMessage(err.message || 'Failed to start video clipping job.');
      }
      setWorkflowState('error');
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  // -------------------------------------------------------------
  // CLIPS ACTIONS: PLAYBACK, SELECTION, EDIT & EXPORT
  // -------------------------------------------------------------

  const handleSelectClip = (id: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllClips = () => {
    const allIds = [
      ...renderedClips.map((c) => c.id),
      ...candidates.map((c) => c.id),
    ];
    if (selectedClipIds.size === allIds.length) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(allIds));
    }
  };

  const handlePlayClipPreview = async (clipId: string, startSeconds: number) => {
    setActivePreviewClipId(clipId);

    // If rendered clip with ready status, fetch its signed preview URL
    const rendered = renderedClips.find((c) => c.id === clipId);
    if (rendered && rendered.render_status === 'ready' && !clipSignedPreviewUrls[clipId]) {
      try {
        const url = await clipRenderService.getPreviewUrl(clipId);
        setClipSignedPreviewUrls((prev) => ({ ...prev, [clipId]: url }));
      } catch {
        // Fall back to source video seeking
      }
    }

    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = startSeconds;
      videoPlayerRef.current.play().then(() => {
        setIsPlayingPreview(true);
      }).catch(() => {
        setIsPlayingPreview(false);
      });
    }
  };

  const handleTogglePlayPause = () => {
    if (!videoPlayerRef.current) return;
    if (isPlayingPreview) {
      videoPlayerRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      videoPlayerRef.current.play().then(() => {
        setIsPlayingPreview(true);
      }).catch(() => {});
    }
  };

  // Edit clip: Navigates to existing Clip Editor with real clip ID
  const handleEditClip = async (clipId: string, isCandidate: boolean) => {
    if (!activeProjectId) return;

    if (!isCandidate) {
      // Already a RenderedClip
      navigate(`/clips/${clipId}/edit`);
      return;
    }

    // If candidate, render it first then navigate to editor
    try {
      setExportStatusMessage('Opening editor for clip...');
      const res = await clipRenderService.createClipFromCandidate(activeProjectId, clipId, aspectRatio);
      navigate(`/clips/${res.clip.id}/edit`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to prepare clip for editor.');
      setWorkflowState('error');
    }
  };

  // Export clip: Triggers signed download via clipRenderService
  const handleExportClip = async (clipId: string, isCandidate: boolean) => {
    if (!activeProjectId) return;

    setIsExportingClipId(clipId);
    setExportStatusMessage('Preparing high-quality export...');

    try {
      let targetClipId = clipId;

      if (isCandidate) {
        // Render clip first
        const createRes = await clipRenderService.createClipFromCandidate(activeProjectId, clipId, aspectRatio);
        targetClipId = createRes.clip.id;
      }

      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(targetClipId);
      if (signedUrl) {
        // Trigger browser download
        const a = document.createElement('a');
        a.href = signedUrl;
        a.download = filename || `vireoclip-${targetClipId.slice(0, 8)}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setExportStatusMessage(`Download initiated: ${filename || 'Clip exported'}`);
        setTimeout(() => setExportStatusMessage(null), 4000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to export clip. Please retry.');
      setWorkflowState('error');
    } finally {
      setIsExportingClipId(null);
    }
  };

  // Batch Export selected clips
  const handleBatchExport = async () => {
    if (selectedClipIds.size === 0) return;
    for (const id of Array.from(selectedClipIds)) {
      const isCandidate = candidates.some((c) => c.id === id);
      await handleExportClip(id, isCandidate);
    }
  };

  // -------------------------------------------------------------
  // RENDER SECTIONS BASED ON WORKFLOW STATE
  // -------------------------------------------------------------

  return (
    <div className="w-full">
      {/* Hidden file input for Upload Video */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePickFile(file);
          if (e.target) e.target.value = '';
        }}
      />

      {/* Offscreen video element for reading metadata/duration */}
      <video ref={offscreenVideoRef} className="hidden" />

      {/* =========================================================================
          STATE 1: NO SOURCE SELECTED (HERO & 3 INPUT CHANNELS)
          ========================================================================= */}
      {workflowState === 'no_source' && (
        <section
          aria-label="Create clips"
          className="vireo-dash-glass vireo-dash-hero p-6 sm:p-8 lg:p-10 xl:p-12 2xl:py-14 text-center rounded-[28px] shadow-[0_24px_70px_rgba(0,0,0,0.6)] border border-[#8B5CF6]/35 relative transition-all duration-300 flex flex-col justify-between lg:min-h-[clamp(520px,calc(100vh-170px),740px)]"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handlePickFile(dropped);
          }}
        >
          {/* Left Floating Card — "Your hook" (Real Creator Video Visual) */}
          <div
            className="hidden xl:flex vireo-clipcard-left group select-none animate-float-1 pointer-events-none"
            style={{ '--base-rot': '-7deg' } as React.CSSProperties}
            aria-label="Your hook preview"
          >
            <img
              src={hookThumbnail}
              alt="Podcast creator speaking - Your hook moment"
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#8B5CF6]/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 self-start flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-mono text-white/90 shadow-sm">
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>0:18</span>
            </div>
            <div className="relative z-10 self-start">
              <span className="font-['Sora',sans-serif] text-[11px] font-bold text-white bg-[#080B12]/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/15 shadow-md flex items-center gap-1.5">
                <span>Your</span>
                <b className="text-[#22D3EE] font-extrabold tracking-wide">hook</b>
              </span>
            </div>
          </div>

          {/* Right Floating Card — "Best moment" (Real Creator Video Visual) */}
          <div
            className="hidden xl:flex vireo-clipcard-right group select-none animate-float-2 pointer-events-none"
            style={{ '--base-rot': '7deg' } as React.CSSProperties}
            aria-label="Best moment preview"
          >
            <img
              src={momentThumbnail}
              alt="Podcast speaker reaction - Best moment"
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#22D3EE]/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 self-end flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-mono text-[#DDD6FE] shadow-sm">
              <Sparkles className="size-3 text-[#22D3EE]" />
              <span>Viral 98</span>
            </div>
            <div className="relative z-10 self-end">
              <span className="font-['Sora',sans-serif] text-[11px] font-bold text-white bg-[#080B12]/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/15 shadow-md flex items-center gap-1.5">
                <span>Best</span>
                <b className="text-[#A78BFA] font-extrabold tracking-wide">moment</b>
              </span>
            </div>
          </div>

          {/* Main Hero Header */}
          <div className="relative z-10 max-w-2xl mx-auto flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.04] border border-[#8B5CF6]/40 text-[#C4B5FD] text-xs font-semibold tracking-wide self-center">
              <span className="size-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
              <span>AI video clipping journey</span>
            </div>

            <h1 className="mt-4 sm:mt-5 text-3xl sm:text-4xl lg:text-[44px] font-extrabold tracking-tight font-['Sora',sans-serif] text-[#F4F6FB] leading-[1.14]">
              Turn Your Videos Into{' '}
              <span className="bg-gradient-to-r from-[#A78BFA] via-[#C084FC] to-[#22D3EE] bg-clip-text text-transparent">
                Great Clips
              </span>
            </h1>

            <p className="mt-3 sm:mt-3.5 text-sm sm:text-base text-[#8E9AB4] leading-relaxed max-w-lg mx-auto">
              Upload video files, paste a YouTube/Vimeo link, or select an existing project to extract viral shorts in one seamless workflow.
            </p>

            {/* URL Validation error notice */}
            {urlValidationError && (
              <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium flex items-center justify-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{urlValidationError}</span>
              </div>
            )}

            {/* URL Ingestion Input Form Bar */}
            <form
              onSubmit={handleUrlSubmit}
              className={`mt-5 sm:mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 sm:p-2.5 rounded-2xl sm:rounded-full bg-[#080B12]/80 border shadow-[0_20px_50px_rgba(0,0,0,0.4)] focus-within:ring-4 focus-within:ring-[#8B5CF6]/20 transition-all text-left ${
                isDragOver ? 'border-[#22D3EE] ring-4 ring-[#22D3EE]/20' : 'border-white/[0.14] focus-within:border-[#8B5CF6]/80'
              }`}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0 px-2 sm:px-3 py-1 sm:py-0">
                <Link2 className="size-5 text-[#8E9AB4] shrink-0" />
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Paste a supported video URL (YouTube, Vimeo, MP4)..."
                  aria-label="Video URL"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm sm:text-[15px] text-[#F4F6FB] placeholder:text-[#8E9AB4]"
                />
              </div>
              <button
                type="submit"
                className="h-10 sm:h-12 px-5 sm:px-7 rounded-xl sm:rounded-full vireo-btn-purple text-xs sm:text-sm font-semibold text-white shrink-0 cursor-pointer w-full sm:w-auto text-center"
              >
                Continue with URL
              </button>
            </form>

            {/* Source Action Buttons Row */}
            <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 h-10 sm:h-11 px-5 sm:px-6 rounded-full bg-white/[0.06] border border-white/[0.14] hover:bg-white/[0.12] hover:border-white/[0.22] text-xs sm:text-[13px] font-semibold text-[#E4E9F5] shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <UploadCloud className="size-4 text-[#A78BFA]" />
                <span>Upload Video (MP4, MOV, WebM)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(true)}
                className="inline-flex items-center gap-2 h-10 sm:h-11 px-5 sm:px-6 rounded-full bg-white/[0.06] border border-white/[0.14] hover:bg-white/[0.12] hover:border-white/[0.22] text-xs sm:text-[13px] font-semibold text-[#E4E9F5] shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <FolderOpen className="size-4 text-[#22D3EE]" />
                <span>Browse Projects ({existingProjects.length})</span>
              </button>
            </div>

            {/* Drag & Drop Indicator */}
            <p className="mt-2.5 sm:mt-3 text-[11.5px] text-[#8E9AB4]">
              Drag and drop any video file directly onto this panel (up to 2 GB)
            </p>

            {/* How It Works 4-Step List */}
            <ol
              aria-label="How it works"
              className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/[0.08] grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-left list-none p-0"
            >
              {[
                { step: '01', title: 'Add Video', desc: 'File or streaming URL' },
                { step: '02', title: 'Configure', desc: 'Aspect ratio & preferences' },
                { step: '03', title: 'AI Clipping', desc: 'Speech & hook extraction' },
                { step: '04', title: 'Edit & Export', desc: 'Timeline & multi-platform' },
              ].map((item) => (
                <li
                  key={item.step}
                  className="p-3 sm:p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.06] transition-colors hover:border-white/[0.12]"
                >
                  <div className="font-mono text-[10px] font-bold text-[#A78BFA]">{item.step}</div>
                  <div className="mt-1 font-semibold text-xs text-[#E4E9F5]">{item.title}</div>
                  <div className="mt-0.5 text-[11px] text-[#8E9AB4] leading-tight">{item.desc}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 2: SOURCE SELECTED & CONFIGURATION PANEL
          ========================================================================= */}
      {workflowState === 'source_selected' && selectedSource && (
        <section
          aria-label="Clipping configuration"
          className="vireo-dash-glass p-6 sm:p-8 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] border border-[#8B5CF6]/40 relative space-y-6"
        >
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#C4B5FD]">
                <Film className="size-5 text-[#A78BFA]" />
              </div>
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-[#A78BFA] uppercase">Step 2 of 4</span>
                <h2 className="text-xl sm:text-2xl font-bold text-[#F4F6FB] font-['Sora',sans-serif]">
                  Configure Video Clipping
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReplaceSource}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/10 text-xs text-[#C9D2E6] transition-all cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className="size-3.5 text-[#8E9AB4]" />
              <span>Replace video</span>
            </button>
          </div>

          {/* Selected Source Overview Card */}
          <div className="p-4 rounded-2xl bg-[#080B12]/80 border border-white/[0.1] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {/* Thumbnail or Video Preview Frame */}
              <div className="relative size-20 sm:size-24 rounded-xl overflow-hidden bg-black/60 border border-white/15 shrink-0 flex items-center justify-center">
                {localVideoPreviewUrl ? (
                  <video
                    src={localVideoPreviewUrl}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : selectedSource.thumbnailUrl ? (
                  <img
                    src={selectedSource.thumbnailUrl}
                    alt={selectedSource.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film className="size-8 text-[#8B5CF6]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                {selectedSource.duration ? (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[9px] text-white">
                    {formatDuration(selectedSource.duration)}
                  </span>
                ) : null}
              </div>

              {/* Source Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#8B5CF6]/20 text-[#DDD6FE] border border-[#8B5CF6]/30">
                    {selectedSource.type === 'file' ? 'Local Video' : selectedSource.type === 'url' ? 'Web URL' : 'Existing Project'}
                  </span>
                  {selectedSource.fileSizeFormatted && (
                    <span className="text-[11px] text-[#8E9AB4] font-mono">
                      {selectedSource.fileSizeFormatted}
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-base font-semibold text-[#F4F6FB] truncate">
                  {selectedSource.title}
                </h3>
                <p className="text-xs text-[#8E9AB4] truncate max-w-md">
                  {selectedSource.url || selectedSource.file?.name || 'Ready for AI processing'}
                </p>
              </div>
            </div>

            {/* Source Status Badge */}
            <div className="flex items-center gap-2 text-xs text-[#22D3EE] bg-[#22D3EE]/10 border border-[#22D3EE]/30 px-3 py-1.5 rounded-full shrink-0">
              <Check className="size-3.5" />
              <span>Source verified & ready</span>
            </div>
          </div>

          {/* Configuration Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Setting 1: Target Aspect Ratio */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
                  <SlidersHorizontal className="size-3.5 text-[#A78BFA]" />
                  <span>Target Aspect Ratio</span>
                </label>
                <span className="text-[10px] text-[#8E9AB4]">Auto-reframed by AI</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: '9:16', label: '9:16 Vertical', sub: 'TikTok, Reels, Shorts', recommended: true },
                  { id: '1:1', label: '1:1 Square', sub: 'Instagram Feed, LinkedIn' },
                  { id: '16:9', label: '16:9 Horizontal', sub: 'YouTube, Web' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAspectRatio(item.id as AspectRatioOption)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                      aspectRatio === item.id
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-[0_0_15px_rgba(139,92,246,0.25)]'
                        : 'bg-[#080B12]/60 border-white/[0.08] text-[#8E9AB4] hover:border-white/20'
                    }`}
                  >
                    {item.recommended && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-[#22D3EE] text-[#080B12] text-[8px] font-extrabold uppercase">
                        Best
                      </span>
                    )}
                    <div className="font-semibold text-xs text-[#F4F6FB]">{item.label}</div>
                    <div className="text-[10px] text-[#8E9AB4] leading-tight mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 2: Clip Duration Preference */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
                  <Clock className="size-3.5 text-[#22D3EE]" />
                  <span>Clip Duration Preference</span>
                </label>
                <span className="text-[10px] text-[#8E9AB4]">Hook to takeaway</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'auto', label: 'Auto (Best)' },
                  { id: '15-30', label: '15 – 30s' },
                  { id: '30-60', label: '30 – 60s' },
                  { id: '60-90', label: '60 – 90s' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDurationPref(item.id as DurationPref)}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      durationPref === item.id
                        ? 'bg-[#22D3EE]/15 border-[#22D3EE] text-white'
                        : 'bg-[#080B12]/60 border-white/[0.08] text-[#8E9AB4] hover:border-white/20'
                    }`}
                  >
                    <div className="font-semibold text-xs text-[#F4F6FB]">{item.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Setting 3 & 4: Smart Captions & Language */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Smart Captions Toggle */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C4B5FD]">
                  <Volume2 className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F4F6FB]">Generate Smart Captions</div>
                  <div className="text-[11px] text-[#8E9AB4]">Auto-synced word-level captions & kinetic presets</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCaptionsEnabled(!captionsEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  captionsEnabled ? 'bg-[#8B5CF6]' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                    captionsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Language Selector */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-[#22D3EE]/15 border border-[#22D3EE]/30 flex items-center justify-center text-[#22D3EE]">
                  <Globe className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F4F6FB]">Audio Language</div>
                  <div className="text-[11px] text-[#8E9AB4]">Whisper multilingual transcription</div>
                </div>
              </div>

              <select
                value={captionLang}
                onChange={(e) => setCaptionLang(e.target.value as CaptionLang)}
                disabled={!captionsEnabled}
                className="bg-[#080B12] border border-white/[0.14] text-xs text-[#F4F6FB] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#8B5CF6] disabled:opacity-50 cursor-pointer"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English (en)</option>
                <option value="es">Spanish (es)</option>
                <option value="fr">French (fr)</option>
                <option value="de">German (de)</option>
                <option value="hi">Hindi (hi)</option>
              </select>
            </div>
          </div>

          {/* Advanced Collapsible Settings: Clip count & Custom instructions */}
          <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-white/[0.01]">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="w-full p-3.5 flex items-center justify-between text-xs font-medium text-[#C4B5FD] hover:text-white transition-colors cursor-pointer"
            >
              <span>+ Advanced AI Prompt & Target Count</span>
              {showAdvancedSettings ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {showAdvancedSettings && (
              <div className="p-4 pt-1 space-y-4 border-t border-white/[0.06]">
                {/* Target Clip Count */}
                <div>
                  <label className="text-xs font-semibold text-[#DDD6FE] block mb-1.5">
                    Target Clip Count
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'auto', label: 'Auto (Best moments)' },
                      { id: '3', label: 'Top 3 clips' },
                      { id: '5', label: 'Top 5 clips' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setClipCount(c.id as ClipCountPref)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          clipCount === c.id
                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                            : 'bg-[#080B12] border-white/10 text-[#8E9AB4]'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Instructions Textarea */}
                <div>
                  <label className="text-xs font-semibold text-[#DDD6FE] block mb-1.5">
                    Custom AI Instructions
                  </label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    rows={2}
                    placeholder="Example: Emphasize controversial insights and actionable marketing advice. Cut long intros."
                    className="w-full rounded-xl bg-[#080B12] border border-white/[0.12] p-3 text-xs text-[#F4F6FB] placeholder:text-[#8E9AB4] outline-none focus:border-[#8B5CF6] transition-all resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button: Generate Clips */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#8E9AB4]">
              Ready to process. AI will transcribe audio, detect viral hooks, and auto-crop to {aspectRatio}.
            </p>

            <button
              type="button"
              onClick={handleGenerateClips}
              disabled={isSubmitting}
              className="h-12 px-8 rounded-full vireo-btn-purple text-sm font-bold text-white shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:shadow-[0_0_40px_rgba(139,92,246,0.6)] flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Preparing Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4 text-[#22D3EE]" />
                  <span>Generate Clips</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 3: UPLOADING OR PROCESSING (REAL BACKEND STAGE TRACKING)
          ========================================================================= */}
      {workflowState === 'processing' && (
        <section
          aria-label="Processing job"
          className="vireo-dash-glass p-8 sm:p-10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] border border-[#8B5CF6]/40 relative text-center space-y-6"
        >
          {/* Animated Ambient Pulsing Spinner */}
          <div className="relative mx-auto size-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#22D3EE] opacity-20 blur-xl animate-pulse" />
            <div className="size-16 rounded-full border-2 border-white/10 border-t-[#8B5CF6] border-r-[#22D3EE] animate-spin flex items-center justify-center">
              <Film className="size-6 text-[#A78BFA] animate-pulse" />
            </div>
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <span className="px-3 py-1 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#DDD6FE] text-xs font-semibold tracking-wide uppercase">
              Stage: {activeProjectStatus}
            </span>

            <h2 className="text-2xl font-bold text-[#F4F6FB] font-['Sora',sans-serif]">
              {selectedSource?.title || 'Processing Video'}
            </h2>

            <p className="text-sm text-[#8E9AB4]">
              {processingStageMessage || 'Analyzing video frames and speech transcript with AI...'}
            </p>
          </div>

          {/* Byte Upload Progress Bar (Only shown during actual file upload) */}
          {activeProjectStatus === 'uploading' && uploadProgress !== null && (
            <div className="max-w-md mx-auto space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-[#8E9AB4]">
                <span>Upload Progress</span>
                <span className="text-[#22D3EE] font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Real Backend Pipeline Stage Indicators */}
          <div className="max-w-lg mx-auto pt-4 border-t border-white/[0.08] grid grid-cols-4 gap-2 text-left">
            {[
              { id: 'upload', label: '1. Ingest', done: activeProjectStatus !== 'uploading' },
              { id: 'transcribe', label: '2. Whisper', done: ['transcribing', 'analyzing', 'generating', 'completed', 'transcribed'].includes(activeProjectStatus) },
              { id: 'analyze', label: '3. Hook AI', done: ['analyzing', 'generating', 'completed', 'transcribed'].includes(activeProjectStatus) },
              { id: 'render', label: '4. Framing', done: ['generating', 'completed'].includes(activeProjectStatus) },
            ].map((st) => (
              <div key={st.id} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] font-mono text-[#8E9AB4]">{st.label}</div>
                <div className="flex items-center gap-1 mt-1">
                  {st.done ? (
                    <span className="size-2 rounded-full bg-[#22D3EE]" />
                  ) : (
                    <span className="size-2 rounded-full bg-white/20 animate-pulse" />
                  )}
                  <span className="text-[11px] text-[#E4E9F5]">
                    {st.done ? 'Active' : 'Pending'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleReplaceSource}
              className="text-xs text-[#8E9AB4] hover:text-[#C4B5FD] transition-colors cursor-pointer"
            >
              Cancel & Start Over
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 4: CLIPS READY FOR REVIEW
          ========================================================================= */}
      {workflowState === 'clips_ready' && (
        <section
          aria-label="Generated clips review"
          className="vireo-dash-glass p-6 sm:p-8 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] border border-[#8B5CF6]/40 relative space-y-6"
        >
          {/* Header & Source Association */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[#22D3EE] text-[10px] font-bold uppercase tracking-wider">
                  Success
                </span>
                <span className="text-xs text-[#8E9AB4]">
                  {candidates.length + renderedClips.length} Viral Clips Extracted
                </span>
              </div>
              <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#F4F6FB] font-['Sora',sans-serif]">
                Review Generated Clips
              </h2>
              <p className="text-xs text-[#8E9AB4]">
                Source: <span className="text-[#DDD6FE] font-medium">{selectedSource?.title}</span>
              </p>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={handleSelectAllClips}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/10 text-xs text-[#E4E9F5] transition-all cursor-pointer"
              >
                {selectedClipIds.size === candidates.length + renderedClips.length ? (
                  <>
                    <CheckSquare className="size-3.5 text-[#22D3EE]" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <Square className="size-3.5 text-[#8E9AB4]" />
                    <span>Select All</span>
                  </>
                )}
              </button>

              {selectedClipIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchExport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white transition-all cursor-pointer shadow-md"
                >
                  <Download className="size-3.5" />
                  <span>Export ({selectedClipIds.size})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleReplaceSource}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/10 text-xs text-[#C9D2E6] transition-all cursor-pointer"
              >
                <RotateCcw className="size-3.5 text-[#8E9AB4]" />
                <span>New Video</span>
              </button>
            </div>
          </div>

          {/* Export Status Toast Banner */}
          {exportStatusMessage && (
            <div className="p-3 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 text-white text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-[#22D3EE]" />
                <span>{exportStatusMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setExportStatusMessage(null)}
                className="text-white/60 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Active Preview Player Section (Seeked to selected clip timestamp) */}
          {(sourceVideoStreamingUrl || localVideoPreviewUrl) && (
            <div className="p-4 rounded-2xl bg-[#080B12]/80 border border-white/[0.1] flex flex-col md:flex-row items-center gap-6">
              <div className="relative w-full md:w-72 aspect-[9/16] rounded-xl overflow-hidden bg-black/90 border border-white/15 shadow-xl shrink-0 flex items-center justify-center">
                <video
                  ref={videoPlayerRef}
                  src={
                    (activePreviewClipId && clipSignedPreviewUrls[activePreviewClipId]) ||
                    sourceVideoStreamingUrl ||
                    localVideoPreviewUrl ||
                    undefined
                  }
                  className="w-full h-full object-cover"
                  playsInline
                  onPlay={() => setIsPlayingPreview(true)}
                  onPause={() => setIsPlayingPreview(false)}
                />

                {/* Video Play/Pause Overlay Control */}
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group cursor-pointer"
                  aria-label={isPlayingPreview ? 'Pause preview' : 'Play preview'}
                >
                  <div className="size-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isPlayingPreview ? (
                      <Pause className="size-5 text-white" />
                    ) : (
                      <Play className="size-5 text-white ml-0.5" />
                    )}
                  </div>
                </button>
              </div>

              {/* Player Details & Clip Info */}
              <div className="flex-1 space-y-3 text-left w-full">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#8B5CF6]/20 text-[#DDD6FE] border border-[#8B5CF6]/30">
                    Live Player
                  </span>
                  <span className="text-xs text-[#8E9AB4]">
                    Aspect: {aspectRatio}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-[#F4F6FB]">
                  {renderedClips.find((c) => c.id === activePreviewClipId)?.title ||
                    candidates.find((c) => c.id === activePreviewClipId)?.title ||
                    'Select a clip below to preview'}
                </h3>

                <p className="text-xs text-[#8E9AB4] leading-relaxed line-clamp-3">
                  {candidates.find((c) => c.id === activePreviewClipId)?.hook ||
                    'Preview the exact start timestamp and AI hook extracted for this segment.'}
                </p>

                {activePreviewClipId && (
                  <div className="pt-2 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const isCand = candidates.some((c) => c.id === activePreviewClipId);
                        handleEditClip(activePreviewClipId, isCand);
                      }}
                      className="px-4 py-2 rounded-xl vireo-btn-purple text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Film className="size-3.5" />
                      <span>Open in Timeline Editor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const isCand = candidates.some((c) => c.id === activePreviewClipId);
                        handleExportClip(activePreviewClipId, isCand);
                      }}
                      disabled={isExportingClipId === activePreviewClipId}
                      className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-xs font-semibold text-[#E4E9F5] flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      {isExportingClipId === activePreviewClipId ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5 text-[#22D3EE]" />
                      )}
                      <span>Export MP4</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generated Clips Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Rendered Clips (if any) */}
            {renderedClips.map((clip) => {
              const isSelected = selectedClipIds.has(clip.id);
              const isActive = activePreviewClipId === clip.id;

              return (
                <div
                  key={clip.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 relative flex flex-col justify-between ${
                    isActive
                      ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                      : 'bg-[#080B12]/80 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Selection Checkbox & Badges */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleSelectClip(clip.id)}
                        className="text-[#8E9AB4] hover:text-[#22D3EE] transition-colors cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="size-4 text-[#22D3EE]" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10 font-mono text-[10px] text-white">
                          {formatDuration(clip.duration_seconds)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#22D3EE]/20 border border-[#22D3EE]/40 text-[#22D3EE] text-[10px] font-bold">
                          Rendered
                        </span>
                      </div>
                    </div>

                    {/* Clip Title & Timestamps */}
                    <div>
                      <h4 className="text-sm font-bold text-[#F4F6FB] line-clamp-1">
                        {clip.title || 'Viral Clip'}
                      </h4>
                      <p className="text-[11px] text-[#8E9AB4] font-mono mt-0.5">
                        {formatDuration(clip.start_seconds)} – {formatDuration(clip.end_seconds)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlayClipPreview(clip.id, clip.start_seconds)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#C4B5FD] hover:text-white transition-colors cursor-pointer"
                    >
                      <Play className="size-3.5 text-[#22D3EE]" />
                      <span>Preview</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditClip(clip.id, false)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-[#E4E9F5] font-medium transition-colors cursor-pointer"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportClip(clip.id, false)}
                        disabled={isExportingClipId === clip.id}
                        className="px-2.5 py-1 rounded-lg bg-[#8B5CF6]/30 hover:bg-[#8B5CF6]/50 text-xs text-white font-medium transition-colors cursor-pointer"
                      >
                        {isExportingClipId === clip.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Export'
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPublishingClip(clip)}
                        className="p-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#8E9AB4] hover:text-white transition-colors cursor-pointer"
                        title="Publish clip"
                      >
                        <Share2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 2. AI Clip Candidates */}
            {candidates.map((cand) => {
              const isSelected = selectedClipIds.has(cand.id);
              const isActive = activePreviewClipId === cand.id;

              return (
                <div
                  key={cand.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 relative flex flex-col justify-between ${
                    isActive
                      ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                      : 'bg-[#080B12]/80 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Selection Checkbox & Virality Score */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleSelectClip(cand.id)}
                        className="text-[#8E9AB4] hover:text-[#22D3EE] transition-colors cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="size-4 text-[#22D3EE]" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10 font-mono text-[10px] text-white">
                          {formatDuration(cand.duration_seconds)}
                        </span>
                        {cand.engagement_score !== undefined && (
                          <span className="px-2 py-0.5 rounded bg-[#8B5CF6]/30 border border-[#8B5CF6]/50 text-[#DDD6FE] text-[10px] font-bold flex items-center gap-1">
                            <Sparkles className="size-2.5 text-[#22D3EE]" />
                            <span>Score: {Math.round(cand.engagement_score)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Clip Title & Hook */}
                    <div>
                      <h4 className="text-sm font-bold text-[#F4F6FB] line-clamp-1">
                        {cand.title}
                      </h4>
                      <p className="text-[11px] text-[#8E9AB4] font-mono mt-0.5">
                        {formatDuration(cand.start_seconds)} – {formatDuration(cand.end_seconds)}
                      </p>
                      <p className="text-xs text-[#C9D2E6] line-clamp-2 mt-1.5 leading-relaxed">
                        {cand.hook || cand.reason}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlayClipPreview(cand.id, cand.start_seconds)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#C4B5FD] hover:text-white transition-colors cursor-pointer"
                    >
                      <Play className="size-3.5 text-[#22D3EE]" />
                      <span>Preview</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditClip(cand.id, true)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-[#E4E9F5] font-medium transition-colors cursor-pointer"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportClip(cand.id, true)}
                        disabled={isExportingClipId === cand.id}
                        className="px-2.5 py-1 rounded-lg bg-[#8B5CF6]/30 hover:bg-[#8B5CF6]/50 text-xs text-white font-medium transition-colors cursor-pointer"
                      >
                        {isExportingClipId === cand.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Export'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =========================================================================
          STATE 6: RECOVERABLE ERROR STATE
          ========================================================================= */}
      {workflowState === 'error' && (
        <section
          aria-label="Error recovery"
          className="vireo-dash-glass p-6 sm:p-8 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] border border-destructive/40 relative space-y-5"
        >
          <div className="flex items-start gap-4">
            <div className="size-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
              <AlertCircle className="size-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#F4F6FB]">
                Unable to complete video clipping
              </h2>
              <p className="text-xs sm:text-sm text-destructive leading-relaxed">
                {errorMessage || 'An unexpected error occurred during processing.'}
              </p>
            </div>
          </div>

          {/* Actionable Direct Upload Fallback if YouTube / external video download failed */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#8E9AB4]">
            <div className="space-y-0.5">
              <div className="font-semibold text-[#F4F6FB] flex items-center gap-1.5">
                <UploadCloud className="size-3.5 text-[#22D3EE]" />
                <span>Supported Alternative: Direct Video Upload</span>
              </div>
              <p className="text-[11px] text-[#8E9AB4]">
                If YouTube restricts automated downloads for this video, you can upload the video file directly (MP4, MOV, WebM up to 2 GB) to continue clipping with full AI transcription.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-lg bg-[#22D3EE]/15 hover:bg-[#22D3EE]/25 border border-[#22D3EE]/30 text-xs font-semibold text-[#22D3EE] transition-all cursor-pointer shrink-0"
            >
              Upload Video File
            </button>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            {selectedSource && (
              <button
                type="button"
                onClick={handleGenerateClips}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-full vireo-btn-purple text-xs font-semibold text-white cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                <span>{isSubmitting ? 'Retrying...' : 'Retry Generation'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReplaceSource}
              className="px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#E4E9F5] cursor-pointer transition-colors"
            >
              Select Another Source
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          BROWSE PROJECTS MODAL PICKER
          ========================================================================= */}
      {isBrowseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl bg-[#080B12] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-base font-bold text-[#F4F6FB]">
                <FolderOpen className="size-5 text-[#22D3EE]" />
                <span>Select a Video Project</span>
              </div>
              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(false)}
                className="text-[#8E9AB4] hover:text-white p-1"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="size-4 text-[#8E9AB4] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                placeholder="Search projects by title..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-[#F4F6FB] placeholder:text-[#8E9AB4] outline-none focus:border-[#8B5CF6]"
              />
            </div>

            {/* Project list */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {existingProjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8E9AB4]">
                  No existing projects found. Upload a video to start your first project.
                </div>
              ) : (
                existingProjects
                  .filter((p) => p.title.toLowerCase().includes(projectSearchTerm.toLowerCase()))
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectExistingProject(p)}
                      className="w-full p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/20 transition-all flex items-center justify-between gap-3 text-left cursor-pointer group"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F4F6FB] group-hover:text-[#22D3EE] transition-colors truncate">
                          {p.title}
                        </div>
                        <div className="text-[10px] text-[#8E9AB4] mt-0.5">
                          Status: {p.video_status || p.status}
                        </div>
                      </div>
                      <span className="text-xs text-[#A78BFA] font-medium shrink-0">
                        Select →
                      </span>
                    </button>
                  ))
              )}
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-[#8E9AB4]">
              {onScrollToProjects && (
                <button
                  type="button"
                  onClick={() => {
                    setIsBrowseModalOpen(false);
                    onScrollToProjects();
                  }}
                  className="hover:text-white underline cursor-pointer"
                >
                  View full projects list below
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium cursor-pointer ml-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PUBLISH MODAL INTEGRATION
          ========================================================================= */}
      {publishingClip && activeProjectId && (
        <PublishModal
          isOpen={Boolean(publishingClip)}
          onClose={() => setPublishingClip(null)}
          projectId={activeProjectId}
          clipId={publishingClip.id}
          initialTitle={publishingClip.title || 'My Viral Clip'}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
  Download,
  AlertCircle,
  Crop,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Shield,
  MoveVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ListOrdered,
  Layers,
} from 'lucide-react';
import { clipRenderService } from '../services/clipRenderService';
import {
  RenderedClip,
  ClipAspectRatio,
  CaptionStyle,
  CaptionPosition,
  TimedCaptionCue,
  CaptionConfig,
  CropConfig,
  CropMode,
  OverlayConfig,
  ReframeKeyframe,
  SAFE_FONT_FAMILIES,
  SafeFontFamily,
} from '../types';

const PRESET_CONFIGS: Record<CaptionStyle, Partial<CaptionConfig>> = {
  clean: {
    fontFamily: 'Inter',
    fontSize: 64,
    fontWeight: 700,
    textColor: '#FFFFFF',
    activeWordColor: '#FF6B35',
    strokeColor: '#000000',
    strokeWidth: 4,
    shadowEnabled: true,
    shadowOpacity: 0.45,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    position: 'bottom',
    positionY: 0.76,
    textAlign: 'center',
    maxWordsPerCue: 4,
    maxLines: 2,
    uppercase: false,
    animation: 'none',
  },
  bold: {
    fontFamily: 'Arial Black',
    fontSize: 76,
    fontWeight: 900,
    textColor: '#FFFFFF',
    activeWordColor: '#FFCC00',
    strokeColor: '#000000',
    strokeWidth: 6,
    shadowEnabled: true,
    shadowOpacity: 0.7,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    position: 'bottom',
    positionY: 0.72,
    textAlign: 'center',
    maxWordsPerCue: 3,
    maxLines: 2,
    uppercase: true,
    animation: 'pop',
  },
  minimal: {
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 500,
    textColor: '#FFFFFF',
    activeWordColor: '#38BDF8',
    strokeColor: '#000000',
    strokeWidth: 1.5,
    shadowEnabled: false,
    backgroundEnabled: true,
    backgroundColor: '#000000',
    backgroundOpacity: 0.55,
    position: 'bottom',
    positionY: 0.80,
    textAlign: 'center',
    maxWordsPerCue: 5,
    maxLines: 2,
    uppercase: false,
    animation: 'none',
  },
  podcast: {
    fontFamily: 'Inter',
    fontSize: 66,
    fontWeight: 800,
    textColor: '#FFFFFF',
    activeWordColor: '#F59E0B',
    strokeColor: '#000000',
    strokeWidth: 4.5,
    shadowEnabled: true,
    shadowOpacity: 0.5,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    position: 'bottom',
    positionY: 0.76,
    textAlign: 'center',
    maxWordsPerCue: 4,
    maxLines: 2,
    uppercase: false,
    animation: 'fade',
  },
  highlight: {
    fontFamily: 'Arial Black',
    fontSize: 72,
    fontWeight: 900,
    textColor: '#FFFFFF',
    activeWordColor: '#10B981',
    strokeColor: '#000000',
    strokeWidth: 5.5,
    shadowEnabled: true,
    shadowOpacity: 0.6,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    position: 'bottom',
    positionY: 0.70,
    textAlign: 'center',
    maxWordsPerCue: 3,
    maxLines: 2,
    uppercase: true,
    animation: 'pop',
  },
  karaoke: {
    fontFamily: 'Arial Black',
    fontSize: 70,
    fontWeight: 800,
    textColor: '#FFFFFF',
    activeWordColor: '#FF6B35',
    strokeColor: '#000000',
    strokeWidth: 5,
    shadowEnabled: true,
    shadowOpacity: 0.5,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    position: 'bottom',
    positionY: 0.76,
    textAlign: 'center',
    maxWordsPerCue: 4,
    maxLines: 2,
    uppercase: false,
    animation: 'none',
  },
};

export const ClipEditorPage: React.FC = () => {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<RenderedClip | null>(null);
  const [timingMode, setTimingMode] = useState<string>('segment');
  const [cues, setCues] = useState<TimedCaptionCue[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Editor configuration state
  const [trimStartOffset, setTrimStartOffset] = useState<number>(0);
  const [trimEndOffset, setTrimEndOffset] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<ClipAspectRatio>('9:16');
  const [captionEnabled, setCaptionEnabled] = useState<boolean>(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('clean');
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>('bottom');
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({});
  const [cropConfig, setCropConfig] = useState<CropConfig>({ mode: 'center', focusX: 0.5, focusY: 0.5 });
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({ enabled: false, text: '', position: 'top', size: 'md' });
  const [volume, setVolume] = useState<number>(1.0);
  const [muted, setMuted] = useState<boolean>(false);

  // Phase 12.5 Caption UI state
  const [captionSection, setCaptionSection] = useState<'style' | 'cues'>('style');
  const [isCustomPreset, setIsCustomPreset] = useState<boolean>(false);
  const [showSafeArea, setShowSafeArea] = useState<boolean>(false);
  const [isDraggingCaption, setIsDraggingCaption] = useState<boolean>(false);
  const [showTimingModal, setShowTimingModal] = useState<boolean>(false);

  // Collapsible control sections
  const [openSections, setOpenSections] = useState({
    presets: true,
    typography: true,
    colors: false,
    layout: false,
    effects: false,
    timing: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Phase 13: Smart Auto-Reframe state
  const [reframeStatus, setReframeStatus] = useState<'pending' | 'analyzing' | 'ready' | 'failed' | null>(null);
  const [detectedFaceCount, setDetectedFaceCount] = useState<number>(0);
  const [dominantTrackId, setDominantTrackId] = useState<string | null>(null);
  const [smoothedKeyframes, setSmoothedKeyframes] = useState<ReframeKeyframe[]>([]);
  const [analyzedTrimStart, setAnalyzedTrimStart] = useState<number>(0);
  const [analyzedTrimEnd, setAnalyzedTrimEnd] = useState<number>(0);
  const [analyzedAspectRatio, setAnalyzedAspectRatio] = useState<string>('9:16');
  const [isAnalyzingReframe, setIsAnalyzingReframe] = useState<boolean>(false);
  const [reframeStep, setReframeStep] = useState<string>('Scanning frames...');
  const [reframeError, setReframeError] = useState<string | null>(null);
  const isSmartReframeEnabled = import.meta.env.VITE_SMART_REFRAME_ENABLED === 'true';

  // Dirty state tracking
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderSuccessMsg, setRenderSuccessMsg] = useState<string | null>(null);

  // Video playback & caption synchronization state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const cueListRef = useRef<HTMLDivElement | null>(null);
  const activeCueElRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'captions' | 'layout' | 'text' | 'audio'>('captions');

  // Load editor data on mount
  useEffect(() => {
    if (!clipId) return;

    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [editorData, captionData, reframeData] = await Promise.all([
          clipRenderService.getClipEditorData(clipId),
          clipRenderService.getClipCaptions(clipId).catch(() => ({ timingMode: 'segment', cues: [] })),
          clipRenderService.getClipReframe(clipId).catch(() => null),
        ]);

        if (!mounted) return;

        const c = editorData.clip;
        setClip(c);
        setTimingMode(captionData.timingMode || editorData.timingMode || 'segment');
        setCues(captionData.cues || []);
        setPreviewUrl(editorData.previewUrl || null);

        // Populate editor controls from saved clip configuration
        setTrimStartOffset(Number(c.trim_start_offset || 0));
        setTrimEndOffset(Number(c.trim_end_offset || 0));
        setAspectRatio(c.aspect_ratio || '9:16');
        setCaptionEnabled(c.caption_enabled !== false);
        setCaptionStyle(c.caption_style || 'clean');
        setCaptionPosition(c.caption_position || 'bottom');

        const initialConfig: CaptionConfig = {
          ...(PRESET_CONFIGS[c.caption_style as CaptionStyle] || PRESET_CONFIGS.clean),
          ...(c.caption_config || {}),
        };
        setCaptionConfig(initialConfig);

        setCropConfig(c.crop_config || { mode: 'center', focusX: 0.5, focusY: 0.5 });
        setOverlayConfig(c.overlay_config || { enabled: false, text: '', position: 'top', size: 'md' });
        setVolume(c.volume !== undefined ? Number(c.volume) : 1.0);
        setMuted(Boolean(c.muted));

        if (reframeData) {
          setReframeStatus(reframeData.status);
          setDetectedFaceCount(reframeData.detectedFaceCount || 0);
          setDominantTrackId(reframeData.dominantTrackId);
          setSmoothedKeyframes(reframeData.smoothedKeyframes || []);
          setAnalyzedTrimStart(reframeData.analyzedTrimStart ?? 0);
          setAnalyzedTrimEnd(reframeData.analyzedTrimEnd ?? 0);
          setAnalyzedAspectRatio(reframeData.analyzedAspectRatio || '9:16');
        }

        setIsDirty(false);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load clip for editing.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, [clipId]);

  // High-framerate playback sync loop using requestAnimationFrame
  useEffect(() => {
    let animId: number;
    const syncLoop = () => {
      if (videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animId = requestAnimationFrame(syncLoop);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(syncLoop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  // Video time update listener for seek, pause, and step events
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Track unsaved modifications
  const markDirty = () => {
    setIsDirty(true);
  };

  // Helper to interpolate visual crop position in editor preview
  const getCurrentSmartFocusX = (time: number, keyframes: ReframeKeyframe[]): number => {
    if (!keyframes || keyframes.length === 0) return 0.5;
    if (keyframes.length === 1 || time <= keyframes[0].time) return keyframes[0].centerX;
    const last = keyframes[keyframes.length - 1];
    if (time >= last.time) return last.centerX;
    for (let i = 0; i < keyframes.length - 1; i++) {
      const k0 = keyframes[i];
      const k1 = keyframes[i + 1];
      if (time >= k0.time && time <= k1.time) {
        const dt = k1.time - k0.time;
        const factor = dt > 0 ? (time - k0.time) / dt : 0;
        return k0.centerX + (k1.centerX - k0.centerX) * factor;
      }
    }
    return 0.5;
  };

  // Reframe staleness check
  const isReframeStale = Boolean(
    cropConfig.mode === 'smart' &&
      reframeStatus === 'ready' &&
      (Math.abs(trimStartOffset - analyzedTrimStart) > 0.05 ||
        Math.abs(trimEndOffset - analyzedTrimEnd) > 0.05 ||
        aspectRatio !== analyzedAspectRatio)
  );

  // Trigger smart reframe analysis
  const handleAnalyzeReframe = async () => {
    if (!clipId) return;
    if (!isSmartReframeEnabled) {
      setReframeError('Smart Auto-Reframe is coming soon in beta.');
      return;
    }
    setIsAnalyzingReframe(true);
    setReframeError(null);
    setReframeStep('Scanning frames...');

    const stepInterval = setInterval(() => {
      setReframeStep((prev) => {
        if (prev === 'Scanning frames...') return 'Tracking subject...';
        if (prev === 'Tracking subject...') return 'Smoothing camera movement...';
        if (prev === 'Smoothing camera movement...') return 'Preparing framing...';
        return 'Scanning frames...';
      });
    }, 1500);

    try {
      await clipRenderService.analyzeClipReframe(clipId);

      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const res = await clipRenderService.getClipReframe(clipId);
          if (res.status === 'ready' || attempts >= 30) {
            clearInterval(pollInterval);
            clearInterval(stepInterval);
            setIsAnalyzingReframe(false);
            setReframeStatus(res.status);
            setDetectedFaceCount(res.detectedFaceCount || 0);
            setDominantTrackId(res.dominantTrackId);
            setSmoothedKeyframes(res.smoothedKeyframes || []);
            setAnalyzedTrimStart(trimStartOffset);
            setAnalyzedTrimEnd(trimEndOffset);
            setAnalyzedAspectRatio(aspectRatio);
            setCropConfig((prev) => ({
              ...prev,
              mode: 'smart',
              smart: { trackId: res.dominantTrackId || undefined, strength: 1.0 },
            }));
            markDirty();
          } else if (res.status === 'failed') {
            clearInterval(pollInterval);
            clearInterval(stepInterval);
            setIsAnalyzingReframe(false);
            setReframeError('Smart reframe analysis encountered an issue. Center framing will be used.');
          }
        } catch {
          if (attempts >= 30) {
            clearInterval(pollInterval);
            clearInterval(stepInterval);
            setIsAnalyzingReframe(false);
          }
        }
      }, 1000);
    } catch (err: any) {
      clearInterval(stepInterval);
      setIsAnalyzingReframe(false);
      setReframeError(err.message || 'Failed to start smart reframe.');
    }
  };

  // Calculate durations and boundaries
  const origDuration = clip ? Number(clip.end_seconds - clip.start_seconds) : 0;
  const effectiveDuration = Math.max(0, origDuration - trimStartOffset - trimEndOffset);
  const isTrimValid = effectiveDuration >= 3.0;

  // STRICT SINGLE-CUE VISIBILITY: cue.start <= currentTime && currentTime < cue.end
  const activeCue = cues.find((c) => currentTime >= c.start && currentTime < c.end) || null;

  // Active word resolution within active cue for spoken-word highlighting
  const activeWordIndex =
    activeCue && Array.isArray(activeCue.words) && activeCue.words.length > 0
      ? activeCue.words.findIndex((w) => currentTime >= w.start && currentTime < w.end)
      : -1;

  // Auto-scroll cue list smoothly when active cue changes
  useEffect(() => {
    if (activeCue && activeCueElRef.current && cueListRef.current) {
      activeCueElRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeCue?.id]);

  // Drag-to-position captions vertically on preview
  const handleCaptionDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingCaption(true);
  };

  useEffect(() => {
    if (!isDraggingCaption) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!videoContainerRef.current) return;
      const rect = videoContainerRef.current.getBoundingClientRect();
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const normalizedY = (clientY - rect.top) / rect.height;
      const clampedY = Math.min(0.92, Math.max(0.08, Number(normalizedY.toFixed(3))));
      setCaptionConfig((prev) => ({ ...prev, positionY: clampedY }));
      setIsCustomPreset(true);
      markDirty();
    };

    const handlePointerUp = () => {
      setIsDraggingCaption(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingCaption]);

  // Apply a style preset
  const handleApplyPreset = (style: CaptionStyle) => {
    setCaptionStyle(style);
    const preset = PRESET_CONFIGS[style];
    if (preset) {
      setCaptionConfig((prev) => ({
        ...prev,
        ...preset,
        caption_overrides: prev.caption_overrides || [],
      }));
    }
    setIsCustomPreset(false);
    markDirty();
  };

  // Update inline cue text correction
  const handleUpdateCueText = (cueId: string, newText: string) => {
    setCaptionConfig((prev) => {
      const overrides = [...(prev.caption_overrides || [])];
      const existingIdx = overrides.findIndex((o) => o.cueId === cueId);
      if (existingIdx >= 0) {
        overrides[existingIdx] = { cueId, text: newText };
      } else {
        overrides.push({ cueId, text: newText });
      }
      return { ...prev, caption_overrides: overrides };
    });

    setCues((prev) =>
      prev.map((c) => (c.id === cueId ? { ...c, text: newText } : c))
    );
    markDirty();
  };

  // Format seconds to MM:SS.s
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${parseFloat(s) < 10 ? '0' : ''}${s}`;
  };

  // Save changes handler
  const handleSave = async (): Promise<RenderedClip | null> => {
    if (!clipId || !clip) return null;
    if (!isTrimValid) {
      setError(`Trimmed duration must be at least 3.0 seconds (currently ${effectiveDuration.toFixed(1)}s).`);
      return null;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await clipRenderService.updateClipEditor(clipId, {
        trimStartOffset,
        trimEndOffset,
        aspectRatio,
        captionEnabled,
        captionStyle,
        captionPosition,
        captionConfig,
        cropConfig,
        overlayConfig,
        volume,
        muted,
      });

      setClip(updated);

      // Re-fetch cues with new chunking / case options
      const freshCaptions = await clipRenderService.getClipCaptions(clipId).catch(() => null);
      if (freshCaptions && Array.isArray(freshCaptions.cues)) {
        setCues(freshCaptions.cues);
      }

      setIsDirty(false);
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default handler
  const handleReset = async () => {
    if (!clipId) return;
    if (!window.confirm('Reset all editor adjustments back to defaults?')) return;

    setLoading(true);
    try {
      const reset = await clipRenderService.resetClipEditor(clipId);
      setClip(reset);
      setTrimStartOffset(0);
      setTrimEndOffset(0);
      setAspectRatio('9:16');
      setCaptionEnabled(true);
      setCaptionStyle('clean');
      setCaptionPosition('bottom');
      setCaptionConfig(PRESET_CONFIGS.clean);
      setCropConfig({ mode: 'center', focusX: 0.5, focusY: 0.5 });
      setOverlayConfig({ enabled: false, text: '', position: 'top', size: 'md' });
      setVolume(1.0);
      setMuted(false);
      setIsDirty(false);
      setIsCustomPreset(false);
      setError(null);

      const freshCaptions = await clipRenderService.getClipCaptions(clipId).catch(() => null);
      if (freshCaptions && Array.isArray(freshCaptions.cues)) {
        setCues(freshCaptions.cues);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reset editor settings.');
    } finally {
      setLoading(false);
    }
  };

  // Render changes handler (saves first, then triggers rerender)
  const handleRenderChanges = async () => {
    if (!clipId) return;

    if (cropConfig.mode === 'smart' && isReframeStale) {
      setError('Framing needs re-analysis: Trim or aspect ratio has changed since last analysis. Click "Re-analyze Framing" in the Framing tab before rendering.');
      return;
    }

    const saved = await handleSave();
    if (!saved) return;

    setIsRendering(true);
    setRenderSuccessMsg(null);
    setError(null);

    try {
      await clipRenderService.renderClip(clipId);

      // Poll until render finishes
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const fresh = await clipRenderService.getClip(clipId);
          setClip(fresh);

          if (fresh.render_status === 'ready') {
            clearInterval(pollInterval);
            setIsRendering(false);
            setRenderSuccessMsg(`Rendered successfully as Revision v${fresh.render_version || 1}!`);

            // Refresh preview with cache buster
            const pUrl = await clipRenderService.getPreviewUrl(clipId);
            setPreviewUrl(`${pUrl}?t=${Date.now()}`);
          } else if (fresh.render_status === 'failed') {
            clearInterval(pollInterval);
            setIsRendering(false);
            setError(`Rendering failed: ${fresh.render_error_message || 'Unknown render error'}`);
          }
        } catch {
          if (pollCount > 60) {
            clearInterval(pollInterval);
            setIsRendering(false);
            setError('Rendering timed out. Please check back shortly.');
          }
        }
      }, 2500);
    } catch (err: any) {
      setIsRendering(false);
      setError(err.message || 'Failed to trigger render.');
    }
  };

  // Download handler
  const handleDownload = async () => {
    if (!clipId) return;
    try {
      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(clipId);
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = filename || 'vireo-clip.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to download clip.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm">Loading Clip Editor...</p>
        </div>
      </div>
    );
  }

  if (error && !clip) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Error Loading Clip</h2>
          <p className="text-sm text-red-300 mb-6">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 border-b border-neutral-800/80 px-4 md:px-6 flex items-center justify-between bg-neutral-900/60 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(clip?.project_id ? `/projects/${clip.project_id}` : '/dashboard')}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
            title="Back to Project"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm md:text-base text-white truncate max-w-xs md:max-w-md">
                Focused Clip Editor
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-medium bg-neutral-800 text-neutral-300 rounded border border-neutral-700">
                v{clip?.render_version || 1}
              </span>
              {isDirty && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-orange-950/80 text-orange-400 rounded border border-orange-800 animate-pulse">
                  Unsaved Edits
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400">
              {clip?.aspect_ratio} • {effectiveDuration.toFixed(1)}s output • Timing:{' '}
              <strong className={timingMode === 'word' ? 'text-emerald-400' : 'text-amber-400'}>
                {timingMode === 'word' ? 'Precise Word-Level' : 'Segment-Level'}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={isRendering || isSaving}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition border border-neutral-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={() => handleSave()}
            disabled={isSaving || isRendering || !isDirty}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition border border-neutral-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Edits'}
          </button>

          <button
            onClick={handleRenderChanges}
            disabled={isRendering || isSaving || !isTrimValid}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition shadow-md shadow-orange-950/40 disabled:opacity-50"
          >
            {isRendering ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Render Changes
              </>
            )}
          </button>

          {clip?.render_status === 'ready' && (
            <button
              onClick={handleDownload}
              className="p-1.5 text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition border border-neutral-700 ml-1"
              title="Download Rendered MP4"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* CENTER: Video Canvas & Live CSS Overlay */}
        <div className="flex-1 bg-neutral-950 flex flex-col items-center justify-center p-4 md:p-6 overflow-y-auto">
          {/* Notifications */}
          {error && (
            <div className="mb-4 w-full max-w-md bg-red-950/50 border border-red-800 text-red-300 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {renderSuccessMsg && (
            <div className="mb-4 w-full max-w-md bg-emerald-950/50 border border-emerald-800 text-emerald-300 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{renderSuccessMsg}</span>
            </div>
          )}

          {/* Canvas Actions Bar (Safe Area Toggle & Quick Guide) */}
          <div className="w-full max-w-md flex items-center justify-between mb-2 text-xs text-neutral-400 px-1">
            <span className="text-[11px] text-neutral-500">
              Drag text vertically on canvas to reposition
            </span>
            {aspectRatio === '9:16' && (
              <button
                type="button"
                onClick={() => setShowSafeArea(!showSafeArea)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium transition ${
                  showSafeArea
                    ? 'bg-orange-950/50 border-orange-500 text-orange-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
                title="Toggle TikTok / Reels Safe Area Guides (Preview Only)"
              >
                <Shield className="w-3 h-3" />
                <span>Safe Area: {showSafeArea ? 'ON' : 'OFF'}</span>
              </button>
            )}
          </div>

          {/* Video Container Framed by Aspect Ratio */}
          <div
            ref={videoContainerRef}
            className={`relative bg-black rounded-xl overflow-hidden shadow-2xl border border-neutral-800 flex items-center justify-center transition-all select-none ${
              aspectRatio === '9:16'
                ? 'w-[280px] sm:w-[320px] md:w-[360px] aspect-[9/16]'
                : aspectRatio === '1:1'
                ? 'w-[320px] sm:w-[380px] aspect-square'
                : 'w-[440px] sm:w-[560px] aspect-video'
            }`}
          >
            {/* Phase 13: Smart Track Active Badge */}
            {cropConfig.mode === 'smart' && reframeStatus === 'ready' && (
              <div className="absolute top-3 left-3 z-30 px-2 py-1 bg-black/80 backdrop-blur-md border border-orange-500/40 rounded-full flex items-center gap-1.5 shadow-lg pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-orange-200">
                  {detectedFaceCount > 0 ? 'Smart Track: Active' : 'Smart Track: Center Fallback'}
                </span>
              </div>
            )}

            {/* TikTok / Reels 9:16 Safe Area Overlay Guide */}
            {aspectRatio === '9:16' && showSafeArea && (
              <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between">
                {/* Top header safe margin */}
                <div className="h-[14%] bg-red-500/10 border-b border-dashed border-red-500/40 p-1 flex items-start justify-between text-[9px] text-red-400 font-mono">
                  <span>Top UI Zone (14%)</span>
                  <span>Header / Search</span>
                </div>

                {/* Center Safe Zone indicator */}
                <div className="flex-1 flex items-center justify-between px-2">
                  <div className="border border-emerald-500/30 rounded px-2 py-0.5 bg-emerald-500/10 text-[9px] text-emerald-400 font-mono">
                    Safe Caption Zone
                  </div>
                  {/* Right side interaction buttons rail */}
                  <div className="w-[15%] h-full bg-red-500/10 border-l border-dashed border-red-500/40 flex items-center justify-center text-[9px] text-red-400 font-mono [writing-mode:vertical-rl]">
                    Actions Rail (15%)
                  </div>
                </div>

                {/* Bottom account & caption margin */}
                <div className="h-[18%] bg-red-500/10 border-t border-dashed border-red-500/40 p-1 flex items-end justify-between text-[9px] text-red-400 font-mono">
                  <span>Bottom Controls (18%)</span>
                  <span>Title & Audio Bar</span>
                </div>
              </div>
            )}

            {previewUrl ? (
              <video
                ref={videoRef}
                src={previewUrl}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onSeeking={handleTimeUpdate}
                onSeeked={handleTimeUpdate}
                onPause={() => {
                  handleTimeUpdate();
                  setIsPlaying(false);
                }}
                onPlay={() => setIsPlaying(true)}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
                style={{
                  objectPosition:
                    cropConfig.mode === 'smart' && smoothedKeyframes.length > 0
                      ? `${Math.round(getCurrentSmartFocusX(currentTime, smoothedKeyframes) * 100)}% 50%`
                      : `${Math.round((cropConfig.focusX ?? 0.5) * 100)}% 50%`,
                }}
                className="w-full h-full object-cover cursor-pointer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-500">
                <p className="text-xs">Preview file not ready yet. Click "Render Changes" to compile initial video.</p>
              </div>
            )}

            {/* Play/Pause Overlay Icon on Hover / Pause */}
            {!isPlaying && previewUrl && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-14 h-14 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition border border-white/20 z-20"
              >
                <Play className="w-6 h-6 ml-1" />
              </button>
            )}

            {/* Live Text Hook / Headline Overlay */}
            {overlayConfig.enabled && overlayConfig.text && (
              <div
                className={`absolute px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white font-bold rounded-lg text-center shadow-lg pointer-events-none max-w-[85%] z-20 ${
                  overlayConfig.position === 'top'
                    ? 'top-6'
                    : overlayConfig.position === 'center'
                    ? 'top-1/2 -translate-y-1/2'
                    : 'bottom-24'
                } ${
                  overlayConfig.size === 'sm'
                    ? 'text-xs'
                    : overlayConfig.size === 'lg'
                    ? 'text-lg tracking-wide'
                    : 'text-sm'
                }`}
              >
                {overlayConfig.text}
              </div>
            )}

            {/* PRO LIVE CAPTION OVERLAY: Strictly exactly one active cue at any timestamp */}
            {captionEnabled && activeCue && (
              <div
                onMouseDown={handleCaptionDragStart}
                onTouchStart={handleCaptionDragStart}
                style={{
                  position: 'absolute',
                  left: `${(captionConfig.positionX ?? 0.5) * 100}%`,
                  top: `${
                    (captionConfig.positionY ??
                      (captionPosition === 'top' ? 0.14 : captionPosition === 'center' ? 0.5 : 0.76)) * 100
                  }%`,
                  transform: 'translate(-50%, -50%)',
                  textAlign: captionConfig.textAlign || 'center',
                  cursor: isDraggingCaption ? 'grabbing' : 'grab',
                  maxWidth: '92%',
                  zIndex: 25,
                  userSelect: 'none',
                  touchAction: 'none',
                }}
                className="group transition-transform active:scale-[1.02]"
                title="Click and drag vertically to position captions"
              >
                {/* Drag Indicator badge on hover */}
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-black/85 text-neutral-300 text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 pointer-events-none shadow border border-white/10">
                  <MoveVertical className="w-2.5 h-2.5" />
                  <span>Drag Y ({Math.round((captionConfig.positionY ?? 0.76) * 100)}%)</span>
                </div>

                <div
                  style={{
                    fontFamily: captionConfig.fontFamily || 'Inter, sans-serif',
                    fontSize: `${Math.round((captionConfig.fontSize || 64) * 0.28)}px`,
                    fontWeight:
                      captionConfig.fontWeight ||
                      (captionStyle === 'bold' || captionStyle === 'highlight' ? 900 : 700),
                    textTransform: captionConfig.uppercase ? 'uppercase' : 'none',
                    color: captionConfig.textColor || captionConfig.primaryColor || '#FFFFFF',
                    WebkitTextStroke: `${(captionConfig.strokeWidth ?? 4) * 0.35}px ${
                      captionConfig.strokeColor || '#000000'
                    }`,
                    paintOrder: 'stroke fill',
                    filter:
                      captionConfig.shadowEnabled !== false
                        ? `drop-shadow(0 2px 4px rgba(0,0,0,${captionConfig.shadowOpacity ?? 0.5}))`
                        : 'none',
                    backgroundColor: captionConfig.backgroundEnabled
                      ? (captionConfig.backgroundColor || '#000000') +
                        Math.round((captionConfig.backgroundOpacity ?? 0.55) * 255)
                          .toString(16)
                          .padStart(2, '0')
                      : 'transparent',
                    padding: captionConfig.backgroundEnabled ? '4px 10px' : '0px',
                    borderRadius: captionConfig.backgroundEnabled ? '6px' : '0px',
                    lineHeight: 1.25,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {timingMode === 'word' && Array.isArray(activeCue.words) && activeCue.words.length > 0 ? (
                    activeCue.words.map((wordObj, wIdx) => {
                      const isWordActive = wIdx === activeWordIndex;
                      const activeColor =
                        captionConfig.activeWordColor || captionConfig.highlightColor || '#FF6B35';
                      return (
                        <span
                          key={`${wordObj.text}-${wIdx}`}
                          style={{
                            color: isWordActive ? activeColor : undefined,
                            display: 'inline-block',
                            marginRight: '0.28em',
                            transition: 'color 0.08s ease, transform 0.08s ease',
                            transform: isWordActive && captionConfig.animation === 'pop' ? 'scale(1.08)' : 'scale(1)',
                          }}
                        >
                          {wordObj.text}
                        </span>
                      );
                    })
                  ) : (
                    activeCue.text.replace(/\\N/g, '\n')
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Trim & Playback Controls Bar */}
          <div className="w-full max-w-2xl mt-4 bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-4 flex flex-col gap-3">
            {/* Play / Progress Scrub */}
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-1.5 text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <span className="font-mono">{formatTime(currentTime)}</span>
                <span>/</span>
                <span className="font-mono">{formatTime(effectiveDuration)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-neutral-400">
                  Cut: <strong className="text-white font-mono">{formatTime(trimStartOffset)}</strong> to{' '}
                  <strong className="text-white font-mono">{formatTime(origDuration - trimEndOffset)}</strong>
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    isTrimValid ? 'bg-neutral-800 text-neutral-200' : 'bg-red-950 text-red-400'
                  }`}
                >
                  {effectiveDuration.toFixed(1)}s {isTrimValid ? '' : '(Min 3.0s)'}
                </span>
              </div>
            </div>

            {/* Trim Slider Handles */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex justify-between text-[11px] text-neutral-500 font-mono">
                <span>Start Offset: +{trimStartOffset.toFixed(1)}s</span>
                <span>End Offset: -{trimEndOffset.toFixed(1)}s</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, origDuration - trimEndOffset - 3.0)}
                    step="0.1"
                    value={trimStartOffset}
                    onChange={(e) => {
                      setTrimStartOffset(parseFloat(e.target.value) || 0);
                      markDirty();
                    }}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                <div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, origDuration - trimStartOffset - 3.0)}
                    step="0.1"
                    value={trimEndOffset}
                    onChange={(e) => {
                      setTrimEndOffset(parseFloat(e.target.value) || 0);
                      markDirty();
                    }}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT / SIDEBAR: Modular Feature Tabs */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-900/40 flex flex-col h-auto lg:h-full">
          {/* Subtabs selector */}
          <div className="flex border-b border-neutral-800 bg-neutral-900/60 p-1">
            <button
              onClick={() => setActiveTab('captions')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'captions'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Captions
            </button>

            <button
              onClick={() => setActiveTab('layout')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'layout'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              Framing
            </button>

            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'text'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              Headline
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'audio'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              Audio
            </button>
          </div>

          {/* Tab Content Panels */}
          <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
            {/* 1. ADVANCED CAPTIONS TAB */}
            {activeTab === 'captions' && (
              <div className="space-y-5">
                {/* Master Captions Toggle */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Burned-in Captions</h3>
                    <p className="text-xs text-neutral-400">High-retention short-form subtitle styles</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captionEnabled}
                      onChange={(e) => {
                        setCaptionEnabled(e.target.checked);
                        markDirty();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>

                {captionEnabled && (
                  <>
                    {/* View Switch: Style Presets vs Cue Editor */}
                    <div className="flex p-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setCaptionSection('style')}
                        className={`flex-1 py-1.5 rounded text-center transition flex items-center justify-center gap-1.5 ${
                          captionSection === 'style'
                            ? 'bg-neutral-800 text-white shadow'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Style & Presets</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCaptionSection('cues')}
                        className={`flex-1 py-1.5 rounded text-center transition flex items-center justify-center gap-1.5 ${
                          captionSection === 'cues'
                            ? 'bg-neutral-800 text-white shadow'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                        <span>Edit Cues ({cues.length})</span>
                      </button>
                    </div>

                    {/* SECTION A: STYLE & APPEARANCE CONTROLS */}
                    {captionSection === 'style' && (
                      <div className="space-y-4">
                        {/* 1. Presets Selector */}
                        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                          <button
                            type="button"
                            onClick={() => toggleSection('presets')}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-neutral-300 hover:bg-neutral-800/40 transition"
                          >
                            <span className="flex items-center gap-2">
                              <span>Presets</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-800 text-orange-400 border border-neutral-700">
                                {isCustomPreset ? 'Custom' : captionStyle}
                              </span>
                            </span>
                            {openSections.presets ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {openSections.presets && (
                            <div className="p-3 pt-0 border-t border-neutral-800/60 grid grid-cols-2 gap-2 mt-2">
                              {[
                                { id: 'clean', name: 'Clean', desc: 'White + dark stroke' },
                                { id: 'bold', name: 'Bold Impact', desc: 'Heavy uppercase sans' },
                                { id: 'minimal', name: 'Minimal', desc: 'Translucent box style' },
                                { id: 'podcast', name: 'Podcast Gold', desc: 'Warm gold accent' },
                                { id: 'punchy', name: 'Punchy', desc: 'Neon green pop' },
                                { id: 'karaoke', name: 'Karaoke', desc: 'Word-by-word pulse' },
                              ].map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handleApplyPreset(p.id as CaptionStyle)}
                                  className={`p-2.5 text-left rounded-lg border transition ${
                                    captionStyle === p.id && !isCustomPreset
                                      ? 'bg-orange-950/40 border-orange-500 text-white ring-1 ring-orange-500/50'
                                      : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                                  }`}
                                >
                                  <p className="text-xs font-semibold">{p.name}</p>
                                  <p className="text-[10px] text-neutral-400 mt-0.5">{p.desc}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Typography Collapsible */}
                        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                          <button
                            type="button"
                            onClick={() => toggleSection('typography')}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-neutral-300 hover:bg-neutral-800/40 transition"
                          >
                            <span>Typography</span>
                            {openSections.typography ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {openSections.typography && (
                            <div className="p-3.5 pt-1 border-t border-neutral-800/60 space-y-3.5">
                              {/* Font Family (Safe Allowlist only) */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-neutral-400">Font Family</label>
                                <select
                                  value={captionConfig.fontFamily || 'Inter'}
                                  onChange={(e) => {
                                    setCaptionConfig((prev) => ({ ...prev, fontFamily: e.target.value as SafeFontFamily }));
                                    setIsCustomPreset(true);
                                    markDirty();
                                  }}
                                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                                >
                                  {SAFE_FONT_FAMILIES.map((font) => (
                                    <option key={font} value={font}>
                                      {font}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Font Size slider */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-neutral-400">Font Size</span>
                                  <span className="font-mono text-white">{captionConfig.fontSize || 64}px</span>
                                </div>
                                <input
                                  type="range"
                                  min="32"
                                  max="110"
                                  step="2"
                                  value={captionConfig.fontSize || 64}
                                  onChange={(e) => {
                                    setCaptionConfig((prev) => ({ ...prev, fontSize: parseInt(e.target.value, 10) }));
                                    setIsCustomPreset(true);
                                    markDirty();
                                  }}
                                  className="w-full accent-orange-500 cursor-pointer"
                                />
                              </div>

                              {/* Font Weight */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-medium text-neutral-400">Weight</label>
                                  <select
                                    value={captionConfig.fontWeight || 700}
                                    onChange={(e) => {
                                      setCaptionConfig((prev) => ({ ...prev, fontWeight: parseInt(e.target.value, 10) }));
                                      setIsCustomPreset(true);
                                      markDirty();
                                    }}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                                  >
                                    <option value="400">400 Regular</option>
                                    <option value="500">500 Medium</option>
                                    <option value="600">600 SemiBold</option>
                                    <option value="700">700 Bold</option>
                                    <option value="800">800 ExtraBold</option>
                                    <option value="900">900 Black</option>
                                  </select>
                                </div>

                                {/* Uppercase toggle */}
                                <div className="space-y-1">
                                  <label className="text-[11px] font-medium text-neutral-400">Case</label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = !captionConfig.uppercase;
                                      setCaptionConfig((prev) => ({ ...prev, uppercase: next }));
                                      setIsCustomPreset(true);
                                      markDirty();
                                    }}
                                    className={`w-full py-1.5 px-2 text-xs font-semibold rounded-lg border transition ${
                                      captionConfig.uppercase
                                        ? 'bg-orange-950/40 border-orange-500 text-orange-200'
                                        : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                                    }`}
                                  >
                                    UPPERCASE: {captionConfig.uppercase ? 'ON' : 'OFF'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 3. Colors, Stroke & Background Collapsible */}
                        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                          <button
                            type="button"
                            onClick={() => toggleSection('colors')}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-neutral-300 hover:bg-neutral-800/40 transition"
                          >
                            <span>Colors & Stroke</span>
                            {openSections.colors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {openSections.colors && (
                            <div className="p-3.5 pt-1 border-t border-neutral-800/60 space-y-3.5">
                              {/* Text & Active Word Color Pickers */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-medium text-neutral-400">Text Color</label>
                                  <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-lg p-1">
                                    <input
                                      type="color"
                                      value={captionConfig.textColor || captionConfig.primaryColor || '#FFFFFF'}
                                      onChange={(e) => {
                                        setCaptionConfig((prev) => ({ ...prev, textColor: e.target.value, primaryColor: e.target.value }));
                                        setIsCustomPreset(true);
                                        markDirty();
                                      }}
                                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                                    />
                                    <span className="text-[11px] font-mono text-neutral-300">
                                      {captionConfig.textColor || captionConfig.primaryColor || '#FFFFFF'}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[11px] font-medium text-neutral-400">Active Word</label>
                                  <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-lg p-1">
                                    <input
                                      type="color"
                                      value={captionConfig.activeWordColor || captionConfig.highlightColor || '#FF6B35'}
                                      onChange={(e) => {
                                        setCaptionConfig((prev) => ({ ...prev, activeWordColor: e.target.value, highlightColor: e.target.value }));
                                        setIsCustomPreset(true);
                                        markDirty();
                                      }}
                                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                                    />
                                    <span className="text-[11px] font-mono text-neutral-300">
                                      {captionConfig.activeWordColor || captionConfig.highlightColor || '#FF6B35'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Stroke width & color */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-neutral-400">Outline / Stroke Width</span>
                                  <span className="font-mono text-white">{captionConfig.strokeWidth ?? 4}px</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={captionConfig.strokeColor || '#000000'}
                                    onChange={(e) => {
                                      setCaptionConfig((prev) => ({ ...prev, strokeColor: e.target.value }));
                                      setIsCustomPreset(true);
                                      markDirty();
                                    }}
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                    title="Outline Color"
                                  />
                                  <input
                                    type="range"
                                    min="0"
                                    max="8"
                                    step="0.5"
                                    value={captionConfig.strokeWidth ?? 4}
                                    onChange={(e) => {
                                      setCaptionConfig((prev) => ({ ...prev, strokeWidth: parseFloat(e.target.value) }));
                                      setIsCustomPreset(true);
                                      markDirty();
                                    }}
                                    className="w-full accent-orange-500 cursor-pointer"
                                  />
                                </div>
                              </div>

                              {/* Background Box */}
                              <div className="space-y-2 pt-1 border-t border-neutral-800/60">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-medium text-neutral-400">Background Box</span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(captionConfig.backgroundEnabled)}
                                    onChange={(e) => {
                                      setCaptionConfig((prev) => ({ ...prev, backgroundEnabled: e.target.checked }));
                                      setIsCustomPreset(true);
                                      markDirty();
                                    }}
                                    className="accent-orange-500 cursor-pointer"
                                  />
                                </div>

                                {captionConfig.backgroundEnabled && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={captionConfig.backgroundColor || '#000000'}
                                      onChange={(e) => {
                                        setCaptionConfig((prev) => ({ ...prev, backgroundColor: e.target.value }));
                                        setIsCustomPreset(true);
                                        markDirty();
                                      }}
                                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                    />
                                    <div className="flex-1 space-y-1">
                                      <div className="flex justify-between text-[10px] text-neutral-400">
                                        <span>Opacity</span>
                                        <span>{Math.round((captionConfig.backgroundOpacity ?? 0.55) * 100)}%</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={captionConfig.backgroundOpacity ?? 0.55}
                                        onChange={(e) => {
                                          setCaptionConfig((prev) => ({ ...prev, backgroundOpacity: parseFloat(e.target.value) }));
                                          setIsCustomPreset(true);
                                          markDirty();
                                        }}
                                        className="w-full accent-orange-500 cursor-pointer"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 4. Layout & Chunking Collapsible */}
                        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                          <button
                            type="button"
                            onClick={() => toggleSection('layout')}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-neutral-300 hover:bg-neutral-800/40 transition"
                          >
                            <span>Layout & Chunk Size</span>
                            {openSections.layout ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {openSections.layout && (
                            <div className="p-3.5 pt-1 border-t border-neutral-800/60 space-y-3.5">
                              {/* Position Presets */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-neutral-400">Vertical Zone</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {[
                                    { id: 'top', label: 'Top', y: 0.14 },
                                    { id: 'center', label: 'Center', y: 0.5 },
                                    { id: 'bottom', label: 'Bottom', y: 0.76 },
                                  ].map((pos) => (
                                    <button
                                      key={pos.id}
                                      type="button"
                                      onClick={() => {
                                        setCaptionPosition(pos.id as CaptionPosition);
                                        setCaptionConfig((prev) => ({ ...prev, position: pos.id as CaptionPosition, positionY: pos.y }));
                                        setIsCustomPreset(true);
                                        markDirty();
                                      }}
                                      className={`py-1.5 text-xs font-medium rounded-lg border text-center transition ${
                                        captionPosition === pos.id
                                          ? 'bg-orange-950/40 border-orange-500 text-white'
                                          : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                                      }`}
                                    >
                                      {pos.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Fine Y position slider */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-neutral-400">Fine Vertical Offset (Y)</span>
                                  <span className="font-mono text-white">
                                    {Math.round((captionConfig.positionY ?? 0.76) * 100)}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0.08"
                                  max="0.92"
                                  step="0.01"
                                  value={captionConfig.positionY ?? 0.76}
                                  onChange={(e) => {
                                    setCaptionConfig((prev) => ({ ...prev, positionY: parseFloat(e.target.value) }));
                                    setIsCustomPreset(true);
                                    markDirty();
                                  }}
                                  className="w-full accent-orange-500 cursor-pointer"
                                />
                              </div>

                              {/* Text Alignment */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-neutral-400">Text Alignment</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {[
                                    { id: 'left', icon: AlignLeft, label: 'Left' },
                                    { id: 'center', icon: AlignCenter, label: 'Center' },
                                    { id: 'right', icon: AlignRight, label: 'Right' },
                                  ].map((al) => {
                                    const Icon = al.icon;
                                    const isSelected = (captionConfig.textAlign || 'center') === al.id;
                                    return (
                                      <button
                                        key={al.id}
                                        type="button"
                                        onClick={() => {
                                          setCaptionConfig((prev) => ({ ...prev, textAlign: al.id as any }));
                                          setIsCustomPreset(true);
                                          markDirty();
                                        }}
                                        className={`py-1.5 flex items-center justify-center gap-1.5 text-xs rounded-lg border transition ${
                                          isSelected
                                            ? 'bg-orange-950/40 border-orange-500 text-white'
                                            : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                                        }`}
                                      >
                                        <Icon className="w-3 h-3" />
                                        <span>{al.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Words per caption */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-neutral-400">Words per Caption</label>
                                <div className="grid grid-cols-5 gap-1.5">
                                  {[2, 3, 4, 5, 6].map((num) => (
                                    <button
                                      key={num}
                                      type="button"
                                      onClick={() => {
                                        setCaptionConfig((prev) => ({ ...prev, maxWordsPerCue: num }));
                                        setIsCustomPreset(true);
                                        markDirty();
                                      }}
                                      className={`py-1.5 text-xs font-semibold rounded border transition ${
                                        (captionConfig.maxWordsPerCue || 4) === num
                                          ? 'bg-orange-950/50 border-orange-500 text-white'
                                          : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                                      }`}
                                    >
                                      {num}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Max lines */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-neutral-400">Max Lines</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {[1, 2].map((lines) => (
                                    <button
                                      key={lines}
                                      type="button"
                                      onClick={() => {
                                        setCaptionConfig((prev) => ({ ...prev, maxLines: lines }));
                                        setIsCustomPreset(true);
                                        markDirty();
                                      }}
                                      className={`py-1.5 text-xs font-medium rounded border transition ${
                                        (captionConfig.maxLines || 2) === lines
                                          ? 'bg-orange-950/50 border-orange-500 text-white'
                                          : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                                      }`}
                                    >
                                      {lines} {lines === 1 ? 'Line' : 'Lines'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 5. Effects & Animations Collapsible */}
                        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                          <button
                            type="button"
                            onClick={() => toggleSection('effects')}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-neutral-300 hover:bg-neutral-800/40 transition"
                          >
                            <span>Effects & Animations</span>
                            {openSections.effects ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {openSections.effects && (
                            <div className="p-3.5 pt-1 border-t border-neutral-800/60 space-y-3.5">
                              {/* Shadow toggle */}
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-neutral-400">Drop Shadow</span>
                                <input
                                  type="checkbox"
                                  checked={captionConfig.shadowEnabled !== false}
                                  onChange={(e) => {
                                    setCaptionConfig((prev) => ({ ...prev, shadowEnabled: e.target.checked }));
                                    setIsCustomPreset(true);
                                    markDirty();
                                  }}
                                  className="accent-orange-500 cursor-pointer"
                                />
                              </div>

                              {/* Animation */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-neutral-400">Animation</label>
                                <select
                                  value={captionConfig.animation || 'none'}
                                  onChange={(e) => {
                                    setCaptionConfig((prev) => ({ ...prev, animation: e.target.value as any }));
                                    setIsCustomPreset(true);
                                    markDirty();
                                  }}
                                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                                >
                                  <option value="none">None</option>
                                  <option value="fade">Fade In/Out</option>
                                  <option value="pop">Pop (Scale Pulse)</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 6. Timing Status Section */}
                        <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">Timing Status</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                timingMode === 'word'
                                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                                  : 'bg-amber-950/60 border-amber-500 text-amber-300'
                              }`}
                            >
                              {timingMode === 'word' ? 'Precise Word Timing ✓' : 'Basic Segment Timing'}
                            </span>
                          </div>

                          <p className="text-[11px] text-neutral-400 leading-relaxed">
                            {timingMode === 'word'
                              ? 'Real word-level timestamps detected. Spoken words are highlighted in real time.'
                              : 'Precise word timing unavailable for this transcript. Displaying phrase-level segment captions.'}
                          </p>

                          {timingMode === 'segment' && (
                            <button
                              type="button"
                              onClick={() => setShowTimingModal(true)}
                              className="text-[11px] text-orange-400 hover:text-orange-300 font-medium underline flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              Improve Caption Timing...
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* SECTION B: CUE LIST & MANUAL CORRECTIONS */}
                    {captionSection === 'cues' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[11px] text-neutral-400">
                          <span>Click a cue to seek video • Edit text inline</span>
                          <span className="font-mono">{cues.length} Cues</span>
                        </div>

                        <div ref={cueListRef} className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                          {cues.map((cue, idx) => {
                            const isCueActive = cue.id === activeCue?.id;
                            return (
                              <div
                                key={cue.id}
                                ref={isCueActive ? activeCueElRef : null}
                                onClick={() => {
                                  if (videoRef.current) {
                                    videoRef.current.currentTime = cue.start;
                                    setCurrentTime(cue.start);
                                  }
                                }}
                                className={`p-2.5 rounded-lg border transition cursor-pointer ${
                                  isCueActive
                                    ? 'bg-orange-950/40 border-orange-500 shadow-md ring-1 ring-orange-500/50'
                                    : 'bg-neutral-800/40 border-neutral-700/60 hover:bg-neutral-800'
                                }`}
                              >
                                <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1.5">
                                  <span className="font-mono font-semibold text-orange-400">
                                    #{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                                  </span>
                                  <span className="font-mono">
                                    {formatTime(cue.start)} → {formatTime(cue.end)}{' '}
                                    <span className="text-neutral-500">
                                      ({(cue.end - cue.start).toFixed(1)}s)
                                    </span>
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={cue.text}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleUpdateCueText(cue.id, e.target.value)}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500 transition"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 2. LAYOUT & FRAMING TAB */}
            {activeTab === 'layout' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Framing & Aspect Ratio</h3>
                  <p className="text-xs text-neutral-400">Target platform dimensions and focus</p>
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-300">Target Aspect Ratio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '9:16', label: '9:16', desc: 'Shorts/TikTok' },
                      { id: '1:1', label: '1:1', desc: 'Square Feed' },
                      { id: '16:9', label: '16:9', desc: 'Landscape' },
                    ].map((ar) => (
                      <button
                        key={ar.id}
                        onClick={() => {
                          setAspectRatio(ar.id as ClipAspectRatio);
                          markDirty();
                        }}
                        className={`p-2.5 text-center rounded-lg border transition ${
                          aspectRatio === ar.id
                            ? 'bg-orange-950/40 border-orange-500 text-white'
                            : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <p className="text-xs font-bold">{ar.label}</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">{ar.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Framing Mode Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-300">Framing Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'center', label: 'Center', desc: 'Standard center' },
                      { id: 'manual', label: 'Manual', desc: 'Adjust slider' },
                      { id: 'smart', label: 'Smart', desc: isSmartReframeEnabled ? 'Auto-track subject' : 'Coming soon' },
                    ].map((mode) => {
                      const isDisabled = mode.id === 'smart' && !isSmartReframeEnabled;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          disabled={isDisabled}
                          title={isDisabled ? 'Smart Auto-Reframe is coming soon in beta' : undefined}
                          onClick={() => {
                            if (isDisabled) return;
                            setCropConfig({ ...cropConfig, mode: mode.id as CropMode });
                            markDirty();
                          }}
                          className={`p-2.5 text-center rounded-lg border transition ${
                            isDisabled
                              ? 'opacity-50 cursor-not-allowed bg-neutral-900 border-neutral-800 text-neutral-500'
                              : (cropConfig.mode || 'center') === mode.id
                              ? 'bg-orange-950/40 border-orange-500 text-white shadow-sm shadow-orange-500/10'
                              : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <p className="text-xs font-bold flex items-center justify-center gap-1">
                            {mode.label}
                            {isDisabled && (
                              <span className="text-[9px] font-normal px-1 py-0.5 rounded bg-neutral-800 text-neutral-400">
                                Beta
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">{mode.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Center Mode Description */}
                {(cropConfig.mode === 'center' || !cropConfig.mode) && (
                  <div className="p-3 bg-neutral-800/30 border border-neutral-700/50 rounded-lg text-xs text-neutral-400">
                    <p className="text-neutral-300 font-medium mb-1">Standard Center Framing</p>
                    <p className="text-[11px] leading-relaxed">
                      Crops precisely from the center of the video frame. Best for presentations or videos where the speaker stays centered.
                    </p>
                  </div>
                )}

                {/* Manual Crop Focus Pad */}
                {cropConfig.mode === 'manual' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-neutral-300">Horizontal Crop Focus</label>
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {Math.round((cropConfig.focusX || 0.5) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={cropConfig.focusX ?? 0.5}
                        onChange={(e) => {
                          setCropConfig({ ...cropConfig, focusX: parseFloat(e.target.value) || 0.5 });
                          markDirty();
                        }}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                        <span>Left (0%)</span>
                        <span>Center (50%)</span>
                        <span>Right (100%)</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {[
                        { label: 'Left', x: 0 },
                        { label: 'Center', x: 0.5 },
                        { label: 'Right', x: 1.0 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setCropConfig({ ...cropConfig, focusX: preset.x });
                            markDirty();
                          }}
                          className="flex-1 py-1.5 bg-neutral-800/60 hover:bg-neutral-800 text-neutral-300 text-xs rounded border border-neutral-700 transition"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Smart Reframe Mode Section */}
                {cropConfig.mode === 'smart' && (
                  <div className="space-y-3 p-3.5 bg-neutral-800/40 border border-neutral-700/60 rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                          Smart Reframe
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                          Vireo will track the primary subject and keep them framed automatically.
                        </p>
                      </div>
                    </div>

                    {isAnalyzingReframe ? (
                      <div className="p-3 bg-orange-950/30 border border-orange-500/30 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-medium text-orange-200">Analyzing subject...</span>
                        </div>
                        <p className="text-[11px] text-orange-300/80 animate-pulse pl-6">
                          {reframeStep}
                        </p>
                      </div>
                    ) : reframeStatus === 'ready' ? (
                      <div className="space-y-2.5">
                        <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="text-[11px]">
                            {detectedFaceCount > 0 ? (
                              <>
                                <p className="font-semibold text-emerald-300">
                                  Primary subject detected ✓ ({dominantTrackId || 'Primary'})
                                </p>
                                <p className="text-emerald-400/80 mt-0.5">
                                  Subject tracked smoothly across {smoothedKeyframes.length} camera keyframes.
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-emerald-300">No clear subject detected</p>
                                <p className="text-emerald-400/80 mt-0.5">
                                  Using center framing for balanced composition.
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {isReframeStale && (
                          <div className="p-2.5 bg-amber-950/40 border border-amber-500/40 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-[11px]">
                              <p className="font-semibold text-amber-300">Framing needs re-analysis</p>
                              <p className="text-amber-400/80 mt-0.5">
                                Trim or aspect ratio changed since tracking analysis. Re-analyze to synchronize framing.
                              </p>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleAnalyzeReframe}
                          className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-600 transition flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                          {isReframeStale ? 'Re-analyze Framing' : 'Re-run Subject Analysis'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reframeError && (
                          <div className="p-2 bg-red-950/40 border border-red-500/30 rounded text-[11px] text-red-300">
                            {reframeError}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleAnalyzeReframe}
                          className="w-full py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-semibold rounded-lg shadow transition flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Analyze Framing
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. HEADLINE / TEXT OVERLAY TAB */}
            {activeTab === 'text' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Headline / Callout Banner</h3>
                    <p className="text-xs text-neutral-400">Top text hook for viral retention</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overlayConfig.enabled}
                      onChange={(e) => {
                        setOverlayConfig({ ...overlayConfig, enabled: e.target.checked });
                        markDirty();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>

                {overlayConfig.enabled && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <label className="font-medium text-neutral-300">Overlay Text</label>
                        <span className="text-neutral-500 font-mono">{(overlayConfig.text || '').length}/120</span>
                      </div>
                      <input
                        type="text"
                        maxLength={120}
                        placeholder="e.g. The #1 Habit That Changed Everything"
                        value={overlayConfig.text || ''}
                        onChange={(e) => {
                          setOverlayConfig({ ...overlayConfig, text: e.target.value });
                          markDirty();
                        }}
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-300">Position</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['top', 'center', 'bottom'].map((pos) => (
                          <button
                            key={pos}
                            onClick={() => {
                              setOverlayConfig({ ...overlayConfig, position: pos as any });
                              markDirty();
                            }}
                            className={`py-2 text-xs font-medium rounded-lg border capitalize transition ${
                              overlayConfig.position === pos
                                ? 'bg-orange-950/40 border-orange-500 text-white'
                                : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-300">Size</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['sm', 'md', 'lg'].map((sz) => (
                          <button
                            key={sz}
                            onClick={() => {
                              setOverlayConfig({ ...overlayConfig, size: sz as any });
                              markDirty();
                            }}
                            className={`py-2 text-xs font-medium rounded-lg border uppercase transition ${
                              overlayConfig.size === sz
                                ? 'bg-orange-950/40 border-orange-500 text-white'
                                : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 4. AUDIO TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Audio Levels</h3>
                  <p className="text-xs text-neutral-400">Mute or boost dialogue volume</p>
                </div>

                <div className="flex items-center justify-between p-3 bg-neutral-800/40 border border-neutral-700/60 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    {muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-neutral-300" />}
                    <span className="text-sm font-medium text-white">Mute Clip Audio</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={muted}
                      onChange={(e) => {
                        setMuted(e.target.checked);
                        markDirty();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                {!muted && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-medium text-neutral-300">Volume Output</label>
                      <span className="text-neutral-400 font-mono">{Math.round(volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2.0"
                      step="0.05"
                      value={volume}
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value) || 1.0);
                        markDirty();
                      }}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                      <span>0% (Silent)</span>
                      <span>100% (Normal)</span>
                      <span>200% (Boosted)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Information Modal: Improve Timing */}
      {showTimingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-orange-400" />
              <h3 className="text-base font-semibold text-white">Improve Caption Timing</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              This video currently has <strong>segment-level timestamps</strong> from an earlier upload.
              Word-level timing enables precise karaoke highlights, granular word breaks, and tighter subtitle sync.
            </p>
            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
              <p>• New video uploads automatically receive word-level timestamps.</p>
              <p>• Generating word timestamps requires running speech recognition processing.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTimingModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipEditorPage;

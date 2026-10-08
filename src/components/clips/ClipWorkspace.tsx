import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Film,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  Lightbulb,
  Check,
  Loader2,
  AlertCircle,
  Download,
  RefreshCw,
  Video,
  Sliders,
  Share2,
  Trash2,
  Search,
  Zap,
  Activity,
  X,
  Wand2,
  Layers,
} from 'lucide-react';
import { Button } from '../Button';
import { SpotlightCard } from '../react-bits/SpotlightCard';
import { ClipCandidate, ClipCandidateStatus, Transcript, RenderedClip, MomentSearchResult } from '../../types';
import { clipService } from '../../services/clipService';
import { clipRenderService } from '../../services/clipRenderService';
import { PublishModal } from '../PublishModal';
import { ContentPackWorkspace } from '../contentPack/ContentPackWorkspace';

export interface ClipWorkspaceProps {
  projectId: string;
  transcript: Transcript | null;
  videoPreviewUrl: string | null;
}

export const ClipWorkspace: React.FC<ClipWorkspaceProps> = ({
  projectId,
  transcript,
  videoPreviewUrl,
}) => {
  // Navigation Tabs: 'suggestions' (AI Clip Candidates) vs 'my_clips' (Real Rendered MP4s)
  const [activeTab, setActiveTab] = useState<'suggestions' | 'my_clips'>('suggestions');

  // AI Suggestions state
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'selected'>('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Phase 16: Multimodal Moment Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMoments, setSearchMoments] = useState<MomentSearchResult[]>([]);

  // Rendered Clips state
  const [myClips, setMyClips] = useState<RenderedClip[]>([]);
  const [isCreatingClip, setIsCreatingClip] = useState<string | null>(null); // candidateId currently creating
  const [clipActionError, setClipActionError] = useState<string | null>(null);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [retryingClipId, setRetryingClipId] = useState<string | null>(null);
  const [publishingClip, setPublishingClip] = useState<RenderedClip | null>(null);
  const [contentPackClip, setContentPackClip] = useState<RenderedClip | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleSearchMoments = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await clipService.findMoments(projectId, searchQuery.trim());
      setSearchMoments(results);
      if (results.length === 0) {
        setSearchError('No matching moments found for that query. Try broader keywords.');
      }
    } catch (err: any) {
      setSearchError(err.message || 'Failed to search video moments.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchMoments([]);
    setSearchError(null);
  };

  const handlePreviewMoment = (moment: MomentSearchResult) => {
    if (videoRef.current) {
      videoRef.current.currentTime = moment.start_seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Load existing clip candidates and rendered clips on mount
  const refreshClipsData = async () => {
    try {
      const [candData, clipsData] = await Promise.all([
        clipService.getClipCandidates(projectId).catch(() => []),
        clipRenderService.getProjectClips(projectId).catch(() => []),
      ]);

      setCandidates(candData);
      if (candData.length > 0 && !selectedCandidateId) {
        setSelectedCandidateId(candData[0].id);
      }

      setMyClips(clipsData);
    } catch (err) {
      // Ignored for initial fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshClipsData();
  }, [projectId]);

  // Polling loop for active rendering jobs in 'my_clips'
  useEffect(() => {
    const hasActiveRenders = myClips.some((c) =>
      ['draft', 'queued', 'rendering', 'uploading'].includes(c.render_status)
    );

    if (!hasActiveRenders) return;

    const interval = setInterval(async () => {
      try {
        const updated = await clipRenderService.getProjectClips(projectId);
        setMyClips(updated);
      } catch (e) {
        // Polling failure ignored
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [projectId, myClips]);

  // Handle Find Clips analysis call (triggers POST /api/projects/:id/analyze-clips ONCE)
  const handleFindClips = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await clipService.analyzeClips(projectId);
      setCandidates(response.candidates);
      if (response.candidates.length > 0) {
        setSelectedCandidateId(response.candidates[0].id);
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to analyze video clips.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle candidate status update (suggested | selected | dismissed)
  const handleUpdateStatus = async (candidateId: string, newStatus: ClipCandidateStatus) => {
    try {
      const updated = await clipService.updateClipCandidateStatus(projectId, candidateId, newStatus);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: updated.status } : c))
      );
    } catch (err: any) {
      console.error('Failed to update clip status:', err);
    }
  };

  // Create real 9:16 clip from candidate
  const handleCreateClip = async (candidateId: string) => {
    if (isCreatingClip) return;
    setIsCreatingClip(candidateId);
    setClipActionError(null);

    try {
      const res = await clipRenderService.createClipFromCandidate(projectId, candidateId, '9:16');
      // Mark candidate selected in local UI
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: 'selected' } : c))
      );
      // Prepend to myClips
      setMyClips((prev) => [res.clip, ...prev.filter((c) => c.id !== res.clip.id)]);
      // Automatically switch to My Clips tab so user sees active rendering
      setActiveTab('my_clips');
    } catch (err: any) {
      setClipActionError(err.message || 'Failed to create clip.');
    } finally {
      setIsCreatingClip(null);
    }
  };

  // Retry rendering for a failed clip
  const handleRetryRender = async (clipId: string) => {
    if (retryingClipId) return;
    setRetryingClipId(clipId);
    setClipActionError(null);

    try {
      await clipRenderService.renderClip(clipId);
      // Immediately refresh clips
      const updated = await clipRenderService.getProjectClips(projectId);
      setMyClips(updated);
    } catch (err: any) {
      setClipActionError(err.message || 'Failed to retry render.');
    } finally {
      setRetryingClipId(null);
    }
  };

  // Delete clip
  const handleDeleteClip = async (clipId: string) => {
    if (!window.confirm('Are you sure you want to delete this rendered clip?')) return;
    try {
      await clipRenderService.deleteClip(clipId);
      setMyClips((prev) => prev.filter((c) => c.id !== clipId));
      if (previewClipId === clipId) {
        setPreviewClipId(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete clip.');
    }
  };

  // Preview clip (obtain signed URL)
  const handleTogglePreview = async (clipId: string) => {
    if (previewClipId === clipId) {
      setPreviewClipId(null);
      return;
    }

    try {
      if (!previewUrls[clipId]) {
        const url = await clipRenderService.getPreviewUrl(clipId);
        setPreviewUrls((prev) => ({ ...prev, [clipId]: url }));
      }
      setPreviewClipId(clipId);
    } catch (err: any) {
      alert(err.message || 'Failed to load preview URL.');
    }
  };

  // Download clip (obtain signed download URL)
  const handleDownloadClip = async (clipId: string) => {
    setIsDownloading(clipId);
    try {
      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(clipId);
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = filename || 'clip.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(err.message || 'Failed to download clip.');
    } finally {
      setIsDownloading(null);
    }
  };

  // Format seconds into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0];

  // Sync video seek position when selected candidate changes
  useEffect(() => {
    if (videoRef.current && activeCandidate) {
      videoRef.current.currentTime = activeCandidate.start_seconds;
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [activeCandidate?.id]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setCurrentTime(curr);

    if (activeCandidate && curr >= activeCandidate.end_seconds) {
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime = activeCandidate.start_seconds;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (
        activeCandidate &&
        (videoRef.current.currentTime < activeCandidate.start_seconds ||
          videoRef.current.currentTime >= activeCandidate.end_seconds)
      ) {
        videoRef.current.currentTime = activeCandidate.start_seconds;
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    if (filter === 'selected') return c.status === 'selected';
    return c.status !== 'dismissed';
  });

  const selectedCount = candidates.filter((c) => c.status === 'selected').length;

  // 1. Initial Loading State
  if (isLoading) {
    return (
      <div className="card-soft p-12 text-center space-y-4">
        <Loader2 className="size-8 text-clay animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">Loading clips workspace...</p>
      </div>
    );
  }

  // 2. AI Analysis In-Progress State
  if (isAnalyzing) {
    return (
      <SpotlightCard
        spotlightColor="rgba(192, 98, 62, 0.14)"
        className="p-8 md:p-12 text-center border-clay/30 bg-card/90 space-y-6 animate-in fade-in duration-300"
      >
        <div className="size-14 rounded-2xl bg-clay/15 text-clay mx-auto flex items-center justify-center animate-pulse">
          <Film className="size-7" />
        </div>

        <div className="space-y-2 max-w-md mx-auto">
          <h3 className="text-xl font-semibold font-display text-foreground">
            Finding your strongest moments...
          </h3>
          <p className="text-sm text-muted-foreground">
            Vireo is analyzing your video transcript to detect high-engagement standalone clips.
          </p>
        </div>

        <div className="max-w-md mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          {[
            'Reading transcript',
            'Evaluating hooks',
            'Checking standalone context',
            'Ranking moments',
          ].map((step) => (
            <div
              key={step}
              className="rounded-xl border border-border/80 bg-cream/50 p-2.5 text-center text-xs font-medium text-foreground flex flex-col items-center justify-center gap-1.5"
            >
              <div className="size-2 rounded-full bg-clay animate-ping" />
              <span className="text-[11px] text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      </SpotlightCard>
    );
  }

  // 3. Main Workspace with Top Sub-Tabs: AI Suggestions vs My Clips
  return (
    <div className="space-y-6">
      {/* Primary Workspace Nav (AI Suggestions vs My Clips) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-cream/70 p-1 border border-border/80 text-xs font-medium">
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'suggestions'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="size-3.5 text-clay" />
              <span>AI Suggestions</span>
              <span className="rounded-full bg-clay/10 px-1.5 py-0.2 text-[10px] font-mono text-clay font-bold">
                {candidates.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('my_clips')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'my_clips'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Video className="size-3.5 text-vireo-green" />
              <span>My Clips</span>
              <span className="rounded-full bg-vireo-green/10 px-1.5 py-0.2 text-[10px] font-mono text-vireo-green font-bold">
                {myClips.length}
              </span>
            </button>
          </div>
        </div>

        {activeTab === 'suggestions' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFindClips}
              disabled={isAnalyzing}
              className="text-xs"
            >
              <Sparkles className="size-3.5 mr-1.5 text-clay" />
              Regenerate Suggestions
            </Button>
          </div>
        )}
      </div>

      {clipActionError && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{clipActionError}</span>
          </div>
          <button
            onClick={() => setClipActionError(null)}
            className="text-[11px] font-semibold underline hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: AI SUGGESTIONS VIEW                                */}
      {/* ======================================================== */}
      {activeTab === 'suggestions' && (
        <>
          {candidates.length === 0 ? (
            <SpotlightCard
              spotlightColor="rgba(192, 98, 62, 0.12)"
              className="p-8 md:p-12 text-center border-border/80 bg-card space-y-6"
            >
              <div className="size-14 rounded-2xl bg-clay/10 text-clay mx-auto flex items-center justify-center">
                <Film className="size-7" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <h3 className="text-xl md:text-2xl font-semibold font-display text-foreground">
                  Find your best moments
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Vireo analyzes your transcript to surface strong standalone moments for Shorts, Reels, and TikTok.
                </p>
                <p className="text-xs text-muted-foreground/80 font-mono">
                  Usually finds 5–10 strong moments based on hook strength, clarity, and pacing.
                </p>
              </div>

              {analysisError && (
                <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs max-w-md mx-auto flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}

              <div className="pt-2">
                <Button
                  variant="clay"
                  size="lg"
                  onClick={handleFindClips}
                  disabled={isAnalyzing || !transcript}
                  className="shadow-clay px-8"
                >
                  <Sparkles className="size-4 mr-2" />
                  Find Clips
                </Button>
              </div>
            </SpotlightCard>
          ) : (
            <div className="space-y-4">
              {/* Natural Language Moment Search Bar */}
              <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-xs">
                <form onSubmit={handleSearchMoments} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ask Vireo to find a moment... (e.g. 'find the part about workspace' or 'hook about AI')"
                      className="w-full bg-cream/50 border border-border/80 rounded-xl pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-clay/30"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    type="submit"
                    variant="clay"
                    size="sm"
                    disabled={isSearching || !searchQuery.trim()}
                    className="text-xs shrink-0"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 mr-1.5" />
                        Find Moment
                      </>
                    )}
                  </Button>
                </form>

                {searchError && (
                  <p className="text-[11px] text-destructive mt-2 px-1 flex items-center gap-1.5">
                    <AlertCircle className="size-3 shrink-0" />
                    <span>{searchError}</span>
                  </p>
                )}

                {/* Found Moments List */}
                {searchMoments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="font-semibold text-foreground flex items-center gap-1.5 font-mono">
                        <Sparkles className="size-3.5 text-clay" />
                        Found {searchMoments.length} Moment{searchMoments.length > 1 ? 's' : ''} for "{searchQuery}"
                      </span>
                      <button
                        onClick={handleClearSearch}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline"
                      >
                        Close
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {searchMoments.map((moment, mIdx) => (
                        <div
                          key={mIdx}
                          onClick={() => handlePreviewMoment(moment)}
                          className="rounded-xl border border-clay/30 bg-cream/40 p-2.5 cursor-pointer hover:bg-cream/70 transition-all text-left flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-foreground line-clamp-1">{moment.title}</span>
                              <span className="rounded bg-clay/10 px-1.5 py-0.2 font-mono text-clay font-bold text-[10px]">
                                {moment.vireo_score} Score
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 italic">
                              "{moment.hook}"
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono border-t border-border/40 pt-1.5">
                            <span>{formatTime(moment.start_seconds)} – {formatTime(moment.end_seconds)}</span>
                            <span className="text-clay font-semibold flex items-center gap-1">
                              <Play className="size-2.5 fill-clay" /> Preview
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Sub-bar */}
              <div className="flex items-center justify-between text-xs pb-1">
                <div className="flex items-center gap-2 font-medium">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      filter === 'all' ? 'bg-cream text-foreground font-semibold' : 'text-muted-foreground'
                    }`}
                  >
                    All ({candidates.filter((c) => c.status !== 'dismissed').length})
                  </button>
                  <button
                    onClick={() => setFilter('selected')}
                    className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                      filter === 'selected' ? 'bg-cream text-vireo-green font-semibold' : 'text-muted-foreground'
                    }`}
                  >
                    <CheckCircle2 className="size-3 text-vireo-green" />
                    <span>Selected ({selectedCount})</span>
                  </button>
                </div>
              </div>

              {/* 3-Column Layout: Candidates | Video Preview | Details & Create Action */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT: Candidate List */}
                <div className="lg:col-span-4 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {filteredCandidates.map((candidate, index) => {
                    const isSelected = candidate.id === activeCandidate?.id;
                    const isChosen = candidate.status === 'selected';
                    const score = candidate.metadata?.vireo_score ?? candidate.engagement_score;
                    const visualScore = candidate.metadata?.explanation?.visual_activity_score;
                    const wasSnapped = candidate.metadata?.was_snapped;

                    return (
                      <div
                        key={candidate.id}
                        onClick={() => setSelectedCandidateId(candidate.id)}
                        className={`group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-clay/50 bg-cream/70 shadow-sm ring-1 ring-clay/20'
                            : 'border-border/80 bg-card hover:bg-cream/30 hover:border-border'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                              #{index + 1}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-xs font-bold font-mono ${
                                score >= 85
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-clay/10 text-clay'
                              }`}
                            >
                              {score} Vireo
                            </span>
                          </div>

                          {isChosen ? (
                            <span className="flex items-center gap-1 rounded-full bg-vireo-green/10 text-vireo-green px-2 py-0.5 text-[11px] font-semibold">
                              <Check className="size-3" />
                              Selected
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider capitalize">
                              {candidate.category}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-2 text-sm font-semibold text-foreground font-display line-clamp-2">
                          {candidate.title}
                        </h4>

                        {/* Multimodal Signal Badges */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {visualScore && (
                            <span className="inline-flex items-center gap-1 rounded bg-cream/70 border border-border/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              <Activity className="size-2.5 text-clay" />
                              {visualScore} Visual
                            </span>
                          )}
                          {wasSnapped && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                              <Zap className="size-2.5" />
                              Snapped
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground font-mono border-t border-border/50 pt-2">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTime(candidate.start_seconds)} – {formatTime(candidate.end_seconds)}
                          </span>
                          <span>{Math.round(candidate.duration_seconds)}s</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CENTER: Source Video Player */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="card-soft overflow-hidden border-border/80 bg-black/95 rounded-2xl relative shadow-lg">
                    {videoPreviewUrl ? (
                      <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                        <video
                          ref={videoRef}
                          src={videoPreviewUrl}
                          className="w-full h-full object-contain"
                          onTimeUpdate={handleTimeUpdate}
                          onEnded={() => setIsPlaying(false)}
                        />

                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/60 backdrop-blur-md px-3 py-2 rounded-xl text-white text-xs">
                          <button
                            onClick={togglePlay}
                            className="flex items-center gap-1.5 font-semibold hover:text-clay transition-colors"
                          >
                            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-white" />}
                            <span>{isPlaying ? 'Pause' : 'Preview Cut'}</span>
                          </button>

                          <div className="font-mono text-[11px] text-white/80">
                            {formatTime(currentTime)} / {activeCandidate ? formatTime(activeCandidate.end_seconds) : '00:00'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video w-full flex flex-col items-center justify-center text-center p-6 space-y-2 bg-[#1a1c1a] text-white">
                        <Film className="size-8 text-clay" />
                        <p className="text-xs text-white/70 max-w-xs">
                          {activeCandidate
                            ? `Active Moment: ${formatTime(activeCandidate.start_seconds)} – ${formatTime(activeCandidate.end_seconds)}`
                            : 'No candidate selected'}
                        </p>
                      </div>
                    )}
                  </div>

                  {activeCandidate && (
                    <div className="rounded-xl border border-border/60 bg-cream/40 p-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-vireo-green animate-pulse" />
                        <span className="font-medium text-foreground">Active Segment:</span>
                        <span className="font-mono text-muted-foreground">
                          {formatTime(activeCandidate.start_seconds)} – {formatTime(activeCandidate.end_seconds)}
                        </span>
                      </div>
                      <span className="font-mono text-muted-foreground font-semibold">
                        {Math.round(activeCandidate.duration_seconds)}s duration
                      </span>
                    </div>
                  )}
                </div>

                {/* RIGHT: Candidate Actions & Phase 16 Explainable Intelligence */}
                {activeCandidate && (
                  <div className="lg:col-span-3 space-y-4">
                    <div className="card-soft p-5 border-border/80 bg-card space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                          MOMENT DETAILS
                        </span>
                        <span
                          className={`rounded-md px-2.5 py-0.5 text-xs font-bold font-mono ${
                            (activeCandidate.metadata?.vireo_score ?? activeCandidate.engagement_score) >= 85
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-clay/10 text-clay'
                          }`}
                        >
                          {activeCandidate.metadata?.vireo_score ?? activeCandidate.engagement_score} Score
                        </span>
                      </div>

                      <h3 className="text-base font-bold font-display text-foreground leading-snug">
                        {activeCandidate.title}
                      </h3>

                      <div className="space-y-1.5 rounded-xl bg-cream/50 p-3 border border-border/50 text-xs">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Sparkles className="size-3.5 text-clay" />
                          Hook
                        </span>
                        <p className="text-muted-foreground leading-relaxed italic">
                          "{activeCandidate.hook}"
                        </p>
                      </div>

                      {/* Phase 16 Explainable Multimodal Signals */}
                      {activeCandidate.metadata?.explanation && (
                        <div className="space-y-2 rounded-xl bg-cream/30 border border-border/60 p-3 text-xs">
                          <span className="font-semibold text-foreground text-[11px] font-mono uppercase tracking-wider block">
                            Multimodal Intelligence
                          </span>
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                            <div className="rounded bg-card p-1.5 text-center border border-border/40">
                              <span className="text-muted-foreground block text-[9px]">Hook</span>
                              <span className="font-bold text-foreground">{activeCandidate.metadata.explanation.hook_score}</span>
                            </div>
                            <div className="rounded bg-card p-1.5 text-center border border-border/40">
                              <span className="text-muted-foreground block text-[9px]">Visual</span>
                              <span className="font-bold text-foreground">{activeCandidate.metadata.explanation.visual_activity_score}</span>
                            </div>
                            <div className="rounded bg-card p-1.5 text-center border border-border/40">
                              <span className="text-muted-foreground block text-[9px]">Audio</span>
                              <span className="font-bold text-foreground">{activeCandidate.metadata.explanation.audio_energy_score}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Why it works / Reasons breakdown */}
                      {activeCandidate.metadata?.explanation?.reasons?.length ? (
                        <div className="space-y-1.5 text-xs">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Lightbulb className="size-3.5 text-sage" />
                            Why it works
                          </span>
                          <ul className="space-y-1">
                            {activeCandidate.metadata.explanation.reasons.map((r: string, rIdx: number) => (
                              <li key={rIdx} className="text-muted-foreground text-[11px] leading-relaxed flex items-start gap-1.5">
                                <span className="text-clay font-bold">•</span>
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : activeCandidate.reason ? (
                        <div className="space-y-1 text-xs">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Lightbulb className="size-3.5 text-sage" />
                            Why it works
                          </span>
                          <p className="text-muted-foreground text-[11px] leading-relaxed">
                            {activeCandidate.reason}
                          </p>
                        </div>
                      ) : null}

                      {/* Platform Suitability */}
                      {activeCandidate.metadata?.explanation?.platform_suitability && (
                        <div className="space-y-1.5 text-xs border-t border-border/50 pt-2.5">
                          <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider font-mono block">
                            Platform Suitability
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(activeCandidate.metadata.explanation.platform_suitability).map(([plat, detail]: any) => (
                              <span
                                key={plat}
                                title={detail.reason}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase font-semibold ${
                                  detail.suitable ? 'bg-vireo-green/10 text-vireo-green' : 'bg-muted text-muted-foreground line-through'
                                }`}
                              >
                                {plat}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PHASE 11 PRIMARY ACTION: Create Clip */}
                      <div className="pt-2 space-y-2 border-t border-border/60">
                        <Button
                          variant="clay"
                          size="sm"
                          className="w-full text-xs shadow-clay py-2.5"
                          disabled={isCreatingClip === activeCandidate.id}
                          onClick={() => handleCreateClip(activeCandidate.id)}
                        >
                          {isCreatingClip === activeCandidate.id ? (
                            <>
                              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                              Creating Clip...
                            </>
                          ) : (
                            <>
                              <Video className="size-3.5 mr-1.5" />
                              Create Clip (Render 9:16)
                            </>
                          )}
                        </Button>

                        {/* Select / Dismiss Toggle */}
                        <div className="flex items-center gap-2 pt-1">
                          {activeCandidate.status === 'selected' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleUpdateStatus(activeCandidate.id, 'suggested')}
                            >
                              Unselect
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs text-vireo-green hover:bg-vireo-green/5"
                              onClick={() => handleUpdateStatus(activeCandidate.id, 'selected')}
                            >
                              <CheckCircle2 className="size-3.5 mr-1 text-vireo-green" />
                              Select
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-destructive px-2"
                            onClick={() => handleUpdateStatus(activeCandidate.id, 'dismissed')}
                            title="Dismiss moment"
                          >
                            <XCircle className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: MY CLIPS (RENDERED MP4 WORKSPACE)                 */}
      {/* ======================================================== */}
      {activeTab === 'my_clips' && (
        <div className="space-y-6">
          {myClips.length === 0 ? (
            <SpotlightCard
              spotlightColor="rgba(45, 90, 60, 0.12)"
              className="p-8 md:p-12 text-center border-border/80 bg-card space-y-4"
            >
              <div className="size-14 rounded-2xl bg-vireo-green/10 text-vireo-green mx-auto flex items-center justify-center">
                <Video className="size-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-xl font-semibold font-display text-foreground">
                  No rendered clips yet
                </h3>
                <p className="text-sm text-muted-foreground">
                  Go to <strong>AI Suggestions</strong>, pick a moment, and click <strong>Create Clip</strong> to render your first 9:16 MP4.
                </p>
              </div>
              <div className="pt-2">
                <Button variant="clay" size="sm" onClick={() => setActiveTab('suggestions')}>
                  <Sparkles className="size-3.5 mr-1.5" />
                  View Suggestions
                </Button>
              </div>
            </SpotlightCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myClips.map((clip) => {
                // Match candidate title if available
                const matchingCand = candidates.find((c) => c.id === clip.candidate_id);
                const title = matchingCand?.title || `Clip (${clip.aspect_ratio})`;
                const isReady = clip.render_status === 'ready';
                const isFailed = clip.render_status === 'failed';
                const isRendering = ['queued', 'rendering', 'uploading'].includes(clip.render_status);
                const progress = clip.latest_job?.progress ?? (isReady ? 100 : 0);
                const stage = clip.latest_job?.stage || clip.render_status;

                return (
                  <div
                    key={clip.id}
                    className="card-soft p-5 border-border/80 bg-card flex flex-col justify-between space-y-4 rounded-2xl shadow-sm transition-all hover:border-border"
                  >
                    <div className="space-y-3">
                      {/* Top Header: Aspect & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-cream border border-border/60 px-2 py-0.5 text-xs font-mono font-bold text-foreground">
                          {clip.aspect_ratio}
                        </span>

                        <div>
                          {isReady && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-vireo-green/10 text-vireo-green px-2.5 py-0.5 text-xs font-semibold">
                              <Check className="size-3" />
                              Ready
                            </span>
                          )}
                          {isRendering && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-clay/10 text-clay px-2.5 py-0.5 text-xs font-semibold animate-pulse">
                              <Loader2 className="size-3 animate-spin" />
                              {progress}% {stage}
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2.5 py-0.5 text-xs font-semibold">
                              <AlertCircle className="size-3" />
                              Failed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Timing */}
                      <div>
                        <h4 className="font-semibold text-sm font-display text-foreground line-clamp-2">
                          {title}
                        </h4>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTime(clip.start_seconds)} – {formatTime(clip.end_seconds)}
                          </span>
                          <span>•</span>
                          <span>{Math.round(clip.duration_seconds)}s</span>
                        </div>
                      </div>

                      {/* Active Rendering Progress Bar */}
                      {isRendering && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                            <span className="capitalize">{stage}...</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-cream rounded-full h-2 overflow-hidden border border-border/50">
                            <div
                              className="bg-clay h-full transition-all duration-300 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Failure Message */}
                      {isFailed && (
                        <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                          {clip.render_error_message || 'Video rendering failed. Please try again.'}
                        </div>
                      )}

                      {/* Inline Preview Player when toggled */}
                      {previewClipId === clip.id && previewUrls[clip.id] && (
                        <div className="pt-2">
                          <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-72 mx-auto flex items-center justify-center border border-border">
                            <video
                              src={previewUrls[clip.id]}
                              controls
                              autoPlay
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isReady && (
                          <>
                            <Link to={`/clips/${clip.id}/edit?tab=producer`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs font-semibold border-purple-500/60 bg-purple-500/10 text-purple-400 hover:bg-purple-600 hover:text-white shadow-xs transition-colors"
                                title="Open Vireo Producer AI Director (auto dead air cuts, kinetic captions, punch-ins)"
                              >
                                <Wand2 className="size-3.5 mr-1.5" />
                                Produce
                              </Button>
                            </Link>
                            <Link to={`/clips/${clip.id}/edit`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs font-semibold border-clay/60 bg-clay/10 text-clay hover:bg-clay hover:text-white shadow-xs transition-colors"
                                title="Open full Clip Editor (framing, captions, headline, audio)"
                              >
                                <Sliders className="size-3.5 mr-1.5" />
                                Edit Video
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs font-semibold border-purple-500/60 bg-purple-500/10 text-purple-400 hover:bg-purple-600 hover:text-white shadow-xs transition-colors"
                              title="Generate or view multi-platform Content Pack (titles, hooks, captions, descriptions, CTAs, thumbnails)"
                              onClick={() => setContentPackClip(clip)}
                            >
                              <Layers className="size-3.5 mr-1.5" />
                              Content Pack
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => handleTogglePreview(clip.id)}
                            >
                              {previewClipId === clip.id ? 'Close' : 'Preview'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs border-sage/60 bg-sage/10 text-sage hover:bg-sage hover:text-white"
                              title="Publish or schedule this clip to social platforms"
                              onClick={() => setPublishingClip(clip)}
                            >
                              <Share2 className="size-3 mr-1" />
                              Publish
                            </Button>
                            <Button
                              variant="clay"
                              size="sm"
                              className="text-xs shadow-clay"
                              disabled={isDownloading === clip.id}
                              onClick={() => handleDownloadClip(clip.id)}
                            >
                              {isDownloading === clip.id ? (
                                <Loader2 className="size-3 animate-spin mr-1" />
                              ) : (
                                <Download className="size-3 mr-1" />
                              )}
                              Download
                            </Button>
                          </>
                        )}

                        {isFailed && (
                          <Button
                            variant="clay"
                            size="sm"
                            className="text-xs"
                            disabled={retryingClipId === clip.id}
                            onClick={() => handleRetryRender(clip.id)}
                          >
                            {retryingClipId === clip.id ? (
                              <Loader2 className="size-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="size-3 mr-1" />
                            )}
                            Retry Render
                          </Button>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive px-2"
                        onClick={() => handleDeleteClip(clip.id)}
                        title="Delete clip"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Phase 10: Publishing Composer Modal */}
      {publishingClip && (
        <PublishModal
          isOpen={Boolean(publishingClip)}
          onClose={() => setPublishingClip(null)}
          projectId={projectId}
          clipId={publishingClip.id}
          initialTitle={`Clip: ${Math.round(publishingClip.duration_seconds)}s Highlight`}
          initialCaption="Check out this highlight clip generated with VireoClip! #ai #video #shorts"
        />
      )}

      {/* Phase 23: Content Pack Workspace Modal */}
      {contentPackClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-5xl">
            <ContentPackWorkspace
              projectId={projectId}
              clipId={contentPackClip.id}
              clipTitle={contentPackClip.title || `Clip: ${Math.round(contentPackClip.duration_seconds)}s Highlight`}
              clipDurationSeconds={contentPackClip.duration_seconds}
              onClose={() => setContentPackClip(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

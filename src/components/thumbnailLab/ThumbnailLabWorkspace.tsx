import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Lock,
  Unlock,
  Heart,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Share2,
  RefreshCw,
  ShieldCheck,
  Check,
  Film,
} from 'lucide-react';
import {
  ThumbnailLabSession,
  ThumbnailConcept,
  ThumbnailSourceFrame,
  ThumbnailCapabilityModel,
  ThumbnailStyleDirection,
  ThumbnailAspectRatio,
  THUMBNAIL_LAB_LIMITS,
} from '../../types';
import { thumbnailLabService } from '../../services/thumbnailLabService';
import { Button } from '../Button';

interface ThumbnailLabWorkspaceProps {
  clipId: string;
  projectId: string;
  clipTitle: string;
  clipDurationSeconds?: number;
  contentPackId?: string;
  onOpenPublishModal?: (handoffData: any) => void;
}

export const ThumbnailLabWorkspace: React.FC<ThumbnailLabWorkspaceProps> = ({
  clipId,
  projectId,
  clipTitle,
  contentPackId,
  onOpenPublishModal,
}) => {
  // State
  const [capabilities, setCapabilities] = useState<ThumbnailCapabilityModel | null>(null);
  const [session, setSession] = useState<ThumbnailLabSession | null>(null);
  const [concepts, setConcepts] = useState<ThumbnailConcept[]>([]);
  const [activeConceptId, setActiveConceptId] = useState<string | null>(null);
  const [sourceFrames, setSourceFrames] = useState<ThumbnailSourceFrame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  // Studio UI states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isExtractingFrames, setIsExtractingFrames] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const [userInstruction, setUserInstruction] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<ThumbnailStyleDirection>('EXPRESSIVE_CREATOR_PORTRAIT');
  const [aspectRatio, setAspectRatio] = useState<ThumbnailAspectRatio>('16:9');
  const [safeAreaOverlay, setSafeAreaOverlay] = useState<boolean>(true);
  const [canvasZoom, setCanvasZoom] = useState<number>(100);
  const [activeTab, setActiveTab] = useState<'text' | 'composition' | 'frames'>('text');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Active concept reference
  const activeConcept = concepts.find((c) => c.id === activeConceptId) || concepts[0] || null;

  // Initialize
  useEffect(() => {
    loadSession();
  }, [clipId]);

  const loadSession = async () => {
    setIsLoading(true);
    setErrorNotice(null);
    try {
      const caps = await thumbnailLabService.getCapabilities();
      setCapabilities(caps);

      const sess = await thumbnailLabService.createOrGetSession(clipId, {
        project_id: projectId,
        content_pack_id: contentPackId,
        video_topic: clipTitle,
        aspect_ratio: aspectRatio,
      });
      setSession(sess);

      const { concepts: loadedConcepts } = await thumbnailLabService.getSession(sess.id);
      if (loadedConcepts && loadedConcepts.length > 0) {
        setConcepts(loadedConcepts);
        setActiveConceptId(loadedConcepts[0].id);
      } else {
        // Auto-generate initial batch
        await handleGenerate(sess.id);
      }

      // Fetch source frames in background
      loadSourceFrames(sess.id);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to load Thumbnail Lab');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSourceFrames = async (sessionId: string) => {
    setIsExtractingFrames(true);
    try {
      const frames = await thumbnailLabService.getSourceFrames(sessionId);
      setSourceFrames(frames);
      if (frames.length > 0 && !selectedFrameId) {
        setSelectedFrameId(frames[0].id);
      }
    } catch (err: any) {
      console.warn('Source frame extraction note:', err.message);
    } finally {
      setIsExtractingFrames(false);
    }
  };

  const handleGenerate = async (targetSessionId?: string) => {
    const sessId = targetSessionId || session?.id;
    if (!sessId) return;

    setIsGenerating(true);
    setErrorNotice(null);
    try {
      const newConcepts = await thumbnailLabService.generateConcepts(sessId, {
        style_direction: selectedStyle,
        reference_frame_id: selectedFrameId || undefined,
        user_instruction: userInstruction || undefined,
        count: 4,
      });
      setConcepts(newConcepts);
      if (newConcepts.length > 0) {
        setActiveConceptId(newConcepts[0].id);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to generate thumbnail concepts');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateActiveText = async (key: string, value: any) => {
    if (!session || !activeConcept) return;
    const updatedTextLayer = { ...activeConcept.text_layer, [key]: value };

    // Optimistic UI update
    const updatedConcept = { ...activeConcept, text_layer: updatedTextLayer, manual_edit: true };
    setConcepts((prev) => prev.map((c) => (c.id === activeConcept.id ? updatedConcept : c)));

    try {
      const saved = await thumbnailLabService.updateConcept(session.id, activeConcept.id, {
        text_layer: { [key]: value },
      });
      setConcepts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update text');
    }
  };

  const handleUpdateActiveComposition = async (key: string, value: any) => {
    if (!session || !activeConcept) return;
    const updatedComp = { ...activeConcept.composition, [key]: value };

    // Optimistic UI update
    const updatedConcept = { ...activeConcept, composition: updatedComp, manual_edit: true };
    setConcepts((prev) => prev.map((c) => (c.id === activeConcept.id ? updatedConcept : c)));

    try {
      const saved = await thumbnailLabService.updateConcept(session.id, activeConcept.id, {
        composition: { [key]: value },
      });
      setConcepts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update composition');
    }
  };

  const handleToggleLock = async (concept: ThumbnailConcept, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) return;
    try {
      const saved = await thumbnailLabService.updateConcept(session.id, concept.id, {
        locked: !concept.locked,
      });
      setConcepts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to toggle lock');
    }
  };

  const handleToggleFavorite = async (concept: ThumbnailConcept, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) return;
    try {
      const saved = await thumbnailLabService.updateConcept(session.id, concept.id, {
        favorited: !concept.favorited,
      });
      setConcepts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to toggle favorite');
    }
  };

  const handleApprove = async (concept: ThumbnailConcept) => {
    if (!session) return;
    try {
      const res = await thumbnailLabService.approveConcept(session.id, concept.id);
      setSession(res.session);
      setConcepts((prev) => prev.map((c) => (c.id === res.concept.id ? res.concept : c)));
      setExportNotice(`Concept "${concept.title}" approved & saved to project assets!`);
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to approve concept');
    }
  };

  const handleHandoffPublish = async (concept: ThumbnailConcept) => {
    if (!session) return;
    try {
      const handoff = await thumbnailLabService.getPublishingHandoff(session.id, concept.id);
      if (onOpenPublishModal) {
        onOpenPublishModal(handoff);
      } else {
        setExportNotice(`Approved thumbnail linked to publishing composer for ${handoff.platform}.`);
        setTimeout(() => setExportNotice(null), 5000);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to link publishing handoff');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[480px] space-y-4">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Opening Vireo Thumbnail Lab & analyzing visual frames...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Top Studio Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
            <ImageIcon className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold font-display">Thumbnail Lab</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Phase 25 Studio
              </span>
              {capabilities?.image_provider_status === 'NOT_CONFIGURED' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Frame Compositor Mode (AI Gen Unconfigured)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate max-w-md">
              {clipTitle} • {session?.aspect_ratio} ({session?.target_platform})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
            <button
              onClick={() => setAspectRatio('16:9')}
              className={`px-2.5 py-1 rounded-md transition ${
                aspectRatio === '16:9' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              16:9 Landscape
            </button>
            <button
              onClick={() => setAspectRatio('9:16')}
              className={`px-2.5 py-1 rounded-md transition ${
                aspectRatio === '9:16' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              9:16 Shorts/Reels
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleGenerate()}
            disabled={isGenerating}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            Regenerate Unlocked
          </Button>

          {activeConcept && (
            <Button
              size="sm"
              variant="default"
              onClick={() => handleApprove(activeConcept)}
              className="text-xs bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow-sm"
            >
              <Check className="size-3.5" />
              Approve Asset
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorNotice && (
        <div className="bg-destructive/15 border-b border-destructive/30 text-destructive text-xs px-6 py-2 flex items-center justify-between animate-fadeIn">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5" /> {errorNotice}
          </span>
          <button
            onClick={() => setErrorNotice(null)}
            className="text-[11px] underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Export / Status Banner */}
      {exportNotice && (

        <div className="bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300 text-xs px-6 py-2 flex items-center justify-between animate-fadeIn">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-3.5" /> {exportNotice}
          </span>
          {activeConcept && (
            <button
              onClick={() => handleHandoffPublish(activeConcept)}
              className="underline font-semibold hover:text-white flex items-center gap-1 text-[11px]"
            >
              <Share2 className="size-3" /> Open in Publishing Composer
            </button>
          )}
        </div>
      )}

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: Creative Brief & Controls (3 cols) */}
        <div className="col-span-3 border-r border-border/70 bg-card/40 p-4 overflow-y-auto space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Creative Brief
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Source intelligence from clip & Brand Brain
            </p>
          </div>

          {/* Style Direction Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Style Direction</label>
            <select
              value={selectedStyle}
              onChange={(e) => setSelectedStyle(e.target.value as ThumbnailStyleDirection)}
              className="w-full text-xs rounded-lg border border-border/70 bg-background px-2.5 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="EXPRESSIVE_CREATOR_PORTRAIT">Expressive Creator Portrait</option>
              <option value="BOLD_TYPOGRAPHY">Bold High-Contrast Typography</option>
              <option value="CINEMATIC_STORYTELLING">Cinematic Storytelling</option>
              <option value="CLEAN_EDUCATIONAL">Clean Educational</option>
              <option value="PODCAST_EDITORIAL">Podcast Editorial</option>
              <option value="MINIMAL_PREMIUM">Minimal Premium</option>
              <option value="HIGH_CONTRAST_VISUAL">High-Contrast Visual</option>
              <option value="PRODUCT_SUBJECT_FOCUSED">Subject Focused</option>
            </select>
          </div>

          {/* User Creative Instruction */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Creative Instruction</label>
            <textarea
              rows={2}
              value={userInstruction}
              onChange={(e) => setUserInstruction(e.target.value)}
              placeholder="e.g. emphasize the word 'NEVER' in gold, increase contrast on creator face..."
              className="w-full text-xs rounded-lg border border-border/70 bg-background p-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          {/* Inspector Tabs (Text vs Composition vs Source Frames) */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs mb-3">
              <button
                onClick={() => setActiveTab('text')}
                className={`flex-1 py-1 rounded-md transition text-center ${
                  activeTab === 'text' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                Typography
              </button>
              <button
                onClick={() => setActiveTab('composition')}
                className={`flex-1 py-1 rounded-md transition text-center ${
                  activeTab === 'composition' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                Composition
              </button>
              <button
                onClick={() => setActiveTab('frames')}
                className={`flex-1 py-1 rounded-md transition text-center ${
                  activeTab === 'frames' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                Source Frames
              </button>
            </div>

            {/* TAB: TYPOGRAPHY CONTROLS */}
            {activeTab === 'text' && activeConcept && (
              <div className="space-y-3 animate-fadeIn">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Cover Headline</label>
                  <input
                    type="text"
                    value={activeConcept.text_layer.headline}
                    onChange={(e) => handleUpdateActiveText('headline', e.target.value)}
                    className="w-full text-xs rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Subheadline / Badge</label>
                  <input
                    type="text"
                    value={activeConcept.text_layer.badge_text || ''}
                    onChange={(e) => handleUpdateActiveText('badge_text', e.target.value)}
                    placeholder="e.g. MUST WATCH"
                    className="w-full text-xs rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Font</label>
                    <select
                      value={activeConcept.text_layer.font_family}
                      onChange={(e) => handleUpdateActiveText('font_family', e.target.value)}
                      className="w-full text-xs rounded-md border border-border/70 bg-background px-2 py-1"
                    >
                      {THUMBNAIL_LAB_LIMITS.APPROVED_FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Font Size ({activeConcept.text_layer.font_size}px)</label>
                    <input
                      type="range"
                      min={32}
                      max={96}
                      value={activeConcept.text_layer.font_size}
                      onChange={(e) => handleUpdateActiveText('font_size', parseInt(e.target.value, 10))}
                      className="w-full accent-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Text Color</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={activeConcept.text_layer.text_color}
                        onChange={(e) => handleUpdateActiveText('text_color', e.target.value)}
                        className="size-6 rounded border border-border cursor-pointer bg-transparent"
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {activeConcept.text_layer.text_color}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Highlight Color</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={activeConcept.text_layer.highlight_color || '#F59E0B'}
                        onChange={(e) => handleUpdateActiveText('highlight_color', e.target.value)}
                        className="size-6 rounded border border-border cursor-pointer bg-transparent"
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {activeConcept.text_layer.highlight_color || '#F59E0B'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">
                    Outline Stroke ({activeConcept.text_layer.stroke_width}px)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={activeConcept.text_layer.stroke_width}
                    onChange={(e) => handleUpdateActiveText('stroke_width', parseInt(e.target.value, 10))}
                    className="w-full accent-rose-500"
                  />
                </div>
              </div>
            )}

            {/* TAB: COMPOSITION CONTROLS */}
            {activeTab === 'composition' && activeConcept && (
              <div className="space-y-3 animate-fadeIn">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">
                    Focal Zoom ({activeConcept.composition.zoom_level.toFixed(2)}x)
                  </label>
                  <input
                    type="range"
                    min={1.0}
                    max={2.0}
                    step={0.05}
                    value={activeConcept.composition.zoom_level}
                    onChange={(e) => handleUpdateActiveComposition('zoom_level', parseFloat(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">
                    Contrast Boost ({activeConcept.composition.contrast.toFixed(2)}x)
                  </label>
                  <input
                    type="range"
                    min={0.8}
                    max={1.8}
                    step={0.05}
                    value={activeConcept.composition.contrast}
                    onChange={(e) => handleUpdateActiveComposition('contrast', parseFloat(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Overlay Gradient</label>
                  <select
                    value={activeConcept.composition.overlay_gradient || 'subtle_dark'}
                    onChange={(e) => handleUpdateActiveComposition('overlay_gradient', e.target.value)}
                    className="w-full text-xs rounded-md border border-border/70 bg-background px-2 py-1"
                  >
                    <option value="none">None (Clean Image)</option>
                    <option value="subtle_dark">Subtle Dark Base (Optimal Text Legibility)</option>
                    <option value="cinematic_vignette">Cinematic Vignette</option>
                    <option value="brand_tint">Brand Color Gradient</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB: SOURCE FRAMES */}
            {activeTab === 'frames' && (
              <div className="space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Source Clip Frames ({sourceFrames.length})
                  </span>
                  {isExtractingFrames && (
                    <span className="text-[10px] text-rose-400 animate-pulse">Extracting...</span>
                  )}
                </div>

                {sourceFrames.length === 0 ? (
                  <div className="p-4 text-center border border-dashed border-border rounded-lg text-xs text-muted-foreground">
                    No source frames available on disk.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {sourceFrames.map((frame) => (
                      <div
                        key={frame.id}
                        onClick={() => setSelectedFrameId(frame.id)}
                        className={`relative rounded-lg overflow-hidden border cursor-pointer transition ${
                          selectedFrameId === frame.id
                            ? 'border-rose-500 ring-2 ring-rose-500/30'
                            : 'border-border/60 hover:border-border'
                        }`}
                      >
                        <div className="aspect-[16/9] bg-neutral-900 flex items-center justify-center text-[10px] text-neutral-400">
                          <Film className="size-4 mr-1 opacity-50" />
                          <span>{frame.timestamp.toFixed(1)}s</span>
                        </div>
                        {selectedFrameId === frame.id && (
                          <div className="absolute top-1 right-1 size-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">
                            ✓
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL: Canvas Preview & Safe Area (6 cols) */}
        <div className="col-span-6 flex flex-col bg-neutral-950 p-6 overflow-auto items-center justify-center relative">
          {/* Canvas Zoom & Safe Area Toolbar */}
          <div className="absolute top-4 left-6 flex items-center gap-2 z-20 bg-background/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border/60 text-xs shadow-md">
            <button
              onClick={() => setSafeAreaOverlay(!safeAreaOverlay)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition ${
                safeAreaOverlay ? 'bg-rose-500/20 text-rose-300 font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Toggle YouTube / Short-form UI safe zone boundary"
            >
              <ShieldCheck className="size-3.5" /> Safe Area
            </button>
            <span className="text-border">|</span>
            <button
              onClick={() => setCanvasZoom((z) => Math.max(50, z - 10))}
              className="p-1 text-muted-foreground hover:text-foreground"
              title="Zoom out"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <span className="font-mono text-[11px] text-muted-foreground w-10 text-center">
              {canvasZoom}%
            </span>
            <button
              onClick={() => setCanvasZoom((z) => Math.min(150, z + 10))}
              className="p-1 text-muted-foreground hover:text-foreground"
              title="Zoom in"
            >
              <ZoomIn className="size-3.5" />
            </button>
          </div>

          {/* Canvas Area */}
          {activeConcept ? (
            <div
              style={{
                transform: `scale(${canvasZoom / 100})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
              className="relative shadow-2xl rounded-xl overflow-hidden border border-neutral-800"
            >
              {/* Aspect Ratio Box */}
              <div
                className={`relative overflow-hidden bg-neutral-900 select-none ${
                  aspectRatio === '16:9' ? 'w-[640px] h-[360px]' : 'w-[280px] h-[497px]'
                }`}
              >
                {/* Background Layer (Simulated high-contrast frame) */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform"
                  style={{
                    backgroundColor: '#1E1B4B',
                    backgroundImage: `radial-gradient(circle at 70% 40%, rgba(244, 63, 94, 0.35), transparent 60%), radial-gradient(circle at 20% 80%, rgba(79, 70, 229, 0.4), transparent 60%)`,
                    transform: `scale(${activeConcept.composition.zoom_level})`,
                    filter: `contrast(${activeConcept.composition.contrast}) brightness(${activeConcept.composition.brightness}) saturate(${activeConcept.composition.saturation})`,
                  }}
                />

                {/* Overlay Gradient for readability */}
                {activeConcept.composition.overlay_gradient === 'subtle_dark' && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
                )}
                {activeConcept.composition.overlay_gradient === 'cinematic_vignette' && (
                  <div className="absolute inset-0 bg-radial from-transparent to-black/85 pointer-events-none" />
                )}
                {activeConcept.composition.overlay_gradient === 'brand_tint' && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-rose-950/70 via-transparent to-indigo-950/50 pointer-events-none" />
                )}

                {/* Safe Area Overlay Lines */}
                {safeAreaOverlay && (
                  <div className="absolute inset-0 pointer-events-none border border-rose-500/30 m-4 rounded-lg">
                    {/* Duration badge safe zone marker in 16:9 */}
                    {aspectRatio === '16:9' && (
                      <div className="absolute bottom-2 right-2 bg-neutral-900/80 border border-neutral-700 text-[10px] text-neutral-400 font-mono px-2 py-0.5 rounded">
                        03:45 (UI Badge Area)
                      </div>
                    )}
                    {/* Mobile interaction icons marker in 9:16 */}
                    {aspectRatio === '9:16' && (
                      <div className="absolute right-2 bottom-12 flex flex-col items-center gap-3 text-neutral-500 text-[9px]">
                        <span className="size-6 rounded-full border border-neutral-700 flex items-center justify-center">♥</span>
                        <span className="size-6 rounded-full border border-neutral-700 flex items-center justify-center">💬</span>
                        <span className="size-6 rounded-full border border-neutral-700 flex items-center justify-center">↗</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Typography Layer */}
                <div
                  className="absolute p-6 flex flex-col justify-end pointer-events-none"
                  style={{
                    left: `${activeConcept.text_layer.position_x * 100}%`,
                    top: `${activeConcept.text_layer.position_y * 100}%`,
                    maxWidth: '85%',
                  }}
                >
                  {/* Badge Text */}
                  {activeConcept.text_layer.badge_text && (
                    <span
                      className="self-start text-[11px] font-bold px-2 py-0.5 rounded mb-1 text-white shadow-md uppercase tracking-wider"
                      style={{
                        backgroundColor: activeConcept.text_layer.badge_color || '#E11D48',
                        fontFamily: activeConcept.text_layer.font_family,
                      }}
                    >
                      {activeConcept.text_layer.badge_text}
                    </span>
                  )}

                  {/* Headline Copy */}
                  <h1
                    className="font-extrabold leading-[1.05] tracking-tight uppercase"
                    style={{
                      fontFamily: activeConcept.text_layer.font_family,
                      fontSize: `${Math.round(activeConcept.text_layer.font_size * (aspectRatio === '16:9' ? 0.6 : 0.45))}px`,
                      color: activeConcept.text_layer.text_color,
                      WebkitTextStroke: `${activeConcept.text_layer.stroke_width}px ${activeConcept.text_layer.stroke_color}`,
                      textShadow: `0px ${activeConcept.text_layer.shadow_offset_y}px ${activeConcept.text_layer.shadow_blur}px ${activeConcept.text_layer.shadow_color}`,
                    }}
                  >
                    {activeConcept.text_layer.headline}
                  </h1>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground text-xs">
              No concept selected.
            </div>
          )}

          {/* Size Realistic Mobile Preview Bar */}
          <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="font-mono text-[11px]">Realistic Feed Viewports:</span>
            <div className="flex items-center gap-3">
              <span className="hover:text-foreground cursor-pointer underline">YouTube Mobile (120px)</span>
              <span className="hover:text-foreground cursor-pointer underline">Desktop Card (320px)</span>
              <span className="hover:text-foreground cursor-pointer underline">Instagram Grid (1:1)</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Variations & Diagnostics (3 cols) */}
        <div className="col-span-3 border-l border-border/70 bg-card/40 p-4 overflow-y-auto space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Concepts & Score
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Explainable visual diagnostics (0–100)
            </p>
          </div>

          {/* Active Concept Diagnostics Card */}
          {activeConcept && (
            <div className="p-3.5 rounded-xl border border-border/70 bg-background/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-medium text-muted-foreground block">Quality Score</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black font-display text-rose-400">
                      {activeConcept.diagnostics.overall_score}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">/100</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => handleToggleFavorite(activeConcept, e)}
                    className={`p-1.5 rounded-lg border transition ${
                      activeConcept.favorited
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                    title="Favorite concept"
                  >
                    <Heart className={`size-3.5 ${activeConcept.favorited ? 'fill-rose-400' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => handleToggleLock(activeConcept, e)}
                    className={`p-1.5 rounded-lg border transition ${
                      activeConcept.locked
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                    title="Lock concept against regeneration"
                  >
                    {activeConcept.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </button>
                </div>
              </div>

              {/* 6-Factor Visual Diagnostic Meters */}
              <div className="space-y-1.5 pt-1 border-t border-border/50 text-[11px]">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Readability (25%)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {activeConcept.diagnostics.score_breakdown.readability}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Contrast (20%)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {activeConcept.diagnostics.score_breakdown.contrast}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Safe Areas (15%)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {activeConcept.diagnostics.score_breakdown.composition}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Subject Visibility (15%)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {activeConcept.diagnostics.score_breakdown.subject_visibility}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Brand Fit (15%)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {activeConcept.diagnostics.score_breakdown.brand_fit}
                  </span>
                </div>
              </div>

              {/* Diagnostic Notes & Strengths */}
              <div className="pt-2 border-t border-border/50 space-y-1">
                {activeConcept.diagnostics.positives.map((pos, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-emerald-400 leading-snug">
                    <Check className="size-3 shrink-0 mt-0.5" />
                    <span>{pos}</span>
                  </div>
                ))}
                {activeConcept.diagnostics.warnings.map((warn, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-400 leading-snug">
                    <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Concepts List Grid */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Generated Variations ({concepts.length})
            </h4>

            <div className="space-y-2">
              {concepts.map((concept) => (
                <div
                  key={concept.id}
                  onClick={() => setActiveConceptId(concept.id)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    activeConceptId === concept.id
                      ? 'border-rose-500/70 bg-rose-500/5 ring-1 ring-rose-500/40'
                      : 'border-border/60 bg-background/50 hover:bg-background'
                  }`}
                >
                  <div className="space-y-0.5 truncate max-w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate">
                        {concept.text_layer.headline}
                      </span>
                      {concept.locked && <Lock className="size-2.5 text-amber-400 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate block">
                      {concept.style_direction.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                      {concept.diagnostics.overall_score}
                    </span>
                    {concept.approved && (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Camera,
  Shield,
  Layers,
  RotateCw,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackItem,
  EditorKeyframe,
} from '../../types';

interface EditorCanvasProps {
  project: EditorProject;
  playhead: number;
  isPlaying: boolean;
  videoSrc: string | null;
  onPlayheadChange: (time: number) => void;
  onTogglePlay: () => void;
  selectedItemId: string | null;
  onUpdateItemTransform: (itemId: string, transform: any) => void;
  previewQuality: 'auto' | '360p' | '540p' | '720p';
  onChangePreviewQuality: (q: 'auto' | '360p' | '540p' | '720p') => void;
  onTakeSnapshot?: () => void;
}

// Easing interpolation helper
function evaluateEasing(t: number, easing: string): number {
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return t * (2 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'linear':
    default:
      return t;
  }
}

// Calculate interpolated value from keyframes
function interpolateKeyframes(
  keyframes: EditorKeyframe[],
  property: string,
  itemRelativeTime: number,
  defaultValue: number
): number {
  const propertyKeyframes = keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);

  if (propertyKeyframes.length === 0) return defaultValue;
  if (propertyKeyframes.length === 1 || itemRelativeTime <= propertyKeyframes[0].time) {
    return propertyKeyframes[0].value;
  }
  const lastKf = propertyKeyframes[propertyKeyframes.length - 1];
  if (itemRelativeTime >= lastKf.time) {
    return lastKf.value;
  }

  for (let i = 0; i < propertyKeyframes.length - 1; i++) {
    const kf0 = propertyKeyframes[i];
    const kf1 = propertyKeyframes[i + 1];
    if (itemRelativeTime >= kf0.time && itemRelativeTime <= kf1.time) {
      const dt = kf1.time - kf0.time;
      if (dt <= 0) return kf0.value;
      const progress = (itemRelativeTime - kf0.time) / dt;
      const factor = evaluateEasing(progress, kf1.easing);
      return kf0.value + (kf1.value - kf0.value) * factor;
    }
  }

  return defaultValue;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  project,
  playhead,
  isPlaying,
  videoSrc,
  onPlayheadChange,
  onTogglePlay,
  selectedItemId,
  onUpdateItemTransform,
  previewQuality,
  onChangePreviewQuality,
  onTakeSnapshot,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [showSafeGuides, setShowSafeGuides] = useState<boolean>(true);

  // Transform manipulation drag state
  const [isTransformDragging, setIsTransformDragging] = useState<boolean>(false);
  const [transformDragMode, setTransformDragMode] = useState<'move' | 'scale' | 'rotate' | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialTransform, setInitialTransform] = useState<{
    position_x: number;
    position_y: number;
    scale: number;
    rotation: number;
  } | null>(null);

  // Synchronize HTML video time with playhead
  useEffect(() => {
    if (videoRef.current) {
      // Seek if difference is significant to prevent stutter during play
      if (Math.abs(videoRef.current.currentTime - playhead) > 0.15) {
        videoRef.current.currentTime = playhead;
      }
    }
  }, [playhead]);

  // Synchronize playing state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Aspect ratio aspect class / dimensions
  const getAspectRatioDimensions = () => {
    switch (project.canvas.aspect_ratio) {
      case '9:16':
        return { width: '360px', height: '640px', ratio: '9/16' };
      case '1:1':
        return { width: '480px', height: '480px', ratio: '1/1' };
      case '4:5':
        return { width: '384px', height: '480px', ratio: '4/5' };
      case '16:9':
      default:
        return { width: '640px', height: '360px', ratio: '16/9' };
    }
  };

  // Find active items at current playhead
  const activeVideoItems: EditorTrackItem[] = [];
  const activeTextItems: EditorTrackItem[] = [];
  const activeCaptionItems: EditorTrackItem[] = [];

  for (const track of project.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (playhead >= item.timeline_start && playhead <= item.timeline_end) {
        if (track.type === 'VIDEO') activeVideoItems.push(item);
        else if (track.type === 'TEXT') activeTextItems.push(item);
        else if (track.type === 'CAPTION') activeCaptionItems.push(item);
      }
    }
  }

  // Selected item reference
  const selectedItem = project.tracks
    .flatMap((t) => t.items)
    .find((i) => i.id === selectedItemId);

  // Calculate CSS filters for color adjustments and effects
  const getComputedCSSFilters = (item: EditorTrackItem): string => {
    const filters: string[] = [];

    // Color adjustments
    if (item.color) {
      if (item.color.brightness !== 0) {
        filters.push(`brightness(${1 + item.color.brightness})`);
      }
      if (item.color.contrast !== 0) {
        filters.push(`contrast(${1 + item.color.contrast})`);
      }
      if (item.color.saturation !== 0) {
        filters.push(`saturate(${1 + item.color.saturation})`);
      }
      if (item.color.exposure !== 0) {
        filters.push(`brightness(${1 + item.color.exposure * 0.8})`);
      }
      if (item.color.temperature !== 0) {
        filters.push(`sepia(${Math.abs(item.color.temperature) * 0.3})`);
      }
    }

    // Filter presets
    if (item.filter && item.filter.preset !== 'none') {
      switch (item.filter.preset) {
        case 'warm':
          filters.push(`sepia(0.25) saturate(1.2)`);
          break;
        case 'cool':
          filters.push(`hue-rotate(180deg) saturate(0.9)`);
          break;
        case 'film':
          filters.push(`contrast(1.15) saturate(0.85) brightness(0.95)`);
          break;
        case 'mono':
          filters.push(`grayscale(1) contrast(1.2)`);
          break;
        case 'punch':
          filters.push(`contrast(1.3) saturate(1.4)`);
          break;
        case 'soft':
          filters.push(`contrast(0.9) brightness(1.05)`);
          break;
      }
    }

    // Effects
    if (item.effects) {
      for (const fx of item.effects) {
        if (fx.type === 'blur') {
          filters.push(`blur(${fx.intensity * 8}px)`);
        }
      }
    }

    return filters.join(' ');
  };

  // Direct transform manipulation listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isTransformDragging || !dragStartPos || !initialTransform || !selectedItem) return;

      const deltaX = e.clientX - dragStartPos.x;
      const deltaY = e.clientY - dragStartPos.y;

      if (transformDragMode === 'move') {
        onUpdateItemTransform(selectedItem.id, {
          ...selectedItem.transform,
          position_x: initialTransform.position_x + deltaX,
          position_y: initialTransform.position_y + deltaY,
        });
      } else if (transformDragMode === 'scale') {
        const scaleFactor = 1 + deltaX / 200;
        const newScale = Math.max(0.1, Math.min(5.0, initialTransform.scale * scaleFactor));
        onUpdateItemTransform(selectedItem.id, {
          ...selectedItem.transform,
          scale: Math.round(newScale * 100) / 100,
        });
      } else if (transformDragMode === 'rotate') {
        const newRot = (initialTransform.rotation + deltaX) % 360;
        onUpdateItemTransform(selectedItem.id, {
          ...selectedItem.transform,
          rotation: Math.round(newRot),
        });
      }
    };

    const handleMouseUp = () => {
      setIsTransformDragging(false);
      setTransformDragMode(null);
      setDragStartPos(null);
      setInitialTransform(null);
    };

    if (isTransformDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTransformDragging, dragStartPos, initialTransform, transformDragMode, selectedItem, onUpdateItemTransform]);

  const dims = getAspectRatioDimensions();

  // Find active cue for captions
  const getActiveCaptionCue = (item: EditorTrackItem) => {
    if (!item.caption || !item.caption.cues) return null;
    return item.caption.cues.find(
      (c) => playhead >= c.start && playhead <= c.end
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 items-center justify-between p-3 overflow-hidden select-none">
      {/* CANVAS PREVIEW HEADER BAR */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white tracking-wide">Preview Canvas</span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-[10px] font-mono text-orange-400">
            {project.canvas.aspect_ratio} ({project.canvas.width}×{project.canvas.height})
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Safe Guides Toggle */}
          <button
            type="button"
            onClick={() => setShowSafeGuides((s) => !s)}
            title="Toggle Safe Area Guides (TikTok/Reels/Shorts UI Zones)"
            className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition ${
              showSafeGuides
                ? 'bg-orange-950/60 text-orange-300 border border-orange-700/50'
                : 'bg-neutral-850 text-neutral-400 hover:text-white'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>Safe Guides</span>
          </button>

          {/* Proxy Quality Selector */}
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5 text-[11px]">
            <span className="text-neutral-500 text-[10px]">Quality:</span>
            <select
              value={previewQuality}
              onChange={(e) => onChangePreviewQuality(e.target.value as any)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="auto">Auto Proxy</option>
              <option value="360p">360p (Fast)</option>
              <option value="540p">540p</option>
              <option value="720p">720p (HD)</option>
            </select>
          </div>
        </div>
      </div>

      {/* CANVAS STAGE (CENTERED) */}
      <div
        ref={canvasContainerRef}
        className="flex-1 w-full flex items-center justify-center p-2 relative overflow-hidden"
      >
        <div
          style={{
            width: dims.width,
            height: dims.height,
            backgroundColor: project.canvas.background_color || '#000000',
          }}
          className="relative rounded-lg shadow-2xl overflow-hidden border border-neutral-800 flex items-center justify-center"
        >
          {/* VIDEO LAYER */}
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{
                filter: activeVideoItems[0] ? getComputedCSSFilters(activeVideoItems[0]) : undefined,
                transform: activeVideoItems[0]
                  ? `translate(${
                      interpolateKeyframes(
                        activeVideoItems[0].keyframes,
                        'position_x',
                        playhead - activeVideoItems[0].timeline_start,
                        activeVideoItems[0].transform?.position_x || 0
                      )
                    }px, ${
                      interpolateKeyframes(
                        activeVideoItems[0].keyframes,
                        'position_y',
                        playhead - activeVideoItems[0].timeline_start,
                        activeVideoItems[0].transform?.position_y || 0
                      )
                    }px) scale(${
                      interpolateKeyframes(
                        activeVideoItems[0].keyframes,
                        'scale',
                        playhead - activeVideoItems[0].timeline_start,
                        activeVideoItems[0].transform?.scale || 1
                      )
                    }) rotate(${
                      interpolateKeyframes(
                        activeVideoItems[0].keyframes,
                        'rotation',
                        playhead - activeVideoItems[0].timeline_start,
                        activeVideoItems[0].transform?.rotation || 0
                      )
                    }deg)`
                  : undefined,
                opacity: activeVideoItems[0]
                  ? interpolateKeyframes(
                      activeVideoItems[0].keyframes,
                      'opacity',
                      playhead - activeVideoItems[0].timeline_start,
                      activeVideoItems[0].transform?.opacity ?? 1
                    )
                  : 1,
              }}
            />
          ) : (
            <div className="text-center p-4 text-neutral-500 text-xs">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <span>No Video Source Loaded</span>
            </div>
          )}

          {/* TEXT LAYERS OVERLAY */}
          {activeTextItems.map((item) => {
            if (!item.text) return null;
            const t = item.text;
            return (
              <div
                key={item.id}
                style={{
                  fontFamily: t.font_family || 'Inter',
                  fontSize: `${t.font_size || 36}px`,
                  fontWeight: t.font_weight === 'bold' ? 700 : t.font_weight === 'black' ? 900 : 500,
                  color: t.color || '#FFFFFF',
                  textAlign: t.alignment || 'center',
                  fontStyle: t.italic ? 'italic' : 'normal',
                  transform: `translate(${item.transform?.position_x || 0}px, ${
                    item.transform?.position_y || 0
                  }px) scale(${item.transform?.scale || 1}) rotate(${
                    item.transform?.rotation || 0
                  }deg)`,
                  opacity: item.transform?.opacity ?? 1,
                  textShadow: t.shadow_color ? `0 2px ${t.shadow_blur || 4}px ${t.shadow_color}` : undefined,
                  WebkitTextStroke: t.stroke_width ? `${t.stroke_width}px ${t.stroke_color || '#000'}` : undefined,
                  backgroundColor: t.background_color || 'transparent',
                  padding: t.background_padding ? `${t.background_padding}px` : undefined,
                  borderRadius: t.background_corner_radius ? `${t.background_corner_radius}px` : undefined,
                }}
                className="absolute pointer-events-none select-none max-w-[85%] leading-tight"
              >
                {t.text}
              </div>
            );
          })}

          {/* KINETIC CAPTIONS OVERLAY */}
          {activeCaptionItems.map((item) => {
            const cue = getActiveCaptionCue(item);
            if (!cue) return null;

            return (
              <div
                key={item.id}
                className="absolute bottom-16 left-4 right-4 text-center pointer-events-none select-none"
              >
                <div className="inline-block bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 shadow-xl max-w-full">
                  <span className="font-extrabold text-lg text-white tracking-wide uppercase drop-shadow-md">
                    {cue.words && cue.words.length > 0 ? (
                      cue.words.map((w, wIdx) => {
                        const isWordActive = playhead >= w.start && playhead <= w.end;
                        return (
                          <span
                            key={wIdx}
                            style={{
                              color: isWordActive
                                ? item.caption?.highlight_color || '#FF6B35'
                                : item.caption?.primary_color || '#FFFFFF',
                              transform: isWordActive ? 'scale(1.1)' : 'scale(1)',
                              display: 'inline-block',
                              transition: 'all 0.1s ease',
                              marginRight: '0.25rem',
                            }}
                          >
                            {w.text}
                          </span>
                        );
                      })
                    ) : (
                      cue.text
                    )}
                  </span>
                </div>
              </div>
            );
          })}

          {/* SAFE AREA GUIDES OVERLAY */}
          {showSafeGuides && (
            <div className="absolute inset-0 pointer-events-none border border-orange-500/30">
              {/* Top Safe Area Margin (TikTok handle/search bar) */}
              <div className="absolute top-0 left-0 right-0 h-12 bg-orange-500/10 border-b border-orange-500/20 flex items-center justify-center text-[9px] font-mono text-orange-400 uppercase tracking-widest">
                Platform Header Safe Zone
              </div>

              {/* Bottom Safe Area Margin (TikTok sound/caption area) */}
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-orange-500/10 border-t border-orange-500/20 flex items-center justify-center text-[9px] font-mono text-orange-400 uppercase tracking-widest">
                Platform Action Buttons Zone
              </div>

              {/* Right Margin (Like, comment, share buttons) */}
              <div className="absolute top-12 bottom-20 right-0 w-12 bg-orange-500/10 border-l border-orange-500/20" />
            </div>
          )}

          {/* DIRECT MANIPULATION TRANSFORM BOUNDING BOX */}
          {selectedItem && (
            <div
              style={{
                transform: `translate(${selectedItem.transform?.position_x || 0}px, ${
                  selectedItem.transform?.position_y || 0
                }px) scale(${selectedItem.transform?.scale || 1}) rotate(${
                  selectedItem.transform?.rotation || 0
                }deg)`,
              }}
              className="absolute w-48 h-48 border-2 border-orange-500 rounded-lg pointer-events-auto cursor-move flex items-center justify-center"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsTransformDragging(true);
                setTransformDragMode('move');
                setDragStartPos({ x: e.clientX, y: e.clientY });
                setInitialTransform({
                  position_x: selectedItem.transform?.position_x || 0,
                  position_y: selectedItem.transform?.position_y || 0,
                  scale: selectedItem.transform?.scale || 1,
                  rotation: selectedItem.transform?.rotation || 0,
                });
              }}
            >
              {/* Corner Scale Handle */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsTransformDragging(true);
                  setTransformDragMode('scale');
                  setDragStartPos({ x: e.clientX, y: e.clientY });
                  setInitialTransform({
                    position_x: selectedItem.transform?.position_x || 0,
                    position_y: selectedItem.transform?.position_y || 0,
                    scale: selectedItem.transform?.scale || 1,
                    rotation: selectedItem.transform?.rotation || 0,
                  });
                }}
                className="absolute -bottom-2 -right-2 w-4 h-4 bg-orange-500 border-2 border-white rounded cursor-se-resize shadow"
                title="Drag to Scale"
              />

              {/* Top Rotation Handle */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsTransformDragging(true);
                  setTransformDragMode('rotate');
                  setDragStartPos({ x: e.clientX, y: e.clientY });
                  setInitialTransform({
                    position_x: selectedItem.transform?.position_x || 0,
                    position_y: selectedItem.transform?.position_y || 0,
                    scale: selectedItem.transform?.scale || 1,
                    rotation: selectedItem.transform?.rotation || 0,
                  });
                }}
                className="absolute -top-6 left-1/2 -translate-x-1/2 w-4 h-4 bg-orange-500 border border-white rounded-full flex items-center justify-center cursor-grab shadow"
                title="Drag to Rotate"
              >
                <RotateCw className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CANVAS TRANSPORT & TIMECODE BAR */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 bg-neutral-900/60 rounded-lg border border-neutral-800 text-xs text-neutral-300">
        <div className="flex items-center gap-1.5">
          {/* Frame Step Back */}
          <button
            type="button"
            onClick={() => onPlayheadChange(Math.max(0, playhead - 1 / 30))}
            title="Step Back 1 Frame"
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          {/* Play / Pause */}
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-1.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-medium flex items-center justify-center transition"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          {/* Frame Step Forward */}
          <button
            type="button"
            onClick={() => onPlayheadChange(Math.min(project.canvas.duration || 60, playhead + 1 / 30))}
            title="Step Forward 1 Frame"
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Timecode */}
        <div className="font-mono text-xs">
          <span className="text-white font-bold">{playhead.toFixed(2)}s</span>
          <span className="text-neutral-500 mx-1">/</span>
          <span className="text-neutral-400">{(project.canvas.duration || 10).toFixed(2)}s</span>
        </div>

        {/* Snapshot & Fullscreen */}
        <div className="flex items-center gap-1.5">
          {onTakeSnapshot && (
            <button
              type="button"
              onClick={onTakeSnapshot}
              title="Snapshot Frame as Image"
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            >
              <Camera className="w-3.5 h-3.5 text-teal-400" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (canvasContainerRef.current) {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                } else {
                  canvasContainerRef.current.requestFullscreen().catch(() => {});
                }
              }
            }}
            title="Fullscreen Preview"
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

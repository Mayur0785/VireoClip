import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Scissors,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Snowflake,
  Camera,
  Layers,
  Music,
  Video,
  Type as TypeIcon,
  Subtitles,
  Image as ImageIcon,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackType,
} from '../../types';

interface TimelineProps {
  project: EditorProject;
  playhead: number;
  isPlaying: boolean;
  onPlayheadChange: (time: number) => void;
  onTogglePlay: () => void;
  onUpdateProject: (updated: EditorProject) => void;
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null, trackId: string | null) => void;
  onSplit: () => void;
  onRippleDelete: () => void;
  onDuplicate: () => void;
  onFreezeFrame?: () => void;
  onSnapshot?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  project,
  playhead,
  isPlaying,
  onPlayheadChange,
  onTogglePlay,
  onUpdateProject,
  selectedItemId,
  onSelectItem,
  onSplit,
  onRippleDelete,
  onDuplicate,
  onFreezeFrame,
  onSnapshot,
}) => {
  // Zoom: pixels per second (min 20px, max 240px)
  const [pixelsPerSec, setPixelsPerSec] = useState<number>(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  // Dragging state for trimming or moving
  const [dragState, setDragState] = useState<{
    type: 'move' | 'trim-left' | 'trim-right';
    trackId: string;
    itemId: string;
    initialMouseX: number;
    initialStart: number;
    initialEnd: number;
    initialSourceStart: number;
    initialSourceEnd: number;
  } | null>(null);

  // Snapping indicator line position (in pixels)
  const [snapIndicatorX, setSnapIndicatorX] = useState<number | null>(null);

  const duration = Math.max(project.canvas.duration || 10, 10);
  const timelineWidth = Math.max(duration * pixelsPerSec, 800);

  // Calculate snap points (playhead, clip starts, clip ends)
  const getSnapPoints = useCallback(
    (excludeItemId?: string) => {
      const points = [0, playhead];
      for (const track of project.tracks) {
        for (const item of track.items) {
          if (item.id !== excludeItemId) {
            points.push(item.timeline_start);
            points.push(item.timeline_end);
          }
        }
      }
      return Array.from(new Set(points)).sort((a, b) => a - b);
    },
    [project.tracks, playhead]
  );

  // Apply snapping if within tolerance (e.g., 0.15s)
  const snapTime = useCallback(
    (targetTime: number, excludeItemId?: string): { time: number; snapped: boolean } => {
      if (!project.settings?.snapping) return { time: targetTime, snapped: false };
      const tolerance = project.settings?.snap_tolerance_sec || 0.15;
      const points = getSnapPoints(excludeItemId);
      for (const pt of points) {
        if (Math.abs(pt - targetTime) <= tolerance) {
          return { time: pt, snapped: true };
        }
      }
      return { time: targetTime, snapped: false };
    },
    [project.settings, getSnapPoints]
  );

  // Mouse move handler for dragging / trimming
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.initialMouseX;
      const deltaTime = deltaX / pixelsPerSec;

      const targetTrack = project.tracks.find((t) => t.id === dragState.trackId);
      if (!targetTrack || targetTrack.locked) return;

      const itemIndex = targetTrack.items.findIndex((i) => i.id === dragState.itemId);
      if (itemIndex === -1) return;

      const item = targetTrack.items[itemIndex];
      const newTracks = [...project.tracks];
      const updatedTrack = { ...targetTrack, items: [...targetTrack.items] };

      if (dragState.type === 'move') {
        const itemDuration = dragState.initialEnd - dragState.initialStart;
        let newStart = Math.max(0, dragState.initialStart + deltaTime);
        const snapRes = snapTime(newStart, item.id);
        if (snapRes.snapped) {
          newStart = snapRes.time;
          setSnapIndicatorX(newStart * pixelsPerSec);
        } else {
          setSnapIndicatorX(null);
        }
        const newEnd = newStart + itemDuration;

        updatedTrack.items[itemIndex] = {
          ...item,
          timeline_start: Math.round(newStart * 1000) / 1000,
          timeline_end: Math.round(newEnd * 1000) / 1000,
        };
      } else if (dragState.type === 'trim-left') {
        let proposedStart = dragState.initialStart + deltaTime;
        proposedStart = Math.max(0, Math.min(proposedStart, item.timeline_end - 0.2));
        const snapRes = snapTime(proposedStart, item.id);
        if (snapRes.snapped) {
          proposedStart = snapRes.time;
          setSnapIndicatorX(proposedStart * pixelsPerSec);
        } else {
          setSnapIndicatorX(null);
        }

        const deltaSource = proposedStart - dragState.initialStart;
        const newSourceStart = Math.max(0, dragState.initialSourceStart + deltaSource);

        updatedTrack.items[itemIndex] = {
          ...item,
          timeline_start: Math.round(proposedStart * 1000) / 1000,
          source_start: Math.round(newSourceStart * 1000) / 1000,
        };
      } else if (dragState.type === 'trim-right') {
        let proposedEnd = dragState.initialEnd + deltaTime;
        proposedEnd = Math.max(item.timeline_start + 0.2, proposedEnd);
        const snapRes = snapTime(proposedEnd, item.id);
        if (snapRes.snapped) {
          proposedEnd = snapRes.time;
          setSnapIndicatorX(proposedEnd * pixelsPerSec);
        } else {
          setSnapIndicatorX(null);
        }

        const deltaSource = proposedEnd - dragState.initialEnd;
        const newSourceEnd = Math.max(item.source_start + 0.2, dragState.initialSourceEnd + deltaSource);

        updatedTrack.items[itemIndex] = {
          ...item,
          timeline_end: Math.round(proposedEnd * 1000) / 1000,
          source_end: Math.round(newSourceEnd * 1000) / 1000,
        };
      }

      const trackIdx = newTracks.findIndex((t) => t.id === targetTrack.id);
      newTracks[trackIdx] = updatedTrack;
      onUpdateProject({ ...project, tracks: newTracks });
    };

    const handleMouseUp = () => {
      setDragState(null);
      setSnapIndicatorX(null);
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, pixelsPerSec, project, snapTime, onUpdateProject]);

  // Handle Playhead Scrubbing on Ruler
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + (tracksScrollRef.current?.scrollLeft || 0);
    const newTime = Math.max(0, Math.min(duration, clickX / pixelsPerSec));
    onPlayheadChange(Math.round(newTime * 100) / 100);
  };

  // Toggle track properties (lock, mute, hide)
  const toggleTrackProperty = (trackId: string, prop: 'locked' | 'muted' | 'hidden') => {
    const updated = project.tracks.map((t) =>
      t.id === trackId ? { ...t, [prop]: !t[prop] } : t
    );
    onUpdateProject({ ...project, tracks: updated });
  };

  // Track Type Icons and Styles
  const getTrackIcon = (type: EditorTrackType) => {
    switch (type) {
      case 'VIDEO':
        return <Video className="w-3.5 h-3.5 text-blue-400" />;
      case 'AUDIO':
        return <Music className="w-3.5 h-3.5 text-emerald-400" />;
      case 'TEXT':
        return <TypeIcon className="w-3.5 h-3.5 text-purple-400" />;
      case 'CAPTION':
        return <Subtitles className="w-3.5 h-3.5 text-amber-400" />;
      case 'IMAGE':
      case 'OVERLAY':
        return <ImageIcon className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const getItemColor = (type: EditorTrackType, isSelected: boolean) => {
    if (isSelected) return 'bg-orange-600/90 border-orange-400 ring-2 ring-orange-500/50';
    switch (type) {
      case 'VIDEO':
        return 'bg-blue-900/60 border-blue-500/70 hover:bg-blue-800/70';
      case 'AUDIO':
        return 'bg-emerald-900/60 border-emerald-500/70 hover:bg-emerald-800/70';
      case 'TEXT':
        return 'bg-purple-900/60 border-purple-500/70 hover:bg-purple-800/70';
      case 'CAPTION':
        return 'bg-amber-900/60 border-amber-500/70 hover:bg-amber-800/70';
      case 'IMAGE':
      case 'OVERLAY':
        return 'bg-rose-900/60 border-rose-500/70 hover:bg-rose-800/70';
      default:
        return 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700';
    }
  };

  // Generate ruler marks based on current zoom
  const renderRulerTicks = () => {
    const ticks = [];
    const step = pixelsPerSec >= 120 ? 1 : pixelsPerSec >= 60 ? 2 : 5;
    for (let sec = 0; sec <= duration; sec += step) {
      const left = sec * pixelsPerSec;
      const mins = Math.floor(sec / 60);
      const secs = Math.floor(sec % 60);
      const label = `${mins}:${secs.toString().padStart(2, '0')}`;
      ticks.push(
        <div
          key={sec}
          className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-neutral-700/60 pl-1 text-[9px] font-mono text-neutral-400 select-none pointer-events-none"
          style={{ left: `${left}px` }}
        >
          <span>{label}</span>
          <div className="w-px h-1.5 bg-neutral-600" />
        </div>
      );
    }
    return ticks;
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-neutral-950 border-t border-neutral-800 select-none overflow-hidden h-72 md:h-80"
    >
      {/* TIMELINE TOOLBAR */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900/90 border-b border-neutral-800 text-xs">
        {/* Left: Playback & Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition flex items-center gap-1"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Split button */}
          <button
            type="button"
            onClick={onSplit}
            disabled={!selectedItemId}
            title="Split Clip at Playhead (S)"
            className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Scissors className="w-3.5 h-3.5 text-orange-400" />
            <span>Split (S)</span>
          </button>

          {/* Ripple Delete button */}
          <button
            type="button"
            onClick={onRippleDelete}
            disabled={!selectedItemId}
            title="Ripple Delete Clip"
            className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Ripple Delete</span>
          </button>

          {/* Duplicate button */}
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!selectedItemId}
            title="Duplicate Selected Clip"
            className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            <span>Duplicate</span>
          </button>

          {/* Freeze Frame */}
          {onFreezeFrame && (
            <button
              type="button"
              onClick={onFreezeFrame}
              disabled={!selectedItemId}
              title="Freeze Frame at Playhead"
              className="px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 text-xs font-medium flex items-center gap-1 transition"
            >
              <Snowflake className="w-3.5 h-3.5 text-sky-400" />
              <span>Freeze</span>
            </button>
          )}

          {/* Snapshot */}
          {onSnapshot && (
            <button
              type="button"
              onClick={onSnapshot}
              disabled={!selectedItemId}
              title="Export Current Frame as Image"
              className="px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 text-xs font-medium flex items-center gap-1 transition"
            >
              <Camera className="w-3.5 h-3.5 text-teal-400" />
              <span>Snapshot</span>
            </button>
          )}
        </div>

        {/* Right: Timecode & Zoom Controls */}
        <div className="flex items-center gap-3">
          <div className="font-mono text-xs text-neutral-300 bg-neutral-950 px-2.5 py-0.5 rounded border border-neutral-800">
            <span className="text-orange-400 font-bold">
              {Math.floor(playhead / 60)}:{(playhead % 60).toFixed(2).padStart(5, '0')}
            </span>
            <span className="text-neutral-500 mx-1">/</span>
            <span className="text-neutral-400">
              {Math.floor(duration / 60)}:{(duration % 60).toFixed(2).padStart(5, '0')}
            </span>
          </div>

          {/* Zoom Slider */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPixelsPerSec((p) => Math.max(20, p - 20))}
              className="p-1 text-neutral-400 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="20"
              max="200"
              value={pixelsPerSec}
              onChange={(e) => setPixelsPerSec(parseInt(e.target.value, 10))}
              className="w-20 accent-orange-500 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setPixelsPerSec((p) => Math.min(200, p + 20))}
              className="p-1 text-neutral-400 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (containerRef.current) {
                  const availableW = containerRef.current.clientWidth - 180;
                  setPixelsPerSec(Math.max(20, Math.floor(availableW / duration)));
                }
              }}
              className="p-1 text-neutral-400 hover:text-white"
              title="Fit to Timeline"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* TIMELINE BODY: TRACK HEADERS (LEFT) + TIMELINE CANVAS (RIGHT) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* TRACK HEADERS (Left Sidebar) */}
        <div className="w-44 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0 z-20 shadow-lg">
          {/* Header spacer for ruler */}
          <div className="h-7 border-b border-neutral-800 px-2 flex items-center text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            Tracks
          </div>

          {/* Track Labels */}
          <div className="flex-1 overflow-y-hidden">
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className="h-14 border-b border-neutral-800/80 px-2.5 flex items-center justify-between text-xs hover:bg-neutral-850/50 transition group"
              >
                <div className="flex items-center gap-2 truncate">
                  {getTrackIcon(track.type)}
                  <span className="truncate text-neutral-300 font-medium text-[11px]">
                    {track.name}
                  </span>
                </div>

                {/* Track controls: Mute, Lock, Hide */}
                <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => toggleTrackProperty(track.id, 'muted')}
                    title={track.muted ? 'Unmute Track' : 'Mute Track'}
                    className={`p-1 rounded hover:bg-neutral-800 transition ${
                      track.muted ? 'text-red-400' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTrackProperty(track.id, 'locked')}
                    title={track.locked ? 'Unlock Track' : 'Lock Track'}
                    className={`p-1 rounded hover:bg-neutral-800 transition ${
                      track.locked ? 'text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTrackProperty(track.id, 'hidden')}
                    title={track.hidden ? 'Show Track' : 'Hide Track'}
                    className={`p-1 rounded hover:bg-neutral-800 transition ${
                      track.hidden ? 'text-neutral-500' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {track.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TIMELINE TRACKS AREA (SCROLLABLE RIGHT) */}
        <div
          ref={tracksScrollRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-neutral-950/80 select-none"
        >
          <div
            className="relative"
            style={{ width: `${timelineWidth}px`, minHeight: '100%' }}
          >
            {/* RULER */}
            <div
              ref={rulerRef}
              onClick={handleRulerClick}
              className="h-7 border-b border-neutral-800 bg-neutral-900/50 sticky top-0 z-30 cursor-pointer overflow-hidden relative"
            >
              {renderRulerTicks()}
            </div>

            {/* SNAP INDICATOR LINE */}
            {snapIndicatorX !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-40 pointer-events-none shadow-[0_0_8px_rgba(250,204,21,0.8)]"
                style={{ left: `${snapIndicatorX}px` }}
              />
            )}

            {/* PLAYHEAD SCRUBBER (FULL HEIGHT LINE + DIAMOND HEAD) */}
            <div
              className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
              style={{
                left: `${playhead * pixelsPerSec}px`,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Playhead marker top */}
              <div className="w-3.5 h-3.5 bg-orange-500 border border-white rotate-45 -mt-0.5 shadow-md" />
              {/* Vertical red/orange needle */}
              <div className="w-0.5 flex-1 bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)]" />
            </div>

            {/* TRACK LANES */}
            <div className="flex flex-col">
              {project.tracks.map((track) => (
                <div
                  key={track.id}
                  className={`h-14 border-b border-neutral-900 relative transition ${
                    track.hidden ? 'opacity-30' : ''
                  }`}
                  style={{
                    backgroundColor: track.locked ? 'rgba(0,0,0,0.3)' : 'transparent',
                  }}
                  onClick={() => onSelectItem(null, track.id)}
                >
                  {/* Track items */}
                  {track.items.map((item) => {
                    const itemWidth = Math.max(
                      8,
                      (item.timeline_end - item.timeline_start) * pixelsPerSec
                    );
                    const itemLeft = item.timeline_start * pixelsPerSec;
                    const isSelected = selectedItemId === item.id;

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item.id, track.id);
                        }}
                        onMouseDown={(e) => {
                          if (track.locked) return;
                          e.stopPropagation();
                          onSelectItem(item.id, track.id);
                          setDragState({
                            type: 'move',
                            trackId: track.id,
                            itemId: item.id,
                            initialMouseX: e.clientX,
                            initialStart: item.timeline_start,
                            initialEnd: item.timeline_end,
                            initialSourceStart: item.source_start,
                            initialSourceEnd: item.source_end,
                          });
                        }}
                        style={{
                          left: `${itemLeft}px`,
                          width: `${itemWidth}px`,
                        }}
                        className={`absolute top-1.5 bottom-1.5 rounded-md border text-xs flex items-center overflow-hidden cursor-move select-none transition-shadow ${getItemColor(
                          track.type,
                          isSelected
                        )}`}
                      >
                        {/* Left Trim Handle */}
                        {!track.locked && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              onSelectItem(item.id, track.id);
                              setDragState({
                                type: 'trim-left',
                                trackId: track.id,
                                itemId: item.id,
                                initialMouseX: e.clientX,
                                initialStart: item.timeline_start,
                                initialEnd: item.timeline_end,
                                initialSourceStart: item.source_start,
                                initialSourceEnd: item.source_end,
                              });
                            }}
                            className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-orange-500 cursor-ew-resize z-20 flex items-center justify-center transition"
                            title="Trim Start"
                          >
                            <div className="w-0.5 h-3 bg-white/60 rounded" />
                          </div>
                        )}

                        {/* Item Label & Keyframe Indicators */}
                        <div className="flex-1 px-3 text-[11px] font-medium text-white truncate flex items-center justify-between pointer-events-none">
                          <span className="truncate">
                            {item.text?.text || item.caption?.style || `${track.name} [${(item.timeline_end - item.timeline_start).toFixed(1)}s]`}
                          </span>

                          {/* Keyframe Diamond Markers */}
                          {item.keyframes && item.keyframes.length > 0 && (
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              {item.keyframes.map((kf, kfIdx) => (
                                <div
                                  key={kf.id || kfIdx}
                                  className="w-1.5 h-1.5 bg-yellow-400 rotate-45 shadow"
                                  title={`Keyframe: ${kf.property} at ${(item.timeline_start + kf.time).toFixed(2)}s`}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Right Trim Handle */}
                        {!track.locked && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              onSelectItem(item.id, track.id);
                              setDragState({
                                type: 'trim-right',
                                trackId: track.id,
                                itemId: item.id,
                                initialMouseX: e.clientX,
                                initialStart: item.timeline_start,
                                initialEnd: item.timeline_end,
                                initialSourceStart: item.source_start,
                                initialSourceEnd: item.source_end,
                              });
                            }}
                            className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-orange-500 cursor-ew-resize z-20 flex items-center justify-center transition"
                            title="Trim End"
                          >
                            <div className="w-0.5 h-3 bg-white/60 rounded" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

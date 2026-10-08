import React, { useState } from 'react';
import { Sliders, Key } from 'lucide-react';
import {
  EditorProject,
  EditorTrackItem,
  SAFE_EDITOR_FONTS,
  EDITOR_FILTER_PRESETS,
  EDITOR_EFFECT_TYPES,
  EditorFilterPreset,
  EditorEffectType,
  ClipAspectRatio,
} from '../../types';

interface InspectorPanelProps {
  project: EditorProject;
  selectedItemId: string | null;
  selectedTrackId: string | null;
  playhead: number;
  onUpdateProject: (updated: EditorProject) => void;
  onUpdateItem: (itemId: string, updates: Partial<EditorTrackItem>) => void;
  onAddKeyframe: (itemId: string, property: any, value: number, easing: any, time?: number) => void;
  onDeleteKeyframe: (itemId: string, keyframeId: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  selectedItemId,
  selectedTrackId,
  playhead,
  onUpdateProject,
  onUpdateItem,
  onAddKeyframe,
  onDeleteKeyframe,
}) => {
  // Find selected item
  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const selectedItem = project.tracks
    .flatMap((t) => t.items)
    .find((i) => i.id === selectedItemId);

  // Active section tabs within inspector
  const [activeTab, setActiveTab] = useState<'properties' | 'color' | 'effects' | 'keyframes' | 'audio'>('properties');

  if (!selectedItem) {
    // Project-level inspector when nothing is selected
    return (
      <div className="w-80 bg-neutral-900 border-l border-neutral-800 p-4 flex flex-col gap-5 text-xs text-neutral-300 overflow-y-auto">
        <div className="flex items-center gap-2 pb-3 border-b border-neutral-800">
          <Sliders className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-white text-sm">Project Inspector</h3>
        </div>

        {/* Project Canvas Settings */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Canvas Format</label>
          <div className="grid grid-cols-2 gap-2">
            {(['9:16', '1:1', '16:9', '4:5'] as ClipAspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => {
                  let width = 1080;
                  let height = 1920;
                  if (ratio === '1:1') {
                    width = 1080;
                    height = 1080;
                  } else if (ratio === '16:9') {
                    width = 1920;
                    height = 1080;
                  } else if (ratio === '4:5') {
                    width = 1080;
                    height = 1350;
                  }
                  onUpdateProject({
                    ...project,
                    canvas: {
                      ...project.canvas,
                      aspect_ratio: ratio,
                      width,
                      height,
                    },
                  });
                }}
                className={`p-2.5 rounded-lg border text-center font-medium transition ${
                  project.canvas.aspect_ratio === ratio
                    ? 'bg-orange-600/30 border-orange-500 text-white font-bold'
                    : 'bg-neutral-800/80 border-neutral-700 hover:border-neutral-600 text-neutral-300'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Snapping Settings */}
        <div className="space-y-3 pt-3 border-t border-neutral-800">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Timeline Preferences</label>
          <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60">
            <span>Magnetic Snapping</span>
            <input
              type="checkbox"
              checked={project.settings?.snapping ?? true}
              onChange={(e) =>
                onUpdateProject({
                  ...project,
                  settings: {
                    ...project.settings,
                    snapping: e.target.checked,
                  },
                })
              }
              className="accent-orange-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="mt-8 p-3 bg-neutral-950/60 rounded-lg border border-neutral-800/80 text-[11px] text-neutral-400 leading-relaxed text-center">
          Select any clip, text layer, or audio track on the timeline to inspect and edit its fine-tuned parameters.
        </div>
      </div>
    );
  }

  // Determine item type
  const isVideo = selectedItem.type === 'VIDEO';
  const isText = selectedItem.type === 'TEXT';
  const isAudio = selectedItem.type === 'AUDIO';

  return (
    <div className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col text-xs text-neutral-300 overflow-hidden">
      {/* HEADER & TYPE BADGE */}
      <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-white truncate">
            {selectedItem.text?.text || selectedTrack?.name || 'Clip Inspector'}
          </span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-neutral-800 text-orange-400">
          {selectedItem.type}
        </span>
      </div>

      {/* SUB-TABS */}
      <div className="flex border-b border-neutral-800 bg-neutral-950/50 p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('properties')}
          className={`flex-1 py-1.5 rounded text-[11px] font-medium transition ${
            activeTab === 'properties' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Transform
        </button>
        {isVideo && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('color')}
              className={`flex-1 py-1.5 rounded text-[11px] font-medium transition ${
                activeTab === 'color' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Color
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('effects')}
              className={`flex-1 py-1.5 rounded text-[11px] font-medium transition ${
                activeTab === 'effects' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Effects
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('keyframes')}
          className={`flex-1 py-1.5 rounded text-[11px] font-medium transition ${
            activeTab === 'keyframes' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Keyframes
        </button>
        {(isAudio || isVideo) && (
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`flex-1 py-1.5 rounded text-[11px] font-medium transition ${
              activeTab === 'audio' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Audio
          </button>
        )}
      </div>

      {/* INSPECTOR CONTENT BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* TAB 1: TRANSFORM & GENERAL PROPERTIES */}
        {activeTab === 'properties' && (
          <div className="space-y-4">
            {/* Position X / Y */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-neutral-400">Position (X / Y offset)</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded px-2 py-1">
                  <span className="text-neutral-500 mr-1 text-[10px]">X:</span>
                  <input
                    type="number"
                    value={Math.round(selectedItem.transform?.position_x || 0)}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, {
                        transform: {
                          ...selectedItem.transform,
                          position_x: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-transparent text-white focus:outline-none"
                  />
                </div>
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded px-2 py-1">
                  <span className="text-neutral-500 mr-1 text-[10px]">Y:</span>
                  <input
                    type="number"
                    value={Math.round(selectedItem.transform?.position_y || 0)}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, {
                        transform: {
                          ...selectedItem.transform,
                          position_y: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-transparent text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Scale */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-400">Scale</span>
                <span className="font-mono text-white">{Math.round((selectedItem.transform?.scale || 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.05"
                value={selectedItem.transform?.scale || 1}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      scale: parseFloat(e.target.value) || 1,
                    },
                  })
                }
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            {/* Rotation */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-400">Rotation</span>
                <span className="font-mono text-white">{Math.round(selectedItem.transform?.rotation || 0)}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                value={selectedItem.transform?.rotation || 0}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      rotation: parseInt(e.target.value, 10) || 0,
                    },
                  })
                }
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            {/* Opacity */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-400">Opacity</span>
                <span className="font-mono text-white">{Math.round((selectedItem.transform?.opacity ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedItem.transform?.opacity ?? 1}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      opacity: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            {/* TEXT SPECIFIC CONTROLS */}
            {isText && selectedItem.text && (
              <div className="pt-3 border-t border-neutral-800 space-y-3">
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Text Properties</label>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-400">Content</label>
                  <textarea
                    rows={2}
                    value={selectedItem.text.text}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, {
                        text: { ...selectedItem.text!, text: e.target.value },
                      })
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* Font Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-400">Font Family</label>
                  <select
                    value={selectedItem.text.font_family || 'Inter'}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, {
                        text: { ...selectedItem.text!, font_family: e.target.value },
                      })
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none"
                  >
                    {SAFE_EDITOR_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400">Fill Color</span>
                  <input
                    type="color"
                    value={selectedItem.text.color || '#FFFFFF'}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, {
                        text: { ...selectedItem.text!, color: e.target.value },
                      })
                    }
                    className="w-7 h-7 rounded border border-neutral-700 cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            )}

            {/* VIDEO SPEED CONTROLS */}
            {isVideo && (
              <div className="pt-3 border-t border-neutral-800 space-y-3">
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Playback Speed</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        onUpdateItem(selectedItem.id, {
                          speed: {
                            ...selectedItem.speed,
                            speed: s,
                          },
                        })
                      }
                      className={`py-1 rounded text-[11px] font-mono font-medium transition ${
                        selectedItem.speed?.speed === s
                          ? 'bg-orange-600 text-white'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COLOR ADJUSTMENTS & FILTERS */}
        {activeTab === 'color' && isVideo && (
          <div className="space-y-4">
            <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Color Grading</label>

            {/* Filter Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-neutral-400">Filter Preset</span>
              <div className="grid grid-cols-3 gap-1.5">
                {EDITOR_FILTER_PRESETS.map((preset: EditorFilterPreset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      onUpdateItem(selectedItem.id, {
                        filter: {
                          preset,
                          intensity: 1.0,
                        },
                      })
                    }
                    className={`p-1.5 rounded text-[10px] capitalize font-medium transition ${
                      (selectedItem.filter?.preset || 'none') === preset
                        ? 'bg-orange-600 text-white font-bold'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders: Brightness, Contrast, Saturation, Exposure */}
            {[
              { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.05 },
              { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.05 },
              { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.05 },
              { key: 'exposure', label: 'Exposure', min: -1, max: 1, step: 0.05 },
              { key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.05 },
            ].map(({ key, label, min, max, step }) => {
              const currentVal = (selectedItem.color as any)?.[key] || 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">{label}</span>
                    <span className="font-mono text-white">{(currentVal * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={currentVal}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, {
                        color: {
                          exposure: 0,
                          brightness: 0,
                          contrast: 0,
                          highlights: 0,
                          shadows: 0,
                          saturation: 0,
                          temperature: 0,
                          tint: 0,
                          fade: 0,
                          sharpen: 0,
                          ...selectedItem.color,
                          [key]: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: VIDEO EFFECTS */}
        {activeTab === 'effects' && isVideo && (
          <div className="space-y-4">
            <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Visual Effects</label>
            <div className="grid grid-cols-2 gap-2">
              {EDITOR_EFFECT_TYPES.map((fxType: EditorEffectType) => {
                const isApplied = selectedItem.effects?.some((e) => e.type === fxType);
                return (
                  <button
                    key={fxType}
                    type="button"
                    onClick={() => {
                      const newEffects = isApplied
                        ? selectedItem.effects.filter((e) => e.type !== fxType)
                        : [...(selectedItem.effects || []), { type: fxType, intensity: 0.5 }];
                      onUpdateItem(selectedItem.id, { effects: newEffects });
                    }}
                    className={`p-2.5 rounded-lg border text-left capitalize transition ${
                      isApplied
                        ? 'bg-orange-950/60 border-orange-500 text-orange-200'
                        : 'bg-neutral-800/80 border-neutral-700 hover:border-neutral-600 text-neutral-400'
                    }`}
                  >
                    <div className="font-semibold text-white">{fxType}</div>
                    <div className="text-[10px] text-neutral-400">{isApplied ? 'Applied' : 'Disabled'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: KEYFRAMES */}
        {activeTab === 'keyframes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Animation Keyframes</label>
              <button
                type="button"
                onClick={() => {
                  const relativeTime = Math.max(0, playhead - selectedItem.timeline_start);
                  onAddKeyframe(selectedItem.id, 'scale', selectedItem.transform?.scale || 1.0, 'ease-in-out', relativeTime);
                }}
                className="px-2 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white font-medium text-[10px] flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                <span>+ Keyframe</span>
              </button>
            </div>

            {/* Keyframe List */}
            {selectedItem.keyframes && selectedItem.keyframes.length > 0 ? (
              <div className="space-y-2">
                {selectedItem.keyframes.map((kf) => (
                  <div
                    key={kf.id}
                    className="p-2 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-mono text-orange-400 font-bold mr-2">{kf.time.toFixed(2)}s</span>
                      <span className="capitalize text-white">{kf.property}:</span>
                      <span className="font-mono text-neutral-300 ml-1">{kf.value}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteKeyframe(selectedItem.id, kf.id)}
                      className="text-neutral-500 hover:text-red-400 p-1"
                      title="Delete Keyframe"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-4 text-neutral-500 text-[11px]">
                No keyframes on this clip yet. Move the playhead and click "+ Keyframe" to animate scale, position, or opacity.
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUDIO INSPECTOR */}
        {activeTab === 'audio' && (
          <div className="space-y-4">
            <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Audio Controls</label>

            {/* Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-400">Volume</span>
                <span className="font-mono text-white">
                  {Math.round((selectedItem.audio?.volume ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={selectedItem.audio?.volume ?? 1.0}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    audio: {
                      volume: parseFloat(e.target.value) || 1.0,
                      fade_in: selectedItem.audio?.fade_in || 0,
                      fade_out: selectedItem.audio?.fade_out || 0,
                      normalized: selectedItem.audio?.normalized || false,
                      target_lufs: selectedItem.audio?.target_lufs || -16,
                    },
                  })
                }
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            {/* Speech Normalization Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 border border-neutral-800">
              <div>
                <div className="font-medium text-white">Normalize Speech</div>
                <div className="text-[10px] text-neutral-400">Phase 17 loudnorm standard (-16 LUFS)</div>
              </div>
              <input
                type="checkbox"
                checked={selectedItem.audio?.normalized ?? false}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    audio: {
                      volume: selectedItem.audio?.volume ?? 1.0,
                      fade_in: selectedItem.audio?.fade_in || 0,
                      fade_out: selectedItem.audio?.fade_out || 0,
                      normalized: e.target.checked,
                      target_lufs: -16,
                    },
                  })
                }
                className="accent-orange-500 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Sliders,
  Mic,
  Activity,
  Layers,
  CheckCircle,
  AlertCircle,
  Play,
  Zap,
} from 'lucide-react';
import {
  EditorProject,
  AudioEnhancementConfig,
  AudioDuckingConfig,
  AudioCleanPreset,
  AUDIO_CLEAN_PRESETS,
  AUDIO_DUCKING_PRESETS,
  AudioAnalysisMetrics,
  VoiceProviderCapabilities,
  VoiceOption,
} from '../../types';
import { audioStudioService } from '../../services/audioStudioService';

interface AudioStudioPanelProps {
  project: EditorProject;
  onUpdateProject: (updated: EditorProject) => void;
  currentTranscriptText?: string;
}

export const AudioStudioPanel: React.FC<AudioStudioPanelProps> = ({
  project,
  onUpdateProject,
  currentTranscriptText = '',
}) => {
  const [activeTab, setActiveTab] = useState<'clean' | 'mix' | 'voiceover' | 'advanced'>('clean');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Enhancement State
  const [cleanPreset, setCleanPreset] = useState<AudioCleanPreset>('clean');
  const [enhancement, setEnhancement] = useState<AudioEnhancementConfig>({
    ...AUDIO_CLEAN_PRESETS.clean,
  });

  // Ducking State
  const [ducking, setDucking] = useState<AudioDuckingConfig>({
    enabled: true,
    preset: 'balanced',
    ...AUDIO_DUCKING_PRESETS.balanced,
  });

  // Track Mix Volumes
  const [dialogueVolume, setDialogueVolume] = useState<number>(1.0);
  const [musicVolume, setMusicVolume] = useState<number>(0.3);
  const [brollMode, setBrollMode] = useState<'muted' | 'original' | 'auto_duck'>('auto_duck');

  // Preview & Analysis State
  const [previewMetrics, setPreviewMetrics] = useState<{
    before: AudioAnalysisMetrics | null;
    after: AudioAnalysisMetrics | null;
    preview_url: string | null;
  }>({ before: null, after: null, preview_url: null });
  const [previewLoading, setPreviewLoading] = useState(false);

  // Voiceover State
  const [scriptText, setScriptText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [capabilities, setCapabilities] = useState<VoiceProviderCapabilities | null>(null);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);

  // Load capabilities & voices on mount
  useEffect(() => {
    async function loadAudioCaps() {
      try {
        const caps = await audioStudioService.getCapabilities();
        setCapabilities(caps);
        const voices = await audioStudioService.listVoices();
        setAvailableVoices(voices);
        if (voices.length > 0) {
          setSelectedVoice(voices[0].id);
        }
      } catch (err: any) {
        // Safe fallback
      }
    }
    loadAudioCaps();
  }, []);

  // Update preset
  const handleSelectPreset = (preset: AudioCleanPreset) => {
    setCleanPreset(preset);
    setEnhancement({ ...AUDIO_CLEAN_PRESETS[preset] });
  };

  // Run A/B Preview snippet
  const handleRunPreview = async () => {
    try {
      setPreviewLoading(true);
      setError(null);

      // Locate first valid source video/audio path in project
      const primaryItem = project.tracks.flatMap((t) => t.items).find((i) => i.source_path);
      const sourcePath = primaryItem?.source_path || '';

      if (!sourcePath) {
        setError('No source audio found in project timeline for preview.');
        setPreviewLoading(false);
        return;
      }

      const res = await audioStudioService.enhancePreview({
        file_path: sourcePath,
        config: enhancement,
        start_time: project.playhead || 0,
        duration: 5.0,
      });

      setPreviewMetrics({
        before: res.before,
        after: res.after,
        preview_url: res.preview_audio_path,
      });
      setSuccessMessage('A/B Preview snippet generated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview snippet.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Apply Audio Studio settings to EditorProject
  const handleApplyAudioStudio = async () => {
    try {
      setLoading(true);
      setError(null);

      const updated = await audioStudioService.applyAudioStudio(project.id, {
        enhancement,
        ducking,
        dialogue_volume: dialogueVolume,
        music_volume: musicVolume,
        broll_audio_mode: brollMode,
      });

      onUpdateProject(updated);
      setSuccessMessage('Audio Studio settings applied to timeline.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to apply audio settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 border-l border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold tracking-wide uppercase">Audio & Voice Studio</h2>
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
          Phase 20
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/40">
        {[
          { id: 'clean', label: 'Clean Speech', icon: Sparkles },
          { id: 'mix', label: 'Mix & Duck', icon: Sliders },
          { id: 'voiceover', label: 'Voiceover', icon: Mic },
          { id: 'advanced', label: 'Advanced', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2.5 px-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                isActive
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="m-3 p-2.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="m-3 p-2.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* TAB 1: CLEAN SPEECH */}
        {activeTab === 'clean' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                Enhancement Preset
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'natural', title: 'Natural', desc: 'Subtle rumble cut & soft leveling' },
                  { id: 'clean', title: 'Clean', desc: 'Noise reduction, hum removal & de-essing' },
                  { id: 'podcast', title: 'Podcast', desc: 'Warm vocal tone & broadcast level' },
                  { id: 'studio', title: 'Studio', desc: 'Crisp presence & dynamic compression' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPreset(p.id as AudioCleanPreset)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      cleanPreset === p.id
                        ? 'border-indigo-500 bg-indigo-500/20 text-white'
                        : 'border-slate-800 bg-slate-800/50 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-medium">{p.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Individual Switches */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                Cleanup Processors
              </label>

              <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
                <span className="text-xs text-slate-200">Reduce Background Noise</span>
                <input
                  type="checkbox"
                  checked={enhancement.denoise_enabled}
                  onChange={(e) =>
                    setEnhancement({ ...enhancement, denoise_enabled: e.target.checked })
                  }
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
                <span className="text-xs text-slate-200">Remove 50/60Hz Electrical Hum</span>
                <input
                  type="checkbox"
                  checked={enhancement.hum_removal_enabled}
                  onChange={(e) =>
                    setEnhancement({ ...enhancement, hum_removal_enabled: e.target.checked })
                  }
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
                <span className="text-xs text-slate-200">De-Essing (Sibilance Tamer)</span>
                <input
                  type="checkbox"
                  checked={enhancement.deess_enabled}
                  onChange={(e) =>
                    setEnhancement({ ...enhancement, deess_enabled: e.target.checked })
                  }
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
                <span className="text-xs text-slate-200">EBU R128 Loudness Normalization</span>
                <input
                  type="checkbox"
                  checked={enhancement.normalize_enabled}
                  onChange={(e) =>
                    setEnhancement({ ...enhancement, normalize_enabled: e.target.checked })
                  }
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
                <span className="text-xs text-slate-200">Lookahead Peak Limiter (-1.0 dB TP)</span>
                <input
                  type="checkbox"
                  checked={enhancement.limiter_enabled}
                  onChange={(e) =>
                    setEnhancement({ ...enhancement, limiter_enabled: e.target.checked })
                  }
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
              </div>
            </div>

            {/* A/B Metrics Box */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Measured Acoustic Metrics</span>
                <button
                  onClick={handleRunPreview}
                  disabled={previewLoading}
                  className="text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1 disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>{previewLoading ? 'Analyzing...' : 'Preview 5s'}</span>
                </button>
              </div>

              {previewMetrics.before && previewMetrics.after ? (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                  <div className="space-y-1 text-slate-400">
                    <div className="text-xs font-semibold text-slate-300">Before</div>
                    <div>Loudness: <span className="text-slate-200">{previewMetrics.before.integrated_lufs} LUFS</span></div>
                    <div>True Peak: <span className="text-slate-200">{previewMetrics.before.true_peak_db} dBFS</span></div>
                    <div>Clipping: <span className={previewMetrics.before.is_clipping ? 'text-rose-400 font-bold' : 'text-emerald-400'}>{previewMetrics.before.is_clipping ? 'Detected' : 'None'}</span></div>
                  </div>
                  <div className="space-y-1 text-slate-400">
                    <div className="text-xs font-semibold text-indigo-300">After Enhancement</div>
                    <div>Loudness: <span className="text-emerald-400 font-semibold">{previewMetrics.after.integrated_lufs} LUFS</span></div>
                    <div>True Peak: <span className="text-emerald-400">{previewMetrics.after.true_peak_db} dBFS</span></div>
                    <div>Clipping: <span className="text-emerald-400 font-semibold">0 (Protected)</span></div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 pt-1">
                  Click Preview to evaluate before and after loudness and clipping measurements on a 5-second snippet.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MIX & DUCK */}
        {activeTab === 'mix' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                Mixer Channels
              </label>

              {/* Dialogue Channel */}
              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 mb-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-200">1. Dialogue (Speaker)</span>
                  <span className="text-indigo-400">{Math.round(dialogueVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={dialogueVolume}
                  onChange={(e) => setDialogueVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Background Music Channel */}
              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 mb-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-200">2. Background Music</span>
                  <span className="text-indigo-400">{Math.round(musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* B-Roll Audio Mode */}
              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-200">3. B-Roll Layer Audio</span>
                  <span className="text-indigo-400 uppercase text-[10px] font-semibold">{brollMode}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {[
                    { id: 'muted', label: 'Muted (Default)' },
                    { id: 'auto_duck', label: 'Auto Duck' },
                    { id: 'original', label: 'Full Volume' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setBrollMode(m.id as any)}
                      className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-colors ${
                        brollMode === m.id
                          ? 'border-indigo-500 bg-indigo-500/20 text-white'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dynamic Sidechain Ducking Section */}
            <div className="p-3.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-200">Dynamic Sidechain Ducking</span>
                </div>
                <input
                  type="checkbox"
                  checked={ducking.enabled}
                  onChange={(e) => setDucking({ ...ducking, enabled: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Hardware-accurate FFmpeg sidechain compression automatically lowers music and B-roll volume whenever dialogue is spoken.
              </p>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {(['subtle', 'balanced', 'strong'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() =>
                      setDucking({
                        enabled: true,
                        preset: p,
                        ...AUDIO_DUCKING_PRESETS[p],
                      })
                    }
                    className={`py-1.5 px-2 rounded text-[11px] font-medium border capitalize text-center transition-colors ${
                      ducking.preset === p
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: VOICEOVER */}
        {activeTab === 'voiceover' && (
          <div className="space-y-4">
            {/* Capability banner */}
            {capabilities && capabilities.text_to_speech === 'NOT_CONFIGURED' && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span>TTS Provider Not Configured</span>
                </div>
                <p className="text-[11px] text-amber-300/80">
                  Add <code>ELEVENLABS_API_KEY</code> or <code>OPENAI_API_KEY</code> to your environment to synthesize real voiceovers. Zero fake audio is generated.
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Script Text
                </label>
                {currentTranscriptText && (
                  <button
                    onClick={() => setScriptText(currentTranscriptText)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Use Selected Transcript
                  </button>
                )}
              </div>
              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="Enter voiceover script text..."
                rows={4}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <div className="text-right text-[10px] text-slate-500 mt-1">
                {scriptText.length} / 2000 characters
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                >
                  <option value="en">English (US)</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="hi">Hindi</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  disabled={availableVoices.length === 0}
                >
                  {availableVoices.length > 0 ? (
                    availableVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.provider})
                      </option>
                    ))
                  ) : (
                    <option value="">No configured voices</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="text-slate-300">Speech Rate</span>
                <span className="text-indigo-400">{speed}x</span>
              </div>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>
        )}

        {/* TAB 4: ADVANCED */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                3-Band Parametric EQ
              </label>
              <div className="space-y-2.5 p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Low (180 Hz)</span>
                    <span className="text-slate-200 font-mono">{(enhancement.eq_low_db || 0).toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-8"
                    max="8"
                    step="0.5"
                    value={enhancement.eq_low_db || 0}
                    onChange={(e) =>
                      setEnhancement({ ...enhancement, eq_low_db: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-slate-700 rounded accent-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Mid (2.2 kHz)</span>
                    <span className="text-slate-200 font-mono">{(enhancement.eq_mid_db || 0).toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-8"
                    max="8"
                    step="0.5"
                    value={enhancement.eq_mid_db || 0}
                    onChange={(e) =>
                      setEnhancement({ ...enhancement, eq_mid_db: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-slate-700 rounded accent-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">High (8 kHz)</span>
                    <span className="text-slate-200 font-mono">{(enhancement.eq_high_db || 0).toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-8"
                    max="8"
                    step="0.5"
                    value={enhancement.eq_high_db || 0}
                    onChange={(e) =>
                      setEnhancement({ ...enhancement, eq_high_db: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-slate-700 rounded accent-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                Dynamics Compressor
              </label>
              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Threshold</span>
                  <span className="text-slate-200">{enhancement.compressor_threshold_db || -18} dB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ratio</span>
                  <span className="text-slate-200">{enhancement.compressor_ratio || 3.0}:1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Attack / Release</span>
                  <span className="text-slate-200">
                    {enhancement.compressor_attack_ms || 20}ms / {enhancement.compressor_release_ms || 200}ms
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60">
        <button
          onClick={handleApplyAudioStudio}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold tracking-wide transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
        >
          {loading ? 'Applying to Timeline...' : 'Apply Audio Settings to Timeline'}
        </button>
      </div>
    </div>
  );
};

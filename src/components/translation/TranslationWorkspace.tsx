import React, { useState, useEffect } from 'react';
import {
  Globe,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Download,
  Volume2,
  FileText,
  Check,
  Edit2,
  ShieldAlert,
  Layers,
  Lock,
  RefreshCw,
  Languages,
} from 'lucide-react';
import {
  EditorProject,
  LanguageDefinition,
  TranslationProject,
  TranslatedSegment,
  DubProject,
  DubVoiceStrategy,
  DubAudioMode,
  TranslationStyle,
  TranslationProviderCapabilities,
  LipSyncProviderCapabilities,
} from '../../types';
import { translationService } from '../../services/translationService';

interface TranslationWorkspaceProps {
  project?: EditorProject | null;
  sourceTranscriptText?: string;
  sourceSegments?: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    speaker_id?: string;
  }>;
  onApplyCaptions?: (language: string, segments: TranslatedSegment[]) => void;
  onRefreshProject?: () => void;
}

export const TranslationWorkspace: React.FC<TranslationWorkspaceProps> = ({
  project,
  sourceTranscriptText = '',
  sourceSegments = [],
  onApplyCaptions,
  onRefreshProject,
}) => {
  // Navigation tabs within workspace
  const [activeTab, setActiveTab] = useState<'translate' | 'subtitles' | 'dubbing'>('translate');

  // Languages & Capabilities
  const [languages, setLanguages] = useState<LanguageDefinition[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('hi');
  const [translationStyle, setTranslationStyle] = useState<TranslationStyle>('creator');
  const [lockedTermsInput, setLockedTermsInput] = useState<string>('Vireo, YouTube, AI');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Project & Segments
  const [activeTranslationProject, setActiveTranslationProject] = useState<TranslationProject | null>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);

  // Providers & Capabilities
  const [translationProviders, setTranslationProviders] = useState<TranslationProviderCapabilities[]>([]);
  const [lipsyncProviders, setLipsyncProviders] = useState<LipSyncProviderCapabilities[]>([]);

  // Dubbing State
  const [dubProject, setDubProject] = useState<DubProject | null>(null);
  const [voiceStrategy, setVoiceStrategy] = useState<DubVoiceStrategy>('SELECTED_VOICE');
  const [targetVoiceId, setTargetVoiceId] = useState<string>('rachel');
  const [audioMode, setAudioMode] = useState<DubAudioMode>('original_low');
  const [smartShortening, setSmartShortening] = useState<boolean>(true);
  const [isDubbing, setIsDubbing] = useState<boolean>(false);
  const [isApplyingDub, setIsApplyingDub] = useState<boolean>(false);

  // Load languages and capabilities on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [langList, caps] = await Promise.all([
        translationService.getSupportedLanguages(),
        translationService.getCapabilities(),
      ]);
      setLanguages(langList);
      setTranslationProviders(caps.translation_providers || []);
      setLipsyncProviders(caps.lipsync_providers || []);
    } catch (err: any) {
      console.error('Failed to load initial translation data', err);
    }
  };

  // Create / Run Translation
  const handleStartTranslation = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const lockedTerms = lockedTermsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      // Extract segments from props or fallback to sample segments
      const segmentsToTranslate =
        sourceSegments.length > 0
          ? sourceSegments
          : [
              {
                id: 'seg-1',
                start: 0.0,
                end: 3.5,
                text: sourceTranscriptText || 'Welcome to Vireo Video AI. Create studio-quality videos effortlessly.',
                speaker_id: 'speaker-0',
              },
            ];

      const newProj = await translationService.createTranslationProject({
        project_id: project?.id,
        clip_id: project?.clip_id || undefined,
        target_languages: [selectedLanguage],
        style: translationStyle,
        locked_terms: lockedTerms,
        source_segments: segmentsToTranslate,
      });

      setActiveTranslationProject(newProj);
      setSuccessMessage(`Successfully translated script to ${getLanguageName(selectedLanguage)}!`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate translations');
    } finally {
      setLoading(false);
    }
  };

  // Inline Segment Edit & Approval
  const handleStartEdit = (seg: TranslatedSegment) => {
    setEditingSegmentId(seg.segment_id);
    setEditText(seg.translated_text);
  };

  const handleSaveEdit = async (segmentId: string, approveImmediately: boolean = false) => {
    if (!activeTranslationProject) return;
    setSavingSegmentId(segmentId);
    try {
      const updated = await translationService.updateSegment(
        activeTranslationProject.id,
        segmentId,
        {
          translated_text: editText,
          is_approved: approveImmediately ? true : undefined,
        }
      );

      setActiveTranslationProject((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          segments: prev.segments.map((s) => (s.segment_id === segmentId ? updated : s)),
        };
      });

      setEditingSegmentId(null);
      setSuccessMessage('Segment updated non-destructively.');
    } catch (err: any) {
      setError(err.message || 'Failed to update segment');
    } finally {
      setSavingSegmentId(null);
    }
  };

  const handleToggleApprove = async (seg: TranslatedSegment) => {
    if (!activeTranslationProject) return;
    setSavingSegmentId(seg.segment_id);
    try {
      const updated = await translationService.updateSegment(
        activeTranslationProject.id,
        seg.segment_id,
        {
          is_approved: !seg.reviewed,
        }
      );

      setActiveTranslationProject((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          segments: prev.segments.map((s) => (s.segment_id === seg.segment_id ? updated : s)),
        };
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update approval status');
    } finally {
      setSavingSegmentId(null);
    }
  };

  // Export Subtitles (SRT / VTT)
  const handleExportSubtitles = async (format: 'srt' | 'vtt') => {
    if (!activeTranslationProject) return;
    try {
      const content = await translationService.exportSubtitles(
        activeTranslationProject.id,
        format,
        selectedLanguage
      );
      const filename = `subtitles_${selectedLanguage}.${format}`;
      translationService.downloadSubtitlesFile(content, filename);
    } catch (err: any) {
      setError(err.message || `Failed to export ${format.toUpperCase()}`);
    }
  };

  // Create Dub Project
  const handleGenerateDub = async () => {
    if (!activeTranslationProject) return;
    setIsDubbing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const dub = await translationService.createDubProject({
        translation_project_id: activeTranslationProject.id,
        target_language: selectedLanguage,
        voice_strategy: voiceStrategy,
        target_voice_id: targetVoiceId,
        audio_mode: audioMode,
        ducking_attenuation_db: -18,
        timing_adjustment: {
          min_speed: 0.85,
          max_speed: 1.2,
          smart_shortening: smartShortening,
        },
      });

      setDubProject(dub);
      setSuccessMessage('Dub project synthesized with timing alignment!');
    } catch (err: any) {
      setError(err.message || 'Failed to create dub project');
    } finally {
      setIsDubbing(false);
    }
  };

  // Apply Dub To Timeline
  const handleApplyDub = async () => {
    if (!dubProject) return;
    setIsApplyingDub(true);
    try {
      const res = await translationService.applyDubToTimeline(dubProject.id);
      setSuccessMessage(res.message || 'Dub track injected into timeline!');
      if (onRefreshProject) onRefreshProject();
    } catch (err: any) {
      setError(err.message || 'Failed to apply dub to timeline');
    } finally {
      setIsApplyingDub(false);
    }
  };

  const getLanguageName = (code: string) => {
    const l = languages.find((lang) => lang.code === code);
    return l ? `${l.name} (${l.native_name})` : code;
  };

  const currentSegments = activeTranslationProject?.segments || [];

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-200 text-xs overflow-hidden">
      {/* Workspace Header */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">Vireo Translate & Dubbing</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-orange-400 border border-neutral-700">
                Phase 21
              </span>
            </div>
            <p className="text-[10px] text-neutral-400">
              Non-destructive global captions, script translation & multilingual voice alignment
            </p>
          </div>
        </div>

        {/* Immutability & Trust Badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-800/80 border border-neutral-700/60 text-[10px] text-neutral-300">
          <Lock className="w-3 h-3 text-emerald-400" />
          <span>Source Media & Audio 100% Immutable</span>
        </div>
      </div>

      {/* Top Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-900/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('translate')}
          className={`flex-1 py-1.5 px-3 rounded text-center font-medium transition flex items-center justify-center gap-1.5 ${
            activeTab === 'translate'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Languages className="w-3.5 h-3.5 text-orange-400" />
          <span>Script Translation</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subtitles')}
          className={`flex-1 py-1.5 px-3 rounded text-center font-medium transition flex items-center justify-center gap-1.5 ${
            activeTab === 'subtitles'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span>Localized Captions & SRT</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dubbing')}
          className={`flex-1 py-1.5 px-3 rounded text-center font-medium transition flex items-center justify-center gap-1.5 ${
            activeTab === 'dubbing'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Voice Dubbing & Timing</span>
        </button>
      </div>

      {/* Alert Banners */}
      {error && (
        <div className="m-3 p-2.5 rounded-lg bg-red-950/60 border border-red-800 text-red-300 flex items-center gap-2 text-[11px]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="m-3 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 flex items-center gap-2 text-[11px]">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* TAB 1: SCRIPT TRANSLATION */}
      {activeTab === 'translate' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
          {/* Target Language & Config Bar */}
          <div className="bg-neutral-900/80 p-3 rounded-lg border border-neutral-800 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-neutral-300">Target Language:</span>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-orange-500"
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.native_name}) {l.direction === 'rtl' ? '• RTL' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-neutral-300">Style:</span>
                <select
                  value={translationStyle}
                  onChange={(e) => setTranslationStyle(e.target.value as TranslationStyle)}
                  className="bg-neutral-800 border border-neutral-700 text-white rounded px-2 py-1 text-xs"
                >
                  <option value="creator">Creator / Engaging</option>
                  <option value="natural">Natural / Conversational</option>
                  <option value="literal">Literal / Direct</option>
                  <option value="professional">Professional / Formal</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleStartTranslation}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 shadow transition ml-auto"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Translating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{activeTranslationProject ? 'Re-Translate Script' : 'Translate Script'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Glossary & Locked Terms Input */}
            <div className="flex items-center gap-2 pt-1 border-t border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 whitespace-nowrap">Protected Terms:</span>
              <input
                type="text"
                value={lockedTermsInput}
                onChange={(e) => setLockedTermsInput(e.target.value)}
                placeholder="Comma separated brand names (e.g. Vireo, YouTube, AI)"
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-[11px] text-neutral-300 focus:outline-none focus:border-neutral-600"
              />
              <span className="text-[10px] text-neutral-500">URLs & @handles preserved automatically</span>
            </div>
          </div>

          {/* Provider Capabilities Status Bar */}
          <div className="flex flex-wrap items-center gap-2 px-1 text-[10px] text-neutral-400">
            <span className="font-semibold text-neutral-500">Providers:</span>
            {translationProviders.map((p) => (
              <span
                key={p.provider_name}
                className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                  p.configured
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                    : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${p.configured ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                {p.provider_name}: {p.configured ? 'Ready' : 'Not Configured'}
              </span>
            ))}
          </div>

          {/* Side-by-Side Review Workspace */}
          <div className="flex-1 flex flex-col overflow-hidden border border-neutral-800 rounded-lg bg-neutral-900/30">
            <div className="p-2 border-b border-neutral-800 bg-neutral-900/80 flex items-center justify-between text-[11px] font-semibold text-neutral-300">
              <div className="flex items-center gap-2">
                <span>Segments Review</span>
                {activeTranslationProject && (
                  <span className="text-[10px] text-neutral-500 font-normal">
                    (Version {activeTranslationProject.version} • {currentSegments.length} Segments)
                  </span>
                )}
              </div>
              <div className="text-[10px] text-neutral-400">
                Double-click or click Edit to modify translated text non-destructively
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {currentSegments.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-neutral-500 p-4">
                  <Globe className="w-8 h-8 mb-2 stroke-1 text-neutral-600" />
                  <p className="font-medium text-neutral-400">No translated segments yet</p>
                  <p className="text-[11px] text-neutral-500 max-w-sm mt-1">
                    Select a target language above and click "Translate Script" to localize dialogue while keeping the source media strictly immutable.
                  </p>
                </div>
              ) : (
                currentSegments.map((seg, idx) => {
                  const isEditing = editingSegmentId === seg.segment_id;
                  const isSaving = savingSegmentId === seg.segment_id;
                  const charDiff = seg.translated_text.length - seg.source_text.length;
                  const expansionRatio = seg.source_text.length > 0 ? charDiff / seg.source_text.length : 0;

                  return (
                    <div
                      key={seg.segment_id}
                      className={`p-2.5 rounded-lg border transition ${
                        seg.reviewed
                          ? 'bg-neutral-900/60 border-emerald-900/50'
                          : 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {/* Segment Header */}
                      <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1.5">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-semibold text-neutral-300">#{idx + 1}</span>
                          <span>
                            [{seg.start_time.toFixed(2)}s - {seg.end_time.toFixed(2)}s]
                          </span>
                          <span className="text-neutral-500">({(seg.end_time - seg.start_time).toFixed(1)}s)</span>
                          {seg.speaker_id && (
                            <span className="px-1 bg-neutral-800 rounded text-neutral-400">
                              {seg.speaker_id}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {seg.locked_terms && seg.locked_terms.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-950/40 text-amber-400 border border-amber-800/60 text-[9px]">
                              {seg.locked_terms.length} Protected Term(s)
                            </span>
                          )}
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded ${
                              expansionRatio > 0.25
                                ? 'bg-orange-950/60 text-orange-400 border border-orange-800/60'
                                : 'text-neutral-500'
                            }`}
                          >
                            {expansionRatio > 0 ? `+${Math.round(expansionRatio * 100)}% chars` : `${Math.round(expansionRatio * 100)}% chars`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleApprove(seg)}
                            disabled={isSaving}
                            className={`p-1 rounded flex items-center gap-1 transition ${
                              seg.reviewed
                                ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700'
                                : 'bg-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                            title={seg.reviewed ? 'Approved' : 'Mark as Approved'}
                          >
                            <Check className="w-3 h-3" />
                            <span className="text-[9px]">{seg.reviewed ? 'Approved' : 'Approve'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Source & Target Comparison Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {/* Source Segment (Immutable) */}
                        <div className="p-2 rounded bg-neutral-950/60 border border-neutral-800/80 text-neutral-400">
                          <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-0.5 font-semibold">
                            Source (Original)
                          </div>
                          <p className="select-text">{seg.source_text}</p>
                        </div>

                        {/* Target Segment (Editable) */}
                        <div className="p-2 rounded bg-neutral-950/80 border border-neutral-700/80 text-white">
                          <div className="flex items-center justify-between text-[9px] text-neutral-500 uppercase tracking-wider mb-0.5 font-semibold">
                            <span>Target ({selectedLanguage.toUpperCase()})</span>
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(seg)}
                                className="text-orange-400 hover:text-orange-300 flex items-center gap-0.5 lowercase"
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                                <span>edit</span>
                              </button>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={2}
                                className="w-full bg-neutral-900 border border-orange-500/60 rounded p-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingSegmentId(null)}
                                  className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white text-[10px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(seg.segment_id, true)}
                                  disabled={isSaving}
                                  className="px-2.5 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-medium"
                                >
                                  {isSaving ? 'Saving...' : 'Save & Approve'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p
                              onDoubleClick={() => handleStartEdit(seg)}
                              className="select-text cursor-text"
                            >
                              {seg.translated_text}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOCALIZED CAPTIONS & SUBTITLES */}
      {activeTab === 'subtitles' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Subtitle Files Export (SRT / VTT)</span>
            </h3>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Download standards-compliant subtitle tracks for YouTube, Vimeo, TikTok, or video players. Subtitles are generated from your reviewed translations with language-aware line breaks.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleExportSubtitles('srt')}
                disabled={!activeTranslationProject}
                className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white font-medium flex items-center gap-2 border border-neutral-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Download SubRip (.SRT)</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportSubtitles('vtt')}
                disabled={!activeTranslationProject}
                className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white font-medium flex items-center gap-2 border border-neutral-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download WebVTT (.VTT)</span>
              </button>
            </div>
          </div>

          {/* Apply to Timeline Captions Track */}
          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-400" />
              <span>Timeline Captions Integration</span>
            </h3>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Inject the translated cues into your Pro Editor timeline as an independent subtitle track. Multilingual typography is automatically configured with proper font families (e.g., Noto Sans Devanagari for Hindi, Noto Sans CJK for Japanese/Korean/Chinese, Noto Sans Arabic for Arabic).
            </p>

            <button
              type="button"
              onClick={() => {
                if (onApplyCaptions && currentSegments.length > 0) {
                  onApplyCaptions(selectedLanguage, currentSegments);
                  setSuccessMessage(`Applied ${getLanguageName(selectedLanguage)} captions to video timeline!`);
                }
              }}
              disabled={currentSegments.length === 0}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-white font-medium flex items-center gap-2 shadow transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Apply {getLanguageName(selectedLanguage)} Captions to Video</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: VOICE DUBBING & TIMING FIT */}
      {activeTab === 'dubbing' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Provider Transparency Banner */}
          <div className="bg-neutral-900/80 p-3.5 rounded-lg border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Voice Dubbing Pipeline</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950/50 text-purple-300 border border-purple-800/60 font-mono">
                Phase 20 Voice Engine
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Dubbing synthesizes translated segments and aligns them with video dialogue using tempo compression (atempo clamped between 0.85x and 1.20x) and ducking under background audio.
            </p>
          </div>

          {/* Dubbing Configuration Form */}
          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                  Voice Strategy
                </label>
                <select
                  value={voiceStrategy}
                  onChange={(e) => setVoiceStrategy(e.target.value as DubVoiceStrategy)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-white rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="SELECTED_VOICE">Selected Voice (All Dialogue)</option>
                  <option value="ORIGINAL_STYLE">Original Style Preservation</option>
                  <option value="AUTHORIZED_CLONE">Authorized Voice Clone (Phase 20)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                  Audio Mode
                </label>
                <select
                  value={audioMode}
                  onChange={(e) => setAudioMode(e.target.value as DubAudioMode)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-white rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="original_low">Sidechain Duck Original (Keep Low Dialogue)</option>
                  <option value="original_muted">Original Muted (Dub Only)</option>
                  <option value="dub_only">Dub Only Isolated Track</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                Target Voice
              </label>
              <input
                type="text"
                value={targetVoiceId}
                onChange={(e) => setTargetVoiceId(e.target.value)}
                placeholder="Voice ID (e.g. rachel, prem)"
                className="w-full bg-neutral-800 border border-neutral-700 text-white rounded px-2.5 py-1.5 text-xs"
              />
            </div>

            {/* Smart Shortening & Clamped Speed */}
            <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-white block">Smart Timing Alignment</span>
                <span className="text-[10px] text-neutral-400">
                  Clamps audio speed strictly to 0.85x - 1.20x to avoid unnatural pitch or cartoonish speech
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smartShortening}
                  onChange={(e) => setSmartShortening(e.target.checked)}
                  className="accent-orange-500 rounded"
                />
                <span className="text-neutral-300">Smart Shortening</span>
              </label>
            </div>

            {/* Generate Dub Button */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleGenerateDub}
                disabled={isDubbing || !activeTranslationProject}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium flex items-center gap-2 transition shadow"
              >
                {isDubbing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing Dub...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Synthesize {getLanguageName(selectedLanguage)} Dub</span>
                  </>
                )}
              </button>

              {dubProject && (
                <button
                  type="button"
                  onClick={handleApplyDub}
                  disabled={isApplyingDub}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium flex items-center gap-2 border border-neutral-700 transition"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isApplyingDub ? 'Applying...' : 'Add Dub Track to Timeline'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Honest Lip-Sync Status Banner */}
          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400 space-y-1 text-xs">
            <div className="flex items-center gap-2 text-neutral-300 font-semibold">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Lip-Sync & Visual Alignment Status</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Lip-Sync provider is currently <strong className="text-neutral-300 font-mono">NOT CONFIGURED</strong> (Safe Consent Protection Mode). No face or video modification will be fabricated. Video visuals remain untouched.
            </p>
            {lipsyncProviders.length > 0 && (
              <div className="text-[10px] text-neutral-500 pt-1">
                Detected provider status: {lipsyncProviders.map((l) => `${l.provider_name}: ${l.status}`).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

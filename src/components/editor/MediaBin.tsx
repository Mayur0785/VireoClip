import React, { useState, useEffect } from 'react';
import {
  Video,
  Plus,
  Folder,
  Search,
  Sparkles,
  Image as ImageIcon,
  CheckCircle,
  Play,
  RotateCw,
  ShieldAlert,
  Globe,
} from 'lucide-react';
import { TranslationWorkspace } from '../translation/TranslationWorkspace';
import {
  EditorProject,
  EditorTrackType,
  NormalizedMediaItem,
  MediaSearchFilter,
  BrollPlanRecord,
  BrollStyle,
  ProviderCapabilities,
} from '../../types';
import { mediaService } from '../../services/mediaService';

interface MediaBinProps {
  project: EditorProject;
  sourceVideoUrl?: string | null;
  onAddMediaToTimeline: (type: EditorTrackType, name: string, url: string, duration?: number) => void;
  onRefreshProject?: () => void;
  currentTime?: number;
}

type TabType = 'library' | 'broll' | 'translate';
type LibrarySubTab = 'Project' | 'Uploads' | 'Clips' | 'Brand' | 'Stock' | 'Generated';

export const MediaBin: React.FC<MediaBinProps> = ({
  project,
  sourceVideoUrl,
  onAddMediaToTimeline,
  onRefreshProject,
  currentTime = 0,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('library');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('Project');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'ALL' | 'VIDEO' | 'IMAGE'>('ALL');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaItems, setMediaItems] = useState<NormalizedMediaItem[]>([]);
  const [providerCaps, setProviderCaps] = useState<ProviderCapabilities[]>([]);

  // B-Roll Intelligence State
  const [brollStyle, setBrollStyle] = useState<BrollStyle>('BALANCED');
  const [brollPlan, setBrollPlan] = useState<BrollPlanRecord | null>(null);
  const [isDetectingBroll, setIsDetectingBroll] = useState(false);
  const [isApplyingBroll, setIsApplyingBroll] = useState(false);
  const [brollMessage, setBrollMessage] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<NormalizedMediaItem | null>(null);

  // Load capabilities & initial media
  useEffect(() => {
    loadCapabilities();
    loadLibraryMedia();
    if (project.clip_id) {
      loadLatestBrollPlan();
    }
  }, [project.id, librarySubTab]);

  const loadCapabilities = async () => {
    try {
      const caps = await mediaService.getMediaCapabilities();
      setProviderCaps(caps);
    } catch (e) {
      console.error('Failed to load media capabilities', e);
    }
  };

  const loadLibraryMedia = async () => {
    setLoadingMedia(true);
    try {
      const filter: MediaSearchFilter = {
        query: searchQuery.trim() || undefined,
        media_type: mediaTypeFilter === 'ALL' ? undefined : mediaTypeFilter,
        project_id: project.project_id || undefined,
        per_page: 30,
      };

      if (librarySubTab === 'Project') {
        filter.source_type = 'PROJECT_SOURCE';
      } else if (librarySubTab === 'Uploads') {
        filter.source_type = 'USER_UPLOAD';
      } else if (librarySubTab === 'Clips') {
        filter.source_type = 'GENERATED_CLIP';
      } else if (librarySubTab === 'Brand') {
        filter.source_type = 'BRAND_ASSET';
      } else if (librarySubTab === 'Stock') {
        filter.provider = 'pexels';
      }

      const res = await mediaService.searchMedia(filter);
      setMediaItems(res.items || []);
    } catch (e) {
      console.error('Failed to load media items', e);
      setMediaItems([]);
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLibraryMedia();
  };

  const loadLatestBrollPlan = async () => {
    if (!project.clip_id) return;
    try {
      const plan = await mediaService.getClipBrollPlan(project.clip_id);
      if (plan) setBrollPlan(plan);
    } catch (e) {
      console.error('Failed to fetch B-roll plan', e);
    }
  };

  const handleDetectBroll = async () => {
    if (!project.clip_id) return;
    setIsDetectingBroll(true);
    setBrollMessage(null);
    try {
      const plan = await mediaService.createClipBrollPlan(project.clip_id, brollStyle);
      setBrollPlan(plan);
      setBrollMessage(`Discovered ${plan.suggestions.length} context-aware B-roll opportunities.`);
    } catch (e: any) {
      setBrollMessage(e.message || 'Failed to detect B-roll opportunities.');
    } finally {
      setIsDetectingBroll(false);
    }
  };

  const handleApplyBrollPlan = async (suggestionId?: string) => {
    if (!brollPlan) return;
    setIsApplyingBroll(true);
    try {
      const selectedIds = suggestionId ? [suggestionId] : undefined;
      const res = await mediaService.applyBrollPlan(brollPlan.id, selectedIds);
      setBrollMessage(`Successfully inserted ${res.appliedCount} B-roll layers into timeline!`);
      if (onRefreshProject) onRefreshProject();
      loadLatestBrollPlan();
    } catch (e: any) {
      setBrollMessage(e.message || 'Failed to apply B-roll plan.');
    } finally {
      setIsApplyingBroll(false);
    }
  };

  const handleInsertDirectAsset = async (asset: NormalizedMediaItem) => {
    try {
      await mediaService.insertDirectBroll(
        project.id,
        asset.id,
        currentTime,
        asset.duration && asset.duration > 0 ? Math.min(4.0, asset.duration) : 3.0
      );
      if (onRefreshProject) onRefreshProject();
    } catch (e: any) {
      // Fallback: use legacy onAddMediaToTimeline
      onAddMediaToTimeline(
        asset.media_type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
        asset.title,
        asset.source_url || asset.preview_url,
        asset.duration || 3
      );
    }
  };

  const stockCap = providerCaps.find((c) => c.provider === 'pexels' || c.provider === 'pixabay');
  const genCap = providerCaps.find((c) => c.provider === 'ai_generated');

  return (
    <div className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col text-xs text-neutral-300 select-none">
      {/* Top Header & Mode Toggle */}
      <div className="p-2.5 border-b border-neutral-800 bg-neutral-950 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span>Media Intelligence</span>
          </div>
          <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700">
            Phase 19
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 p-0.5 bg-neutral-900 rounded-lg border border-neutral-800 text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`py-1.5 text-center font-medium rounded-md transition flex items-center justify-center gap-1 ${
              activeTab === 'library'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Folder className="w-3 h-3 text-orange-400" />
            <span>Library</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('broll')}
            className={`py-1.5 text-center font-medium rounded-md transition flex items-center justify-center gap-1 ${
              activeTab === 'broll'
                ? 'bg-neutral-800 text-orange-400 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>B-Roll</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('translate')}
            className={`py-1.5 text-center font-medium rounded-md transition flex items-center justify-center gap-1 ${
              activeTab === 'translate'
                ? 'bg-neutral-800 text-orange-400 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>Translate</span>
          </button>
        </div>
      </div>

      {/* Tab 1: MEDIA LIBRARY */}
      {activeTab === 'library' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Subtabs */}
          <div className="flex items-center gap-1 p-2 border-b border-neutral-800 overflow-x-auto no-scrollbar bg-neutral-900/60">
            {(['Project', 'Uploads', 'Clips', 'Brand', 'Stock', 'Generated'] as LibrarySubTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLibrarySubTab(tab)}
                className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition ${
                  librarySubTab === tab
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                    : 'text-neutral-400 hover:text-white bg-neutral-800/40 border border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Bar & Type Filter */}
          <div className="p-2 border-b border-neutral-800 flex flex-col gap-1.5 bg-neutral-950/40">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                placeholder={`Search ${librarySubTab.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-7 pr-3 py-1 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-2" />
            </form>

            <div className="flex items-center justify-between text-[10px] text-neutral-400">
              <div className="flex items-center gap-1">
                {(['ALL', 'VIDEO', 'IMAGE'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMediaTypeFilter(type);
                      loadLibraryMedia();
                    }}
                    className={`px-1.5 py-0.5 rounded ${
                      mediaTypeFilter === type
                        ? 'bg-neutral-800 text-white font-medium'
                        : 'hover:text-neutral-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={loadLibraryMedia}
                className="hover:text-white flex items-center gap-1"
                title="Refresh media"
              >
                <RotateCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {/* Pinned Source Footage Card */}
            {librarySubTab === 'Project' && sourceVideoUrl && (
              <div className="p-2 rounded-lg bg-neutral-950 border border-blue-500/30 hover:border-blue-500/50 transition flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-white truncate max-w-[190px]">
                    <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">Source Video</span>
                  </div>
                  <span className="text-[10px] text-blue-400 font-mono">
                    {project.canvas.duration ? `${project.canvas.duration.toFixed(0)}s` : 'Base'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onAddMediaToTimeline('VIDEO', 'Source Video Track', sourceVideoUrl, project.canvas.duration || 10)}
                    className="flex-1 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center justify-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add to Timeline</span>
                  </button>
                </div>
              </div>
            )}
            {/* Stock Provider Not Configured Notice */}
            {librarySubTab === 'Stock' && stockCap?.status === 'NOT_CONFIGURED' && (
              <div className="p-3.5 rounded-lg bg-neutral-950 border border-amber-500/30 text-neutral-300 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-400 font-medium">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Stock Provider Not Configured</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  External stock video and image search requires an active provider key. Configure{' '}
                  <code className="text-amber-300 bg-neutral-900 px-1 py-0.5 rounded">PEXELS_API_KEY</code> or{' '}
                  <code className="text-amber-300 bg-neutral-900 px-1 py-0.5 rounded">PIXABAY_API_KEY</code> in your environment.
                </p>
                <div className="text-[10px] text-neutral-400 bg-neutral-900/60 p-2 rounded border border-neutral-800">
                  Real project source footage, clips, and local uploads remain fully available.
                </div>
              </div>
            )}

            {/* Generated Provider Not Configured Notice */}
            {librarySubTab === 'Generated' && genCap?.status === 'NOT_CONFIGURED' && (
              <div className="p-3.5 rounded-lg bg-neutral-950 border border-amber-500/30 text-neutral-300 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-400 font-medium">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>AI Generation Not Configured</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  AI Text-to-Video generation is disabled because no generation provider is configured. Configure{' '}
                  <code className="text-amber-300 bg-neutral-900 px-1 py-0.5 rounded">AI_MEDIA_GEN_API_KEY</code> to enable generative assets.
                </p>
              </div>
            )}

            {/* Loading Indicator */}
            {loadingMedia && (
              <div className="py-8 text-center text-neutral-500 flex flex-col items-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin text-orange-400" />
                <span>Searching real media assets...</span>
              </div>
            )}

            {/* Empty State */}
            {!loadingMedia && mediaItems.length === 0 && (
              <div className="py-8 text-center text-neutral-500 flex flex-col items-center gap-1.5">
                <Folder className="w-6 h-6 text-neutral-600" />
                <p className="font-medium text-neutral-400">No media assets found</p>
                <p className="text-[11px]">Upload media or index project source footage.</p>
              </div>
            )}

            {/* Media Items Grid */}
            {!loadingMedia &&
              mediaItems.map((item) => (
                <div
                  key={item.id}
                  className="p-2 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition flex flex-col gap-2 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-white truncate max-w-[190px]">
                      {item.media_type === 'VIDEO' ? (
                        <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {item.duration ? `${item.duration.toFixed(1)}s` : item.aspect_ratio || '9:16'}
                    </span>
                  </div>

                  {item.relevance_score !== undefined && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-orange-400 font-medium">
                        {item.relevance_score}% Relevance
                      </span>
                      {item.priority_source && (
                        <span className="text-neutral-400 capitalize">
                          {item.priority_source.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleInsertDirectAsset(item)}
                      className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium flex items-center justify-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Use this</span>
                    </button>
                    {item.preview_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
                        title="Preview Asset"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tab 2: AI B-ROLL OPPORTUNITIES */}
      {activeTab === 'broll' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Controls Bar */}
          <div className="p-3 border-b border-neutral-800 bg-neutral-950/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">B-Roll Pacing Style</span>
              <div className="flex items-center gap-1">
                {(['MINIMAL', 'BALANCED', 'DYNAMIC'] as BrollStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setBrollStyle(style)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                      brollStyle === style
                        ? 'bg-orange-500 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={isDetectingBroll}
              onClick={handleDetectBroll}
              className="w-full py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isDetectingBroll ? 'Detecting Moments...' : 'Detect & Plan B-Roll'}</span>
            </button>

            {brollMessage && (
              <div className="text-[10px] p-2 rounded bg-neutral-900 border border-neutral-800 text-orange-300">
                {brollMessage}
              </div>
            )}
          </div>

          {/* Opportunities / Suggestions List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
            {!brollPlan || brollPlan.suggestions.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 flex flex-col items-center gap-1.5">
                <Sparkles className="w-6 h-6 text-neutral-600" />
                <p className="font-medium text-neutral-400">No B-Roll Plan Generated Yet</p>
                <p className="text-[11px] max-w-[220px]">
                  Click "Detect & Plan B-Roll" to let Vireo analyze speech pacing, scene cuts, and topic changes.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-1">
                  <span className="font-medium text-neutral-400 text-[11px]">
                    {brollPlan.suggestions.length} Suggested Slots
                  </span>
                  <button
                    type="button"
                    disabled={isApplyingBroll}
                    onClick={() => handleApplyBrollPlan()}
                    className="text-[11px] font-medium text-orange-400 hover:text-orange-300"
                  >
                    {isApplyingBroll ? 'Applying...' : 'Apply All'}
                  </button>
                </div>

                {brollPlan.suggestions.map((sug, idx) => {
                  const opp = sug.opportunity;
                  const asset = sug.selected_asset;

                  return (
                    <div
                      key={sug.id || idx}
                      className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition flex flex-col gap-2"
                    >
                      {/* Interval & Concept Header */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-orange-400 font-semibold">
                          {opp
                            ? `${opp.start_time.toFixed(1)}s – ${opp.end_time.toFixed(1)}s`
                            : `${sug.suggested_timeline_start.toFixed(1)}s – ${sug.suggested_timeline_end.toFixed(1)}s`}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                          {sug.relevance_score}% Match
                        </span>
                      </div>

                      <div className="text-[11px] font-medium text-white truncate">
                        "{opp?.concept || asset?.title || 'Visual Context'}"
                      </div>

                      <p className="text-[10px] text-neutral-400 leading-relaxed">
                        {opp?.reason || sug.explanation.summary}
                      </p>

                      {/* Candidate Asset Info */}
                      {asset && (
                        <div className="p-1.5 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-between text-[10px]">
                          <span className="truncate max-w-[160px] text-neutral-300">{asset.title}</span>
                          <span className="text-neutral-400 font-mono">
                            {asset.duration ? `${asset.duration.toFixed(1)}s` : asset.aspect_ratio || '9:16'}
                          </span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          disabled={isApplyingBroll || sug.status === 'applied'}
                          onClick={() => handleApplyBrollPlan(sug.id)}
                          className={`flex-1 py-1 rounded font-medium flex items-center justify-center gap-1 transition ${
                            sug.status === 'applied'
                              ? 'bg-neutral-800 text-neutral-400 cursor-default'
                              : 'bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30'
                          }`}
                        >
                          <CheckCircle className="w-3 h-3" />
                          <span>{sug.status === 'applied' ? 'Applied' : 'Use this'}</span>
                        </button>
                        {asset?.preview_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewItem(asset)}
                            className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
                            title="Preview Asset"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: TRANSLATE & MULTILINGUAL DUBBING */}
      {activeTab === 'translate' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <TranslationWorkspace
            project={project}
            onRefreshProject={onRefreshProject}
          />
        </div>
      )}

      {/* Asset Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
              <span className="font-semibold text-white truncate">{previewItem.title}</span>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="aspect-[9/16] bg-black flex items-center justify-center max-h-[420px] overflow-hidden">
              {previewItem.media_type === 'IMAGE' ? (
                <img
                  src={previewItem.preview_url}
                  alt={previewItem.title}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={previewItem.source_url || previewItem.preview_url}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="p-3 flex items-center justify-between bg-neutral-950">
              <div className="text-[10px] text-neutral-400">
                {previewItem.license_type || 'User Owned'} · {previewItem.aspect_ratio || '9:16'}
              </div>
              <button
                type="button"
                onClick={() => {
                  handleInsertDirectAsset(previewItem);
                  setPreviewItem(null);
                }}
                className="px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Insert into Timeline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

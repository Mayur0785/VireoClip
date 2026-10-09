import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Copy,
  Check,
  Lock,
  Unlock,
  RefreshCw,
  Share2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Globe,
  Info,
  Edit2,
  Save,
  X,
  Tag,
  MessageSquare,
  Image as ImageIcon,
  Bookmark,
} from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { PublishModal } from '../PublishModal';
import {
  ContentPack,
  ContentPackItem,
  ContentPackItemType,
  ContentPackGenerationMode,
  ContentPackTemplate,
  OutputPlatform,
} from '../../types';
import { contentPackService } from '../../services/contentPackService';

export interface ContentPackWorkspaceProps {
  projectId: string;
  clipId: string;
  clipTitle?: string;
  clipDurationSeconds?: number;
  onClose?: () => void;
  onOpenHookLab?: (hookText?: string) => void;
  onOpenThumbnailLab?: () => void;
}

export const ContentPackWorkspace: React.FC<ContentPackWorkspaceProps> = ({
  projectId,
  clipId,
  clipTitle = 'Approved Clip',
  clipDurationSeconds = 30,
  onClose,
  onOpenHookLab,
  onOpenThumbnailLab,
}) => {

  const [pack, setPack] = useState<ContentPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter & Generation Controls
  const [selectedPlatform, setSelectedPlatform] = useState<OutputPlatform | 'all'>('all');
  const [generationMode, setGenerationMode] = useState<ContentPackGenerationMode>('BALANCED');
  const [selectedTemplate, setSelectedTemplate] = useState<ContentPackTemplate>('Creator');
  const [userInstruction, setUserInstruction] = useState('');
  const [translatingLanguage, setTranslatingLanguage] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  // Inline editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Publish Modal State
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishPayload, setPublishPayload] = useState<{
    title: string;
    caption: string;
    tags: string[];
    platform?: any;
  }>({ title: '', caption: '', tags: [] });

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPack();
  }, [projectId, clipId]);

  const loadPack = async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await contentPackService.listPacksForClip(projectId, clipId);
      if (existing && existing.length > 0) {
        const fullPack = await contentPackService.getContentPack(existing[0].id);
        setPack(fullPack);
      } else {
        setPack(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load content packs.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const newPack = await contentPackService.generateContentPack({
        projectId,
        clipId,
        mode: generationMode,
        template: selectedTemplate,
        platform: selectedPlatform !== 'all' ? selectedPlatform : undefined,
        user_instruction: userInstruction.trim() || undefined,
      });
      setPack(newPack);
    } catch (err: any) {
      setError(err.message || 'Failed to generate Content Pack.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleLock = async (item: ContentPackItem) => {
    if (!pack) return;
    try {
      const updated = await contentPackService.updateItem(pack.id, item.id, {
        locked: !item.locked,
      });
      setPack({
        ...pack,
        items: (pack.items || []).map((i) => (i.id === item.id ? updated : i)),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update lock.');
    }
  };

  const handleApproveItem = async (item: ContentPackItem) => {
    if (!pack) return;
    try {
      const updated = await contentPackService.updateItem(pack.id, item.id, {
        approved: true,
      });
      setPack({
        ...pack,
        items: (pack.items || []).map((i) => (i.id === item.id ? updated : i)),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to approve item.');
    }
  };

  const handleStartEdit = (item: ContentPackItem) => {
    setEditingItemId(item.id);
    setEditText(item.text);
  };

  const handleSaveEdit = async (item: ContentPackItem) => {
    if (!pack) return;
    try {
      const updated = await contentPackService.updateItem(pack.id, item.id, {
        text: editText.trim(),
      });
      setPack({
        ...pack,
        items: (pack.items || []).map((i) => (i.id === item.id ? updated : i)),
      });
      setEditingItemId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save edit.');
    }
  };

  const handleRegenerateItem = async (item: ContentPackItem) => {
    if (!pack) return;
    try {
      const updated = await contentPackService.regenerateItem(
        pack.id,
        item.id,
        userInstruction.trim() || undefined
      );
      setPack({
        ...pack,
        items: (pack.items || []).map((i) => (i.id === item.id ? updated : i)),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate item.');
    }
  };

  const handleRegeneratePack = async () => {
    if (!pack) return;
    setGenerating(true);
    try {
      const refreshed = await contentPackService.regeneratePack(
        pack.id,
        userInstruction.trim() || undefined
      );
      setPack(refreshed);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate pack.');
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveAll = async () => {
    if (!pack) return;
    try {
      const approved = await contentPackService.approvePack(pack.id);
      setPack(approved);
    } catch (err: any) {
      setError(err.message || 'Failed to approve pack.');
    }
  };

  const handleTranslate = async () => {
    if (!pack || !translatingLanguage.trim()) return;
    setIsTranslating(true);
    try {
      const translated = await contentPackService.translatePack(pack.id, translatingLanguage.trim());
      setPack(translated);
      setTranslatingLanguage('');
    } catch (err: any) {
      setError(err.message || 'Failed to translate pack.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleOpenPublish = (platformTarget: OutputPlatform = 'shorts') => {
    if (!pack || !pack.items) return;
    const items = pack.items;

    const findItem = (type: ContentPackItemType) => {
      return (
        items.find((i) => i.type === type && i.platform === platformTarget && i.approved) ||
        items.find((i) => i.type === type && i.platform === platformTarget) ||
        items.find((i) => i.type === type && i.approved) ||
        items.find((i) => i.type === type)
      );
    };

    const title = findItem('PRIMARY_TITLE')?.text || clipTitle;
    const caption = findItem('SHORT_CAPTION')?.text || findItem('LONG_CAPTION')?.text || '';
    const hashtagsText = findItem('HASHTAGS')?.text || '';
    const tags = hashtagsText
      .split(/\s+/)
      .map((t) => t.replace(/^#/, ''))
      .filter(Boolean);

    setPublishPayload({
      title,
      caption,
      tags,
      platform: platformTarget === 'shorts' ? 'youtube' : (platformTarget as any),
    });
    setPublishModalOpen(true);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Filter items by platform
  const items = (pack?.items || []).filter(
    (item) => selectedPlatform === 'all' || item.platform === 'all' || item.platform === selectedPlatform
  );

  const primaryTitle = items.find((i) => i.type === 'PRIMARY_TITLE');
  const altTitles = items.filter((i) => i.type === 'ALT_TITLE');
  const hooks = items.filter((i) => i.type === 'HOOK');
  const shortCaptions = items.filter((i) => i.type === 'SHORT_CAPTION');
  const longCaptions = items.filter((i) => i.type === 'LONG_CAPTION');
  const descriptions = items.filter((i) => i.type === 'SHORT_DESCRIPTION' || i.type === 'LONG_DESCRIPTION');
  const ctas = items.filter((i) => i.type === 'CTA');
  const hashtags = items.filter((i) => i.type === 'HASHTAGS');
  const keywords = items.filter((i) => i.type === 'KEYWORDS');
  const thumbnailDirection = items.find((i) => i.type === 'THUMBNAIL_DIRECTION');
  const thumbnailTexts = items.filter((i) => i.type === 'THUMBNAIL_TEXT');
  const altText = items.find((i) => i.type === 'ALT_TEXT');
  const pinnedComment = items.find((i) => i.type === 'PINNED_COMMENT');

  return (
    <div className="bg-background text-foreground rounded-2xl border border-border/70 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
      {/* Top Header */}
      <div className="p-5 border-b border-border/60 bg-card/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-xs">
            <Layers className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">Content Pack</h2>
              {pack && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                    pack.status === 'APPROVED'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {pack.status} (v{pack.version})
                </span>
              )}
              {pack?.brand_brain_id && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center gap-1 font-medium"
                  title="Grounded in Brand Brain DNA"
                >
                  <Sparkles className="size-3" /> Using Brand Brain
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {clipTitle} • {Math.round(clipDurationSeconds)}s • Source-Grounded Multi-Platform Package
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pack && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                onClick={handleApproveAll}
                disabled={pack.status === 'APPROVED'}
              >
                <CheckCircle2 className="size-3.5 mr-1" />
                {pack.status === 'APPROVED' ? 'Pack Approved' : 'Approve Pack'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-sage/60 bg-sage/10 text-sage hover:bg-sage hover:text-white"
                onClick={() => handleOpenPublish(selectedPlatform !== 'all' ? selectedPlatform : 'shorts')}
              >
                <Share2 className="size-3.5 mr-1" />
                Use in Publish
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleRegeneratePack}
                disabled={generating}
              >
                <RefreshCw className={`size-3.5 mr-1 ${generating ? 'animate-spin' : ''}`} />
                Regenerate Unlocked
              </Button>
            </>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Control Bar: Platform Selector + Generation Options */}
      <div className="px-5 py-3 border-b border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Platform Tabs */}
        <div className="flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/60">
          {(['all', 'shorts', 'youtube', 'instagram', 'tiktok', 'linkedin', 'x'] as const).map(
            (p) => (
              <button
                key={p}
                onClick={() => setSelectedPlatform(p)}
                className={`px-3 py-1 rounded-lg font-medium transition-all capitalize ${
                  selectedPlatform === p
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p === 'shorts' ? 'Shorts' : p}
              </button>
            )
          )}
        </div>

        {/* Templates & Mode Selection */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={generationMode}
            onChange={(e) => setGenerationMode(e.target.value as ContentPackGenerationMode)}
            className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs"
          >
            <option value="BALANCED">Balanced Pack</option>
            <option value="QUICK">Quick Pack</option>
            <option value="FULL">Full Pack</option>
          </select>

          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value as ContentPackTemplate)}
            className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs"
          >
            <option value="Creator">Template: Creator</option>
            <option value="Podcast">Template: Podcast</option>
            <option value="Education">Template: Education</option>
            <option value="Business">Template: Business</option>
            <option value="Interview">Template: Interview</option>
            <option value="Gaming">Template: Gaming</option>
            <option value="Vlog">Template: Vlog</option>
          </select>
        </div>
      </div>

      {/* User Instruction Bar */}
      <div className="px-5 py-2.5 border-b border-border/40 bg-card/30 flex items-center gap-3">
        <Input
          placeholder="User instruction (e.g. 'Make titles punchier', 'Target LinkedIn professionals', 'No emojis')..."
          value={userInstruction}
          onChange={(e) => setUserInstruction(e.target.value)}
          className="text-xs h-8 bg-background/60"
        />
        {!pack ? (
          <Button
            variant="clay"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
            className="shrink-0 text-xs"
          >
            <Sparkles className={`size-3.5 mr-1.5 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Content Pack'}
          </Button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Input
              placeholder="Translate to (e.g. Spanish, German)..."
              value={translatingLanguage}
              onChange={(e) => setTranslatingLanguage(e.target.value)}
              className="text-xs h-8 w-44 bg-background/60"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleTranslate}
              disabled={isTranslating || !translatingLanguage.trim()}
              className="text-xs"
            >
              <Globe className="size-3.5 mr-1" />
              {isTranslating ? 'Translating...' : 'Translate'}
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="size-8 animate-spin mx-auto text-purple-400" />
            <p className="text-sm text-muted-foreground">Loading Content Pack...</p>
          </div>
        ) : !pack ? (
          <div className="py-16 text-center space-y-4 max-w-md mx-auto">
            <div className="size-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 mx-auto flex items-center justify-center">
              <Sparkles className="size-8" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Turn this clip into a complete Publishing Pack</h3>
              <p className="text-xs text-muted-foreground mt-1">
                One video creates source-grounded titles, hook variants, social copy, descriptions, CTAs, hashtags, and thumbnail creative direction tailored to each platform.
              </p>
            </div>
            <Button
              variant="clay"
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs px-5 py-2 shadow-clay"
            >
              <Sparkles className={`size-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Crafting Content Pack...' : 'Generate Content Pack Now'}
            </Button>
          </div>
        ) : (
          <>
            {/* Summary Metrics Bar */}
            <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-purple-300 font-medium">
                <Bookmark className="size-4 text-purple-400" />
                <span>Pack Breakdown:</span>
                <span className="text-muted-foreground font-normal">
                  {altTitles.length + (primaryTitle ? 1 : 0)} titles • {hooks.length} hooks •{' '}
                  {shortCaptions.length + longCaptions.length} captions • {ctas.length} CTAs •{' '}
                  {thumbnailTexts.length} thumbnail text ideas
                </span>
              </div>
              <div className="text-muted-foreground">
                Locked: {(pack.items || []).filter((i) => i.locked).length} • Approved:{' '}
                {(pack.items || []).filter((i) => i.approved).length}
              </div>
            </div>

            {/* 1. PRIMARY & ALTERNATIVE TITLES */}
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
              <div
                className="px-4 py-3 bg-muted/30 border-b border-border/50 flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('titles')}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Titles</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    {altTitles.length + (primaryTitle ? 1 : 0)} variants
                  </span>
                </div>
                {collapsedSections['titles'] ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </div>

              {!collapsedSections['titles'] && (
                <div className="p-4 space-y-3">
                  {/* Recommended Primary Title */}
                  {primaryTitle && (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-400 tracking-wider uppercase flex items-center gap-1">
                          <Sparkles className="size-3" /> Recommended Primary Title
                        </span>
                        <div className="flex items-center gap-1.5">
                          {renderItemActions(primaryTitle)}
                        </div>
                      </div>
                      {renderItemBody(primaryTitle)}
                    </div>
                  )}

                  {/* Alternative Titles */}
                  {altTitles.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Alternative Angles
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {altTitles.map((alt) => (
                          <div
                            key={alt.id}
                            className="p-3 rounded-lg border border-border/60 bg-background/50 hover:bg-background transition-colors space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {alt.explanation || `Variant ${alt.variant_index}`}
                              </span>
                              <div className="flex items-center gap-1">
                                {renderItemActions(alt)}
                              </div>
                            </div>
                            {renderItemBody(alt)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. HOOK VARIANTS */}
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
              <div
                className="px-4 py-3 bg-muted/30 border-b border-border/50 flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('hooks')}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Hook Variants</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                    {hooks.length} options
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (Supporting variants for clip opening)
                  </span>
                </div>
                {collapsedSections['hooks'] ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </div>

              {!collapsedSections['hooks'] && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {hooks.map((hook, idx) => (
                    <div
                      key={hook.id}
                      className="p-3.5 rounded-xl border border-border/60 bg-background/50 space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-400">
                            Hook {idx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            {renderItemActions(hook)}
                          </div>
                        </div>
                        {renderItemBody(hook)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. CAPTIONS & DESCRIPTIONS */}
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
              <div
                className="px-4 py-3 bg-muted/30 border-b border-border/50 flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('captions')}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Captions & Descriptions</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Social Copy
                  </span>
                </div>
                {collapsedSections['captions'] ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </div>

              {!collapsedSections['captions'] && (
                <div className="p-4 space-y-4">
                  {/* Short Captions */}
                  {shortCaptions.map((sc) => (
                    <div key={sc.id} className="p-3.5 rounded-xl border border-border/60 bg-background/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-400">
                          Short Social Caption (Shorts / Reels / TikTok)
                        </span>
                        <div className="flex items-center gap-1.5">
                          {renderItemActions(sc)}
                        </div>
                      </div>
                      {renderItemBody(sc)}
                    </div>
                  ))}

                  {/* Long Captions */}
                  {longCaptions.map((lc) => (
                    <div key={lc.id} className="p-3.5 rounded-xl border border-border/60 bg-background/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-400">
                          Long Context Caption (LinkedIn / Long Posts)
                        </span>
                        <div className="flex items-center gap-1.5">
                          {renderItemActions(lc)}
                        </div>
                      </div>
                      {renderItemBody(lc)}
                    </div>
                  ))}

                  {/* Descriptions */}
                  {descriptions.map((desc) => (
                    <div key={desc.id} className="p-3.5 rounded-xl border border-border/60 bg-background/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {desc.type === 'LONG_DESCRIPTION' ? 'Full Video Description' : 'Summary Description'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {renderItemActions(desc)}
                        </div>
                      </div>
                      {renderItemBody(desc)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. CTAs, HASHTAGS & KEYWORDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CTAs */}
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageSquare className="size-4 text-purple-400" /> Call to Action (CTA)
                  </span>
                </div>
                <div className="space-y-2">
                  {ctas.map((cta) => (
                    <div key={cta.id} className="p-2.5 rounded-lg border border-border/60 bg-background/50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">Option</span>
                        <div className="flex items-center gap-1">{renderItemActions(cta)}</div>
                      </div>
                      {renderItemBody(cta)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hashtags */}
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Tag className="size-4 text-blue-400" /> Hashtag Set
                  </span>
                </div>
                <div className="space-y-2">
                  {hashtags.map((ht) => (
                    <div key={ht.id} className="p-2.5 rounded-lg border border-border/60 bg-background/50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">Tags</span>
                        <div className="flex items-center gap-1">{renderItemActions(ht)}</div>
                      </div>
                      {renderItemBody(ht)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Keywords / Topics */}
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Bookmark className="size-4 text-amber-400" /> Topics & Keywords
                  </span>
                </div>
                <div className="space-y-2">
                  {keywords.map((kw) => (
                    <div key={kw.id} className="p-2.5 rounded-lg border border-border/60 bg-background/50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">Extracted Topics</span>
                        <div className="flex items-center gap-1">{renderItemActions(kw)}</div>
                      </div>
                      {renderItemBody(kw)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. THUMBNAIL CREATIVE DIRECTION */}
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
              <div
                className="px-4 py-3 bg-muted/30 border-b border-border/50 flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('thumbnail')}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm flex items-center gap-1.5">
                    <ImageIcon className="size-4 text-rose-400" /> Thumbnail Creative Direction
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (Visual brief & headline text)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenThumbnailLab && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenThumbnailLab();
                      }}
                      className="text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/10 h-7 px-2.5 flex items-center gap-1"
                    >
                      <ImageIcon className="size-3" />
                      Open in Thumbnail Lab
                    </Button>
                  )}
                  {collapsedSections['thumbnail'] ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                </div>
              </div>


              {!collapsedSections['thumbnail'] && (
                <div className="p-4 space-y-4">
                  {thumbnailDirection && (
                    <div className="p-3.5 rounded-xl border border-border/60 bg-background/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-rose-400">
                          Textual Visual Brief (Framing, Mood, Focal Point)
                        </span>
                        <div className="flex items-center gap-1.5">{renderItemActions(thumbnailDirection)}</div>
                      </div>
                      {renderItemBody(thumbnailDirection)}
                    </div>
                  )}

                  {thumbnailTexts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        High-Contrast Cover Headline Options (2–5 words)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        {thumbnailTexts.map((tt, idx) => (
                          <div key={tt.id} className="p-3 rounded-lg border border-border/60 bg-background/50 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-muted-foreground">Text {idx + 1}</span>
                              <div className="flex items-center gap-1">{renderItemActions(tt)}</div>
                            </div>
                            {renderItemBody(tt)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {altText && (
                    <div className="p-3 rounded-xl border border-border/60 bg-background/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Accessibility Alt-Text
                        </span>
                        <div className="flex items-center gap-1.5">{renderItemActions(altText)}</div>
                      </div>
                      {renderItemBody(altText)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. PINNED COMMENT */}
            {pinnedComment && (
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageSquare className="size-4 text-cyan-400" /> Pinned Comment Prompt
                  </span>
                  <div className="flex items-center gap-1.5">{renderItemActions(pinnedComment)}</div>
                </div>
                {renderItemBody(pinnedComment)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Publish Handoff Modal */}
      {publishModalOpen && (
        <PublishModal
          isOpen={publishModalOpen}
          onClose={() => setPublishModalOpen(false)}
          projectId={projectId}
          clipId={clipId}
          initialTitle={publishPayload.title}
          initialCaption={publishPayload.caption}
          initialTags={publishPayload.tags}
          initialPlatform={publishPayload.platform}
        />
      )}
    </div>
  );

  // Helper renderers
  function renderItemActions(item: ContentPackItem) {
    const isEditing = editingItemId === item.id;
    return (
      <>
        {item.approved && (
          <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 font-semibold border border-emerald-500/20">
            Approved
          </span>
        )}
        <button
          onClick={() => handleCopy(item.text, item.id)}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Copy text"
        >
          {copiedId === item.id ? (
            <Check className="size-3.5 text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
        {onOpenHookLab && item.type === 'HOOK' && (
          <button
            onClick={() => onOpenHookLab(item.text)}
            className="p-1 rounded text-amber-400 hover:text-amber-300 transition-colors"
            title="Open in Hook Lab"
          >
            <Sparkles className="size-3.5" />
          </button>
        )}
        <button
          onClick={() => handleToggleLock(item)}
          className={`p-1 rounded transition-colors ${
            item.locked ? 'text-amber-400' : 'text-muted-foreground hover:text-foreground'
          }`}
          title={item.locked ? 'Locked (survives regenerations)' : 'Lock item'}
        >
          {item.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </button>
        {!item.locked && (
          <button
            onClick={() => handleRegenerateItem(item)}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Regenerate this item"
          >
            <RefreshCw className="size-3.5" />
          </button>
        )}
        {!isEditing ? (
          <button
            onClick={() => handleStartEdit(item)}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Edit text"
          >
            <Edit2 className="size-3.5" />
          </button>
        ) : (
          <button
            onClick={() => handleSaveEdit(item)}
            className="p-1 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
            title="Save edit"
          >
            <Save className="size-3.5" />
          </button>
        )}
        {!item.approved && (
          <button
            onClick={() => handleApproveItem(item)}
            className="p-1 rounded text-muted-foreground hover:text-emerald-400 transition-colors"
            title="Approve item"
          >
            <CheckCircle2 className="size-3.5" />
          </button>
        )}
      </>
    );
  }

  function renderItemBody(item: ContentPackItem) {
    const isEditing = editingItemId === item.id;

    return (
      <div className="space-y-1.5">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="text-xs bg-background min-h-[60px]"
            />
            <Button size="sm" variant="outline" onClick={() => setEditingItemId(null)} className="h-8 px-2">
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <p className="text-xs font-normal leading-relaxed whitespace-pre-wrap select-text">
            {item.text}
          </p>
        )}

        {/* Validation warnings / Claim guard alerts */}
        {item.validation_warnings && item.validation_warnings.length > 0 && (
          <div className="text-[11px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 flex items-center gap-1.5">
            <AlertTriangle className="size-3 shrink-0" />
            <span>{item.validation_warnings.join(' • ')}</span>
          </div>
        )}

        {/* Explanation / Grounding Evidence */}
        {item.explanation && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="size-2.5" />
            <span>{item.explanation}</span>
          </div>
        )}
      </div>
    );
  }
};

export default ContentPackWorkspace;

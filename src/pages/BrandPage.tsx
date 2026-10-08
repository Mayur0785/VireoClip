import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Palette,
  Mic,
  Subtitles,
  Film,
  Brain,
  History,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Upload,
  Shield,
} from 'lucide-react';
import { brandBrainService } from '../services/brandBrainService';
import {
  BrandBrainProfile,
  BrandBrainVersion,
  BrandEvidence,
  BrandCheckResult,
  BrandRecommendation,
  SAFE_EDITOR_FONTS,
} from '../types';

export const BrandPage: React.FC = () => {
  const [profile, setProfile] = useState<BrandBrainProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'voice' | 'visual' | 'captions' | 'hooks_cta' | 'editing_audio' | 'learned' | 'check' | 'versions' | 'import'
  >('overview');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Extra state for sub-features
  const [evidenceList, setEvidenceList] = useState<BrandEvidence[]>([]);
  const [versions, setVersions] = useState<BrandBrainVersion[]>([]);
  const [recommendations, setRecommendations] = useState<BrandRecommendation[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [analyticsStatus, setAnalyticsStatus] = useState<string>('INSUFFICIENT_DATA');

  // Brand Check State
  const [checkText, setCheckText] = useState('');
  const [checkResult, setCheckResult] = useState<BrandCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Import guidelines state
  const [guidelinesText, setGuidelinesText] = useState('');
  const [importedDraft, setImportedDraft] = useState<any | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Fast Onboarding modal
  const [showWizard, setShowWizard] = useState(false);
  const [wizardData, setWizardData] = useState({
    brand_name: '',
    industry: '',
    tone: 'conversational',
    primary_color: '#3B82F6',
    font: 'Inter',
    caption_style: 'active_word_pop',
    pacing_style: 'fast' as const,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await brandBrainService.getProfile();
      setProfile(data);

      // Load supporting data in parallel
      const [ev, vers, recs] = await Promise.all([
        brandBrainService.getEvidence(data.id),
        brandBrainService.getVersions(data.id),
        brandBrainService.getRecommendations(data.id),
      ]);
      setEvidenceList(ev);
      setVersions(vers);
      setRecommendations(recs.recommendations || []);
      setConflicts(recs.conflicts || []);
      setAnalyticsStatus(recs.analytics_status || 'INSUFFICIENT_DATA');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load Brand Brain profile.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleLock = async (ruleKey: string) => {
    if (!profile) return;
    try {
      const isCurrentlyLocked = profile.locks?.[ruleKey] === true;
      const updated = await brandBrainService.setLock(ruleKey, !isCurrentlyLocked, profile.id);
      setProfile(updated);
      setFeedback({
        type: 'success',
        message: !isCurrentlyLocked ? `Locked rule: ${ruleKey}` : `Unlocked rule: ${ruleKey}`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update rule lock.' });
    }
  };

  const handleResetLearned = async () => {
    if (!profile) return;
    if (!window.confirm('Reset all learned intelligence preferences back to default? Explicit and locked brand settings will NOT be touched.')) {
      return;
    }
    try {
      const updated = await brandBrainService.resetLearned(profile.id);
      setProfile(updated);
      setFeedback({ type: 'success', message: 'Learned intelligence layer reset successfully.' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reset learned layer.' });
    }
  };

  const handleRunCheck = async () => {
    if (!profile) return;
    try {
      setIsChecking(true);
      const result = await brandBrainService.checkCompliance(
        {
          text: checkText,
          fonts: [profile.visual.fonts[0] || 'Inter'],
          colors: [profile.visual.primary_colors[0] || '#3B82F6'],
          caption_style: profile.captions.default_style,
          pacing_style: profile.editing.pacing_style,
        },
        profile.id
      );
      setCheckResult(result);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Check failed.' });
    } finally {
      setIsChecking(false);
    }
  };

  const handleParseGuidelines = async () => {
    try {
      setIsParsing(true);
      const draft = await brandBrainService.parseGuidelines(guidelinesText);
      setImportedDraft(draft);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to parse guidelines.' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!profile || !importedDraft) return;
    try {
      setSaving(true);
      const updates: any = {};
      if (importedDraft.detected_brand_name) {
        updates.identity = { brand_name: importedDraft.detected_brand_name };
      }
      if (importedDraft.detected_colors?.length > 0) {
        updates.visual = { primary_colors: importedDraft.detected_colors };
      }
      if (importedDraft.detected_tones?.length > 0) {
        updates.voice = { tones: importedDraft.detected_tones };
      }
      if (importedDraft.detected_avoid_phrases?.length > 0) {
        updates.voice = { ...updates.voice, avoid_phrasing: importedDraft.detected_avoid_phrases };
      }

      const updated = await brandBrainService.updateProfile(updates, profile.id);
      setProfile(updated);
      setImportedDraft(null);
      setGuidelinesText('');
      setFeedback({ type: 'success', message: 'Imported guidelines saved to Brand Brain!' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply import.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreVersion = async (versionNum: number) => {
    if (!profile) return;
    if (!window.confirm(`Restore Brand Brain version ${versionNum}? Current settings will be snapshotted in version history.`)) {
      return;
    }
    try {
      const restored = await brandBrainService.restoreVersion(versionNum, profile.id);
      setProfile(restored);
      setFeedback({ type: 'success', message: `Restored version ${versionNum} successfully.` });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to restore version.' });
    }
  };

  const handleSaveProfile = async (updates: Partial<BrandBrainProfile>) => {
    if (!profile) return;
    try {
      setSaving(true);
      const updated = await brandBrainService.updateProfile(updates, profile.id);
      setProfile(updated);
      setFeedback({ type: 'success', message: 'Brand Brain updated successfully.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteWizard = async () => {
    if (!profile) return;
    try {
      setSaving(true);
      const updated = await brandBrainService.updateProfile(
        {
          identity: {
            brand_name: wizardData.brand_name || profile.identity.brand_name,
            industry: wizardData.industry || profile.identity.industry,
          },
          voice: {
            ...profile.voice,
            tones: [wizardData.tone],
          },
          visual: {
            ...profile.visual,
            primary_colors: [wizardData.primary_color],
            fonts: [wizardData.font],
          },
          captions: {
            ...profile.captions,
            default_style: wizardData.caption_style,
          },
          editing: {
            ...profile.editing,
            pacing_style: wizardData.pacing_style,
          },
        },
        profile.id
      );
      setProfile(updated);
      setShowWizard(false);
      setFeedback({ type: 'success', message: 'Brand Brain setup complete!' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Setup wizard failed.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Brain className="size-8 animate-pulse text-vireo-green" />
          <p className="text-sm font-medium text-muted-foreground">Loading Vireo Brand Brain...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-r from-forest via-[#1b3d2b] to-[#12261b] p-8 text-white shadow-xl md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-vireo-green/20 backdrop-blur-md">
              <Brain className="size-6 text-vireo-green" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vireo Brand Brain</h1>
              <p className="text-xs text-emerald-200/80">Persistent Brand Memory, Creator Voice & Visual Identity</p>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Advisory brand intelligence powering your Producer plans, Pro Editor timeline, Captions, B-Roll, and Multilingual Dubbing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 rounded-xl bg-vireo-green px-4 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-emerald-600"
          >
            <Sparkles className="size-4" />
            Fast Setup Wizard
          </button>
          <button
            onClick={handleResetLearned}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-white/20"
          >
            <RotateCcw className="size-4" />
            Reset Learned Layer
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-6 flex items-center justify-between rounded-xl p-4 text-sm ${
            feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-2 text-sm font-medium">
        {[
          { id: 'overview', label: 'Overview', icon: Brain },
          { id: 'voice', label: 'Creator Voice', icon: Mic },
          { id: 'visual', label: 'Visual System', icon: Palette },
          { id: 'captions', label: 'Captions DNA', icon: Subtitles },
          { id: 'hooks_cta', label: 'Hooks & CTA', icon: Sparkles },
          { id: 'editing_audio', label: 'Editing & Audio', icon: Film },
          { id: 'learned', label: 'Learned Intelligence', icon: CheckCircle2 },
          { id: 'check', label: 'Brand Check', icon: Shield },
          { id: 'versions', label: 'Version History', icon: History },
          { id: 'import', label: 'Import Guidelines', icon: Upload },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 transition ${
              activeTab === tab.id
                ? 'bg-[#eaf3eb] text-vireo-green font-semibold shadow-2xs'
                : 'text-muted-foreground hover:bg-cream hover:text-foreground'
            }`}
          >
            <tab.icon className="size-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-6 shadow-xs lg:col-span-2">
            <h2 className="text-lg font-bold text-foreground">Brand Identity Summary</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Brand Name</label>
                <p className="text-base font-semibold text-foreground">{profile.identity.brand_name || 'Not set'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Industry / Niche</label>
                <p className="text-base font-semibold text-foreground">{profile.identity.industry || 'General'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Primary Palette</label>
                <div className="mt-1 flex items-center gap-2">
                  {profile.visual.primary_colors.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs font-mono">
                      <span className="size-3.5 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Primary Brand Font</label>
                <p className="text-base font-semibold text-foreground">{profile.visual.fonts[0] || 'Inter'}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground">Core Writing Tone</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.voice.tones.map((t, idx) => (
                  <span key={idx} className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-6 shadow-xs">
            <h2 className="text-lg font-bold text-foreground">Governance & Learning</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs text-muted-foreground">Profile Version</span>
                <span className="rounded-md bg-cream px-2 py-1 text-xs font-bold text-foreground">v{profile.version}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs text-muted-foreground">Evidence Records</span>
                <span className="text-xs font-semibold text-foreground">{profile.learning.evidence_count} events recorded</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs text-muted-foreground">Locked Brand Rules</span>
                <span className="text-xs font-semibold text-emerald-600">
                  {Object.values(profile.locks || {}).filter(Boolean).length} rules locked
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Performance Signals</span>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  {analyticsStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Explainable Recommendations */}
          {recommendations.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-6 shadow-xs lg:col-span-3">
              <h3 className="text-sm font-bold text-foreground">Explainable Brand Recommendations</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recommendations.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{r.title}</span>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {r.confidence}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                    <p className="mt-2 text-[11px] font-mono text-gray-500">Evidence: {r.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-xs lg:col-span-3">
              <h3 className="text-sm font-bold text-amber-900">Performance Divergence & Conflict Resolution</h3>
              <div className="mt-3 space-y-3">
                {conflicts.map((c, i) => (
                  <div key={i} className="rounded-xl border border-amber-300 bg-white p-4">
                    <p className="text-xs font-medium text-foreground">{c.message}</p>
                    <p className="mt-2 text-xs font-semibold text-amber-700">{c.action_prompt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Voice */}
      {activeTab === 'voice' && (
        <div className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Creator Voice & Terminology</h2>
              <p className="text-xs text-muted-foreground">Defines how AI writes hooks, scripts, and captions.</p>
            </div>
            <button
              onClick={() => handleToggleLock('voice.avoid_phrasing')}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-cream"
            >
              {profile.locks['voice.avoid_phrasing'] ? (
                <>
                  <Lock className="size-3.5 text-emerald-600" /> Locked Avoid Phrasing
                </>
              ) : (
                <>
                  <Unlock className="size-3.5 text-muted-foreground" /> Unlocked
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Preferred Phrasing / Signatures</label>
              <textarea
                rows={4}
                className="mt-2 w-full rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-vireo-green"
                value={profile.voice.preferred_phrasing.join('\n')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    voice: { ...profile.voice, preferred_phrasing: e.target.value.split('\n').filter(Boolean) },
                  })
                }
                placeholder="Enter one preferred phrase per line..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Prohibited / Avoid Phrasing</label>
              <textarea
                rows={4}
                className="mt-2 w-full rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-vireo-green"
                value={profile.voice.avoid_phrasing.join('\n')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    voice: { ...profile.voice, avoid_phrasing: e.target.value.split('\n').filter(Boolean) },
                  })
                }
                placeholder="Enter prohibited phrases that Vireo should never generate..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => handleSaveProfile({ voice: profile.voice })}
              disabled={saving}
              className="rounded-xl bg-vireo-green px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-600"
            >
              {saving ? 'Saving...' : 'Save Voice Rules'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Visual */}
      {activeTab === 'visual' && (
        <div className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Visual Identity & Colors</h2>
              <p className="text-xs text-muted-foreground">Palettes and allowlisted typography for Pro Editor & renders.</p>
            </div>
            <button
              onClick={() => handleToggleLock('visual.primary_colors')}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-cream"
            >
              {profile.locks['visual.primary_colors'] ? (
                <>
                  <Lock className="size-3.5 text-emerald-600" /> Locked Palette
                </>
              ) : (
                <>
                  <Unlock className="size-3.5 text-muted-foreground" /> Unlocked
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Primary Accent Color (Hex)</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  className="size-10 cursor-pointer rounded-lg border border-border p-1"
                  value={profile.visual.accent_colors[0] || '#10B981'}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      visual: { ...profile.visual, accent_colors: [e.target.value] },
                    })
                  }
                />
                <input
                  type="text"
                  className="w-32 rounded-lg border border-border px-3 py-2 text-sm font-mono"
                  value={profile.visual.accent_colors[0] || '#10B981'}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      visual: { ...profile.visual, accent_colors: [e.target.value] },
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Safe Editor Font</label>
              <select
                className="mt-2 w-full rounded-xl border border-border p-2.5 text-sm"
                value={profile.visual.fonts[0] || 'Inter'}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    visual: { ...profile.visual, fonts: [e.target.value] },
                  })
                }
              >
                {SAFE_EDITOR_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => handleSaveProfile({ visual: profile.visual })}
              disabled={saving}
              className="rounded-xl bg-vireo-green px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-600"
            >
              {saving ? 'Saving...' : 'Save Visual Rules'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Learned Intelligence */}
      {activeTab === 'learned' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">Vireo Has Learned</h2>
                <p className="text-xs text-muted-foreground">
                  Observed only from your approved video exports and finalized Producer plans.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {evidenceList.length} evidence records
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {evidenceList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No approved projects recorded yet. As you edit and export videos, Vireo will organically learn your editing and caption style here.
                </div>
              ) : (
                evidenceList.slice(0, 10).map((ev) => (
                  <div key={ev.id} className="flex flex-col justify-between gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-cream px-2 py-0.5 text-xs font-bold uppercase text-foreground">
                          {ev.dimension}
                        </span>
                        <span className="text-xs text-muted-foreground">Source: {ev.source_type}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">{JSON.stringify(ev.value)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ev.confidence === 'HIGH'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ev.confidence === 'MEDIUM'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        Confidence: {ev.confidence}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Brand Check & Compliance */}
      {activeTab === 'check' && (
        <div className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-xs">
          <div>
            <h2 className="text-lg font-bold text-foreground">Brand Check & Compliance Test</h2>
            <p className="text-xs text-muted-foreground">
              Test copy or video transcripts against brand avoid phrasing, typography, and tone governance.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">Content Text / Script to Evaluate</label>
            <textarea
              rows={4}
              className="mt-2 w-full rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-vireo-green"
              value={checkText}
              onChange={(e) => setCheckText(e.target.value)}
              placeholder="Paste video hook, transcript, or caption text here..."
            />
          </div>

          <button
            onClick={handleRunCheck}
            disabled={isChecking || !checkText}
            className="rounded-xl bg-vireo-green px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-600 disabled:opacity-50"
          >
            {isChecking ? 'Evaluating...' : 'Run Compliance Check'}
          </button>

          {checkResult && (
            <div className="mt-6 rounded-2xl border border-border bg-cream/40 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Deterministic Brand Match</h3>
                  <p className="text-xs text-muted-foreground">Strict evaluation of brand alignment</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-extrabold text-vireo-green">{checkResult.score}</span>
                  <span className="text-xs text-muted-foreground"> / 100</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {Object.entries(checkResult.match_breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg bg-white p-3 text-xs">
                    <span className="font-semibold uppercase text-muted-foreground">{key}</span>
                    <span className={val.matched ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                      {val.details}
                    </span>
                  </div>
                ))}
              </div>

              {checkResult.warnings.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  <h4 className="text-xs font-bold uppercase text-red-600">Warnings Detected</h4>
                  {checkResult.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-red-700">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>[{w.rule}]: {w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Version History */}
      {activeTab === 'versions' && (
        <div className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-xs">
          <div>
            <h2 className="text-lg font-bold text-foreground">Brand Brain Version History</h2>
            <p className="text-xs text-muted-foreground">Every setting change is snapshotted and reversible.</p>
          </div>

          <div className="space-y-3">
            {versions.map((ver) => (
              <div key={ver.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-cream px-2 py-0.5 text-xs font-bold text-foreground">
                      v{ver.version}
                    </span>
                    <span className="text-xs font-medium text-foreground">{ver.change_summary}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(ver.created_at).toLocaleString()} • Source: {ver.source}
                  </p>
                </div>
                <button
                  onClick={() => handleRestoreVersion(ver.version)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-cream"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Import Guidelines */}
      {activeTab === 'import' && (
        <div className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-xs">
          <div>
            <h2 className="text-lg font-bold text-foreground">Brand Guidelines Document Import</h2>
            <p className="text-xs text-muted-foreground">
              Paste public brand guideline text or style guides. Text is processed strictly as data with prompt injection defense.
            </p>
          </div>

          <textarea
            rows={6}
            className="w-full rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-vireo-green"
            value={guidelinesText}
            onChange={(e) => setGuidelinesText(e.target.value)}
            placeholder="Paste brand guidelines, tone rules, brand colors (#HEX), or banned phrases..."
          />

          <button
            onClick={handleParseGuidelines}
            disabled={isParsing || !guidelinesText}
            className="rounded-xl bg-vireo-green px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-600 disabled:opacity-50"
          >
            {isParsing ? 'Parsing...' : 'Analyze Document'}
          </button>

          {importedDraft && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
              <h3 className="text-sm font-bold text-emerald-900">Detected Guidelines Draft</h3>
              <p className="text-xs text-emerald-700">{importedDraft.review_notice}</p>

              <div className="mt-4 space-y-2 text-xs">
                {importedDraft.detected_brand_name && (
                  <div>
                    <strong>Name:</strong> {importedDraft.detected_brand_name}
                  </div>
                )}
                {importedDraft.detected_colors?.length > 0 && (
                  <div>
                    <strong>Colors:</strong> {importedDraft.detected_colors.join(', ')}
                  </div>
                )}
                {importedDraft.detected_tones?.length > 0 && (
                  <div>
                    <strong>Tones:</strong> {importedDraft.detected_tones.join(', ')}
                  </div>
                )}
                {importedDraft.detected_avoid_phrases?.length > 0 && (
                  <div>
                    <strong>Avoid phrases:</strong> {importedDraft.detected_avoid_phrases.join(', ')}
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleConfirmImport}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
                >
                  Confirm & Apply to Brand Brain
                </button>
                <button
                  onClick={() => setImportedDraft(null)}
                  className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium text-foreground hover:bg-cream"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAST SETUP WIZARD MODAL */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-vireo-green" />
                <h3 className="text-base font-bold text-foreground">Fast Brand Setup Wizard</h3>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="py-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground">Brand Name</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-border p-2.5 text-sm"
                  value={wizardData.brand_name}
                  onChange={(e) => setWizardData({ ...wizardData, brand_name: e.target.value })}
                  placeholder="e.g. Acme Studio"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">What do you create? (Industry / Niche)</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-border p-2.5 text-sm"
                  value={wizardData.industry}
                  onChange={(e) => setWizardData({ ...wizardData, industry: e.target.value })}
                  placeholder="e.g. AI Engineering, Tech Tutorials, Fitness..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Primary Brand Color</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="color"
                    className="size-10 cursor-pointer rounded-lg border border-border p-1"
                    value={wizardData.primary_color}
                    onChange={(e) => setWizardData({ ...wizardData, primary_color: e.target.value })}
                  />
                  <input
                    type="text"
                    className="w-32 rounded-lg border border-border px-3 py-2 text-sm font-mono"
                    value={wizardData.primary_color}
                    onChange={(e) => setWizardData({ ...wizardData, primary_color: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Pacing Preference</label>
                <select
                  className="mt-1 w-full rounded-xl border border-border p-2.5 text-sm"
                  value={wizardData.pacing_style}
                  onChange={(e) => setWizardData({ ...wizardData, pacing_style: e.target.value as any })}
                >
                  <option value="fast">Fast & punchy (TikTok / Shorts)</option>
                  <option value="balanced">Balanced & natural</option>
                  <option value="slow">Deliberate & educational</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setShowWizard(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-cream"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteWizard}
                disabled={saving}
                className="rounded-xl bg-vireo-green px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-600"
              >
                {saving ? 'Completing...' : 'Finish Setup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

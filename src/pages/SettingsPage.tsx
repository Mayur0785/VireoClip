import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Sparkles,
  ShieldAlert,
  Link as LinkIcon,
  Check,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { backendRequest } from '../services/backendClient';
import { projectService } from '../services/projectService';
import { SpotlightCard } from '../components/react-bits/SpotlightCard';
import { ShinyButton } from '../components/react-bits/ShinyButton';
import { AmbientBackdrop } from '../components/react-bits/AmbientBackdrop';

const LANGUAGES = [
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Arabic',
  'Japanese',
];

const TONES = [
  'Friendly',
  'Professional',
  'Witty',
  'Bold',
  'Inspirational',
  'Educational',
  'Custom',
];

const HOOK_STYLES = [
  'Curiosity-driven hooks',
  'Problem-first hooks',
  'Contrarian / bold take hooks',
  'Story & experience hooks',
  'Data & insight hooks',
];

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    profile: authProfile,
    creatorProfile: authCreator,
    refreshProfile,
    signOut,
    isConfigured,
  } = useAuth();

  // Section A: Creator Identity
  const [fullName, setFullName] = useState(authProfile?.full_name || '');
  const [niche, setNiche] = useState(authCreator?.niche || '');
  const [audience, setAudience] = useState(authCreator?.target_audience || '');

  // Section B: Content Style
  const [language, setLanguage] = useState(authCreator?.language || 'English');
  const [tone, setTone] = useState(authCreator?.tone || 'Friendly');
  const [customTone, setCustomTone] = useState(authCreator?.custom_tone || '');
  const [preferredHookStyle, setPreferredHookStyle] = useState(authCreator?.preferred_hook_style || '');

  // Section C: Brand Rules
  const [brandRules, setBrandRules] = useState(authCreator?.brand_rules || '');
  const [forbiddenPhrases, setForbiddenPhrases] = useState(authCreator?.forbidden_phrases || '');

  // Section D: Links & CTAs
  const [websiteUrl, setWebsiteUrl] = useState(authCreator?.website_url || '');
  const [newsletterUrl, setNewsletterUrl] = useState(authCreator?.newsletter_url || '');
  const [podcastUrl, setPodcastUrl] = useState(authCreator?.podcast_url || '');
  const [youtubeCta, setYoutubeCta] = useState(authCreator?.youtube_cta || '');
  const [instagramCta, setInstagramCta] = useState(authCreator?.instagram_cta || '');
  const [linkedinCta, setLinkedinCta] = useState(authCreator?.linkedin_cta || '');
  const [twitterCta, setTwitterCta] = useState(authCreator?.twitter_cta || '');
  const [tiktokCta, setTiktokCta] = useState(authCreator?.tiktok_cta || '');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authProfile) {
      setFullName(authProfile.full_name);
    } else if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    }

    if (authCreator) {
      if (authCreator.niche !== undefined) setNiche(authCreator.niche);
      if (authCreator.target_audience !== undefined) setAudience(authCreator.target_audience);
      if (authCreator.language !== undefined) setLanguage(authCreator.language);
      if (authCreator.tone !== undefined) setTone(authCreator.tone);
      if (authCreator.custom_tone !== undefined) setCustomTone(authCreator.custom_tone);
      if (authCreator.preferred_hook_style !== undefined) setPreferredHookStyle(authCreator.preferred_hook_style);
      if (authCreator.brand_rules !== undefined) setBrandRules(authCreator.brand_rules);
      if (authCreator.forbidden_phrases !== undefined) setForbiddenPhrases(authCreator.forbidden_phrases);
      if (authCreator.website_url !== undefined) setWebsiteUrl(authCreator.website_url);
      if (authCreator.newsletter_url !== undefined) setNewsletterUrl(authCreator.newsletter_url);
      if (authCreator.podcast_url !== undefined) setPodcastUrl(authCreator.podcast_url);
      if (authCreator.youtube_cta !== undefined) setYoutubeCta(authCreator.youtube_cta);
      if (authCreator.instagram_cta !== undefined) setInstagramCta(authCreator.instagram_cta);
      if (authCreator.linkedin_cta !== undefined) setLinkedinCta(authCreator.linkedin_cta);
      if (authCreator.twitter_cta !== undefined) setTwitterCta(authCreator.twitter_cta);
      if (authCreator.tiktok_cta !== undefined) setTiktokCta(authCreator.tiktok_cta);
    }
  }, [authProfile, authCreator, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);

    // Sync local projectService profile
    projectService.updateProfile({
      name: fullName,
      niche,
      audience,
      language,
      tone,
      custom_tone: customTone,
      website_url: websiteUrl,
      newsletter_url: newsletterUrl,
      podcast_url: podcastUrl,
      youtube_cta: youtubeCta,
      instagram_cta: instagramCta,
      linkedin_cta: linkedinCta,
      twitter_cta: twitterCta,
      tiktok_cta: tiktokCta,
      preferred_hook_style: preferredHookStyle,
      brand_rules: brandRules,
      forbidden_phrases: forbiddenPhrases,
    });

    if (isConfigured && user) {
      try {
        await backendRequest('/profiles/me', {
          method: 'PUT',
          body: JSON.stringify({ full_name: fullName.trim(), creatorProfile: {
              niche: niche.trim(),
              target_audience: audience.trim(),
              language,
              tone,
              custom_tone: customTone.trim(),
              website_url: websiteUrl.trim(),
              newsletter_url: newsletterUrl.trim(),
              podcast_url: podcastUrl.trim(),
              youtube_cta: youtubeCta.trim(),
              instagram_cta: instagramCta.trim(),
              linkedin_cta: linkedinCta.trim(),
              twitter_cta: twitterCta.trim(),
              tiktok_cta: tiktokCta.trim(),
              preferred_hook_style: preferredHookStyle.trim(),
              brand_rules: brandRules.trim(),
              forbidden_phrases: forbiddenPhrases.trim(),
            } }),
        });

        await refreshProfile();
      } catch (err: any) {
        console.error('Failed to save settings:', err);
        setErrorMessage(
          err.message || 'Failed to sync settings with database. Local changes were preserved.'
        );
      }
    }

    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    setAccountMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin + '/settings',
      });
      if (error) {
        setAccountMessage(`Password reset error: ${error.message}`);
      } else {
        setAccountMessage(`Password reset link sent to ${user.email}`);
      }
    } catch {
      setAccountMessage('Could not send password reset email.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="relative mx-auto max-w-3xl space-y-6 pt-4 pb-16">
      <AmbientBackdrop variant="glow" />

      <div>
        <h1 className="text-3xl font-semibold tracking-tight font-display text-foreground">
          Creator Studio Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your creator persona, brand voice, content rules, and platform call-to-actions.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section A: Creator Identity */}
        <SpotlightCard
          spotlightColor="rgba(94, 128, 103, 0.08)"
          className="p-6 md:p-7 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sage/15 text-sage">
              <User className="size-3.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-foreground">Creator Identity</h2>
              <p className="text-[11px] text-muted-foreground">Public creator persona & audience focus.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alex Rivera"
              className="rounded-2xl"
            />
            <Input
              label="Email Address"
              value={user?.email || ''}
              disabled
              className="bg-secondary/40 text-muted-foreground cursor-not-allowed rounded-2xl"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Creator Niche"
              placeholder="e.g. Fitness, Tech breakdowns, SaaS & Startups"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="rounded-2xl"
            />
            <Input
              label="Target Audience"
              placeholder="e.g. Busy founders, developers, early career professionals"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="rounded-2xl"
            />
          </div>
        </SpotlightCard>

        {/* Section B: Content Style & Brand Voice */}
        <SpotlightCard
          spotlightColor="rgba(192, 98, 62, 0.1)"
          className="p-6 md:p-7 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-clay/15 text-clay">
              <Sparkles className="size-3.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-foreground">Content Style</h2>
              <p className="text-[11px] text-muted-foreground">Control voice, tone, and opening hook delivery.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="flex h-10 w-full rounded-2xl border border-input bg-card px-3.5 text-xs shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Content Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="flex h-10 w-full rounded-2xl border border-input bg-card px-3.5 text-xs shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Conditional Custom Tone */}
          {tone === 'Custom' && (
            <div className="space-y-1.5 pt-1 animate-in fade-in duration-200">
              <Textarea
                label="Describe your custom brand voice"
                placeholder="Example: High-energy, direct, slightly sarcastic, practical and confident."
                value={customTone}
                onChange={(e) => setCustomTone(e.target.value)}
                rows={3}
                className="rounded-2xl text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                If empty, falls back gracefully to a friendly conversational tone.
              </p>
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Preferred Hook Style
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {HOOK_STYLES.map((style) => {
                const isSelected = preferredHookStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setPreferredHookStyle(isSelected ? '' : style)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all select-none cursor-pointer ${
                      isSelected
                        ? 'bg-clay text-white shadow-clay font-semibold'
                        : 'border border-border/80 text-muted-foreground hover:text-foreground hover:bg-cream/60'
                    }`}
                  >
                    {style}
                  </button>
                );
              })}
            </div>
          </div>
        </SpotlightCard>

        {/* Section C: Brand Rules & Forbidden Phrases */}
        <SpotlightCard
          spotlightColor="rgba(38, 36, 34, 0.08)"
          className="p-6 md:p-7 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ShieldAlert className="size-3.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-foreground">Brand Rules & Guardrails</h2>
              <p className="text-[11px] text-muted-foreground">Writing rules & blacklisted phrases for AI generation.</p>
            </div>
          </div>

          <Textarea
            label="Brand Rules & Style Guidelines"
            placeholder="e.g. Keep language simple. Avoid corporate jargon. Sound like a practitioner rather than a marketer."
            value={brandRules}
            onChange={(e) => setBrandRules(e.target.value)}
            rows={3}
            className="rounded-2xl text-xs"
          />

          <Textarea
            label="Forbidden Phrases (Do Not Use)"
            placeholder="e.g. game changer, unlock your potential, in today's fast-paced world, buckle up"
            value={forbiddenPhrases}
            onChange={(e) => setForbiddenPhrases(e.target.value)}
            rows={2}
            className="rounded-2xl text-xs"
          />
        </SpotlightCard>

        {/* Section D: Links & CTAs */}
        <SpotlightCard
          spotlightColor="rgba(94, 128, 103, 0.08)"
          className="p-6 md:p-7 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sage/15 text-sage">
              <LinkIcon className="size-3.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-foreground">Links & Call-To-Actions</h2>
              <p className="text-[11px] text-muted-foreground">
                Personalized URLs & conversion prompts. Included only when provided.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Website URL"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="rounded-2xl text-xs"
            />
            <Input
              label="Newsletter URL"
              placeholder="https://news.example.com"
              value={newsletterUrl}
              onChange={(e) => setNewsletterUrl(e.target.value)}
              className="rounded-2xl text-xs"
            />
            <Input
              label="Podcast URL"
              placeholder="https://podcast.example.com"
              value={podcastUrl}
              onChange={(e) => setPodcastUrl(e.target.value)}
              className="rounded-2xl text-xs"
            />
          </div>

          <div className="space-y-3 pt-2">
            <Input
              label="YouTube CTA"
              placeholder="e.g. Subscribe for weekly breakdowns and check the links in the description"
              value={youtubeCta}
              onChange={(e) => setYoutubeCta(e.target.value)}
              className="rounded-2xl text-xs"
            />
            <Input
              label="Instagram CTA"
              placeholder="e.g. Comment 'GUIDE' below and I'll DM you the free template"
              value={instagramCta}
              onChange={(e) => setInstagramCta(e.target.value)}
              className="rounded-2xl text-xs"
            />
            <Input
              label="LinkedIn CTA"
              placeholder="e.g. Follow for daily frameworks on scaling SaaS products"
              value={linkedinCta}
              onChange={(e) => setLinkedinCta(e.target.value)}
              className="rounded-2xl text-xs"
            />
            <Input
              label="X / Twitter CTA"
              placeholder="e.g. Repost the first tweet if you found this valuable"
              value={twitterCta}
              onChange={(e) => setTwitterCta(e.target.value)}
              className="rounded-2xl text-xs"
            />
            <Input
              label="TikTok CTA"
              placeholder="e.g. Drop a comment for part 2 and save this sound"
              value={tiktokCta}
              onChange={(e) => setTiktokCta(e.target.value)}
              className="rounded-2xl text-xs"
            />
          </div>
        </SpotlightCard>

        {errorMessage && (
          <div role="alert" className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs text-destructive font-medium text-center">
            {errorMessage}
          </div>
        )}

        {savedSuccess && (
          <div role="status" className="rounded-2xl bg-sage/15 border border-sage/30 p-3.5 text-xs text-sage font-medium text-center flex items-center justify-center gap-1.5">
            <Check className="size-4" />
            <span>Creator profile settings saved successfully!</span>
          </div>
        )}

        <ShinyButton
          type="submit"
          variant="sage"
          className="w-full h-11 text-sm font-semibold"
          disabled={saving}
          leftIcon={
            saving ? (
              <span className="size-3.5 rounded-full border-2 border-white/60 border-t-white animate-spin" />
            ) : (
              <Check className="size-4" />
            )
          }
        >
          {saving ? 'Saving Settings…' : 'Save Creator Settings'}
        </ShinyButton>
      </form>

      {/* Section E: Account Section */}
      <SpotlightCard
        spotlightColor="rgba(38, 36, 34, 0.05)"
        className="p-6 md:p-7 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-border/50 pb-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <KeyRound className="size-3.5" />
          </div>
          <div>
            <h2 className="text-base font-semibold font-display text-foreground">Account Security</h2>
            <p className="text-[11px] text-muted-foreground">Password reset and authentication controls.</p>
          </div>
        </div>

        {accountMessage && (
          <p className="text-xs font-medium text-sage">{accountMessage}</p>
        )}

        <div className="flex flex-wrap gap-2.5 pt-1">
          <Button variant="outline" size="sm" onClick={handleResetPassword}>
            Reset Password
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="mr-1.5 size-3.5" /> Sign Out
          </Button>
        </div>
      </SpotlightCard>
    </div>
  );
};

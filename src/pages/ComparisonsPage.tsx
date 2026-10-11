import React from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Sparkles, ArrowRight, Zap, Star } from 'lucide-react';

interface ComparisonData {
  slug: string;
  competitor: string;
  tagline: string;
  vireoAdvantage: string;
  competitorFocus: string;
  table: {
    feature: string;
    vireo: boolean | string;
    competitor: boolean | string;
  }[];
}

const COMPARISONS: ComparisonData[] = [
  {
    slug: 'opusclip',
    competitor: 'OpusClip',
    tagline: 'VireoClip vs OpusClip: Complete Multi-Platform Kits & Transparent Pricing',
    vireoAdvantage: 'VireoClip generates complete, tailored copy for 6 platforms (YouTube, IG, TikTok, Shorts, LinkedIn, X) plus smart reframe without aggressive credit locks.',
    competitorFocus: 'OpusClip focuses primarily on AI clip curation with credit-based usage tiers.',
    table: [
      { feature: 'Multi-platform post drafts (6 channels)', vireo: true, competitor: false },
      { feature: 'Face-Tracking Reframe (9:16 portrait)', vireo: true, competitor: true },
      { feature: 'Client-side rapid preview', vireo: true, competitor: false },
      { feature: 'Animated word-by-word subtitles', vireo: true, competitor: true },
      { feature: 'Direct URL video import', vireo: true, competitor: true },
      { feature: 'Transparent pricing with INR support', vireo: true, competitor: false },
    ],
  },
  {
    slug: 'vizard',
    competitor: 'Vizard',
    tagline: 'VireoClip vs Vizard: Streamlined Creator Workflows vs Complex Video Suites',
    vireoAdvantage: 'VireoClip is laser-focused on turning long podcasts and talking videos into viral clips with zero clutter.',
    competitorFocus: 'Vizard provides an extensive all-in-one editor that can feel overwhelming for fast repurposing.',
    table: [
      { feature: 'Instant AI viral hook detection', vireo: true, competitor: true },
      { feature: 'Minimalist, creator-first UI', vireo: true, competitor: false },
      { feature: 'Dual-speaker podcast split-screen', vireo: true, competitor: true },
      { feature: 'Multi-channel social text generation', vireo: true, competitor: false },
      { feature: '1080p HD exports on all paid tiers', vireo: true, competitor: true },
    ],
  },
  {
    slug: 'capcut',
    competitor: 'CapCut',
    tagline: 'VireoClip vs CapCut: Automated AI Repurposing vs Manual Timeline Editing',
    vireoAdvantage: 'VireoClip automates long-to-short clipping, moment identification and transcript generation in one click.',
    competitorFocus: 'CapCut is an excellent manual mobile/desktop editor designed for manual cutting and trending templates.',
    table: [
      { feature: 'Autonomous long-to-short clipping', vireo: true, competitor: 'Manual' },
      { feature: 'Automated transcript & moments', vireo: true, competitor: 'Partial' },
      { feature: 'Web-based zero-install workflow', vireo: true, competitor: true },
      { feature: 'Creator brand voice presets', vireo: true, competitor: false },
      { feature: 'Privacy-focused workspace', vireo: true, competitor: 'Cloud sync' },
    ],
  },
  {
    slug: 'vidyo',
    competitor: 'Vidyo',
    tagline: 'VireoClip vs Vidyo.ai: Precision Transcripts & Snappy Performance',
    vireoAdvantage: 'VireoClip offers responsive performance, modern typography, realistic animations, and clear pricing in USD and INR.',
    competitorFocus: 'Vidyo.ai specializes in social video resizing with predefined content templates.',
    table: [
      { feature: 'Dual USD / INR billing options', vireo: true, competitor: false },
      { feature: 'Accurate word-level timestamping', vireo: true, competitor: true },
      { feature: 'Social auto-scheduling & dispatch', vireo: true, competitor: true },
      { feature: 'Free tier with immediate signup', vireo: true, competitor: true },
    ],
  },
  {
    slug: 'submagic',
    competitor: 'Submagic',
    tagline: 'VireoClip vs Submagic: End-to-End Clipping & Captions in One Platform',
    vireoAdvantage: 'Submagic specializes strictly in caption emojis; VireoClip clips long video, reframes, AND styles captions.',
    competitorFocus: 'Submagic concentrates heavily on dynamic caption styling with sound effects.',
    table: [
      { feature: 'Long-form to short-clip extraction', vireo: true, competitor: false },
      { feature: 'Dynamic caption styles (Beasty, Youshaei)', vireo: true, competitor: true },
      { feature: 'AI B-roll suggestion & timeline', vireo: true, competitor: true },
      { feature: 'Multi-platform social copy kits', vireo: true, competitor: false },
    ],
  },
  {
    slug: 'veed',
    competitor: 'VEED',
    tagline: 'VireoClip vs VEED: Rapid AI Extraction vs Traditional Timeline Suite',
    vireoAdvantage: 'VireoClip gets you from YouTube link to 6 viral clips in under 2 minutes without heavy timeline overhead.',
    competitorFocus: 'VEED is a broad cloud video editing suite with extensive general video editing tools.',
    table: [
      { feature: 'One-click viral clip generation', vireo: true, competitor: 'Add-on' },
      { feature: 'Lightning fast rendering pipeline', vireo: true, competitor: 'Variable' },
      { feature: 'Transparent tier pricing', vireo: true, competitor: true },
      { feature: 'Clean dark-mode creator studio', vireo: true, competitor: false },
    ],
  },
  {
    slug: 'captions',
    competitor: 'Captions.ai',
    tagline: 'VireoClip vs Captions.ai: Multi-Platform Cloud Studio vs Mobile App',
    vireoAdvantage: 'VireoClip works seamlessly in any desktop or mobile browser with complete desktop workspace features.',
    competitorFocus: 'Captions.ai originated as an iOS-first app with teleprompter and eye-contact correction.',
    table: [
      { feature: 'Full browser web workspace', vireo: true, competitor: 'App-first' },
      { feature: 'Long video URL ingestion', vireo: true, competitor: 'Upload' },
      { feature: 'Collaborative team workspaces', vireo: true, competitor: 'Single user' },
      { feature: 'Social distribution scheduling', vireo: true, competitor: false },
    ],
  },
];

export const ComparisonsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#080B12] text-[#F4F6FC] selection:bg-purple-500/30">
      {/* Header Banner */}
      <section className="relative overflow-hidden border-b border-white/10 py-16 sm:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-950/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300">
            <Sparkles className="size-3.5" />
            <span>Honest Creator Tool Comparisons</span>
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl font-display">
            How VireoClip Compares to <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400">
              Other Video Repurposing Tools
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-zinc-400">
            Choose the right AI video clipping and social publishing tool for your workflow. Here is an honest, detailed breakdown of features, performance and value.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {COMPARISONS.map((c) => (
              <a
                key={c.slug}
                href={`#${c.slug}`}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-purple-400 hover:text-white"
              >
                vs {c.competitor}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Comparisons List */}
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 space-y-16">
        {COMPARISONS.map((comp) => (
          <section
            key={comp.slug}
            id={comp.slug}
            className="scroll-mt-24 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 sm:p-10 backdrop-blur-md shadow-xl"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  Head-to-Head Comparison
                </span>
                <h2 className="mt-1 text-2xl font-bold font-display sm:text-3xl text-white">
                  VireoClip vs {comp.competitor}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">{comp.tagline}</p>
              </div>

              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-900/30 hover:brightness-110 transition-all shrink-0"
              >
                <span>Try VireoClip Free</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <Star className="size-4 fill-emerald-400" />
                  <span>Why Creators Choose VireoClip</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                  {comp.vireoAdvantage}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  <Zap className="size-4 text-zinc-400" />
                  <span>{comp.competitor}'s Core Focus</span>
                </div>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  {comp.competitorFocus}
                </p>
              </div>
            </div>

            {/* Feature Checklist Table */}
            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-400">
                    <th className="py-3 font-semibold">Feature & Capability</th>
                    <th className="py-3 font-semibold text-purple-300">VireoClip</th>
                    <th className="py-3 font-semibold text-zinc-400">{comp.competitor}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {comp.table.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 text-zinc-300 font-medium">{row.feature}</td>
                      <td className="py-3 font-semibold">
                        {typeof row.vireo === 'boolean' ? (
                          row.vireo ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-400">
                              <Check className="size-4" />
                              <span>Yes</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-zinc-500">
                              <X className="size-4" />
                              <span>No</span>
                            </span>
                          )
                        ) : (
                          <span className="text-zinc-200">{row.vireo}</span>
                        )}
                      </td>
                      <td className="py-3">
                        {typeof row.competitor === 'boolean' ? (
                          row.competitor ? (
                            <span className="inline-flex items-center gap-1.5 text-zinc-300">
                              <Check className="size-4 text-zinc-400" />
                              <span>Yes</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-zinc-600">
                              <X className="size-4" />
                              <span>No</span>
                            </span>
                          )
                        ) : (
                          <span className="text-zinc-400">{row.competitor}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* Bottom CTA Banner */}
      <section className="border-t border-white/10 py-16 text-center">
        <div className="mx-auto max-w-xl px-5">
          <h2 className="text-2xl font-bold font-display sm:text-3xl text-white">
            Ready to streamline your video repurposing?
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Get 15 minutes of free video clipping every month with no credit card required.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-900/30 hover:brightness-110 transition-all"
            >
              <span>Get Started Free</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

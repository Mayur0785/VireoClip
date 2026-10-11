import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Subtitles,
  Maximize2,
  CalendarClock,
  BarChart3,
  Split,
  Palette,
  Sliders,
  Users,
  AudioLines,
  Wand2,
  Workflow,
  ArrowUpRight,
} from 'lucide-react';

export function ExploreMajorFeatures({ id = 'major-features' }: { id?: string }) {
  // Interactive state for mini-previews
  const [activeReframingRatio, setActiveReframingRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [activeCaptionStyle, setActiveCaptionStyle] = useState<'hormozi' | 'beast' | 'neon'>('hormozi');
  const [activeTone, setActiveTone] = useState<'Energetic' | 'Professional' | 'Casual'>('Energetic');
  const [activePublishTab, setActivePublishTab] = useState<'all' | 'queued' | 'published'>('queued');

  return (
    <section id={id} className="lv-major-features relative py-20 lg:py-28 bg-[#080B12] text-[#F4F6FC] border-t border-white/[0.06] overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-[#20E3A2]/5 via-[#9870FF]/5 to-transparent blur-3xl pointer-events-none -z-10" />

      <div className="lv-container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-[#20E3A2]/20 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-[#20E3A2]" />
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#20E3A2] uppercase">
              Full Platform Capabilities
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-5 leading-tight">
            Explore All <em>Major Features</em>
          </h2>
          <p className="text-base sm:text-lg text-[#A6B0C2] leading-relaxed">
            From automated raw footage ingestion and viral clip discovery to multi-track editing, brand consistency, and multi-channel social queues—discover everything built into VireoClip.
          </p>
        </div>

        {/* 12 Major Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* =========================================================================
              01. AI Video Clipping
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#20E3A2]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(32,227,162,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#20E3A2] tracking-wider uppercase">01 / DISCOVERY</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#20E3A2]/10 text-[#20E3A2] border border-[#20E3A2]/20">
                  <Sparkles className="w-3 h-3" /> Core Engine
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">AI Video Clipping</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Transform long-form podcasts, webinars, and YouTube videos into high-retention short clips. Our scoring engine analyzes narrative hooks, audience sentiment, and speaker pauses to highlight the most viral moments.
              </p>

              {/* Motion Graphic: Animated Clip Cards Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[#778398] pb-2 border-b border-white/[0.06]">
                  <span className="font-mono">Detected Clip Candidates</span>
                  <span className="text-[#20E3A2] font-semibold">Ranked by Virality</span>
                </div>
                {[
                  { title: "The 3-Second Retention Rule", time: "01:24 – 02:08", score: 98, tag: "High Virality" },
                  { title: "Why Most Creators Quit Early", time: "05:12 – 05:54", score: 94, tag: "Emotional Hook" },
                ].map((clip, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded bg-[#20E3A2]/10 text-[#20E3A2] flex items-center justify-center font-bold text-xs shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{clip.title}</div>
                        <div className="text-[11px] text-[#778398] font-mono">{clip.time}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-[#20E3A2] bg-[#20E3A2]/10 px-2 py-0.5 rounded border border-[#20E3A2]/20">
                        {clip.score}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/projects/new"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#20E3A2] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#20E3A2] transition-all group-hover:border-[#20E3A2]/30"
            >
              <span>Try AI Video Clipping</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              02. AI Captions & Subtitles
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#56D9E8]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(86,217,232,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#56D9E8] tracking-wider uppercase">02 / TYPOGRAPHY</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#56D9E8]/10 text-[#56D9E8] border border-[#56D9E8]/20">
                  <Subtitles className="w-3 h-3" /> Word-Level Sync
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">AI Captions & Subtitles</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Word-by-word synchronized animated subtitles with zero manual transcription. Choose between creator-proven styling presets, customizable emoji highlights, and multi-language support.
              </p>

              {/* Motion Graphic: Caption Style Switcher Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs text-[#778398]">Caption Styles:</span>
                  <div className="flex items-center gap-1.5">
                    {(['hormozi', 'beast', 'neon'] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setActiveCaptionStyle(style)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider transition-all ${
                          activeCaptionStyle === style
                            ? 'bg-[#56D9E8] text-[#080B12]'
                            : 'bg-white/[0.04] text-[#A6B0C2] hover:text-white'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-16 rounded-lg bg-gradient-to-r from-purple-950/40 via-blue-950/40 to-black/60 border border-white/5 flex items-center justify-center p-3 text-center">
                  {activeCaptionStyle === 'hormozi' && (
                    <span className="font-extrabold uppercase text-sm tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                      TURN ONE VIDEO INTO <span className="text-[#FFDD00] bg-black/80 px-1.5 py-0.5 rounded border border-[#FFDD00]">CONTENT EVERYWHERE</span>
                    </span>
                  )}
                  {activeCaptionStyle === 'beast' && (
                    <span className="font-black italic text-base tracking-wider text-[#00E5FF] drop-shadow-[0_2px_8px_rgba(0,229,255,0.6)]">
                      NEVER SPEND HOURS <span className="text-[#FF0055]">MANUALLY SUBTITLING</span>
                    </span>
                  )}
                  {activeCaptionStyle === 'neon' && (
                    <span className="font-bold text-sm tracking-widest text-[#20E3A2] drop-shadow-[0_0_10px_rgba(32,227,162,0.8)]">
                      FRAME-ACCURATE · WORD-BY-WORD · SYNCED
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#56D9E8] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#56D9E8] transition-all group-hover:border-[#56D9E8]/30"
            >
              <span>Explore Caption Styles in Studio</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              03. AI Reframing
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#9870FF]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(152,112,255,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#9870FF] tracking-wider uppercase">03 / ASPECT RATIOS</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#9870FF]/10 text-[#9870FF] border border-[#9870FF]/20">
                  <Maximize2 className="w-3 h-3" /> Active Speaker Tracking
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">AI Reframing</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Adapt horizontal 16:9 recordings to vertical 9:16 Shorts/TikToks and square 1:1 Instagram feeds. Face and speaker tracking keeps your subjects centered naturally without black bars or distorted stretching.
              </p>

              {/* Motion Graphic: Aspect Ratio Toggle Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="text-[#778398]">Target Ratio:</span>
                  <div className="flex items-center gap-1.5">
                    {(['9:16', '1:1', '16:9'] as const).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setActiveReframingRatio(ratio)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all ${
                          activeReframingRatio === ratio
                            ? 'bg-[#9870FF] text-white shadow-sm'
                            : 'bg-white/[0.04] text-[#A6B0C2] hover:text-white'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-20 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center relative overflow-hidden">
                  <div
                    className={`transition-all duration-300 border-2 border-dashed border-[#9870FF] rounded flex items-center justify-center bg-[#9870FF]/10 ${
                      activeReframingRatio === '9:16'
                        ? 'w-12 h-18'
                        : activeReframingRatio === '1:1'
                        ? 'w-16 h-16'
                        : 'w-28 h-16'
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold text-[#9870FF]">
                      {activeReframingRatio}
                    </span>
                  </div>
                  <div className="absolute bottom-1 right-2 text-[10px] text-[#778398] font-mono">
                    Subject Locked • No Distortion
                  </div>
                </div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#9870FF] text-white hover:text-white font-semibold text-xs border border-white/10 hover:border-[#9870FF] transition-all group-hover:border-[#9870FF]/30"
            >
              <span>Test Smart Reframing in Project Studio</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              04. Social Publishing Queue & Scheduling
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#F59E0B]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(245,158,11,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#F59E0B] tracking-wider uppercase">04 / SCHEDULING</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
                  <CalendarClock className="w-3 h-3" /> Queue Engine
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Social Publishing Queue & Scheduling</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Automated multi-platform post scheduler. Queue clips for YouTube Shorts, TikTok, Instagram Reels, LinkedIn, and X with automated time-zone dispatching and exponential retry recovery.
              </p>

              {/* Motion Graphic: Publishing Queue Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActivePublishTab('queued')}
                      className={`text-xs font-semibold ${activePublishTab === 'queued' ? 'text-[#F59E0B]' : 'text-[#778398]'}`}
                    >
                      Queued (2)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePublishTab('published')}
                      className={`text-xs font-semibold ${activePublishTab === 'published' ? 'text-[#F59E0B]' : 'text-[#778398]'}`}
                    >
                      Published (8)
                    </button>
                  </div>
                  <span className="text-[11px] text-[#778398] font-mono">Timezone: UTC-5 (EST)</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded bg-white/[0.03] text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
                      <span className="font-medium text-white truncate max-w-[150px]">Clip #1: The Retention Hook</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#A6B0C2]">
                      <span>Today, 6:00 PM</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-white">YT / TT</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white/[0.03] text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-medium text-white truncate max-w-[150px]">Clip #2: Studio Breakdown</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#A6B0C2]">
                      <span>Tomorrow, 9:30 AM</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-white">IG / LI</span>
                    </div>
                  </div>
                </div>

                <div className="pt-1 text-[10px] text-[#778398] italic">
                  * Note: Direct publishing requires connecting your authorized platform accounts via OAuth.
                </div>
              </div>
            </div>

            <Link
              to="/publishing"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#F59E0B] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#F59E0B] transition-all group-hover:border-[#F59E0B]/30"
            >
              <span>Manage Social Publishing Queue</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              05. Cross-Platform Performance Analytics
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#20E3A2]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(32,227,162,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#20E3A2] tracking-wider uppercase">05 / INTELLIGENCE</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#20E3A2]/10 text-[#20E3A2] border border-[#20E3A2]/20">
                  <BarChart3 className="w-3 h-3" /> Growth Coach
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Cross-Platform Performance Analytics</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Track views, completion rates, engagement ratios, and follower conversions across all channels in one dashboard. Built-in AI Growth Memory uncovers patterns in what hooks resonate best.
              </p>

              {/* Motion Graphic: KPI Cards & Mini Trendline Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2 rounded bg-white/[0.03] text-center border border-white/[0.04]">
                    <div className="text-[10px] text-[#778398] uppercase font-mono">Total Views</div>
                    <div className="text-sm font-bold text-white mt-0.5">248.5K</div>
                    <div className="text-[10px] text-[#20E3A2] font-semibold">+18.2%</div>
                  </div>
                  <div className="p-2 rounded bg-white/[0.03] text-center border border-white/[0.04]">
                    <div className="text-[10px] text-[#778398] uppercase font-mono">Avg Watch Time</div>
                    <div className="text-sm font-bold text-white mt-0.5">82.4%</div>
                    <div className="text-[10px] text-[#20E3A2] font-semibold">+5.4%</div>
                  </div>
                  <div className="p-2 rounded bg-white/[0.03] text-center border border-white/[0.04]">
                    <div className="text-[10px] text-[#778398] uppercase font-mono">Engagement</div>
                    <div className="text-sm font-bold text-white mt-0.5">9.1%</div>
                    <div className="text-[10px] text-[#56D9E8] font-semibold">High</div>
                  </div>
                </div>

                <div className="h-8 flex items-end gap-1 px-1">
                  {[35, 45, 60, 50, 75, 68, 85, 92, 88, 100].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-[#20E3A2]/20 to-[#20E3A2] rounded-t transition-all duration-300 hover:brightness-125"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-[#778398] text-right mt-1 font-mono">Sample 30-Day Growth Metric</div>
              </div>
            </div>

            <Link
              to="/analytics"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#20E3A2] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#20E3A2] transition-all group-hover:border-[#20E3A2]/30"
            >
              <span>View Analytics Dashboard</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              06. A/B Testing Studio
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#EC4899]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(236,72,153,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#EC4899] tracking-wider uppercase">06 / EXPERIMENTS</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EC4899]/10 text-[#EC4899] border border-[#EC4899]/20">
                  <Split className="w-3 h-3" /> Variant Testing
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">A/B Testing Studio</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Test multiple hooks, intro pacing, and thumbnail covers side-by-side. Track which variant achieves higher click-through rates (CTR) and longer retention before publishing wide.
              </p>

              {/* Motion Graphic: A/B Experiment Comparison Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] relative">
                    <span className="text-[10px] font-mono font-bold text-[#A6B0C2] uppercase">Variant A</span>
                    <div className="text-xs font-semibold text-white mt-1">Curiosity Hook</div>
                    <div className="mt-2 text-xs font-mono text-[#A6B0C2]">CTR: 5.8%</div>
                    <div className="text-[11px] text-[#778398]">Retention: 64%</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#EC4899]/10 border border-[#EC4899]/40 relative">
                    <span className="absolute top-2 right-2 text-[9px] font-bold text-[#EC4899] bg-[#EC4899]/20 px-1.5 py-0.5 rounded">WINNER</span>
                    <span className="text-[10px] font-mono font-bold text-[#EC4899] uppercase">Variant B</span>
                    <div className="text-xs font-semibold text-white mt-1">Direct Question Hook</div>
                    <div className="mt-2 text-xs font-mono text-[#EC4899] font-bold">CTR: 9.2%</div>
                    <div className="text-[11px] text-[#EC4899]">Retention: 86%</div>
                  </div>
                </div>
              </div>
            </div>

            <Link
              to="/ab-testing"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#EC4899] text-white hover:text-white font-semibold text-xs border border-white/10 hover:border-[#EC4899] transition-all group-hover:border-[#EC4899]/30"
            >
              <span>Explore A/B Testing Studio</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              07. Brand Brain & Style Rules
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#8B5CF6]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(139,92,246,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#8B5CF6] tracking-wider uppercase">07 / IDENTITY</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20">
                  <Palette className="w-3 h-3" /> Style Rules
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Brand Brain & Style Rules</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Preserve consistent branding across every generated clip. Lock your official brand color palette, font typography, tone-of-voice directives, and banned-word lists across your team.
              </p>

              {/* Motion Graphic: Brand Kit Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="text-[#778398]">Brand Palette:</span>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#8B5CF6] border border-white/20" title="Primary #8B5CF6" />
                    <span className="w-5 h-5 rounded-full bg-[#20E3A2] border border-white/20" title="Accent #20E3A2" />
                    <span className="w-5 h-5 rounded-full bg-[#56D9E8] border border-white/20" title="Highlight #56D9E8" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs py-2 border-t border-b border-white/[0.06] mb-3">
                  <span className="text-[#778398]">Tone of Voice:</span>
                  <div className="flex gap-1.5">
                    {(['Energetic', 'Professional', 'Casual'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTone(t)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          activeTone === t ? 'bg-[#8B5CF6] text-white' : 'bg-white/[0.03] text-[#A6B0C2]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#778398]">
                  <span>Guardrails:</span>
                  <span className="font-mono text-[#20E3A2]">4 Banned Words • Slang Filter Active</span>
                </div>
              </div>
            </div>

            <Link
              to="/brand"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#8B5CF6] text-white hover:text-white font-semibold text-xs border border-white/10 hover:border-[#8B5CF6] transition-all group-hover:border-[#8B5CF6]/30"
            >
              <span>Configure Brand Brain</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              08. Pro Timeline Editor
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#3B82F6]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(59,130,246,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#3B82F6] tracking-wider uppercase">08 / POST-PRODUCTION</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20">
                  <Sliders className="w-3 h-3" /> Multi-Track
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Pro Timeline Editor</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                A browser-native multi-track timeline editor. Fine-tune cut points, audio levels, keyframes, transitions, and B-roll overlays without exporting to external software.
              </p>

              {/* Motion Graphic: Timeline Tracks Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-3 mb-6 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#778398] pb-1 border-b border-white/[0.06] font-mono">
                  <span>Timeline: 00:32.400</span>
                  <span>4 Active Tracks</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-[10px] text-[#778398] font-mono">Video</span>
                  <div className="flex-1 h-5 rounded bg-blue-950/60 border border-blue-500/30 flex items-center px-2 text-[10px] text-blue-300 font-mono">
                    Clip_A_4K.mp4
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-[10px] text-[#778398] font-mono">Captions</span>
                  <div className="flex-1 h-5 rounded bg-purple-950/60 border border-purple-500/30 flex items-center px-2 text-[10px] text-purple-300 font-mono">
                    Synced Subtitle Layer
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-[10px] text-[#778398] font-mono">Audio</span>
                  <div className="flex-1 h-5 rounded bg-emerald-950/60 border border-emerald-500/30 flex items-center px-2 text-[10px] text-emerald-300 font-mono">
                    Dialogue Master (LUFS -14)
                  </div>
                </div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#3B82F6] text-white hover:text-white font-semibold text-xs border border-white/10 hover:border-[#3B82F6] transition-all group-hover:border-[#3B82F6]/30"
            >
              <span>Launch Studio Editor via Dashboard</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              09. Team Workspaces & Permissions
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#10B981]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(16,185,129,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#10B981] tracking-wider uppercase">09 / COLLABORATION</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                  <Users className="w-3 h-3" /> RBAC Security
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Team Workspaces & Permissions</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Collaborate with creators, agencies, and video editors seamlessly. Assign role-based access (Owner, Editor, Viewer), share brand templates, and manage multi-client workflows.
              </p>

              {/* Motion Graphic: Workspace Members Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs mb-2.5">
                  <span className="font-semibold text-white">Vertex Studios Workspace</span>
                  <span className="text-[11px] text-[#10B981] font-mono">3 Active Seats</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-1.5 rounded bg-white/[0.02] text-xs">
                    <span className="text-white">lead.creator@vireo.app</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#10B981]/20 text-[#10B981]">Owner</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-white/[0.02] text-xs">
                    <span className="text-[#A6B0C2]">editor@production.io</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">Editor</span>
                  </div>
                </div>
              </div>
            </div>

            <Link
              to="/workspaces"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#10B981] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#10B981] transition-all group-hover:border-[#10B981]/30"
            >
              <span>Manage Workspaces & Permissions</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              10. AI Producer, B-roll & Audio Tools
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#06B6D4]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(6,182,212,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#06B6D4] tracking-wider uppercase">10 / AUDIO & B-ROLL</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/20">
                  <AudioLines className="w-3 h-3" /> Studio Mastering
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">AI Producer, B-roll & Audio Tools</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Automatic dialogue enhancement, background noise suppression, and LUFS broadcast mastering. Contextually match transcript keywords to stock footage overlays.
              </p>

              {/* Motion Graphic: Audio Equalizer & B-roll Matcher */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="text-[#778398]">Speech Cleaner:</span>
                  <span className="font-mono text-[#06B6D4] font-semibold">Active (-14 LUFS Norm)</span>
                </div>
                <div className="flex items-center gap-1 h-8 px-2 bg-white/[0.02] rounded border border-white/[0.04]">
                  {[40, 70, 90, 60, 80, 50, 75, 95, 85, 60, 45, 90, 70, 50].map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-[#06B6D4] rounded-full opacity-80"
                      style={{ height: `${v}%` }}
                    />
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A6B0C2]">
                  <span>Matched B-roll:</span>
                  <span className="text-white font-medium">"Studio Microphone Setup" (0:12–0:16)</span>
                </div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#06B6D4] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#06B6D4] transition-all group-hover:border-[#06B6D4]/30"
            >
              <span>Explore Audio & B-roll Tools</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              11. Content Creation Tools
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#EAB308]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(234,179,8,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#EAB308] tracking-wider uppercase">11 / CREATIVE LABS</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EAB308]/10 text-[#EAB308] border border-[#EAB308]/20">
                  <Wand2 className="w-3 h-3" /> Creative Suite
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Content Creation Tools</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Specialized creator studios: Hook Lab for opening retention hooks, Thumbnail Lab for high-contrast face cutouts, and Content Pack Studio for platform-native captions.
              </p>

              {/* Motion Graphic: Lab Cards Preview */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-4 mb-6 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
                  <div className="text-[10px] text-[#778398] font-mono">Hook Lab</div>
                  <div className="text-xs font-bold text-white mt-1">96 / 100</div>
                  <div className="text-[9px] text-[#20E3A2]">Strong Hook</div>
                </div>
                <div className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
                  <div className="text-[10px] text-[#778398] font-mono">Thumbnail Lab</div>
                  <div className="text-xs font-bold text-white mt-1">Face Crop</div>
                  <div className="text-[9px] text-[#56D9E8]">Neon Border</div>
                </div>
                <div className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
                  <div className="text-[10px] text-[#778398] font-mono">Content Pack</div>
                  <div className="text-xs font-bold text-white mt-1">6 Formats</div>
                  <div className="text-[9px] text-[#EAB308]">Ready to Post</div>
                </div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#EAB308] text-white hover:text-[#080B12] font-semibold text-xs border border-white/10 hover:border-[#EAB308] transition-all group-hover:border-[#EAB308]/30"
            >
              <span>Explore Content Creation Labs</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {/* =========================================================================
              12. Autopilot & Content Workflows
             ========================================================================= */}
          <div className="group relative rounded-2xl bg-[#0D131F]/90 border border-white/10 hover:border-[#6366F1]/40 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(99,102,241,0.08)] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-mono text-xs font-bold text-[#6366F1] tracking-wider uppercase">12 / AUTOMATION</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20">
                  <Workflow className="w-3 h-3" /> Autopilot
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Autopilot & Content Workflows</h3>
              <p className="text-sm text-[#A6B0C2] mb-6 leading-relaxed">
                Automate your entire repurposing pipeline. Connect podcast RSS feeds or YouTube channels to automatically detect viral clips, generate subtitles, and queue social posts on autopilot.
              </p>

              {/* Motion Graphic: Workflow Automation Pipeline Nodes */}
              <div className="rounded-xl bg-[#070A10] border border-white/[0.08] p-3 mb-6">
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                  <div className="px-2 py-1.5 rounded bg-white/[0.04] border border-white/[0.06] text-white text-center">
                    RSS / YouTube
                  </div>
                  <span className="text-[#6366F1]">→</span>
                  <div className="px-2 py-1.5 rounded bg-[#6366F1]/20 border border-[#6366F1]/40 text-[#6366F1] text-center">
                    AI Clipping
                  </div>
                  <span className="text-[#6366F1]">→</span>
                  <div className="px-2 py-1.5 rounded bg-[#20E3A2]/20 border border-[#20E3A2]/40 text-[#20E3A2] text-center">
                    Subtitles
                  </div>
                  <span className="text-[#6366F1]">→</span>
                  <div className="px-2 py-1.5 rounded bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#F59E0B] text-center">
                    Post Queue
                  </div>
                </div>
                <div className="text-[10px] text-[#778398] text-center mt-2">
                  Zero Manual Touch • Automatic Pipeline Execution
                </div>
              </div>
            </div>

            <Link
              to="/workflows"
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#6366F1] text-white hover:text-white font-semibold text-xs border border-white/10 hover:border-[#6366F1] transition-all group-hover:border-[#6366F1]/30"
            >
              <span>Configure Autopilot Workflows</span>
              <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

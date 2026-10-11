import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Link2,
  UploadCloud,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCinematicScrollReveal } from '../../hooks/useCinematicScrollReveal';
import { validateVideoFile } from '../../services/storageService';
import { Spotlight } from '../reactbits/Spotlight';
import { ParticlesBackground } from '../reactbits/ParticlesBackground';
import { CreatorShowcaseCard } from '../reactbits/CreatorShowcaseCard';
import { AiClippingPreview } from '../reactbits/AiClippingPreview';

// Creator Portraits
import creator1 from '../../assets/creators/creator-1.jpg';
import creator2 from '../../assets/creators/creator-2.jpg';
import creator3 from '../../assets/creators/creator-3.jpg';
import creator4 from '../../assets/creators/creator-4.jpg';
import creator5 from '../../assets/creators/creator-5.jpg';
import creator6 from '../../assets/creators/creator-6.jpg';

// Social Platform Icons
import ytIcon from '../../assets/landing/platforms/youtube.svg';
import ttIcon from '../../assets/landing/platforms/tiktok.svg';
import igIcon from '../../assets/landing/platforms/instagram.svg';
import liIcon from '../../assets/landing/platforms/linkedin-in.png';
import xIcon from '../../assets/landing/platforms/x.svg';

function creationPath(isAuthenticated: boolean, path: string) {
  return isAuthenticated ? path : `/signup?next=${encodeURIComponent(path)}`;
}

export function LandingHero() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useCinematicScrollReveal(heroRef, { threshold: 0.05 });

  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const leftCreators = [
    {
      name: 'Marcus Vance',
      category: 'Fitness & Motivation',
      image: creator1,
      rotation: -10,
      offsetY: 26,
      scale: 0.94,
      floatVariant: 1 as const,
    },
    {
      name: 'Elena Chen',
      category: 'Tech & AI Insights',
      image: creator2,
      rotation: -5,
      offsetY: 6,
      scale: 0.98,
      floatVariant: 2 as const,
    },
    {
      name: 'David Ross',
      category: 'Podcast Studio',
      image: creator3,
      rotation: -1,
      offsetY: 0,
      scale: 1,
      floatVariant: 3 as const,
    },
  ];

  const rightCreators = [
    {
      name: 'Dr. Julian Cole',
      category: 'Science & Education',
      image: creator4,
      rotation: 1,
      offsetY: 0,
      scale: 1,
      floatVariant: 2 as const,
    },
    {
      name: 'Sarah Jenkins',
      category: 'Travel & Lifestyle',
      image: creator5,
      rotation: 5,
      offsetY: 6,
      scale: 0.98,
      floatVariant: 3 as const,
    },
    {
      name: 'Leo Sterling',
      category: 'Sports & Motivation',
      image: creator6,
      rotation: 10,
      offsetY: 26,
      scale: 0.94,
      floatVariant: 1 as const,
    },
  ];

  const platformList = [
    { name: 'YouTube', icon: ytIcon, invert: false },
    { name: 'TikTok', icon: ttIcon, invert: true },
    { name: 'Instagram', icon: igIcon, invert: false },
    { name: 'LinkedIn', icon: liIcon, invert: false },
    { name: 'X', icon: xIcon, invert: true },
  ];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please paste a YouTube or video link.');
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid');
      }
      setError('');
      const target = `/projects/new?url=${encodeURIComponent(trimmed)}`;
      navigate(creationPath(isAuthenticated, target));
    } catch {
      setError('Please enter a valid YouTube or direct video URL (e.g. https://...).');
    }
  }

  function handleUploadClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      navigate(creationPath(isAuthenticated, '/projects/new'));
    }
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Please select a valid video file.');
      event.target.value = '';
      return;
    }

    setError('');
    // Route to new project workspace (or signup if unauthenticated)
    navigate(creationPath(isAuthenticated, '/projects/new'));
  }

  const ctaButtonLabel = isAuthenticated ? 'Generate clips' : 'Get free clips';

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden pt-6 pb-20 sm:pt-10 sm:pb-28 bg-[#060B12] text-[#F4F7FB]"
      aria-labelledby="hero-main-title"
    >
      {/* 1. Background Effects & Lights (Layer 1) */}
      <Spotlight fill="rgba(32, 227, 162, 0.16)" />
      <ParticlesBackground count={36} />

      {/* Top Curved Neon Light Arcs */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] overflow-hidden opacity-75" aria-hidden="true">
        {/* Left Emerald Arc */}
        <svg
          className="absolute -top-12 -left-32 w-[620px] h-[400px] text-[#20E3A2]/25"
          viewBox="0 0 620 400"
          fill="none"
        >
          <path
            d="M-50 40 C 220 50, 480 180, 580 380"
            stroke="url(#emerald-arc-grad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="emerald-arc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#00DCC8" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#20E3A2" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#20E3A2" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Right Cyan Arc */}
        <svg
          className="absolute -top-12 -right-32 w-[620px] h-[400px] text-[#00DCC8]/25"
          viewBox="0 0 620 400"
          fill="none"
        >
          <path
            d="M670 40 C 400 50, 140 180, 40 380"
            stroke="url(#cyan-arc-grad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="cyan-arc-grad" x1="1" y1="0" x2="0" y2="1">
              <stop stopColor="#20E3A2" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#00DCC8" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#00DCC8" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Main Hero Container */}
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        {/* Center Stage & Decorative Flanks */}
        <div className="relative flex items-center justify-center min-h-[520px]">
          {/* Layer 1: Left Decorative Creator Cards (Hidden on mobile/tablet, positioned at far edge on xl+) */}
          <div
            className="hidden xl:flex absolute left-[-15px] 2xl:left-2 top-1/2 -translate-y-[52%] items-end gap-2 z-10 pointer-events-none"
            aria-label="Creator showcases left"
          >
            {leftCreators.map((creator, idx) => (
              <div key={idx} className="pointer-events-auto">
                <CreatorShowcaseCard
                  name={creator.name}
                  category={creator.category}
                  image={creator.image}
                  rotation={creator.rotation}
                  offsetY={creator.offsetY}
                  scale={creator.scale}
                  floatVariant={creator.floatVariant}
                  onPreviewClick={() => navigate(creationPath(isAuthenticated, '/projects/new'))}
                />
              </div>
            ))}
          </div>

          {/* Layer 2: Main Hero Content (High Z-Index, Centered, Predictable Layout) */}
          <div className="relative z-20 w-full max-w-2xl text-center py-4 sm:py-6 mx-auto">
            {/* Top Eyebrow Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#20E3A2]/40 bg-[#0A111B]/90 px-4 py-1.5 shadow-[0_0_20px_rgba(32,227,162,0.2)] backdrop-blur-md mb-6 cinematic-reveal-init stagger-1">
              <Sparkles className="size-3.5 text-[#20E3A2]" aria-hidden="true" />
              <span className="text-[11px] font-bold tracking-widest text-[#20E3A2] uppercase">
                BEST AI VIDEO CLIPPING TOOL
              </span>
            </div>

            {/* Main Headline */}
            <h1
              id="hero-main-title"
              className="text-4xl sm:text-5xl md:text-6xl lg:text-[66px] font-extrabold tracking-[-0.04em] leading-[1.08] text-white mb-5 cinematic-reveal-init stagger-2"
            >
              One video in.
              <br />
              Your{' '}
              <span className="shimmer-gradient-text drop-shadow-[0_0_25px_rgba(32,227,162,0.4)]">
                best content out.
              </span>
            </h1>

            {/* Supporting Text */}
            <p className="mx-auto max-w-xl text-base sm:text-lg text-[#A6B4C6] leading-relaxed mb-8 cinematic-reveal-init stagger-3">
              Find the strongest moments, clip them, add captions, reframe, and create ready-to-share content for every platform —{' '}
              <strong className="text-white font-semibold">in minutes.</strong>
            </p>

            {/* Ingestion & Upload Section (Predictable 2-Row Stack) */}
            <div className="w-full max-w-xl mx-auto space-y-4 cinematic-reveal-init stagger-4">
              {/* Row 1: URL Input and Primary Action Button */}
              <form
                onSubmit={handleSubmit}
                className="relative flex flex-col sm:flex-row items-stretch sm:items-center rounded-2xl sm:rounded-full border border-white/15 bg-[#0A111B]/95 p-1.5 sm:p-2 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 focus-within:border-[#20E3A2]/70 focus-within:shadow-[0_0_30px_rgba(32,227,162,0.3)] gap-2 sm:gap-0"
                noValidate
              >
                {/* Link Icon Badge */}
                <div className="hidden sm:flex size-10 items-center justify-center rounded-full bg-white/5 text-[#20E3A2] ml-1 shrink-0">
                  <Link2 className="size-5" aria-hidden="true" />
                </div>

                {/* URL Input Field */}
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="Paste a YouTube or video link..."
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError('');
                  }}
                  className="w-full bg-transparent px-3 sm:px-4 py-2.5 text-sm sm:text-base text-white placeholder-[#78889B] focus:outline-hidden"
                  aria-label="Video link URL"
                  aria-invalid={Boolean(error)}
                />

                {/* Primary Emerald CTA Button */}
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-full bg-[#20E3A2] px-6 py-3 text-sm sm:text-base font-bold text-[#060B12] shadow-[0_0_20px_rgba(32,227,162,0.45)] hover:bg-[#2cf2b2] hover:shadow-[0_0_30px_rgba(32,227,162,0.65)] hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0 cursor-pointer"
                >
                  <span>{ctaButtonLabel}</span>
                  <ArrowRight className="size-4.5" aria-hidden="true" />
                </button>
              </form>

              {/* Validation & Error Message */}
              {error && (
                <p className="text-xs text-[#EF4444] font-medium text-center" role="alert">
                  {error}
                </p>
              )}

              {/* Divider: OR */}
              <div className="flex items-center justify-center gap-3 pt-1">
                <div className="h-px w-14 bg-gradient-to-r from-transparent to-white/15" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#78889B]">
                  OR
                </span>
                <div className="h-px w-14 bg-gradient-to-l from-transparent to-white/15" />
              </div>

              {/* Row 2: Clearly Visible Upload Video Button */}
              <div className="w-full max-w-md mx-auto">
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="group w-full flex items-center justify-center gap-3.5 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-[#20E3A2]/50 px-6 py-3.5 text-sm font-semibold text-[#F4F7FB] transition-all duration-300 shadow-[0_8px_25px_rgba(0,0,0,0.4)] backdrop-blur-md cursor-pointer hover:shadow-[0_0_24px_rgba(32,227,162,0.2)] active:scale-[0.99]"
                >
                  <div className="flex size-8 items-center justify-center rounded-lg bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30 group-hover:scale-110 transition-transform shrink-0">
                    <UploadCloud className="size-4.5" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-left sm:text-center">
                    <span className="text-[#F4F7FB] font-semibold group-hover:text-[#20E3A2] transition-colors">
                      Upload video
                    </span>
                    <span className="text-[11px] text-[#78889B] font-mono">
                      MP4, MOV, WebM up to 2GB
                    </span>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.mov,.webm,.avi,.mkv,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>
            </div>

            {/* Layer 3: Supporting Details (Trust Badges + Social Platforms) */}
            <div className="mt-8 space-y-4 cinematic-reveal-init stagger-5">
              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-7 text-xs sm:text-sm font-medium text-[#A6B4C6]">
                <div className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-[#20E3A2]" aria-hidden="true" />
                  <span>Free plan available</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-[#20E3A2]" aria-hidden="true" />
                  <span>No credit card required</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-[#20E3A2]" aria-hidden="true" />
                  <span>15 source minutes/month</span>
                </div>
              </div>

              {/* Supported Platforms Strip: Uniform Fixed-Size Icons (18-20px) */}
              <div className="inline-flex items-center justify-center gap-3 rounded-full border border-white/10 bg-[#0A111B]/80 px-5 py-2.5 backdrop-blur-md shadow-sm">
                <span className="text-xs font-semibold text-[#78889B] shrink-0">Works with</span>
                <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                  {platformList.map((platform) => (
                    <div
                      key={platform.name}
                      className="flex size-5 items-center justify-center shrink-0"
                      title={platform.name}
                    >
                      <img
                        src={platform.icon}
                        alt={platform.name}
                        width="20"
                        height="20"
                        className={`size-5 max-w-[20px] max-h-[20px] object-contain shrink-0 opacity-85 hover:opacity-100 transition-opacity ${
                          platform.invert ? 'brightness-0 invert' : ''
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-xs text-[#A6B4C6] shrink-0">and more...</span>
              </div>
            </div>
          </div>

          {/* Layer 1: Right Decorative Creator Cards (Hidden on mobile/tablet, positioned at far edge on xl+) */}
          <div
            className="hidden xl:flex absolute right-[-15px] 2xl:right-2 top-1/2 -translate-y-[52%] items-end gap-2 z-10 pointer-events-none"
            aria-label="Creator showcases right"
          >
            {rightCreators.map((creator, idx) => (
              <div key={idx} className="pointer-events-auto">
                <CreatorShowcaseCard
                  name={creator.name}
                  category={creator.category}
                  image={creator.image}
                  rotation={creator.rotation}
                  offsetY={creator.offsetY}
                  scale={creator.scale}
                  floatVariant={creator.floatVariant}
                  onPreviewClick={() => navigate(creationPath(isAuthenticated, '/projects/new'))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Integrated AI Clipping Preview (Directly Below Hero) */}
        <div className="mt-8 sm:mt-10 lg:mt-12">
          <AiClippingPreview
            onViewAllClips={() => navigate(creationPath(isAuthenticated, '/dashboard'))}
            onClipSelect={() => {}}
          />
        </div>
      </div>
    </section>
  );
}

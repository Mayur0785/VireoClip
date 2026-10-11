import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Maximize2,
  Palette,
  Sliders,
  Sparkles,
  Split,
  Subtitles,
  UploadCloud,
  Users,
  Video,
} from "lucide-react";
import { Logo } from "../components/Logo";
import {
  MomentsPreview,
  TimelineEditorPreview,
  TranscriptPreview,
  TransformationVisual,
  WorkspacePreview,
} from "../components/landing/ProductVisuals";
import { platformOutputs } from "../data/platforms";
import { plans } from "../data/marketing";
import { useLandingMotion } from "../components/landing/useLandingMotion";
import { LandingHero } from "../components/landing/LandingHero";
import { ExploreMajorFeatures } from "../components/landing/ExploreMajorFeatures";
import { useCurrency } from "../context/CurrencyContext";
import { CurrencyToggle } from "../components/CurrencyToggle";
import { getMarketingPlanRate } from "../utils/pricingUtils";
import "./landing.css";
import "./landing-motion.css";
import "./landing-foundation.css";

const platformContent = [
  {
    name: "YouTube",
    label: "TITLE · DESCRIPTION · CHAPTERS",
    title: "Make one idea work across every channel",
    body: "A clear title, a useful description, and chapters that help viewers find the parts they need.",
    details: [
      "Title that leads with the idea",
      "Description shaped from your video",
      "Timestamped chapters",
    ],
  },
  {
    name: "Instagram",
    label: "HOOK · CAPTION · HASHTAGS",
    title: "Your next caption starts here.",
    body: "A first line that earns attention, a caption with a point of view, and relevant hashtags.",
    details: ["Opening hook", "Ready-to-edit caption", "Relevant hashtags"],
  },
  {
    name: "Shorts / Reels",
    label: "MOMENTS · TIMESTAMPS",
    title: "Find the part worth replaying.",
    body: "Spot concise moments in your transcript and return to the right point in the original video.",
    details: ["Moment ideas", "Source timestamps", "Short-form hooks"],
  },
  {
    name: "TikTok",
    label: "HOOK · CAPTION · MOMENT",
    title: "Make the first seconds count.",
    body: "Turn a standout moment into a short-form angle with a clear opening and an editable caption.",
    details: ["Scroll-stopping hook", "Moment idea", "Editable caption"],
  },
  {
    name: "LinkedIn",
    label: "PROFESSIONAL POST",
    title: "Make the idea useful at work.",
    body: "Turn the key lesson from your video into a thoughtful professional post.",
    details: ["Clear opening", "Structured takeaway", "Editable draft"],
  },
  {
    name: "X",
    label: "THREAD",
    title: "Tell the story, post by post.",
    body: "Break an idea into a concise thread that carries the thought from start to finish.",
    details: ["Thread opening", "Connected posts", "Closing thought"],
  },
] as const;
const faqs = [
  {
    q: "What does VireoClip do?",
    a: "VireoClip finds the strongest standalone moments in your long-form videos for short-form clips, and generates ready-to-post content kits across YouTube, Instagram, Shorts/Reels, TikTok, LinkedIn, and X.",
  },
  {
    q: "How does social media scheduling and publishing work?",
    a: "VireoClip includes an automated Social Publishing Queue & Post Scheduling engine. You can prepare, queue, and schedule video clips for YouTube, TikTok, Instagram, LinkedIn, and X. Scheduled background workers manage queue execution and retry recovery. Please note: Direct external publishing requires connecting and authorizing your respective social accounts via secure OAuth. VireoClip provides queue and status management rather than a manual drag-and-drop calendar.",
  },
  {
    q: "What happens to my uploaded videos?",
    a: "Uploaded videos are stored privately and securely. Projects are tied directly to your account so you can return to your transcripts, clips, and generated assets at any time.",
  },
  {
    q: "Which file formats are supported?",
    a: "The upload studio accepts MP4, MOV, WebM, AVI, and MKV video files, as well as direct web video URLs.",
  },
  {
    q: "How large can my video be?",
    a: "Direct video uploads support files up to 2 GB, with long-form recordings up to 2 hours in duration supported.",
  },
  {
    q: "Which platforms can VireoClip generate content for?",
    a: "VireoClip crafts tailored content kits for YouTube, Instagram, Shorts/Reels, TikTok, LinkedIn, and X.",
  },
  {
    q: "Can I edit the generated content?",
    a: "Yes. You can fine-tune clips in our browser multi-track timeline editor (adjusting keyframes, captions, B-roll, and audio), and edit your transcripts, aspect ratios, and social posts directly in the workspace before publishing.",
  },
];

const Cta = ({ className = "" }: { className?: string }) => (
  <Link className={`lv-cta ${className}`} to="/signup">
    Clip a Video <ArrowUpRight size={17} />
  </Link>
);
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="lv-section-label">{children}</span>
);

function PlatformStrip() {
  return (
    <section
      className="lv-platform-strip"
      aria-label="Supported content platforms"
    >
      <p className="lv-reveal">
        Content built for the places your audience already is.
      </p>
      <div className="lv-reveal">
        {platformOutputs.map((output) => (
          <span key={output.name}>
            <span className="lv-platform-mark">
              <img src={output.logo} alt="" loading="lazy" decoding="async" />
            </span>
            {output.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function ProblemAndSolution() {
  const oldTasks = [
    "Re-watch hours of long-form footage",
    "Manual 16:9 to 9:16 vertical re-cropping",
    "Hand-typing subtitles & timing sync",
    "Scattered hunting for relevant B-roll footage",
    "Manual audio cleaning & loudness normalization",
    "Rewriting captions for six different platforms",
    "Fragmented multi-tool chaos across separate apps",
  ];
  const flow = [
    { icon: UploadCloud, title: "Upload", text: "Direct file or video URL up to 2 GB" },
    { icon: Sparkles, title: "AI Clipping", text: "Viral moment detection with score rankings" },
    { icon: Maximize2, title: "Auto-Reframe", text: "Smart 9:16 vertical subject & face tracking" },
    { icon: Subtitles, title: "Smart Captions", text: "Word-level animated presets & B-roll overlays" },
  ];
  return (
    <>
      <section className="lv-problem lv-container">
        <div className="lv-problem-intro lv-reveal lv-reveal-left">
          <Label>THE OLD WAY</Label>
          <h2>
            One video shouldn't mean <em>hours of manual re-editing.</em>
          </h2>
          <p>Eliminate tedious reframing, captioning, and multi-platform rewriting.</p>
        </div>
        <div className="lv-old-workflow lv-reveal lv-reveal-right">
          <div className="lv-old-header">
            <Video size={17} />
            <span>Video is finished</span>
            <span className="lv-old-still">But the editing isn't.</span>
          </div>
          <ol>
            {oldTasks.map((task, i) => (
              <li key={task}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {task}
                <span className="lv-old-line" />
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section id="solutions" className="lv-solution">
        <div className="lv-container">
          <div className="lv-solution-heading lv-reveal">
            <div>
              <Label>THE VIREOCLIP WAY</Label>
              <h2>
                VireoClip automates the <em>video repurposing pipeline.</em>
              </h2>
            </div>
            <p>
              Your source video transforms into polished vertical clips, synchronized captions, and platform-native drafts in minutes.
            </p>
          </div>
          <div className="lv-flow lv-reveal-group">
            {flow.map((step, i) => (
              <div className="lv-flow-item" key={step.title}>
                <span className="lv-flow-icon">
                  <step.icon size={21} />
                </span>
                <span className="lv-flow-number">0{i + 1}</span>
                <strong>{step.title}</strong>
                <small>{step.text}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function ProductShowcase() {
  return (
    <section id="product" className="lv-showcase lv-container">
      <div className="lv-showcase-row">
        <div className="lv-showcase-copy lv-reveal lv-reveal-left">
          <Label>01 / TRANSCRIPT</Label>
          <h2>
            Your complete transcript, <em>without the busywork.</em>
          </h2>
          <p>
            Vireo turns spoken words into a readable, timestamped transcript.
            Find the line you need and keep the original idea close.
          </p>
          <div className="lv-showcase-note">
            <AudioLines size={18} /> Transcript · language · duration ·
            timestamps
          </div>
        </div>
        <TranscriptPreview />
      </div>
      <div className="lv-showcase-row lv-showcase-row-reverse">
        <WorkspacePreview />
        <div className="lv-showcase-copy lv-reveal lv-reveal-right">
          <Label>02 / CONTENT</Label>
          <h2>
            One story, shaped for <em>every platform.</em>
          </h2>
          <p>
            Start with YouTube titles and descriptions, Instagram hooks and
            captions, Shorts/Reels moments, TikTok hooks, LinkedIn posts and X
            threads. Edit every draft in your workspace.
          </p>
          <div className="lv-showcase-note">
            <FileText size={18} /> Review, edit and copy your drafts
          </div>
        </div>
      </div>
      <div className="lv-showcase-row">
        <div className="lv-showcase-copy lv-reveal lv-reveal-left">
          <Label>03 / MOMENTS</Label>
          <h2>
            Find the moments <em>worth sharing.</em>
          </h2>
          <p>
            Revisit standout lines in the transcript with timestamps that point
            back to the original video.
          </p>
          <div className="lv-showcase-note">
            <Clock3 size={18} /> Short-form ideas with source timestamps
          </div>
        </div>
        <MomentsPreview />
      </div>
      <div className="lv-showcase-row lv-showcase-row-reverse">
        <TimelineEditorPreview />
        <div className="lv-showcase-copy lv-reveal lv-reveal-right">
          <Label>04 / PRO TIMELINE EDITOR</Label>
          <h2>
            Multi-track timeline editing, <em>directly in your browser.</em>
          </h2>
          <p>
            Fine-tune clips in VireoClip's studio editor with dedicated tracks for video, B-roll, captions, and audio. Adjust keyframes, apply dynamic transitions, customize animated word-level subtitles, trim clip boundaries with precision, and export high-definition MP4 renders.
          </p>
          <div className="lv-showcase-note">
            <Sliders size={18} /> Timeline tracks · keyframes · transitions · captions
          </div>
          <div className="pt-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20E3A2] hover:text-[#56D9E8] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#20E3A2] rounded py-1 px-2.5 bg-white/[0.04] border border-white/10"
            >
              <span>Access studio editor via your project dashboard</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformOutputs() {
  const [active, setActive] = useState(0);
  const output = platformContent[active];
  return (
    <section id="platforms" className="lv-outputs">
      <div className="lv-container">
        <div className="lv-output-heading lv-reveal">
          <div>
            <Label>MADE FOR EACH CHANNEL</Label>
            <h2>
              One video.
              <br />
              <em>Six content channels.</em>
            </h2>
          </div>
          <p>
            A different format for each audience, with your original idea at the
            center.
          </p>
        </div>
        <div
          className="lv-output-switcher lv-reveal"
          role="tablist"
          aria-label="Content platform previews"
        >
          {platformContent.map((platform, i) => (
            <button
              key={platform.name}
              id={`platform-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-controls="platform-panel"
              tabIndex={active === i ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next =
                    (i +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      platformContent.length) %
                    platformContent.length;
                  setActive(next);
                  document.getElementById(`platform-tab-${next}`)?.focus();
                }
              }}
            >
              {platform.name}
            </button>
          ))}
        </div>
        <div
          id="platform-panel"
          className="lv-output-panel"
          role="tabpanel"
          aria-labelledby={`platform-tab-${active}`}
          tabIndex={0}
        >
          <div className="lv-output-panel-main" key={`main-${active}`}>
            <span className="lv-output-label">{output.label}</span>
            <h3>{output.title}</h3>
            <p>{output.body}</p>
            <span className="lv-output-example">
              Illustrative content preview
            </span>
          </div>
          <div className="lv-output-panel-aside" key={`aside-${active}`}>
            <span className="lv-mini-eyebrow">IN YOUR CONTENT KIT</span>
            {output.details.map((detail, i) => (
              <div key={detail}>
                <span>0{i + 1}</span>
                <strong>{detail}</strong>
                <Check size={16} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BeforeAfter() {
  return (
    <section className="lv-before-after lv-container">
      <div className="lv-before-title lv-reveal lv-reveal-left">
        <Label>A BETTER WAY TO CREATE</Label>
        <h2>
          One recording.
          <br />
          <em>Every channel ready.</em>
        </h2>
      </div>
      <div className="lv-before-compare lv-reveal-group">
        <div>
          <span>THE OLD FRAGMENTED WORKFLOW</span>
          <strong>Manual timeline reframing (16:9 → 9:16)</strong>
          <strong>Hand-typed subtitle timing</strong>
          <strong>Scattered stock B-roll hunting</strong>
          <strong>Rewriting drafts across 6 apps</strong>
        </div>
        <ArrowRight className="lv-before-arrow" size={26} />
        <div>
          <span>THE VIREOCLIP PIPELINE</span>
          <strong>Automated 9:16 smart subject reframe</strong>
          <strong>Instant animated word-level captions</strong>
          <strong>Contextual AI B-roll overlays</strong>
          <strong>Unified studio, branding & publishing queue</strong>
        </div>
      </div>
    </section>
  );
}

function FeatureBento() {
  return (
    <section id="features" className="lv-features">
      <div className="lv-container">
        <div className="lv-feature-heading lv-reveal">
          <Label>INTELLIGENT CREATOR SUITE</Label>
          <h2>
            Engineered for growth,
            <br />
            <em>built for teams.</em>
          </h2>
        </div>
        <div className="lv-bento lv-reveal-group">
          {/* 1. Core AI Video Ingestion & Clipping */}
          <div className="lv-bento-card lv-bento-wide">
            <AudioLines size={22} />
            <h3>AI transcription & viral detection</h3>
            <p>Word-level Whisper transcripts paired with viral hook and sweet-spot scoring (0–100).</p>
            <div className="lv-bento-quote">
              <span>00:42</span> “Extract high-impact standalone moments automatically.”
            </div>
          </div>

          {/* 2. Platform Content Packs */}
          <div className="lv-bento-card lv-bento-sage">
            <FileText size={22} />
            <h3>Platform-specific content kits</h3>
            <p>Ready-to-publish titles, hooks, captions, and thread kits tailored for each algorithm.</p>
            <div className="lv-bento-pills">
              {platformOutputs.map((output) => (
                <span key={output.name}>{output.name}</span>
              ))}
            </div>
          </div>

          {/* 3. Timestamped Moments */}
          <div className="lv-bento-card">
            <Clock3 size={22} />
            <h3>Timestamped source moments</h3>
            <p>Jump to exact video timestamps with explainable viral moment rankings.</p>
            <div className="lv-bento-time">
              00:18 <span>→</span> 00:42 <span>→</span> 01:06
            </div>
          </div>

          {/* 4. Brand Brain & Style Rules -> /brand */}
          <div className="lv-bento-card">
            <Palette size={22} className="text-[#20E3A2]" />
            <h3>Brand Brain & style rules</h3>
            <p>Enforce brand voice tone rules, custom color palettes, typography, and logo watermarks across every clip.</p>
            <Link
              to="/brand"
              className="mt-auto pt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#20E3A2] hover:text-[#56D9E8] transition-colors focus-visible:outline-none focus-visible:underline"
            >
              <span>Configure Brand Brain</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>

          {/* 5. A/B Testing Studio -> /ab-testing */}
          <div className="lv-bento-card">
            <Split size={22} className="text-purple-400" />
            <h3>A/B Testing Studio</h3>
            <p>Evaluate hooks, titles, and thumbnail variants with two-proportion Z-score statistical confidence.</p>
            <Link
              to="/ab-testing"
              className="mt-auto pt-3 inline-flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors focus-visible:outline-none focus-visible:underline"
            >
              <span>Open A/B Studio</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>

          {/* 6. Cross-Platform Analytics -> /analytics */}
          <div className="lv-bento-card">
            <BarChart3 size={22} className="text-cyan-400" />
            <h3>Cross-Platform Analytics</h3>
            <p>Monitor engagement, retention signals, and publishing history across connected channels in one view.</p>
            <Link
              to="/analytics"
              className="mt-auto pt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:underline"
            >
              <span>Explore Analytics</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>

          {/* 7. Team Workspaces & RBAC -> /workspaces */}
          <div className="lv-bento-card">
            <Users size={22} className="text-emerald-400" />
            <h3>Team Workspaces & RBAC</h3>
            <p>Collaborate across isolated workspaces with Owner, Admin, Editor, and Viewer permissions and secure invites.</p>
            <Link
              to="/workspaces"
              className="mt-auto pt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors focus-visible:outline-none focus-visible:underline"
            >
              <span>Manage Workspaces</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {
      number: "01",
      title: "YouTube creators",
      text: "A published video can become captions, posts and short-form starting points.",
    },
    {
      number: "02",
      title: "Podcasters",
      text: "Turn a recorded conversation into shareable takeaways for each channel.",
    },
    {
      number: "03",
      title: "Founders & personal brands",
      text: "Keep your ideas moving without rewriting them from scratch.",
    },
  ];
  return (
    <section id="use-cases" className="lv-use-cases">
      <div className="lv-container">
        <div className="lv-use-heading lv-reveal">
          <Label>BUILT FOR CREATORS</Label>
          <h2>
            Spend more time creating.
            <br />
            <em>Less time repurposing.</em>
          </h2>
        </div>
        <div className="lv-use-list lv-reveal-group">
          {cases.map((item) => (
            <div key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <ArrowUpRight size={20} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Upload your video",
      text: "Choose a supported video file or web URL up to 2 GB.",
    },
    {
      title: "VireoClip transcribes & clips",
      text: "AI detects high-scoring moments with word-level synchronized timing.",
    },
    {
      title: "Auto-reframe & style",
      text: "Apply 9:16 face-tracking, animated captions, B-roll, and brand presets.",
    },
    {
      title: "Review, queue & schedule",
      text: "Queue posts with scheduled release dates or publish directly once your social accounts are connected.",
    },
  ];
  return (
    <section id="how" className="lv-how lv-container relative">
      <div id="resources" className="absolute -top-24 left-0 pointer-events-none" aria-hidden="true" />
      <div className="lv-how-heading lv-reveal">
        <Label>HOW IT WORKS</Label>
        <h2>
          From upload to <em>everywhere.</em>
        </h2>
      </div>
      <div className="lv-timeline lv-reveal-group">
        {steps.map((step, i) => (
          <div key={step.title}>
            <span className="lv-timeline-dot">0{i + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const { currency } = useCurrency();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  return (
    <section id="pricing" className="lv-pricing">
      <div className="lv-container">
        <div className="lv-pricing-heading lv-reveal">
          <div>
            <Label>PLANS</Label>
            <h2>
              Start with the <em>essentials.</em>
            </h2>
          </div>
          <p>
            Free tier with 15 processing minutes is available immediately upon signup.
            Paid tiers (Creator, Pro, Studio) are configured in-app; live payment checkout is currently undergoing sandbox verification prior to public commercial release.
          </p>
        </div>

        {/* Currency & Cadence Controls Bar */}
        <div className="lv-pricing-controls lv-reveal">
          <div className="lv-cadence-toggle" role="group" aria-label="Billing interval selection">
            <button
              type="button"
              onClick={() => setBillingInterval('month')}
              className={`lv-cadence-btn ${billingInterval === 'month' ? 'active' : ''}`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => {
                if (currency === 'INR') {
                  return;
                }
                setBillingInterval('year');
              }}
              disabled={currency === 'INR'}
              title={currency === 'INR' ? 'Annual billing unconfigured for INR' : 'Yearly Billing (Save ~17%)'}
              className={`lv-cadence-btn ${billingInterval === 'year' ? 'active' : ''} ${currency === 'INR' ? 'disabled' : ''}`}
            >
              <span>Yearly Billing</span>
              {currency === 'INR' ? (
                <span className="lv-cadence-badge lv-cadence-badge-warn">Unavailable for INR</span>
              ) : (
                <span className="lv-cadence-badge">Save ~17%</span>
              )}
            </button>
          </div>

          <div className="lv-pricing-currency-wrap">
            <span className="lv-currency-label">Currency:</span>
            <CurrencyToggle size="sm" />
          </div>
        </div>

        <div className="lv-pricing-grid lv-reveal-group">
          {plans.map((plan) => {
            const planId = plan.name.toLowerCase() as 'free' | 'creator' | 'pro' | 'studio';
            const rate = getMarketingPlanRate(planId, billingInterval, currency);

            return (
              <div
                className={`lv-plan ${plan.name === "Pro" ? "lv-plan-featured" : ""}`}
                key={plan.name}
              >
                <div className="lv-plan-top">
                  <h3>{plan.name}</h3>
                  {plan.badge && <span>{plan.badge}</span>}
                </div>
                <strong>
                  {rate.symbol}{rate.amount}
                  <span className="text-xs font-sans font-normal text-muted-foreground ml-1.5">
                    {rate.periodText}
                  </span>
                </strong>
                {rate.savingsBadge && (
                  <div className="text-[11px] font-semibold text-[#20E3A2] mt-1">
                    {rate.savingsBadge}
                  </div>
                )}
                {!rate.isAvailable && (
                  <div className="text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 mt-1">
                    Annual billing is unconfigured for INR
                  </div>
                )}
                <p>{plan.description}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.available ? (
                  <Cta className="lv-plan-cta" />
                ) : (
                  <span
                    className="lv-plan-unavailable px-2 text-center text-[11px] leading-tight"
                    title="Live payment gateway verification in progress"
                  >
                    {plan.statusNote}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="lv-faq">
      <div className="lv-container lv-faq-inner">
        <div className="lv-faq-header lv-reveal lv-reveal-left">
          <Label>FAQ</Label>
          <h2>
            Good to know
            <br />
            <em>before you begin.</em>
          </h2>
          <p>The practical details for your first video.</p>
        </div>
        <div
          className="lv-faq-list lv-reveal lv-reveal-right"
          role="region"
          aria-label="Frequently Asked Questions"
        >
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const btnId = `faq-btn-${index}`;
            const panelId = `faq-panel-${index}`;

            return (
              <div
                key={faq.q}
                className={`lv-faq-item ${isOpen ? "lv-faq-item-open" : ""}`}
              >
                <button
                  type="button"
                  id={btnId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleFaq(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleFaq(index);
                    }
                  }}
                  className="lv-faq-trigger"
                >
                  <span className="lv-faq-question">{faq.q}</span>
                  <span className="lv-faq-icon-wrapper" aria-hidden="true">
                    <ChevronDown
                      size={18}
                      className={`lv-faq-chevron ${isOpen ? "lv-faq-chevron-open" : ""}`}
                    />
                  </span>
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className="lv-faq-panel"
                >
                  <div className="lv-faq-panel-inner">
                    <p>{faq.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="lv-final lv-motion-loop">
      <div className="lv-final-orbit lv-final-orbit-one" />
      <div className="lv-final-orbit lv-final-orbit-two" />
      <div className="lv-container lv-final-content lv-reveal">
        <Logo light />
        <Label>ONE VIDEO. EVERY PLATFORM.</Label>
        <h2>
          Your next video is already
          <br />
          <em>more than one piece of content.</em>
        </h2>
        <p>Turn it into an entire content kit with Vireo.</p>
        <Cta />
      </div>
    </section>
  );
}

export function LandingPage() {
  const pageRef = useRef<HTMLElement>(null);
  useLandingMotion(pageRef);

  useEffect(() => {
    // Disable automatic browser scroll restoration so page reloads reliably start at top
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const navEntries = performance.getEntriesByType('navigation');
    const isReload =
      navEntries.length > 0
        ? (navEntries[0] as PerformanceNavigationTiming).type === 'reload'
        : (performance as any).navigation?.type === 1;

    if (isReload) {
      // On page refresh at root landing page, clear any lingering anchor hash and start at top hero
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }

    // Direct initial navigation with an explicit hash (e.g. typing /#pricing or deep link)
    const hash = window.location.hash.replace('#', '');
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }

    const slideIds = ['clipping', 'captions', 'reframe', 'broll', 'audio', 'voice'];
    if (slideIds.includes(hash)) {
      window.dispatchEvent(new CustomEvent('vireo:goto-slide', { detail: { slideId: hash } }));
      const sc = document.getElementById('showcase') || document.querySelector('.vireo-showcase');
      sc?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const el = document.getElementById(hash);
      if (el) {
        const navbarOffset = 80;
        const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, []);

  // Synchronize browser back/forward buttons with anchor scroll positions
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const el = document.getElementById(hash);
        if (el) {
          const navbarOffset = 80;
          const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  return (
    <main className="lv-page" ref={pageRef}>
      <LandingHero />
      <ExploreMajorFeatures id="major-features" />
      <section className="lv-transformation">
        <div className="lv-container">
          <div className="lv-transformation-heading lv-reveal">
            <Label>THE TRANSFORMATION</Label>
            <h2>
              One upload.
              <br />
              <em>Every platform covered.</em>
            </h2>
          </div>
          <TransformationVisual />
        </div>
      </section>
      <PlatformStrip />
      <ProblemAndSolution />
      <ProductShowcase />
      <PlatformOutputs />
      <BeforeAfter />
      <FeatureBento />
      <UseCases />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <FinalCTA />
    </main>
  );
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  FileText,
  LockKeyhole,
  Settings2,
  Sparkles,
  UploadCloud,
  Video,
} from "lucide-react";
import { Logo } from "../components/Logo";
import {
  MomentsPreview,
  TranscriptPreview,
  TransformationVisual,
  WorkspacePreview,
} from "../components/landing/ProductVisuals";
import { platformOutputs } from "../data/platforms";
import { plans } from "../data/marketing";
import { useLandingMotion } from "../components/landing/useLandingMotion";
import { LandingHero } from "../components/landing/LandingHero";
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
    q: "What does Vireo do?",
    a: "Vireo finds the strongest standalone moments in your long-form videos for short-form clips, and generates ready-to-post content kits across YouTube, Instagram, Shorts/Reels, TikTok, LinkedIn, and X.",
  },
  {
    q: "What happens to my uploaded videos?",
    a: "Uploaded videos are stored privately. Projects are tied to your account so you can return to your transcript and generated content.",
  },
  {
    q: "Which file formats are supported?",
    a: "The upload form accepts MP4, MOV, WEBM, AVI and MKV files.",
  },
  { q: "How large can my video be?", a: "Video uploads can be up to 50 MB." },
  {
    q: "Which platforms can Vireo generate content for?",
    a: "Vireo drafts content for YouTube, Instagram, Shorts/Reels, TikTok, LinkedIn and X.",
  },
  {
    q: "Can I edit the generated content?",
    a: "Yes. Review and edit your drafts before copying them to publish through your own channels.",
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
    "Watch the video again",
    "Write the title & description",
    "Find Shorts / Reels moments",
    "Write the caption & hashtags",
    "Write a TikTok hook",
    "Create a LinkedIn post",
    "Write an X thread",
  ];
  const flow = [
    { icon: UploadCloud, title: "Upload", text: "Start with a video" },
    { icon: AudioLines, title: "Transcribe", text: "Get the words" },
    { icon: Sparkles, title: "Understand", text: "Find the ideas" },
    { icon: ArrowUpRight, title: "Repurpose", text: "Shape every draft" },
  ];
  return (
    <>
      <section className="lv-problem lv-container">
        <div className="lv-problem-intro lv-reveal lv-reveal-left">
          <Label>THE OLD WAY</Label>
          <h2>
            One video shouldn't create <em>five more hours of work.</em>
          </h2>
          <p>Stop rewriting the same idea for every platform.</p>
        </div>
        <div className="lv-old-workflow lv-reveal lv-reveal-right">
          <div className="lv-old-header">
            <Video size={17} />
            <span>Video is finished</span>
            <span className="lv-old-still">But the work isn't.</span>
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
      <section className="lv-solution">
        <div className="lv-container">
          <div className="lv-solution-heading lv-reveal">
            <div>
              <Label>THE VIREO WAY</Label>
              <h2>
                Vireo does the <em>repurposing</em> for you.
              </h2>
            </div>
            <p>
              Your video stays the source. Vireo gives you a useful starting
              point for each channel.
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
        <Label>A BETTER WAY TO WORK</Label>
        <h2>
          Same video.
          <br />
          <em>More places to go.</em>
        </h2>
      </div>
      <div className="lv-before-compare lv-reveal-group">
        <div>
          <span>BEFORE VIREO</span>
          <strong>One video</strong>
          <strong>Six platforms</strong>
          <strong>Hours of manual writing</strong>
        </div>
        <ArrowRight className="lv-before-arrow" size={26} />
        <div>
          <span>WITH VIREO</span>
          <strong>One upload</strong>
          <strong>One transcript</strong>
          <strong>Multiple ready-to-use drafts</strong>
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
          <Label>THOUGHTFULLY BUILT</Label>
          <h2>
            Everything after the upload,
            <br />
            <em>in one place.</em>
          </h2>
        </div>
        <div className="lv-bento lv-reveal-group">
          <div className="lv-bento-card lv-bento-wide">
            <AudioLines size={22} />
            <h3>AI transcription</h3>
            <p>Start with the words you actually said.</p>
            <div className="lv-bento-quote">
              <span>00:42</span> “Shape the same message for every channel.”
            </div>
          </div>
          <div className="lv-bento-card lv-bento-sage">
            <FileText size={22} />
            <h3>Platform-specific drafts</h3>
            <p>Titles, captions, posts and threads with a format in mind.</p>
            <div className="lv-bento-pills">
              {platformOutputs.map((output) => (
                <span key={output.name}>{output.name}</span>
              ))}
            </div>
          </div>
          <div className="lv-bento-card">
            <Clock3 size={22} />
            <h3>Timestamped moments</h3>
            <p>Return to the right line when you want a short-form idea.</p>
            <div className="lv-bento-time">
              00:18 <span>→</span> 00:42 <span>→</span> 01:06
            </div>
          </div>
          <div className="lv-bento-card">
            <Settings2 size={22} />
            <h3>Creator preferences</h3>
            <p>Set your niche, audience, language and tone.</p>
          </div>
          <div className="lv-bento-card">
            <LockKeyhole size={22} />
            <h3>Private uploads</h3>
            <p>Your source video belongs in your own account workspace.</p>
          </div>
          <div className="lv-bento-card">
            <Copy size={22} />
            <h3>Project history</h3>
            <p>Return to a project and keep refining your content.</p>
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
      text: "Choose a supported video file up to 50 MB.",
    },
    {
      title: "Vireo transcribes it",
      text: "Get a readable source transcript with timing where available.",
    },
    {
      title: "Generate for every channel",
      text: "Create platform-specific drafts from your original message.",
    },
    {
      title: "Review, copy & publish",
      text: "Edit what you need, then share through your own channels.",
    },
  ];
  return (
    <section id="how" className="lv-how lv-container">
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
        <div className="lv-pricing-grid lv-reveal-group">
          {plans.map((plan) => (
            <div
              className={`lv-plan ${plan.name === "Pro" ? "lv-plan-featured" : ""}`}
              key={plan.name}
            >
              <div className="lv-plan-top">
                <h3>{plan.name}</h3>
                {plan.badge && <span>{plan.badge}</span>}
              </div>
              <strong>
                {plan.price}
                {plan.period && (
                  <span className="text-xs font-sans font-normal text-muted-foreground ml-1.5">
                    {plan.period}
                  </span>
                )}
              </strong>
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
                <span className="lv-plan-unavailable px-2 text-center text-[11px] leading-tight" title="Live payment gateway verification in progress">
                  {plan.statusNote}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="lv-faq lv-container">
      <div className="lv-reveal lv-reveal-left">
        <Label>FAQ</Label>
        <h2>
          Good to know
          <br />
          <em>before you begin.</em>
        </h2>
        <p>The practical details for your first video.</p>
      </div>
      <div className="lv-faq-list lv-reveal lv-reveal-right">
        {faqs.map((faq) => (
          <details key={faq.q}>
            <summary>
              {faq.q}
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <p>{faq.a}</p>
          </details>
        ))}
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
  return (
    <main className="lv-page" ref={pageRef}>
      <LandingHero />
      <section className="lv-transformation lv-container">
        <div className="lv-transformation-heading lv-reveal">
          <Label>THE TRANSFORMATION</Label>
          <h2>
            One upload.
            <br />
            <em>Every platform covered.</em>
          </h2>
        </div>
        <TransformationVisual />
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

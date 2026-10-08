import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Link2, Play, UploadCloud, WandSparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import brandMark from '../../assets/brand/vireo-mark.svg';
import creatorVideo from '../../assets/landing/creator-video.webp';
import creatorMomentTwo from '../../assets/landing/creator-moment-2.webp';
import creatorMomentThree from '../../assets/landing/creator-moment-3.webp';

const featureChips = ['AI Clipping', 'AI Captions', 'AI Reframe', 'AI Producer'] as const;

const demoClips = [
  { score: 94, title: 'A stronger opening', duration: '00:28', image: creatorVideo },
  { score: 89, title: 'The key takeaway', duration: '00:32', image: creatorMomentTwo },
  { score: 86, title: 'The closing thought', duration: '00:26', image: creatorMomentThree },
] as const;

const waveform = Array.from({ length: 76 }, (_, index) => {
  const wave = Math.abs(Math.sin(index * 1.71) * Math.cos(index * 0.42));
  return Math.round(13 + wave * 42 + Math.abs(Math.sin(index * 0.17)) * 12);
});

function creationPath(isAuthenticated: boolean, path: string) {
  return isAuthenticated ? path : `/signup?next=${encodeURIComponent(path)}`;
}

function HeroInput() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
      setError('');
      const projectPath = `/projects/new?url=${encodeURIComponent(trimmed)}`;
      navigate(creationPath(isAuthenticated, projectPath));
    } catch {
      setError('Enter a valid YouTube or direct video URL, including https://.');
    }
  }

  return (
    <div className="lp-hero-create">
      <form className="lp-hero-form" onSubmit={submit} noValidate>
        <Link2 size={20} aria-hidden="true" />
        <label className="sr-only" htmlFor="lp-video-url">YouTube or direct video URL</label>
        <input
          id="lp-video-url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="Paste a YouTube or video link..."
          value={url}
          onChange={(event) => { setUrl(event.target.value); if (error) setError(''); }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'lp-video-url-error' : undefined}
        />
        <button className="lp-button lp-button-jade" type="submit">
          Get free clips <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
      {error && <p id="lp-video-url-error" className="lp-form-error" role="alert">{error}</p>}
      <Link className="lp-upload-link" to={creationPath(isAuthenticated, '/projects/new')}>
        <UploadCloud size={17} aria-hidden="true" /> Upload video
      </Link>
    </div>
  );
}

function FeatureChipRail() {
  const [active, setActive] = useState<(typeof featureChips)[number]>('AI Clipping');
  return (
    <div className="lp-feature-rail" role="group" aria-label="Vireo product features">
      {featureChips.map((label) => (
        <button
          key={label}
          type="button"
          className="lp-feature-chip"
          aria-pressed={active === label}
          onClick={() => setActive(label)}
        >
          <WandSparkles size={15} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}

function HeroProductStage() {
  return (
    <div className="lp-product-stage" aria-label="Illustrative Vireo clipping workspace showing a video, waveform and three clip suggestions">
      <div className="lp-product-topbar">
        <div className="lp-product-brand"><img src={brandMark} alt="" /> <strong>vireo</strong></div>
        <span className="lp-product-file">podcast-interview.mp4</span>
        <span className="lp-demo-tag">DEMO PREVIEW</span>
      </div>
      <div className="lp-product-main">
        <div className="lp-product-video">
          <img src={creatorVideo} alt="Creator speaking in a studio" fetchPriority="high" />
          <span className="lp-product-video-overlay"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
          <span className="lp-product-video-duration">42:18 source video</span>
        </div>
        <div className="lp-product-analysis">
          <div className="lp-product-analysis-heading"><span>AI Suggestions</span><span className="lp-live-dot" /></div>
          <strong>3 moments found</strong>
          <p>Standout moments from your original conversation.</p>
          <div className="lp-analysis-points">
            <span><Check size={15} /> Strong opening</span>
            <span><Check size={15} /> Complete thought</span>
            <span><Check size={15} /> Clear takeaway</span>
          </div>
        </div>
      </div>
      <div className="lp-product-timeline">
        <div className="lp-product-timeline-label"><span>Source timeline</span><span>00:00 — 42:18</span></div>
        <div className="lp-waveform" aria-hidden="true">
          {waveform.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
          <span className="lp-wave-highlight lp-wave-highlight-1" />
          <span className="lp-wave-highlight lp-wave-highlight-2" />
          <span className="lp-wave-highlight lp-wave-highlight-3" />
        </div>
      </div>
      <div className="lp-clips-heading"><span>Suggested clips</span><span>Clip Score</span></div>
      <div className="lp-clip-list">
        {demoClips.map((clip) => (
          <div className="lp-clip-card" key={clip.score}>
            <div className="lp-clip-image"><img src={clip.image} alt="" loading="lazy" /><span>{clip.duration}</span></div>
            <div className="lp-clip-meta"><strong>{clip.title}</strong><span>Clip Score <b>{clip.score}</b></span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-inner">
        <div className="lp-hero-copy">
          <div className="lp-hero-eyebrow"><span /> BEST FREE AI VIDEO CLIPPING TOOL</div>
          <h1 id="hero-title">One video in.<br /><span>Your <em>best content out.</em></span></h1>
          <p className="lp-hero-subhead">Vireo finds strong moments, helps you shape short clips, adds captions, and creates ready-to-edit content for every channel.</p>
          <HeroInput />
          <div className="lp-hero-trust" aria-label="Getting started details">
            <span><Check size={15} /> Free plan available</span>
            <span><Check size={15} /> No credit card required</span>
            <span><Check size={15} /> YouTube, uploads &amp; direct links</span>
          </div>
        </div>
        <div className="lp-hero-visual">
          <FeatureChipRail />
          <HeroProductStage />
        </div>
      </div>
    </section>
  );
}

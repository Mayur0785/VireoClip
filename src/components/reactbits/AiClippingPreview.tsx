import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCinematicScrollReveal } from '../../hooks/useCinematicScrollReveal';
import { projectService } from '../../services/projectService';
import { clipService } from '../../services/clipService';
import { ClipCandidate } from '../../types';

// Stills & thumbnails from project assets
import creatorVideo from '../../assets/landing/creator-video.webp';
import creatorMomentTwo from '../../assets/landing/creator-moment-2.webp';
import creatorMomentThree from '../../assets/landing/creator-moment-3.webp';
import creator1 from '../../assets/creators/creator-1.jpg';
import creator2 from '../../assets/creators/creator-2.jpg';
import creator3 from '../../assets/creators/creator-3.jpg';
import creator4 from '../../assets/creators/creator-4.jpg';

export interface AiClippingPreviewProps {
  className?: string;
  videoSrc?: string;
  onClipSelect?: (clipIndex: number) => void;
  onViewAllClips?: () => void;
}

interface ClipDisplayItem {
  id: string;
  title: string;
  duration: string;
  timestamp: string;
  thumbnail: string;
  videoSrc: string;
  platform: 'YT' | 'IG' | 'in' | 'TT' | 'f' | 'X';
  score: number;
  isReal?: boolean;
  projectId?: string;
}

// 10 Original Demo MP4 Assets (order, content & mappings preserved exactly)
const DEMO_VIDEOS = [
  '/demo/showcase/v0.mp4',
  '/demo/showcase/v1.mp4',
  '/demo/showcase/v2.mp4',
  '/demo/showcase/v3.mp4',
  '/demo/showcase/v4.mp4',
  '/demo/showcase/v5.mp4',
  '/demo/showcase/v6.mp4',
  '/demo/showcase/v7.mp4',
  '/demo/showcase/v8.mp4',
  '/demo/showcase/v9.mp4',
];

const DEMO_POSTERS = [
  creatorVideo,
  creatorMomentTwo,
  creatorMomentThree,
  creator1,
  creator2,
  creator3,
  creator4,
  '/demo/thumbnails/clip-1-hook.jpg',
  '/demo/thumbnails/clip-2-reaction.jpg',
  '/demo/thumbnails/clip-3-challenge.jpg',
];

const CLIPV = [7, 9, 2, 1, 8, 0];
const SCORES = [97, 99, 94, 98, 96, 92];
const ICONS: ('YT' | 'IG' | 'in' | 'TT' | 'f' | 'X')[] = ['YT', 'IG', 'in', 'TT', 'f', 'X'];

const LAYOUTS = [
  'Podcast layout',
  'Split layout',
  'ScreenShare layout',
  'Fill layout',
  'Speaker layout',
];

const rnd = (s: number) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const clean = (i: number) =>
  12 + 58 * Math.abs(Math.sin(i * 0.33 + 0.6)) * (0.55 + 0.45 * Math.sin(i * 0.09 + 1));

const formatSeconds = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * Resource-conscious Carousel Video Component:
 * - When shouldLoad is false: unmounts video, frees media buffers & decoders.
 * - When shouldLoad is true: mounts video with metadata-first preload strategy.
 * - When shouldPlay is true: plays video; when shouldPlay is false: strictly pauses.
 * - Preserves video poster and first-frame cueing.
 */
interface CarouselVideoProps {
  src: string;
  poster?: string;
  pos?: string;
  origin?: string;
  zoom?: number;
  shouldLoad: boolean;
  shouldPlay: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const CarouselVideo: React.FC<CarouselVideoProps> = React.memo(({
  src,
  poster,
  pos = '50% 50%',
  origin,
  zoom = 1,
  shouldLoad,
  shouldPlay,
  className = 'vf',
  style,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (!shouldLoad) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      return;
    }

    if (shouldPlay) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      v.pause();
    }
  }, [shouldLoad, shouldPlay, src]);

  const handleLoadedData = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.paused && v.currentTime === 0) {
      try {
        v.currentTime = 0.05;
      } catch {}
    }
  }, []);

  if (!shouldLoad) {
    return null;
  }

  const transformOrigin = origin || pos;

  return (
    <video
      ref={videoRef}
      className={className}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload={shouldPlay ? 'auto' : 'metadata'}
      aria-hidden="true"
      onLoadedData={handleLoadedData}
      style={{
        objectPosition: pos,
        transformOrigin,
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        ...style,
      }}
    />
  );
});

CarouselVideo.displayName = 'CarouselVideo';

/**
 * Video Tile helper component matching V(...) from original design.
 * Memoized outside parent to avoid re-creating component type on re-render.
 */
interface VideoTileProps {
  left?: number | string;
  top?: number | string;
  width?: number | string;
  height?: number | string;
  clipIndex: number;
  pos?: string;
  origin?: string;
  zoom?: number;
  cls?: string;
  shouldLoad: boolean;
  shouldPlay: boolean;
  children?: React.ReactNode;
}

const VideoTile: React.FC<VideoTileProps> = React.memo(({
  left,
  top,
  width,
  height,
  clipIndex,
  pos = '50% 50%',
  origin,
  zoom = 1,
  cls = '',
  shouldLoad,
  shouldPlay,
  children,
}) => {
  const transformOrigin = origin || pos;
  const videoSrc = DEMO_VIDEOS[clipIndex % DEMO_VIDEOS.length];
  const posterSrc = DEMO_POSTERS[clipIndex % DEMO_POSTERS.length];

  return (
    <div
      className={`tl ${cls} ${shouldLoad ? 'hasvid' : ''}`}
      data-v={clipIndex}
      data-pos={pos}
      data-origin={transformOrigin}
      data-zoom={zoom}
      style={{
        left: typeof left === 'number' ? `${left}%` : left,
        top: typeof top === 'number' ? `${top}%` : top,
        width: typeof width === 'number' ? `${width}%` : width,
        height: typeof height === 'number' ? `${height}%` : height,
      }}
    >
      <CarouselVideo
        src={videoSrc}
        poster={posterSrc}
        pos={pos}
        origin={transformOrigin}
        zoom={zoom}
        shouldLoad={shouldLoad}
        shouldPlay={shouldPlay}
      />
      <i className="p" aria-hidden="true" />
      {children}
    </div>
  );
});

VideoTile.displayName = 'VideoTile';

export const AiClippingPreview: React.FC<AiClippingPreviewProps> = ({
  className = '',
  onClipSelect,
  onViewAllClips,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isHeldRef = useRef<boolean>(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useCinematicScrollReveal(containerRef, { threshold: 0.05 });

  const [cur, setCur] = useState<number>(0);
  const [isInView, setIsInView] = useState<boolean>(false);
  const [animKey, setAnimKey] = useState<number>(0);
  const [reframeLayout, setReframeLayout] = useState<number>(0);
  const [isUserInteracted, setIsUserInteracted] = useState<boolean>(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);

  const isInViewRef = useRef<boolean>(false);
  const hasTriggeredInViewRef = useRef<boolean>(false);
  const userInteractedTabRef = useRef<boolean>(false);

  // Ingestion & URL state
  const [urlInput, setUrlInput] = useState<string>('');
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authPrompt, setAuthPrompt] = useState<boolean>(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [realClips, setRealClips] = useState<ClipDisplayItem[] | null>(null);

  // Timers
  const reframeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reframeStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Directly toggle class on DOM without forcing full tree re-render on hover/blur
  const setHold = useCallback((held: boolean) => {
    isHeldRef.current = held;
    rootRef.current?.classList.toggle('hold', held);
  }, []);

  // 6 Slides matching final.html with Vireo branding
  const slides = useMemo(
    () => [
      {
        id: 'clipping',
        label: 'Clipping',
        icon: (
          <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
        ),
        c1: '#4a5648',
        c2: '#2b3a3f',
        glow: '#7a8a7a',
      },
      {
        id: 'captions',
        label: 'Captions',
        icon: (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 15h4M14 15h3M7 11h2M12 11h5" />
          </>
        ),
        c1: '#6b5546',
        c2: '#3a2f2c',
        glow: '#a7774f',
      },
      {
        id: 'reframe',
        label: 'Reframe',
        icon: <path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" />,
        c1: '#28507f',
        c2: '#1b2f4d',
        glow: '#3b6aa8',
      },
      {
        id: 'broll',
        label: 'B-roll',
        icon: (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M7 3v18M17 3v18M3 8h4M3 12h18M3 16h4M17 8h4M17 16h4" />
          </>
        ),
        c1: '#5a3d8c',
        c2: '#2b2146',
        glow: '#7a4bb0',
      },
      {
        id: 'audio',
        label: 'Audio',
        icon: <path d="M3 10v4M7 6v12M11 3v18M15 8v8M19 11v2" />,
        c1: '#1f6a68',
        c2: '#173a40',
        glow: '#2fa59a',
      },
      {
        id: 'voiceover',
        label: 'Voice-over',
        icon: (
          <>
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </>
        ),
        c1: '#7a3a58',
        c2: '#3a2036',
        glow: '#b04c78',
      },
    ],
    []
  );

  // Calculate slide load state: active slide + immediate neighbours are loaded.
  // Other slides are unloaded when safe to preserve memory and decoders.
  const n = slides.length;
  const getSlideLoadState = useCallback(
    (slideIdx: number) => {
      const isActive = cur === slideIdx;
      const isAdjacent =
        Math.abs(slideIdx - cur) === 1 ||
        (cur === 0 && slideIdx === n - 1) ||
        (cur === n - 1 && slideIdx === 0);
      const shouldLoad = isActive || isAdjacent;
      const shouldPlay = isActive && isInView && !isReducedMotion && !isDocumentHidden;
      return { isActive, isAdjacent, shouldLoad, shouldPlay };
    },
    [cur, n, isInView, isReducedMotion, isDocumentHidden]
  );

  // Synchronize videos: strictly only play active slide's videos, never multiple slides
  const syncVideos = useCallback(
    (activeIdx: number) => {
      const track = trackRef.current;
      if (!track) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const hidden = document.hidden;
      const inView = isInViewRef.current;
      const slideNodes = track.querySelectorAll<HTMLElement>('.slide');

      slideNodes.forEach((sNode, sIdx) => {
        const vids = sNode.querySelectorAll<HTMLVideoElement>('video.vf');
        vids.forEach((v) => {
          if (sIdx === activeIdx && !reduce && !hidden && inView) {
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          } else {
            v.pause();
          }
        });
      });
    },
    []
  );

  // Layout centering using un-transformed layout metrics (offsetLeft & offsetWidth)
  const layout = useCallback((slideIndex: number, animate: boolean = true) => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;

    const slideElements = track.querySelectorAll<HTMLElement>('.slide');
    const targetSlide = slideElements[slideIndex];
    if (!targetSlide) return;

    // Center targetSlide with sub-pixel precision independent of scale(0.92) transform
    const targetX = Math.round(viewport.clientWidth / 2 - (targetSlide.offsetLeft + targetSlide.offsetWidth / 2));

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce) {
      track.classList.add('no-anim');
    }
    track.style.transform = `translateX(${targetX}px)`;

    if (!animate || reduce) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          track.classList.remove('no-anim');
        });
      });
    }
  }, []);

  // Stop & Run Reframe cycling for Slide 2
  const stopReframe = useCallback(() => {
    if (reframeTimerRef.current) clearInterval(reframeTimerRef.current);
    if (reframeStartRef.current) clearTimeout(reframeStartRef.current);
  }, []);

  const runReframe = useCallback(() => {
    stopReframe();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let k = 0;
    reframeStartRef.current = setTimeout(() => {
      reframeTimerRef.current = setInterval(() => {
        k = (k + 1) % LAYOUTS.length;
        setReframeLayout(k);
      }, 1450);
    }, 900);
  }, [stopReframe]);

  // Navigate to slide
  const goToSlide = useCallback(
    (targetIndex: number, isUserAction: boolean = false) => {
      if (isUserAction) {
        userInteractedTabRef.current = true;
      }
      const nextIndex = ((targetIndex % n) + n) % n;
      setCur(nextIndex);
      layout(nextIndex, true);
      syncVideos(nextIndex);

      stopReframe();
      if (nextIndex === 2) {
        setReframeLayout(0);
        runReframe();
      }
    },
    [n, layout, syncVideos, stopReframe, runReframe]
  );

  // Listen for external slide navigation events (e.g. from Navbar dropdown or URL hash)
  useEffect(() => {
    const slideMap: Record<string, number> = {
      clipping: 0,
      captions: 1,
      reframe: 2,
      broll: 3,
      audio: 4,
      voice: 5,
    };

    const handleGotoSlide = (e: Event) => {
      const customEvent = e as CustomEvent<{ slideId?: string; slideIndex?: number }>;
      if (customEvent.detail) {
        if (typeof customEvent.detail.slideIndex === 'number') {
          goToSlide(customEvent.detail.slideIndex, true);
        } else if (customEvent.detail.slideId) {
          const idx = slideMap[customEvent.detail.slideId];
          if (idx !== undefined) {
            goToSlide(idx, true);
          }
        }
      }
    };

    const checkHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (slideMap[hash] !== undefined) {
        goToSlide(slideMap[hash], true);
      }
    };

    window.addEventListener('vireo:goto-slide', handleGotoSlide);
    window.addEventListener('hashchange', checkHash);
    checkHash();

    return () => {
      window.removeEventListener('vireo:goto-slide', handleGotoSlide);
      window.removeEventListener('hashchange', checkHash);
    };
  }, [goToSlide]);

  // Scroll-triggered showcase activation with boundary hysteresis
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      isInViewRef.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Entry threshold: showcase entered viewport comfortably
        const isComfortablyInView =
          entry.isIntersecting &&
          (entry.intersectionRatio >= 0.2 ||
            (entry.boundingClientRect.top < window.innerHeight * 0.82 &&
              entry.boundingClientRect.bottom > window.innerHeight * 0.18));

        // Exit threshold: showcase is scrolled away
        const hasExited = !entry.isIntersecting || entry.intersectionRatio < 0.05;

        if (isComfortablyInView) {
          if (!hasTriggeredInViewRef.current) {
            hasTriggeredInViewRef.current = true;
            isInViewRef.current = true;
            setIsInView(true);

            // Always start animation from Slide 0 (AI Clipping) on normal scroll,
            // unless user explicitly selected a slide via navbar/tabs
            if (!userInteractedTabRef.current) {
              setCur(0);
              setAnimKey((k) => k + 1);
            }
            userInteractedTabRef.current = false;

            requestAnimationFrame(() => {
              layout(userInteractedTabRef.current ? cur : 0, !reduce);
              if (!reduce && !document.hidden) {
                syncVideos(userInteractedTabRef.current ? cur : 0);
              }
            });
          }
        } else if (hasExited) {
          if (isInViewRef.current) {
            isInViewRef.current = false;
            hasTriggeredInViewRef.current = false;
            setIsInView(false);
            userInteractedTabRef.current = false;
            stopReframe();
            syncVideos(-1);
          }
        }
      },
      {
        threshold: [0, 0.05, 0.2, 0.35],
        rootMargin: '0px 0px -40px 0px',
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [layout, syncVideos, stopReframe]);

  // Check prefers-reduced-motion & visibility listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);
    const motionHandler = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
      if (e.matches) {
        stopReframe();
        syncVideos(-1);
      } else {
        syncVideos(cur);
      }
    };
    mediaQuery.addEventListener('change', motionHandler);

    const handleResize = () => {
      layout(cur, false);
    };
    window.addEventListener('resize', handleResize);

    let ro: ResizeObserver | null = null;
    if (viewportRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        layout(cur, false);
      });
      ro.observe(viewportRef.current);
    }

    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      setIsDocumentHidden(hidden);
      setHold(hidden);
      if (!hidden && isInViewRef.current) {
        syncVideos(cur);
      } else {
        syncVideos(-1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    layout(cur, false);
    if (isInViewRef.current) {
      syncVideos(cur);
    }

    return () => {
      mediaQuery.removeEventListener('change', motionHandler);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ro?.disconnect();
      stopReframe();
    };
  }, [cur, layout, syncVideos, stopReframe, setHold]);

  // Continuous Clipping Animation Lifecycle:
  // Loops the complete AI clipping animation smoothly cycle after cycle without reloading videos
  useEffect(() => {
    if (cur !== 0 || !isInView || isReducedMotion || isUserInteracted || isDocumentHidden) {
      return;
    }

    const dclip = rootRef.current?.querySelector('.d-clip') as HTMLElement | null;
    if (!dclip) return;

    const CYCLE_MS = 6000;
    const FADE_OUT_MS = 5300;

    let cycleCount = 0;
    dclip.dataset.cycle = '0';
    dclip.dataset.cycleTime = String(Date.now());

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let cycleInterval: ReturnType<typeof setInterval> | null = null;

    const triggerReset = () => {
      cycleCount++;
      dclip.dataset.cycle = String(cycleCount);
      dclip.dataset.cycleTime = String(Date.now());

      const targets = dclip.querySelectorAll<HTMLElement>(
        '.src, .fill, .g1, .g2, .clip, .th em, .cur, .rip'
      );
      targets.forEach((el) => {
        el.style.animation = 'none';
      });
      dclip.classList.remove('cycle-out');

      const srcVid = dclip.querySelector<HTMLVideoElement>('.src video');
      if (srcVid) {
        try {
          srcVid.currentTime = 0;
        } catch {}
      }

      // Trigger synchronous reflow
      void dclip.offsetHeight;
      targets.forEach((el) => {
        el.style.animation = '';
      });
    };

    const scheduleCycle = () => {
      fadeTimer = setTimeout(() => {
        dclip.classList.add('cycle-out');
      }, FADE_OUT_MS);

      resetTimer = setTimeout(() => {
        triggerReset();
      }, CYCLE_MS - 50);
    };

    // Schedule cycle 1 fade & reset
    scheduleCycle();

    // Schedule recurring cycles
    cycleInterval = setInterval(() => {
      scheduleCycle();
    }, CYCLE_MS);

    return () => {
      if (fadeTimer) clearTimeout(fadeTimer);
      if (resetTimer) clearTimeout(resetTimer);
      if (cycleInterval) clearInterval(cycleInterval);
      dclip.classList.remove('cycle-out');
    };
  }, [cur, isInView, isReducedMotion, isUserInteracted, isDocumentHidden, animKey]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    setHold(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current !== null) {
      const dx = e.changedTouches[0].clientX - touchStartXRef.current;
      if (Math.abs(dx) > 50) {
        goToSlide(cur + (dx < 0 ? 1 : -1));
      }
    }
    touchStartXRef.current = null;
    setHold(false);
  };

  // Keyboard navigation on tabs
  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToSlide(index + 1);
      document.getElementById(`tab-${(index + 1) % n}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToSlide(index - 1);
      document.getElementById(`tab-${(index - 1 + n) % n}`)?.focus();
    }
  };

  // Real "Get Clips" action with backend integration & honest workflow
  const handleGetClips = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUserInteracted(true);
    setErrorMsg(null);
    setAuthPrompt(false);

    const trimmed = urlInput.trim();
    if (!trimmed) {
      setErrorMsg('Please paste a video URL to generate clips.');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported.');
      }
    } catch {
      setErrorMsg('Please enter a valid HTTP or HTTPS video URL.');
      return;
    }

    const isYouTube = /(?:youtube\.com\/(?:watch\?|shorts\/|embed\/)|youtu\.be\/)/i.test(trimmed);
    const isDirectVideo = /\.(mp4|webm|mov|mkv)(?:\?.*)?$/i.test(parsed.pathname);

    if (!isYouTube && !isDirectVideo) {
      setErrorMsg(
        'Vireo currently supports YouTube links and direct video files (.mp4, .webm). Social URLs must be public direct video streams.'
      );
      return;
    }

    if (!isAuthenticated) {
      setAuthPrompt(true);
      setErrorMsg('A free account is required to import video links and extract AI clips.');
      return;
    }

    setIsIngesting(true);
    setLoadingStep('Ingesting video stream & validating format...');

    try {
      const inferredTitle =
        parsed.pathname.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Imported Video';
      const project = await projectService.ingestProjectUrlAsync({
        url: trimmed,
        title: decodeURIComponent(inferredTitle),
      });

      setCreatedProjectId(project.id);
      setLoadingStep('Analyzing speech, audio tone & detecting viral hooks...');

      let candidates: ClipCandidate[] = [];
      try {
        const analyzeRes = await clipService.analyzeClips(project.id);
        candidates = analyzeRes.candidates || [];
      } catch {
        candidates = await clipService.getClipCandidates(project.id);
      }

      if (candidates.length > 0) {
        const formatted: ClipDisplayItem[] = candidates.slice(0, 6).map((c, i) => {
          return {
            id: c.id,
            title: c.title || `Clip ${i + 1}`,
            duration: formatSeconds(c.duration_seconds || c.end_seconds - c.start_seconds),
            timestamp: `${formatSeconds(c.start_seconds)} - ${formatSeconds(c.end_seconds)}`,
            thumbnail: c.metadata?.thumbnail_url || DEMO_POSTERS[i % DEMO_POSTERS.length],
            videoSrc: DEMO_VIDEOS[i % DEMO_VIDEOS.length],
            platform: ICONS[i % ICONS.length],
            score: c.engagement_score || SCORES[i % SCORES.length],
            isReal: true,
            projectId: project.id,
          };
        });
        setRealClips(formatted);
        setLoadingStep(null);
        setIsIngesting(false);
      } else {
        setIsIngesting(false);
        setLoadingStep(null);
        navigate(`/projects/${project.id}`);
      }
    } catch (err: any) {
      setIsIngesting(false);
      setLoadingStep(null);
      setErrorMsg(
        err.message ||
          'Failed to import video from URL. Please verify that the video is public and accessible.'
      );
    }
  };

  // Demo clips matching final.html CLIPV & SCORES
  const demoClips: ClipDisplayItem[] = useMemo(
    () =>
      CLIPV.map((vIdx, nIdx) => ({
        id: `demo-${nIdx}`,
        title: `Viral Clip ${nIdx + 1}`,
        duration: ['0:42', '0:35', '0:58', '0:46', '0:39', '0:51'][nIdx],
        timestamp: '00:15 - 00:57',
        thumbnail: DEMO_POSTERS[vIdx % DEMO_POSTERS.length],
        videoSrc: DEMO_VIDEOS[vIdx % DEMO_VIDEOS.length],
        platform: ICONS[nIdx],
        score: SCORES[nIdx],
      })),
    []
  );

  const displayedClips = realClips || demoClips;

  // Audio bars (46 bars) matching final.html
  const audioBars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => {
        const h = clean(i);
        const nScore = Math.min(78, h * 0.5 + 26 + rnd(i) * 26);
        return (
          <b
            key={i}
            style={
              {
                '--i': i,
                '--h': h.toFixed(1),
                '--n': nScore.toFixed(1),
              } as React.CSSProperties
            }
          />
        );
      }),
    []
  );

  // Voice waveform bars (10 bars) matching final.html
  const voiceBars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => (
        <b
          key={i}
          style={
            {
              '--i': i,
              '--h': (30 + 62 * rnd(i + 7)).toFixed(1),
            } as React.CSSProperties
          }
        />
      )),
    []
  );

  // Slide state flags for resource management
  const s0 = getSlideLoadState(0);
  const s1 = getSlideLoadState(1);
  const s2 = getSlideLoadState(2);
  const s3 = getSlideLoadState(3);
  const s4 = getSlideLoadState(4);
  const s5 = getSlideLoadState(5);

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      {/* Scope strictly under .vireo-showcase */}
      <section
        id="showcase"
        ref={rootRef}
        className="vireo-showcase"
        aria-roledescription="carousel"
        aria-label="Feature showcase"
        style={{ '--glow': slides[cur]?.glow } as React.CSSProperties}
      >
        {/* Dynamic ambient backdrop glow */}
        <div className="glow" aria-hidden="true" />

        {/* Carousel Stage */}
        <div className="stage">
          <div
            ref={viewportRef}
            className="viewport"
            onMouseEnter={() => setHold(true)}
            onMouseLeave={() => setHold(false)}
            onFocus={() => setHold(true)}
            onBlur={() => setHold(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div ref={trackRef} className="track">
              {slides.map((s, idx) => {
                const isActive = cur === idx;
                return (
                  <div
                    key={s.id}
                    className={`slide ${isActive ? 'active' : ''}`}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${idx + 1} of ${slides.length}: ${s.label}`}
                    aria-hidden={!isActive}
                    onClick={() => {
                      if (!isActive) goToSlide(idx, true);
                    }}
                  >
                    <div
                      className="card"
                      style={
                        {
                          '--c1': s.c1,
                          '--c2': s.c2,
                        } as React.CSSProperties
                      }
                    >
                      {/* ========================================================
                          SLIDE 1: AI CLIPPING (with Real URL Ingestion)
                         ======================================================== */}
                      {s.id === 'clipping' && (
                        <div
                          key={`d-clip-${animKey}`}
                          className={`demo d-clip ${isUserInteracted ? 'user-interacted' : ''}`}
                        >
                          <div className={`src ${s0.shouldLoad ? 'hasvid' : ''}`} data-v="6" title="Source Video">
                            <CarouselVideo
                              src={DEMO_VIDEOS[6]}
                              poster={DEMO_POSTERS[6]}
                              shouldLoad={s0.shouldLoad}
                              shouldPlay={s0.shouldPlay}
                            />
                            <i className="p" aria-hidden="true" />
                            <em>48:12</em>
                          </div>

                          {/* URL Bar Form */}
                          <form
                            onSubmit={handleGetClips}
                            className="bar"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsUserInteracted(true);
                            }}
                          >
                            <i className="fill" />
                            <div className="bar-field">
                              <svg className="bar-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                              </svg>
                              <input
                                type="url"
                                value={urlInput}
                                onChange={(e) => {
                                  setUrlInput(e.target.value);
                                  setErrorMsg(null);
                                  setAuthPrompt(false);
                                  setIsUserInteracted(true);
                                }}
                                onFocus={() => {
                                  setHold(true);
                                  setIsUserInteracted(true);
                                }}
                                placeholder="Drop a long video link…"
                                className="bar-input"
                                disabled={isIngesting}
                                aria-label="Video URL input"
                              />
                            </div>
                            <button
                              type="submit"
                              className="get-clips-btn"
                              disabled={isIngesting}
                              aria-label="Get clips"
                            >
                              {isIngesting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Processing...</span>
                                </>
                              ) : isUserInteracted ? (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                                  <span>Get clips</span>
                                </>
                              ) : (
                                <span className="btn-label-stack">
                                  <span className="g1">Get clips</span>
                                  <span className="g2">Finding clips…</span>
                                </span>
                              )}
                            </button>
                          </form>

                          {/* Actionable Error / Auth Prompt Message */}
                          {errorMsg && (
                            <div
                              className="absolute top-[14.8cqw] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[1.1cqw] backdrop-blur-md shadow-lg max-w-[85%] text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span className="truncate">{errorMsg}</span>
                              {authPrompt && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/signup?next=${encodeURIComponent(
                                        '/projects/new?url=' + encodeURIComponent(urlInput.trim())
                                      )}`
                                    )
                                  }
                                  className="underline text-emerald-300 font-semibold ml-1 shrink-0 hover:text-white"
                                >
                                  Sign up free →
                                </button>
                              )}
                            </div>
                          )}

                          {isIngesting && (
                            <div
                              className="absolute top-[14.8cqw] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/25 border border-purple-500/40 text-purple-200 text-[1.1cqw] backdrop-blur-md shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
                              <span>{loadingStep || 'Processing video stream...'}</span>
                            </div>
                          )}

                          {/* 6 Viral Clip Cards matching original feature showcase */}
                          {displayedClips.map((clip, nIdx) => {
                            const isReal = clip.isReal;
                            const clipPoster = isReal ? clip.thumbnail : DEMO_POSTERS[CLIPV[nIdx] % DEMO_POSTERS.length];
                            return (
                              <div
                                key={clip.id}
                                className={`clip ${nIdx === 0 ? 'top' : ''}`}
                                style={
                                  {
                                    '--n': nIdx,
                                    '--score': clip.score,
                                  } as React.CSSProperties
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const targetProj = clip.projectId || createdProjectId;
                                  if (clip.isReal && targetProj) {
                                    navigate(`/projects/${targetProj}`);
                                  } else {
                                    if (onClipSelect) onClipSelect(nIdx);
                                    if (onViewAllClips) onViewAllClips();
                                  }
                                }}
                                title={`${clip.title} (${clip.duration})`}
                              >
                                <span className="ic">{clip.platform}</span>
                                <div className={`th ${s0.shouldLoad ? 'hasvid' : ''}`} data-v={CLIPV[nIdx]}>
                                  <CarouselVideo
                                    src={clip.videoSrc}
                                    poster={clipPoster}
                                    shouldLoad={s0.shouldLoad}
                                    shouldPlay={s0.shouldPlay}
                                  />
                                  <i className="p" aria-hidden="true" />
                                  <em />
                                </div>
                              </div>
                            );
                          })}

                          <i
                            className="rip"
                            style={
                              {
                                left: '68.2cqw',
                                top: '16.4cqw',
                                '--d': '1.54s',
                              } as React.CSSProperties
                            }
                          />

                          {!isUserInteracted && (
                            <svg className="cur" viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M5 3l14 7-6 2-2 6z"
                                fill="#fff"
                                stroke="#000"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                      )}

                      {/* ========================================================
                          SLIDE 2: AI CAPTIONS DEMO
                         ======================================================== */}
                      {s.id === 'captions' && (
                        <div className="demo d-cap">
                          <div
                            className={`vid ${s1.shouldLoad ? 'hasvid' : ''}`}
                            data-v="0"
                            data-pos="50% 30%"
                            data-zoom="1.12"
                          >
                            <CarouselVideo
                              src={DEMO_VIDEOS[0]}
                              poster={DEMO_POSTERS[0]}
                              pos="50% 30%"
                              origin="50% 30%"
                              zoom={1.12}
                              shouldLoad={s1.shouldLoad}
                              shouldPlay={s1.shouldPlay}
                            />
                            <i className="p" aria-hidden="true" />
                            <div className="cap ca">CREATE VIRAL CLIPS</div>
                            <div className="cap cb">
                              WITHOUT <u>SPENDING</u> ALL DAY
                            </div>
                            <div className="cap cc">
                              <span>
                                turn <s>raw video</s> into <strong>viral reels</strong>
                              </span>
                            </div>
                          </div>

                          <div className="panel">
                            <div className="tabs2">
                              <span className="on">Presets</span>
                              <span>Font</span>
                              <span>Effects</span>
                            </div>

                            {[
                              { k: 0, sm: 'Aa', name: 'Default', style: '' },
                              { k: 1, sm: 'TO GET', name: 'Beasty', style: 'color:#ff39c8' },
                              { k: 2, sm: 'CHOOSE', name: 'Deep Diver', style: 'color:#7dff3b' },
                              {
                                k: 3,
                                sm: 'to get',
                                name: 'Pod P',
                                style:
                                  'background:#111;padding:.2cqw .7cqw;border-radius:.3cqw;font-weight:600;font-size:1.6cqw',
                              },
                              { k: 4, sm: 'TO GET', name: 'Youshaei', style: 'color:#ffd23f' },
                            ].map((pr) => (
                              <div
                                key={pr.k}
                                className={`pr ${pr.k === 3 ? 'on' : ''}`}
                                style={{ '--k': pr.k } as React.CSSProperties}
                              >
                                <span
                                  className="sm"
                                  style={{ cssText: pr.style } as React.CSSProperties}
                                >
                                  {pr.sm}
                                </span>
                                <small>{pr.name}</small>
                              </div>
                            ))}
                          </div>

                          <i
                            className="rip"
                            style={
                              {
                                left: '78.5cqw',
                                top: '21.4cqw',
                                '--d': '.98s',
                              } as React.CSSProperties
                            }
                          />
                          <i
                            className="rip"
                            style={
                              {
                                left: '78.5cqw',
                                top: '29.2cqw',
                                '--d': '2.8s',
                              } as React.CSSProperties
                            }
                          />
                          <i
                            className="rip"
                            style={
                              {
                                left: '78.5cqw',
                                top: '37cqw',
                                '--d': '4.62s',
                              } as React.CSSProperties
                            }
                          />

                          <svg className="cur" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M5 3l14 7-6 2-2 6z"
                              fill="#fff"
                              stroke="#000"
                              strokeWidth="1.4"
                              strokeLinejoin="round"
                            />
                          </svg>

                          <a
                            href="#major-features"
                            className="absolute bottom-[2.5cqw] right-[4cqw] z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 hover:bg-[#20E3A2]/20 border border-white/10 hover:border-[#20E3A2]/50 text-[1.1cqw] text-[#A6B0C2] hover:text-[#20E3A2] backdrop-blur-md transition-all font-semibold"
                            onClick={(e) => {
                              e.stopPropagation();
                              const el = document.getElementById('major-features');
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth' });
                              }
                            }}
                          >
                            <span>Explore all major features ↓</span>
                          </a>
                        </div>
                      )}

                      {/* ========================================================
                          SLIDE 3: AI REFRAME DEMO (Optimized Scene Loading)
                         ======================================================== */}
                      {s.id === 'reframe' && (
                        <div className="demo d-rf" data-l={reframeLayout}>
                          <div className="lf">
                            <div className="scene s0">
                              <VideoTile
                                left={0}
                                top={0}
                                width={100}
                                height={100}
                                clipIndex={6}
                                shouldLoad={s2.shouldLoad}
                                shouldPlay={s2.shouldPlay && reframeLayout === 0}
                              />
                            </div>
                            <div className="scene s1">
                              <VideoTile
                                left={0}
                                top={0}
                                width={100}
                                height={100}
                                clipIndex={3}
                                shouldLoad={s2.shouldLoad}
                                shouldPlay={s2.shouldPlay && reframeLayout === 1}
                              />
                            </div>
                            <div className="scene s2">
                              <VideoTile
                                left={0}
                                top={0}
                                width={100}
                                height={100}
                                clipIndex={4}
                                shouldLoad={s2.shouldLoad}
                                shouldPlay={s2.shouldPlay && reframeLayout === 2}
                              />
                            </div>
                            <div className="scene s3">
                              <VideoTile
                                left={0}
                                top={0}
                                width={100}
                                height={100}
                                clipIndex={8}
                                pos="50% 50%"
                                zoom={1.5}
                                cls="blur"
                                shouldLoad={s2.shouldLoad}
                                shouldPlay={s2.shouldPlay && reframeLayout === 3}
                              />
                              <VideoTile
                                left={34.2}
                                top={0}
                                width={31.6}
                                height={100}
                                clipIndex={8}
                                shouldLoad={s2.shouldLoad}
                                shouldPlay={s2.shouldPlay && reframeLayout === 3}
                              />
                            </div>
                            <div className="scene s4">
                              <VideoTile
                                left={0}
                                top={0}
                                width={100}
                                height={100}
                                clipIndex={0}
                                shouldLoad={s2.shouldLoad}
                                shouldPlay={s2.shouldPlay && reframeLayout === 4}
                              />
                            </div>
                            <i className="cb cb1" />
                            <i className="cb cb2" />
                          </div>

                          <div className="pill" style={{ left: '28cqw', top: '35.4cqw' }}>
                            Before
                          </div>

                          <div className="dots">
                            {LAYOUTS.map((_, dotIdx) => (
                              <i
                                key={dotIdx}
                                className={reframeLayout === dotIdx ? 'on' : ''}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReframeLayout(dotIdx);
                                }}
                              />
                            ))}
                          </div>

                          <svg className="arr" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>

                          <div className="rfw">
                            <div className="bk bk1" />
                            <div className="bk bk2" />
                            <div className="rf pulse">
                              <div className="scene s0">
                                <VideoTile
                                  left={0}
                                  top={0}
                                  width={100}
                                  height={49.5}
                                  clipIndex={6}
                                  pos="0% 38%"
                                  zoom={1.7}
                                  origin="38% 38%"
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 0}
                                />
                                <VideoTile
                                  left={0}
                                  top={50.5}
                                  width={100}
                                  height={49.5}
                                  clipIndex={6}
                                  pos="100% 38%"
                                  zoom={1.7}
                                  origin="59% 38%"
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 0}
                                />
                              </div>
                              <div className="scene s1">
                                <VideoTile
                                  left={0}
                                  top={0}
                                  width={100}
                                  height={49.5}
                                  clipIndex={3}
                                  pos="0% 28%"
                                  zoom={1.5}
                                  origin="43% 28%"
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 1}
                                />
                                <VideoTile
                                  left={0}
                                  top={50.5}
                                  width={100}
                                  height={49.5}
                                  clipIndex={3}
                                  pos="100% 30%"
                                  zoom={1.5}
                                  origin="51% 30%"
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 1}
                                />
                              </div>
                              <div className="scene s2">
                                <VideoTile
                                  left={0}
                                  top={0}
                                  width={100}
                                  height={40}
                                  clipIndex={4}
                                  pos="31% 30%"
                                  zoom={1.6}
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 2}
                                />
                                <VideoTile
                                  left={0}
                                  top={41.5}
                                  width={100}
                                  height={58.5}
                                  clipIndex={4}
                                  pos="56% 10%"
                                  zoom={1.8}
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 2}
                                />
                              </div>
                              <div className="scene s3">
                                <VideoTile
                                  left={0}
                                  top={0}
                                  width={100}
                                  height={100}
                                  clipIndex={8}
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 3}
                                />
                              </div>
                              <div className="scene s4">
                                <VideoTile
                                  left={0}
                                  top={0}
                                  width={100}
                                  height={100}
                                  clipIndex={0}
                                  pos="50% 25%"
                                  zoom={1.45}
                                  shouldLoad={s2.shouldLoad}
                                  shouldPlay={s2.shouldPlay && reframeLayout === 4}
                                />
                              </div>
                            </div>
                          </div>

                          <div
                            className="pill"
                            id="rfLabel"
                            style={{ left: '74.5cqw', top: '41.6cqw' }}
                          >
                            {LAYOUTS[reframeLayout]}
                          </div>
                        </div>
                      )}

                      {/* ========================================================
                          SLIDE 4: AI B-ROLL DEMO
                         ======================================================== */}
                      {s.id === 'broll' && (
                        <div className="demo d-br">
                          <div className="vid2">
                            <div
                              className={`sc s-talk ${s3.shouldLoad ? 'hasvid' : ''}`}
                              data-v="0"
                              data-pos="50% 30%"
                              data-zoom="1.1"
                            >
                              <CarouselVideo
                                src={DEMO_VIDEOS[0]}
                                poster={DEMO_POSTERS[0]}
                                pos="50% 30%"
                                origin="50% 30%"
                                zoom={1.1}
                                shouldLoad={s3.shouldLoad}
                                shouldPlay={s3.shouldPlay}
                              />
                              <i className="p" aria-hidden="true" />
                            </div>
                            <div className={`sc s-a ${s3.shouldLoad ? 'hasvid' : ''}`} data-v="5">
                              <CarouselVideo
                                src={DEMO_VIDEOS[5]}
                                poster={DEMO_POSTERS[5]}
                                shouldLoad={s3.shouldLoad}
                                shouldPlay={s3.shouldPlay}
                              />
                              <i className="p" aria-hidden="true" />
                            </div>
                            <div
                              className={`sc s-b ${s3.shouldLoad ? 'hasvid' : ''}`}
                              data-v="9"
                              data-pos="50% 55%"
                              data-zoom="1.1"
                            >
                              <CarouselVideo
                                src={DEMO_VIDEOS[9]}
                                poster={DEMO_POSTERS[9]}
                                pos="50% 55%"
                                origin="50% 55%"
                                zoom={1.1}
                                shouldLoad={s3.shouldLoad}
                                shouldPlay={s3.shouldPlay}
                              />
                              <i className="p" aria-hidden="true" />
                            </div>
                            <div className="tag">B-roll</div>
                            <div className="cp">Show, don’t just tell</div>
                          </div>

                          <div className="sug">
                            <h4>Suggested B-roll</h4>
                            {[
                              { k: 0, v: 5, t: 'Hands close-up', time: '0:08 – 0:12', done: true },
                              {
                                k: 1,
                                v: 9,
                                t: 'Goal celebration',
                                time: '0:20 – 0:25',
                                done: true,
                              },
                              {
                                k: 2,
                                v: 8,
                                t: 'Training drills',
                                time: '0:31 – 0:34',
                                done: false,
                              },
                            ].map((row) => (
                              <div
                                key={row.k}
                                className={`row ${row.done ? 'done' : ''}`}
                                style={{ '--k': row.k } as React.CSSProperties}
                              >
                                <i className={`rth ${s3.shouldLoad ? 'hasvid' : ''}`} data-v={row.v}>
                                  <CarouselVideo
                                    src={DEMO_VIDEOS[row.v]}
                                    poster={DEMO_POSTERS[row.v]}
                                    shouldLoad={s3.shouldLoad}
                                    shouldPlay={s3.shouldPlay}
                                  />
                                  <i className="p" aria-hidden="true" />
                                </i>
                                <div className="tx">
                                  {row.t}
                                  <small>{row.time}</small>
                                </div>
                                <b className="add">
                                  <span className="a1">Insert</span>
                                  <span className="a2">Added</span>
                                </b>
                              </div>
                            ))}
                          </div>

                          <div className="tl2">
                            <span className="tm" />
                            <div className="t1" />
                            <div className="t2">
                              <span className={`g1 ${s3.shouldLoad ? 'hasvid' : ''}`} data-v="5">
                                <CarouselVideo
                                  src={DEMO_VIDEOS[5]}
                                  poster={DEMO_POSTERS[5]}
                                  shouldLoad={s3.shouldLoad}
                                  shouldPlay={s3.shouldPlay}
                                />
                              </span>
                              <span className={`g2 ${s3.shouldLoad ? 'hasvid' : ''}`} data-v="9">
                                <CarouselVideo
                                  src={DEMO_VIDEOS[9]}
                                  poster={DEMO_POSTERS[9]}
                                  shouldLoad={s3.shouldLoad}
                                  shouldPlay={s3.shouldPlay}
                                />
                              </span>
                            </div>
                            <div className="ph" />
                          </div>
                        </div>
                      )}

                      {/* ========================================================
                          SLIDE 5: AI AUDIO CLEAN DEMO
                         ======================================================== */}
                      {s.id === 'audio' && (
                        <div className="demo d-au">
                          <div className={`avt ${s4.shouldLoad ? 'hasvid' : ''}`} data-v="2">
                            <CarouselVideo
                              src={DEMO_VIDEOS[2]}
                              poster={DEMO_POSTERS[2]}
                              shouldLoad={s4.shouldLoad}
                              shouldPlay={s4.shouldPlay}
                            />
                            <i className="p" aria-hidden="true" />
                            <i className="bd">
                              <span className="x1">Original</span>
                              <span className="x2">Enhanced</span>
                            </i>
                          </div>

                          <div className="wvp">{audioBars}</div>

                          <div className="lbl l1">
                            <span className="x1">Noisy</span>
                            <span className="x2">Studio clean</span>
                          </div>

                          <div className="lbl l2">−24 dB background noise</div>

                          <i className="sweep" />

                          <div className="sw">
                            <span>Enhance audio</span>
                            <span className="trk">
                              <i />
                            </span>
                          </div>

                          <i
                            className="rip"
                            style={
                              {
                                left: '67cqw',
                                top: '42.2cqw',
                                '--d': '1.6s',
                              } as React.CSSProperties
                            }
                          />

                          <svg className="cur" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M5 3l14 7-6 2-2 6z"
                              fill="#fff"
                              stroke="#000"
                              strokeWidth="1.4"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}

                      {/* ========================================================
                          SLIDE 6: AI VOICE-OVER DEMO
                         ======================================================== */}
                      {s.id === 'voiceover' && (
                        <div className="demo d-vo">
                          <div
                            className={`vid3 ${s5.shouldLoad ? 'hasvid' : ''}`}
                            data-v="0"
                            data-pos="50% 30%"
                            data-zoom="1.12"
                          >
                            <CarouselVideo
                              src={DEMO_VIDEOS[0]}
                              poster={DEMO_POSTERS[0]}
                              pos="50% 30%"
                              origin="50% 30%"
                              zoom={1.12}
                              shouldLoad={s5.shouldLoad}
                              shouldPlay={s5.shouldPlay}
                            />
                            <i className="p" aria-hidden="true" />
                            <span className="badge">AI dubbing</span>
                          </div>

                          <div className="dub">
                            <span className="lg k0" style={{ '--k': 0 } as React.CSSProperties}>
                              Dubbed in हिन्दी
                            </span>
                            <span className="ln k0" style={{ '--k': 0 } as React.CSSProperties}>
                              अपनी पहली इंटर्नशिप कैसे पाएं
                            </span>

                            <span className="lg k1" style={{ '--k': 1 } as React.CSSProperties}>
                              Dubbed in English
                            </span>
                            <span className="ln k1" style={{ '--k': 1 } as React.CSSProperties}>
                              Here’s how to land your first internship
                            </span>

                            <span className="lg k2" style={{ '--k': 2 } as React.CSSProperties}>
                              Dubbed in Español
                            </span>
                            <span className="ln k2" style={{ '--k': 2 } as React.CSSProperties}>
                              Así consigues tu primera práctica
                            </span>

                            <span className="lg k3" style={{ '--k': 3 } as React.CSSProperties}>
                              Dubbed in Français
                            </span>
                            <span className="ln k3" style={{ '--k': 3 } as React.CSSProperties}>
                              Comment décrocher son premier stage
                            </span>

                            <div className="wf">{voiceBars}</div>
                          </div>

                          <div className="voices">
                            <h4>Voice</h4>
                            {[
                              { k: 0, a1: '#ffb36b', a2: '#e0566b', name: 'Aarav', lang: 'हिन्दी' },
                              {
                                k: 1,
                                a1: '#7ab8ff',
                                a2: '#4a63d8',
                                name: 'Maya',
                                lang: 'English (US)',
                              },
                              {
                                k: 2,
                                a1: '#8be0a4',
                                a2: '#2f9a7c',
                                name: 'Lucía',
                                lang: 'Español',
                              },
                              {
                                k: 3,
                                a1: '#e0a0ff',
                                a2: '#8a52d8',
                                name: 'Camille',
                                lang: 'Français',
                              },
                            ].map((vo) => (
                              <div
                                key={vo.k}
                                className={`vr ${vo.k === 0 ? 'on' : ''}`}
                                style={
                                  {
                                    '--k': vo.k,
                                    '--a1': vo.a1,
                                    '--a2': vo.a2,
                                  } as React.CSSProperties
                                }
                              >
                                <i className="av" />
                                <div>
                                  {vo.name}
                                  <small>{vo.lang}</small>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation Arrows */}
          <button
            type="button"
            className="nav prev"
            aria-label="Previous feature"
            onClick={() => goToSlide(cur - 1, true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="nav next"
            aria-label="Next feature"
            onClick={() => goToSlide(cur + 1, true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Feature Navigation Tabs Row with Live Animated Progress Bar Driving Autoplay */}
        <div className="tabs" role="tablist" aria-label="Feature showcase tabs">
          {slides.map((s, idx) => {
            const isSelected = cur === idx;
            return (
              <button
                key={s.id}
                id={`tab-${idx}`}
                className="tab"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => goToSlide(idx, true)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {s.icon}
                </svg>
                <span>{s.label}</span>
                {isInView && isSelected && !isReducedMotion && (
                  <i
                    key={`pg-${idx}-${animKey}`}
                    className="pg"
                    onAnimationEnd={(e) => {
                      if (e.animationName === 'prog' && isSelected && isInViewRef.current) {
                        goToSlide(cur + 1, false);
                      }
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

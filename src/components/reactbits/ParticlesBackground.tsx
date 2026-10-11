import React, { useEffect, useRef } from 'react';

export interface ParticlesBackgroundProps {
  className?: string;
  count?: number;
}

/**
 * ReactBits-inspired Particles Background.
 * Renders lightweight, ambient dust particles drifting in the dark space.
 * Automatically halts when user prefers reduced motion, when the canvas is offscreen,
 * or when the tab/window is hidden in the background.
 */
export const ParticlesBackground: React.FC<ParticlesBackgroundProps> = ({
  className = '',
  count = 30,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    let animationFrameId: number | null = null;
    let isIntersecting = true;
    let isHidden = document.hidden;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    interface Particle {
      x: number;
      y: number;
      size: number;
      vx: number;
      vy: number;
      alpha: number;
      alphaChange: number;
      hue: number;
    }

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * (width || 800),
      y: Math.random() * (height || 600),
      size: Math.random() * 2 + 0.8,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -Math.random() * 0.35 - 0.1,
      alpha: Math.random() * 0.6 + 0.2,
      alphaChange: (Math.random() - 0.5) * 0.008,
      hue: Math.random() > 0.5 ? 160 : 175, // Emerald (160) or Cyan (175)
    }));

    const render = () => {
      if (!isIntersecting || isHidden) {
        animationFrameId = null;
        return;
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.alphaChange;

        if (p.alpha <= 0.1 || p.alpha >= 0.7) {
          p.alphaChange = -p.alphaChange;
        }

        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    const startLoop = () => {
      if (animationFrameId === null && isIntersecting && !isHidden) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const stopLoop = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    // IntersectionObserver to avoid background work when scrolled away
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        isIntersecting = entry.isIntersecting;
        if (isIntersecting) {
          startLoop();
        } else {
          stopLoop();
        }
      }, { threshold: 0.01 });
      observer.observe(canvas);
    } else {
      startLoop();
    }

    const handleVisibility = () => {
      isHidden = document.hidden;
      if (isHidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopLoop();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      observer?.disconnect();
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 w-full h-full opacity-60 ${className}`}
      aria-hidden="true"
    />
  );
};

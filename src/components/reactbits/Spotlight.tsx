import React, { useRef, useState, useEffect } from 'react';

export interface SpotlightProps {
  className?: string;
  fill?: string;
}

/**
 * ReactBits-inspired Spotlight component.
 * Renders subtle ambient radial gradient spotlight behind glass surfaces
 * that gracefully moves or creates a fixed cinematic glow.
 * Optimized: uses requestAnimationFrame direct DOM style updates to prevent React re-renders on mousemove.
 */
export const Spotlight: React.FC<SpotlightProps> = ({
  className = '',
  fill = 'rgba(32, 227, 162, 0.12)',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    let rafId: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !glowRef.current) return;
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!containerRef.current || !glowRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(10, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
        glowRef.current.style.left = `${x}%`;
        glowRef.current.style.top = `${y}%`;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Primary Emerald Glow */}
      <div
        ref={glowRef}
        className="absolute w-[600px] h-[600px] rounded-full blur-[130px] transition-transform duration-700 ease-out will-change-transform animate-spotlight-drift"
        style={{
          background: `radial-gradient(circle, ${fill} 0%, rgba(0, 220, 200, 0.08) 50%, transparent 75%)`,
          left: '50%',
          top: '30%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      {/* Secondary Cyan Accent Arc */}
      <div
        className="absolute top-0 right-1/4 w-[480px] h-[380px] rounded-full blur-[140px] opacity-45 pointer-events-none animate-glow-trail"
        style={{
          background: 'radial-gradient(circle, rgba(0, 220, 200, 0.18) 0%, transparent 70%)',
        }}
      />
    </div>
  );
};

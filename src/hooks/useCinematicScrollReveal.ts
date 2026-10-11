import { useEffect, type RefObject } from 'react';

export interface UseCinematicScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  selector?: string;
}

/**
 * Reusable IntersectionObserver hook for cinematic scroll-triggered reveals.
 * Adds 'is-revealed' class when elements enter the viewport.
 * Unobserves elements once revealed to optimize performance.
 * Respects 'prefers-reduced-motion'.
 */
export function useCinematicScrollReveal<T extends HTMLElement = HTMLElement>(
  containerRef?: RefObject<T>,
  options: UseCinematicScrollRevealOptions = {}
) {
  const {
    threshold = 0.12,
    rootMargin = '0px 0px -6% 0px',
    selector = '.cinematic-reveal-init, .cinematic-panel-enter',
  } = options;

  useEffect(() => {
    // If user prefers reduced motion, reveal everything immediately
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const root = containerRef ? containerRef.current : document;
    if (!root) return;

    const targets = root.querySelectorAll(selector);

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    targets.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [containerRef, threshold, rootMargin, selector]);
}

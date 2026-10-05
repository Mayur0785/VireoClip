import React from 'react';
import { cn } from '../../lib/utils';

export interface AmbientBackdropProps {
  className?: string;
  variant?: 'dots' | 'glow' | 'combined';
}

export const AmbientBackdrop: React.FC<AmbientBackdropProps> = ({
  className,
  variant = 'combined',
}) => {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none',
        className
      )}
      aria-hidden="true"
    >
      {(variant === 'glow' || variant === 'combined') && (
        <>
          {/* Subtle Sage Glow Orb */}
          <div
            className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-sage/10 blur-3xl transform-gpu -translate-x-1/2 motion-reduce:opacity-40"
            style={{ filter: 'blur(90px)' }}
          />
          {/* Subtle Terracotta/Clay Glow Orb */}
          <div
            className="absolute top-20 right-1/4 h-96 w-96 rounded-full bg-clay/10 blur-3xl transform-gpu translate-x-1/2 motion-reduce:opacity-40"
            style={{ filter: 'blur(100px)' }}
          />
        </>
      )}

      {(variant === 'dots' || variant === 'combined') && (
        <svg
          className="absolute inset-0 h-full w-full opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="dot-pattern"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
              patternContentUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" className="fill-ink/15" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" strokeWidth="0" fill="url(#dot-pattern)" />
        </svg>
      )}
    </div>
  );
};

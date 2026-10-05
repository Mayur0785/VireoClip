import React from 'react';
import { cn } from '../../lib/utils';

export interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'clay' | 'sage' | 'ink';
  children: React.ReactNode;
  className?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const ShinyButton: React.FC<ShinyButtonProps> = ({
  variant = 'clay',
  children,
  className,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}) => {
  const variantStyles = {
    clay: 'bg-clay text-clay-foreground shadow-clay hover:brightness-105 active:scale-[0.98]',
    sage: 'bg-sage text-sage-foreground shadow-sage hover:brightness-105 active:scale-[0.98]',
    ink: 'bg-primary text-primary-foreground shadow-ink hover:bg-primary/95 active:scale-[0.98]',
  };

  return (
    <button
      disabled={disabled}
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 font-medium transition-all duration-300 cursor-pointer disabled:pointer-events-none disabled:opacity-50 select-none',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {/* Light sweep flare */}
      <span
        className="pointer-events-none absolute -inset-full top-0 block -translate-x-full transform-gpu bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full motion-reduce:hidden"
        style={{ transform: 'skewX(-20deg)' }}
        aria-hidden="true"
      />
      {leftIcon && <span className="relative z-10 shrink-0">{leftIcon}</span>}
      <span className="relative z-10">{children}</span>
      {rightIcon && <span className="relative z-10 shrink-0">{rightIcon}</span>}
    </button>
  );
};

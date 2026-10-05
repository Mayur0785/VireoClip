import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

export interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
  onAnimationComplete?: () => void;
}

export const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 50,
  className = '',
  animateBy = 'words',
  direction = 'top',
  onAnimationComplete,
}) => {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setInView(true);
      if (onAnimationComplete) {
        setTimeout(onAnimationComplete, elements.length * delay + 400);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [elements.length, delay, onAnimationComplete]);

  return (
    <span className={cn('inline-flex flex-wrap gap-x-2.5', className)}>
      {elements.map((el, i) => (
        <span
          key={i}
          className={cn(
            'inline-block transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:filter-none',
            inView
              ? 'opacity-100 translate-y-0 blur-0'
              : `opacity-0 blur-sm ${direction === 'top' ? '-translate-y-3' : 'translate-y-3'}`
          )}
          style={{
            transitionDelay: `${i * delay}ms`,
          }}
        >
          {el === ' ' ? '\u00A0' : el}
        </span>
      ))}
    </span>
  );
};

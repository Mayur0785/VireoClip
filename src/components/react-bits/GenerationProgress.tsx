import React, { useEffect, useState } from 'react';
import { Sparkles, Brain, FileCheck, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface GenerationProgressProps {
  platformName?: string;
  className?: string;
}

const STAGES = [
  { label: 'Understanding your video transcript', icon: Brain },
  { label: 'Analyzing key moments & highlights', icon: Sparkles },
  { label: 'Adapting to your creator voice & tone', icon: Layers },
  { label: 'Crafting platform-ready copy', icon: FileCheck },
];

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
  platformName,
  className,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STAGES.length);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-3xl bg-card border border-border/80 p-6 sm:p-8 shadow-soft text-center space-y-6',
        className
      )}
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cream border border-border/60 relative overflow-hidden">
        {/* Animated breathing glow */}
        <div
          className="absolute inset-0 bg-sage/20 animate-pulse rounded-2xl motion-reduce:hidden"
          style={{ animationDuration: '2s' }}
        />
        <Sparkles className="size-7 text-clay relative z-10 animate-bounce motion-reduce:animate-none" />
      </div>

      <div className="space-y-1.5">
        <h4 className="text-lg font-semibold font-display text-foreground">
          {platformName ? `Generating ${platformName} package` : 'Generating content package'}
        </h4>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
          AI is analyzing your video insights and shaping native copy tailored to your audience.
        </p>
      </div>

      {/* Sequential Presentation Stages */}
      <div className="space-y-2.5 max-w-md mx-auto pt-2">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isCurrent = idx === activeStep;
          const isPast = idx < activeStep;

          return (
            <div
              key={stage.label}
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-xs sm:text-sm transition-all duration-300',
                isCurrent
                  ? 'bg-cream border-sage/40 text-foreground font-medium shadow-sm translate-x-1'
                  : isPast
                  ? 'bg-transparent border-transparent text-muted-foreground/80 opacity-60'
                  : 'bg-transparent border-transparent text-muted-foreground/50 opacity-40'
              )}
            >
              <div
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
                  isCurrent ? 'bg-sage text-white' : isPast ? 'bg-sage/30 text-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="size-3.5" />
              </div>
              <span className="flex-1 text-left">{stage.label}</span>
              {isCurrent && (
                <span className="size-2 rounded-full bg-clay animate-ping motion-reduce:hidden" />
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground/75 font-mono">
        This usually takes 8–15 seconds · Please keep this tab open
      </p>
    </div>
  );
};

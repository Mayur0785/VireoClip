import React from 'react';
import { cn } from '../../lib/utils';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface AnimatedTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export const AnimatedTabs = <T extends string = string>({
  tabs,
  activeKey,
  onChange,
  className,
}: AnimatedTabsProps<T>): React.ReactElement => {
  return (
    <div
      role="tablist"
      aria-label="Platform content tabs"
      className={cn(
        'relative flex items-center gap-1.5 p-1.5 rounded-full bg-secondary/50 border border-border/60 overflow-x-auto scrollbar-none',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.key}`}
            id={`tab-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative z-10 flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-colors duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'text-foreground font-semibold shadow-soft bg-card border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            )}
          >
            {tab.icon && (
              <span
                className={cn(
                  'shrink-0 transition-colors',
                  isActive ? 'text-clay' : 'text-muted-foreground'
                )}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none font-bold',
                  isActive
                    ? 'bg-clay/15 text-clay'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

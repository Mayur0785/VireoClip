import React from 'react';
import { User, Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CreatorProfileData } from '../../context/AuthContext';
import { SpotlightCard } from './SpotlightCard';

export interface CreatorPersonaCardProps {
  profile?: CreatorProfileData | null;
  className?: string;
  hasOverrides?: boolean;
}

export const CreatorPersonaCard: React.FC<CreatorPersonaCardProps> = ({
  profile,
  className,
  hasOverrides,
}) => {
  const isProfileConfigured = Boolean(
    profile && (profile.niche || profile.tone || profile.target_audience)
  );

  return (
    <SpotlightCard
      spotlightColor="rgba(94, 128, 103, 0.12)"
      className={className}
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage/15 text-sage">
              <User className="size-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Creator Persona
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {hasOverrides ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-clay/15 px-2 py-0.5 text-[10px] font-medium text-clay">
                <Sparkles className="size-2.5" />
                Customized for video
              </span>
            ) : isProfileConfigured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sage/15 px-2 py-0.5 text-[10px] font-medium text-sage">
                Active
              </span>
            ) : null}
          </div>
        </div>

        {/* Persona Metrics Grid */}
        {isProfileConfigured ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                Niche
              </span>
              <p className="font-medium text-foreground truncate">
                {profile?.niche || 'General Creator'}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                Voice Tone
              </span>
              <p className="font-medium text-foreground truncate">
                {profile?.custom_tone
                  ? profile.custom_tone
                  : profile?.tone || 'Friendly'}
              </p>
            </div>

            <div className="space-y-0.5 col-span-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                Target Audience
              </span>
              <p className="font-medium text-foreground truncate">
                {profile?.target_audience || 'Broad Audience'}
              </p>
            </div>

            {profile?.preferred_hook_style && (
              <div className="space-y-0.5 col-span-2 pt-1 border-t border-border/40">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Hook Style
                </span>
                <p className="font-medium text-sage truncate">
                  {profile.preferred_hook_style}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Define your creator voice, niche, and hook style so AI outputs match your personal brand.
            </p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs font-semibold text-clay hover:underline"
            >
              <span>Complete creator profile</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>
        )}
      </div>
    </SpotlightCard>
  );
};

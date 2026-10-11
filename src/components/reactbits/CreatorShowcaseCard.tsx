import React from 'react';
import { Play } from 'lucide-react';

export interface CreatorShowcaseCardProps {
  name: string;
  category: string;
  image: string;
  rotation?: number;
  offsetY?: number;
  scale?: number;
  floatVariant?: 1 | 2 | 3;
  className?: string;
  onPreviewClick?: () => void;
}

/**
 * ReactBits-inspired 3D Floating Creator Showcase Card.
 * Renders portrait creator video cards with subtle cinematic floating,
 * dynamic rotation, frosted play button, and smooth hover elevation.
 */
export const CreatorShowcaseCard: React.FC<CreatorShowcaseCardProps> = ({
  name,
  category,
  image,
  rotation = 0,
  offsetY = 0,
  scale = 1,
  floatVariant = 1,
  className = '',
  onPreviewClick,
}) => {
  const floatClass =
    floatVariant === 1
      ? 'animate-float-1'
      : floatVariant === 2
      ? 'animate-float-2'
      : 'animate-float-3';

  return (
    <div
      className={`group relative select-none transition-all duration-500 ease-out hover:z-40 hover:scale-[1.06] hover:!transform-none hover:-translate-y-3 ${floatClass} ${className}`}
      style={
        {
          transform: `translateY(${offsetY}px) rotate(${rotation}deg) scale(${scale})`,
          transformOrigin: 'center bottom',
          '--base-rot': `${rotation}deg`,
        } as React.CSSProperties
      }
    >
      {/* Outer Glow Halo with Animated Trail */}
      <div
        className="absolute -inset-1.5 rounded-[24px] bg-gradient-to-b from-[#20E3A2]/25 via-[#00DCC8]/15 to-transparent opacity-0 blur-lg transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
        aria-hidden="true"
      />

      {/* Main Glass Card Frame */}
      <div className="relative w-[125px] sm:w-[135px] md:w-[145px] xl:w-[155px] 2xl:w-[180px] aspect-[9/15] rounded-[20px] overflow-hidden border border-white/10 bg-[#0A111B]/80 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all duration-300 group-hover:border-[#20E3A2]/40 group-hover:shadow-[0_20px_45px_rgba(32,227,162,0.18)]">
        {/* Background Image */}
        <img
          src={image}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
          loading="lazy"
        />

        {/* Cinematic Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060B12] via-[#060B12]/20 to-transparent opacity-85 group-hover:opacity-75 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

        {/* Center Frosted Glass Play Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={onPreviewClick}
            aria-label={`Preview ${name} clips`}
            className="flex size-11 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:border-[#20E3A2] group-hover:bg-[#20E3A2]/20 group-hover:text-[#20E3A2] group-hover:shadow-[0_0_20px_rgba(32,227,162,0.5)] focus:outline-hidden"
          >
            <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
          </button>
        </div>

        {/* Bottom Creator Meta info */}
        <div className="absolute inset-x-0 bottom-0 p-3.5 pt-6 text-left">
          <h4 className="font-semibold text-sm tracking-tight text-[#F4F7FB] truncate group-hover:text-white drop-shadow-sm">
            {name}
          </h4>
          <p className="text-[11px] font-medium text-[#A6B4C6] truncate mt-0.5 group-hover:text-[#20E3A2]/90 transition-colors">
            {category}
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';

export interface KeyframeMarker {
  timePercent: number; // 0 to 100
  thumbnail: string;
  label: string;
}

export interface AudioTimelineVisualizerProps {
  keyframes?: KeyframeMarker[];
  className?: string;
  currentTime?: string;
  totalTime?: string;
  isPlaying?: boolean;
  playheadPercent?: number;
  onSeek?: (percent: number) => void;
}

/**
 * Colorful multi-hued audio waveform and timeline strip inspired by the reference image.
 * Features gradient waveform bars with embedded video keyframe thumbnails and interactive click-to-seek.
 */
export const AudioTimelineVisualizer: React.FC<AudioTimelineVisualizerProps> = ({
  keyframes = [],
  className = '',
  currentTime = '00:12',
  totalTime = '42:18',
  isPlaying = true,
  playheadPercent: controlledPercent,
  onSeek,
}) => {
  const [internalPercent, setInternalPercent] = useState(28);
  const playheadPercent = controlledPercent !== undefined ? controlledPercent : internalPercent;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    setInternalPercent(pct);
    if (onSeek) onSeek(pct);
  };

  // Generate 88 waveform bars with variable heights and vibrant hue distribution
  const bars = React.useMemo(() => {
    return Array.from({ length: 88 }, (_, i) => {
      // Natural speech rhythm curve
      const wave = Math.abs(Math.sin(i * 0.28) * Math.cos(i * 0.12));
      const peak = Math.round(18 + wave * 62 + (i % 3 === 0 ? 12 : 0));

      // Color mapping: Purple/Violet -> Magenta -> Cyan -> Emerald -> Yellow
      let colorClass = 'from-[#8b5cf6] to-[#ec4899]';
      if (i > 20 && i <= 45) {
        colorClass = 'from-[#06b6d4] to-[#20E3A2]';
      } else if (i > 45 && i <= 65) {
        colorClass = 'from-[#ec4899] to-[#8b5cf6]';
      } else if (i > 65) {
        colorClass = 'from-[#20E3A2] to-[#eab308]';
      }

      return { height: Math.min(95, peak), colorClass };
    });
  }, []);

  return (
    <div className={`relative w-full rounded-xl bg-[#060B12]/90 border border-white/10 p-3 pt-4 backdrop-blur-md ${className}`}>
      {/* Top Scrubber Track / Keyframe Row */}
      <div
        className="relative h-14 w-full flex items-center justify-between mb-2 cursor-pointer select-none"
        onClick={handleTrackClick}
      >
        {/* Waveform Bars Container */}
        <div className="absolute inset-0 flex items-center justify-between gap-[2px] px-1 pointer-events-none">
          {bars.map((bar, index) => {
            const isPlayed = (index / bars.length) * 100 <= playheadPercent;
            return (
              <div
                key={index}
                className={`w-[2px] rounded-full transition-all duration-200 ${
                  isPlaying && isPlayed ? 'animate-waveform-bar' : ''
                }`}
                style={{
                  height: `${bar.height}%`,
                  transformOrigin: 'bottom',
                  animationDelay: `${(index % 12) * 0.08}s`,
                  background: isPlayed
                    ? `linear-gradient(to top, #20E3A2, #00DCC8)`
                    : `linear-gradient(to top, rgba(166, 180, 198, 0.3), rgba(255, 255, 255, 0.15))`,
                  opacity: isPlayed ? 1 : 0.45,
                }}
              />
            );
          })}
        </div>

        {/* Floating Mini Keyframe Video Thumbnails */}
        {keyframes.map((kf, idx) => (
          <div
            key={idx}
            className="absolute z-20 -top-1 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: `${kf.timePercent}%` }}
            onClick={(e) => {
              e.stopPropagation();
              setInternalPercent(kf.timePercent);
              if (onSeek) onSeek(kf.timePercent);
            }}
          >
            <div className="size-11 sm:size-12 rounded-lg overflow-hidden border-2 border-[#20E3A2] shadow-[0_0_12px_rgba(32,227,162,0.4)] transition-transform duration-200 group-hover:scale-110">
              <img src={kf.thumbnail} alt={kf.label} className="w-full h-full object-cover" />
            </div>
            <span className="text-[9px] font-semibold tracking-tight text-[#20E3A2] mt-0.5 bg-[#060B12]/80 px-1 rounded-sm border border-white/10">
              {kf.label}
            </span>
          </div>
        ))}

        {/* Playhead Indicator */}
        <div
          className="absolute z-30 top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#20E3A2] via-white to-[#00DCC8] shadow-[0_0_8px_#20E3A2] transition-all duration-150"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="absolute -top-1.5 -translate-x-1/2 left-1/2 size-3 rounded-full bg-[#20E3A2] border-2 border-white shadow-md" />
        </div>
      </div>

      {/* Timestamp footer bar */}
      <div className="flex items-center justify-between text-[11px] font-mono font-medium text-[#78889B] px-1">
        <span className="text-[#20E3A2] font-semibold">{currentTime}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#A6B4C6]/60">Speech Waveform &amp; Smart Cut Points</span>
        <span>{totalTime}</span>
      </div>
    </div>
  );
};

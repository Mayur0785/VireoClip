import { Link } from "react-router-dom";
import mark from "../assets/brand/vireo-mark.svg";
import lightLogo from "../assets/brand/vireo-logo-light.svg";

export interface LogoProps {
  to?: string;
  className?: string;
  compact?: boolean;
  light?: boolean;
}

export function Logo({
  to = "/",
  className = "",
  compact = false,
  light = false,
}: LogoProps) {
  return (
    <Link
      to={to}
      aria-label="Vireo home"
      className={`inline-flex items-center gap-2 group ${className}`}
    >
      {light && !compact ? (
        <img
          src={lightLogo}
          alt=""
          className="h-10 w-auto transition-transform group-hover:scale-105"
        />
      ) : (
        <>
          <img
            src={mark}
            alt=""
            className="size-9 shrink-0 transition-transform group-hover:scale-105"
          />
          {!compact && (
            <span className="text-[27px] font-bold tracking-[-0.07em] leading-none text-forest inline-flex items-center gap-1.5">
              Vireo
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-clay/10 text-clay border border-clay/20 font-sans tracking-normal">
                Beta
              </span>
            </span>
          )}
        </>
      )}
    </Link>
  );
}

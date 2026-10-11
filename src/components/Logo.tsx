import { Link } from "react-router-dom";
import vireoLogo from "../assets/brand/vireo-logo-purple.png";
import vireoMark from "../assets/brand/vireo-mark-purple.png";

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
}: LogoProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (to === "/" && (window.location.pathname === "/" || window.location.pathname === "")) {
      e.preventDefault();
      if (window.location.hash) {
        window.history.pushState(null, '', '/');
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (to === "/") {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (to === "/" && (e.key === "Enter" || e.key === " " || e.key === "Spacebar")) {
      e.preventDefault();
      (e.currentTarget as HTMLAnchorElement).click();
    }
  };

  return (
    <Link
      to={to}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label="VireoClip home - scroll to top"
      className={`inline-flex items-center gap-2 group focus:outline-hidden ${className}`}
    >
      {compact ? (
        <img
          src={vireoMark}
          alt="VireoClip"
          className="size-8 sm:size-9 shrink-0 object-contain transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <img
          src={vireoLogo}
          alt="VireoClip"
          className="h-9 sm:h-10 w-auto max-w-[210px] object-contain shrink-0 transition-transform duration-200 group-hover:scale-105 drop-shadow-[0_2px_10px_rgba(139,92,246,0.15)]"
        />
      )}
    </Link>
  );
}

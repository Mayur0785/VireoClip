import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Menu, X, LayoutDashboard } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";

const links = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/#how" },
  { label: "Use Cases", href: "/#use-cases" },
  { label: "Pricing", href: "/#pricing" },
];

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-200 ${scrolled || open ? "border-[#e2e7dd] bg-[#fbf8f3]/95 shadow-[0_7px_22px_#143f310b]" : "border-transparent bg-[#fbf8f3]/85"} backdrop-blur-xl`}
    >
      <nav
        className="mx-auto flex h-[72px] max-w-[1288px] items-center justify-between gap-7 px-5 lg:px-8"
        aria-label="Main navigation"
      >
        <Logo />
        <div className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-semibold text-[#526a59] transition-colors hover:text-forest"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-5 lg:flex">
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-forest/90"
            >
              <LayoutDashboard size={16} />
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="text-[13px] font-semibold text-[#365441] hover:text-clay"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-clay px-4 text-[13px] font-bold text-white shadow-clay transition-colors hover:bg-[#bd3f1d]"
              >
                Start Creating Free <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="grid size-11 place-items-center rounded-lg text-forest hover:bg-[#eaf0e6] lg:hidden"
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>
      {open && (
        <div
          id="mobile-navigation"
          className="border-t border-[#e2e7dd] bg-[#fbf8f3] px-5 pb-6 pt-3 lg:hidden"
        >
          <div className="mx-auto flex max-w-[1288px] flex-col">
            <div className="flex flex-col border-b border-[#e4e8df] pb-3">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center text-sm font-semibold text-[#365441]"
                >
                  {link.label}
                </a>
              ))}
            </div>
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-forest px-4 text-sm font-bold text-white shadow-sm"
              >
                <LayoutDashboard size={16} />
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center text-sm font-semibold text-[#365441]"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-clay px-4 text-sm font-bold text-white"
                >
                  Start Creating Free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

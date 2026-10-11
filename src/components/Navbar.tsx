import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Scissors,
  Subtitles,
  Maximize2,
  Layers,
  Mic,
  Share2,
  Split,
  Video,
  Smartphone,
  Sparkles,
  Users,
  HelpCircle,
  Scale,
  Workflow,
  ShieldCheck,
  LayoutDashboard,
  Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import vireoLogo from '../assets/brand/vireo-logo-purple.png';

export interface NavDropdownItem {
  title: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isExternal?: boolean;
}

export interface NavSection {
  label: string;
  href: string;
  hasDropdown: boolean;
  dropdownItems?: NavDropdownItem[];
  gridCols?: number;
  menuWidth?: string;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Product',
    href: '/#product',
    hasDropdown: true,
    gridCols: 2,
    menuWidth: 'w-[580px]',
    dropdownItems: [
      {
        title: 'AI Clipping',
        desc: 'Auto-detect viral moments & high-scoring hooks',
        href: '/#clipping',
        icon: Scissors,
        badge: 'Core',
      },
      {
        title: 'AI Captions',
        desc: 'Word-by-word animated subtitles & viral presets',
        href: '/#captions',
        icon: Subtitles,
      },
      {
        title: 'AI Reframe',
        desc: 'Smart 9:16 vertical crop with zero video distortion',
        href: '/#reframe',
        icon: Maximize2,
      },
      {
        title: 'AI B-Roll',
        desc: 'Context-aware stock footage & visual pacing',
        href: '/#broll',
        icon: Layers,
      },
      {
        title: 'AI Audio & Voice',
        desc: 'Clean Speech noise removal & multi-voice dubbing',
        href: '/#audio',
        icon: Mic,
      },
      {
        title: 'Social Publishing Queue & Post Scheduling',
        desc: 'Automated post scheduling & queue management across 5 platforms',
        href: '/publishing',
        icon: Share2,
      },
      {
        title: 'A/B Testing Studio',
        desc: 'Test titles, hooks & thumbnail variants for CTR',
        href: '/ab-testing',
        icon: Split,
        badge: 'Pro',
      },
      {
        title: 'Content Workspace',
        desc: 'Complete project transcript & multi-channel drafts',
        href: '/#product',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Solutions',
    href: '/#solutions',
    hasDropdown: true,
    gridCols: 1,
    menuWidth: 'w-[380px]',
    dropdownItems: [
      {
        title: 'Content Creators',
        desc: 'Repurpose long YouTube uploads into daily viral shorts',
        href: '/#use-cases',
        icon: Video,
      },
      {
        title: 'Podcasters & Shows',
        desc: 'Extract conversation soundbites and highlight reels',
        href: '/#use-cases',
        icon: Mic,
      },
      {
        title: 'Shorts, Reels & TikTok',
        desc: 'Platform-native vertical formats built to stop the scroll',
        href: '/#platforms',
        icon: Smartphone,
      },
      {
        title: 'Founders & Personal Brands',
        desc: 'Scale thought leadership across 6 channels consistently',
        href: '/#use-cases',
        icon: Sparkles,
      },
      {
        title: 'Marketing Agencies & Teams',
        desc: 'High-volume client repurposing with brand presets',
        href: '/#pricing',
        icon: Users,
      },
    ],
  },
  {
    label: 'Resources',
    href: '/#resources',
    hasDropdown: true,
    gridCols: 1,
    menuWidth: 'w-[380px]',
    dropdownItems: [
      {
        title: 'How It Works',
        desc: 'The 4-step workflow from video upload to everywhere',
        href: '/#how',
        icon: HelpCircle,
      },
      {
        title: 'Compare Competitors',
        desc: 'VireoClip vs OpusClip, CapCut, Submagic & others',
        href: '/comparisons',
        icon: Scale,
        badge: 'New',
      },
      {
        title: 'Frequently Asked Questions',
        desc: 'Answers on file formats, storage & subscription quotas',
        href: '/#faq',
        icon: HelpCircle,
      },
      {
        title: 'Creator Workflows',
        desc: 'Step-by-step guides for multi-platform distribution',
        href: '/workflows',
        icon: Workflow,
      },
      {
        title: 'Official Support',
        desc: 'Direct email support, 24–48h SLA & verified contact details',
        href: '/support',
        icon: Mail,
      },
      {
        title: 'Terms & Privacy',
        desc: 'Terms of service, privacy practices & data security',
        href: '/terms',
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: 'Pricing',
    href: '/#pricing',
    hasDropdown: false,
  },
];

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileExpandedSection, setMobileExpandedSection] = useState<string | null>(null);

  const navRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Scroll detection for navbar background elevation
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 10);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setActiveDropdown(null);
    setOpen(false);
    setMobileExpandedSection(null);
  }, [location.pathname, location.search]);

  // Click outside to close dropdown
  useEffect(() => {
    if (!activeDropdown) return;

    const handleClickOutside = (event: Event) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeDropdown]);

  // Keyboard accessibility: Escape closes dropdown and mobile drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeDropdown) {
          setActiveDropdown(null);
        }
        if (open) {
          setOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDropdown, open]);

  // Centralized navigation handler with smooth anchor scrolling & slide activation
  const handleNavigate = (href: string) => {
    setActiveDropdown(null);
    setOpen(false);
    setMobileExpandedSection(null);

    if (href.startsWith('/#') || href.startsWith('#')) {
      const targetHash = href.replace('/#', '').replace('#', '');
      const isHome = location.pathname === '/' || location.pathname === '';

      if (isHome) {
        const slideIds = ['clipping', 'captions', 'reframe', 'broll', 'audio', 'voice'];
        if (slideIds.includes(targetHash)) {
          window.dispatchEvent(new CustomEvent('vireo:goto-slide', { detail: { slideId: targetHash } }));
          const showcaseEl = document.getElementById('showcase') || document.querySelector('.vireo-showcase');
          if (showcaseEl) {
            showcaseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          const el = document.getElementById(targetHash);
          if (el) {
            const navbarOffset = 80;
            const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        }
        window.history.pushState(null, '', `#${targetHash}`);
      } else {
        navigate(`/#${targetHash}`);
      }
    } else {
      navigate(href);
    }
  };

  const toggleDropdown = (label: string) => {
    setActiveDropdown((prev) => (prev === label ? null : label));
  };

  const toggleMobileSection = (label: string) => {
    setMobileExpandedSection((prev) => (prev === label ? null : label));
  };

  const ctaPath = isAuthenticated ? '/projects/new' : '/signup';
  const ctaLabel = isAuthenticated ? 'Create clips' : 'Get free clips';

  return (
    <header
      ref={navRef}
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled || activeDropdown || open
          ? 'bg-[#060B12]/95 border-b border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl'
          : 'bg-[#060B12]/70 border-b border-white/[0.05] backdrop-blur-md'
      }`}
    >
      <nav
        className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        {/* Brand Logo with Smooth Scroll-to-Top / Home Navigation */}
        <Link
          to="/"
          className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060B12] rounded-lg"
          aria-label="VireoClip Home - Scroll to top"
          onClick={(e) => {
            if (location.pathname === '/' || location.pathname === '') {
              e.preventDefault();
              if (window.location.hash) {
                window.history.pushState(null, '', '/');
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }, 50);
            }
          }}
        >
          <img
            src={vireoLogo}
            alt="VireoClip"
            className="h-9 sm:h-10 w-auto max-w-[210px] object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_2px_10px_rgba(139,92,246,0.15)]"
          />
        </Link>

        {/* Center Desktop Navigation with Interactive Dropdowns */}
        <div className="hidden md:flex items-center gap-1.5 lg:gap-2">
          {NAV_SECTIONS.map((section) => {
            const isOpen = activeDropdown === section.label;

            if (!section.hasDropdown) {
              return (
                <button
                  key={section.label}
                  type="button"
                  onClick={() => handleNavigate(section.href)}
                  className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-[#A6B4C6] hover:text-[#F4F7FB] hover:bg-white/[0.04] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060B12]"
                >
                  {section.label}
                </button>
              );
            }

            return (
              <div key={section.label} className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown(section.label)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  aria-controls={`dropdown-${section.label.toLowerCase()}`}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060B12] ${
                    isOpen
                      ? 'text-white bg-white/[0.08] shadow-inner'
                      : 'text-[#A6B4C6] hover:text-[#F4F7FB] hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    className={`size-3.5 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#20E3A2]' : 'opacity-60'
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {/* Dropdown Menu Panel */}
                {isOpen && (
                  <div
                    ref={dropdownRef}
                    id={`dropdown-${section.label.toLowerCase()}`}
                    role="menu"
                    aria-label={`${section.label} menu`}
                    className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 ${section.menuWidth || 'w-[380px]'} rounded-2xl border border-white/10 bg-[#0A111B]/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150`}
                  >
                    <div
                      className={`grid ${
                        section.gridCols === 2 ? 'grid-cols-2 gap-2' : 'grid-cols-1 gap-1.5'
                      }`}
                    >
                      {section.dropdownItems?.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.title}
                            type="button"
                            role="menuitem"
                            onClick={() => handleNavigate(item.href)}
                            className="group flex items-start gap-3 w-full text-left p-2.5 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/[0.06] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-[#20E3A2] group-hover:bg-[#20E3A2]/15 group-hover:border-[#20E3A2]/30 transition-all">
                              <Icon className="size-4.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[#F4F7FB] group-hover:text-[#20E3A2] transition-colors truncate">
                                  {item.title}
                                </span>
                                {item.badge && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30 shrink-0">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#8A9BAE] group-hover:text-[#A6B4C6] leading-snug line-clamp-1 mt-0.5">
                                {item.desc}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right CTA Actions */}
        <div className="hidden sm:flex items-center gap-3.5">
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-full border border-white/15 bg-white/[0.05] text-sm font-semibold text-[#F4F7FB] hover:border-[#20E3A2]/50 hover:text-[#20E3A2] hover:bg-white/[0.08] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-full border border-white/15 bg-white/[0.05] text-sm font-semibold text-[#F4F7FB] hover:border-[#20E3A2]/50 hover:text-[#20E3A2] hover:bg-white/[0.08] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
            >
              Login
            </Link>
          )}

          <Link
            to={ctaPath}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 rounded-full bg-[#20E3A2] text-[#060B12] text-sm font-bold shadow-[0_0_20px_rgba(32,227,162,0.4)] hover:bg-[#2bf0ad] hover:shadow-[0_0_28px_rgba(32,227,162,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          className="flex md:hidden size-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F4F7FB] hover:border-[#20E3A2]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile Drawer with Accordion Dropdowns & Touch Targets */}
      {open && (
        <div className="md:hidden max-h-[calc(100vh-80px)] overflow-y-auto border-b border-white/10 bg-[#0A111B]/98 p-5 backdrop-blur-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col space-y-1">
            {NAV_SECTIONS.map((section) => {
              if (!section.hasDropdown) {
                return (
                  <button
                    key={section.label}
                    type="button"
                    onClick={() => handleNavigate(section.href)}
                    className="flex w-full items-center justify-between py-3 px-3 text-left text-base font-semibold text-[#A6B4C6] hover:text-[#20E3A2] rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <span>{section.label}</span>
                  </button>
                );
              }

              const isExpanded = mobileExpandedSection === section.label;

              return (
                <div key={section.label} className="border-b border-white/[0.05] pb-1">
                  <button
                    type="button"
                    onClick={() => toggleMobileSection(section.label)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between py-3 px-3 text-left text-base font-semibold text-[#A6B4C6] hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={`size-4 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-[#20E3A2]' : 'opacity-60'
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {isExpanded && (
                    <div className="pl-2 pr-1 py-1 space-y-1">
                      {section.dropdownItems?.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.title}
                            type="button"
                            onClick={() => handleNavigate(item.href)}
                            className="flex items-center gap-3 w-full text-left py-2 px-3 rounded-lg hover:bg-white/[0.07] text-sm text-[#8A9BAE] hover:text-[#20E3A2] transition-colors"
                          >
                            <Icon className="size-4 shrink-0 text-[#20E3A2]" />
                            <span className="font-medium text-white text-xs sm:text-sm truncate">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span className="ml-auto px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#20E3A2]/15 text-[#20E3A2]">
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="w-full text-center py-3 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white hover:border-[#20E3A2]/40"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="w-full text-center py-3 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white hover:border-[#20E3A2]/40"
              >
                Login
              </Link>
            )}

            <Link
              to={ctaPath}
              onClick={() => setOpen(false)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#20E3A2] text-[#060B12] text-sm font-bold shadow-[0_0_15px_rgba(32,227,162,0.4)]"
            >
              <span>{ctaLabel}</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

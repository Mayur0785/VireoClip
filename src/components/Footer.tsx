import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';

interface FooterLinkItem {
  label: string;
  href: string;
  badge?: string;
  isExternal?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLinkItem[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Creation Studio',
    links: [
      { label: 'AI Clipping', href: '/#clipping' },
      { label: 'AI Captions', href: '/#captions' },
      { label: 'AI Auto-Reframe (9:16)', href: '/#reframe' },
      { label: 'AI B-Roll Insertion', href: '/#broll' },
      { label: 'Audio Enhancement', href: '/#audio' },
      { label: 'AI Voice & Dubbing', href: '/#voice' },
      { label: 'Multi-Track Timeline Editor', href: '/dashboard' },
      { label: 'New Project Upload', href: '/projects/new' },
    ],
  },
  {
    title: 'Creator Intelligence',
    links: [
      { label: 'Brand Brain', href: '/brand', badge: 'Live' },
      { label: 'A/B Testing Studio', href: '/ab-testing', badge: 'Live' },
      { label: 'Performance Analytics', href: '/analytics', badge: 'Live' },
      { label: 'Hook Lab', href: '/#product' },
      { label: 'Thumbnail Lab', href: '/#product' },
      { label: 'Content Pack Studio', href: '/#product' },
      { label: 'Autopilot Engine', href: '/workflows' },
    ],
  },
  {
    title: 'Workspaces & Teams',
    links: [
      { label: 'Team Workspaces & RBAC', href: '/workspaces', badge: 'New' },
      { label: 'Workflow Automation', href: '/workflows' },
      { label: 'Social Publishing Queue & Post Scheduling', href: '/publishing' },
      { label: 'Project History & Library', href: '/history' },
      { label: 'Creator Dashboard', href: '/dashboard' },
      { label: 'Account Settings', href: '/settings' },
    ],
  },
  {
    title: 'Platform Channels',
    links: [
      { label: 'YouTube Shorts Repurposing', href: '/#platforms' },
      { label: 'TikTok & Reels Optimization', href: '/#platforms' },
      { label: 'Instagram Captions & Hooks', href: '/#platforms' },
      { label: 'LinkedIn Professional Posts', href: '/#platforms' },
      { label: 'X (Twitter) Thread Kits', href: '/#platforms' },
      { label: '4-Step Pipeline Architecture', href: '/#how' },
    ],
  },
  {
    title: 'Company & Trust',
    links: [
      { label: 'Plans & Pricing (USD / INR)', href: '/#pricing' },
      { label: 'Creator Use Cases', href: '/#use-cases' },
      { label: 'Frequently Asked Questions', href: '/#faq' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Official Support', href: '/support' },
    ],
  },
];

export const Footer: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    if (href.startsWith('/#') || href.startsWith('#')) {
      const targetHash = href.replace('/#', '').replace('#', '');
      const isHome = location.pathname === '/' || location.pathname === '';

      if (isHome) {
        e.preventDefault();
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
        // Navigating from another route
        navigate(`/#${targetHash}`);
      }
    }
  };

  return (
    <footer
      id="features-footer"
      className="w-full border-t border-white/10 bg-[#080B12] text-[#F4F6FC] overflow-x-hidden vireo-features-footer"
      aria-label="Features and Navigation Footer"
    >
      {/* Top Brand Banner */}
      <div className="mx-auto max-w-7xl px-5 pt-12 pb-8 sm:px-8 lg:px-10 border-b border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <Logo light />
            <p className="max-w-md text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
              Turn long videos into scroll-stopping clips and complete social kits for YouTube, Instagram, TikTok, LinkedIn, and X.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-purple-900/30 hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Start Creating Free
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Main 5-Column Navigation Section Built Around Actual 40-Phase Features */}
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-8 xl:gap-10">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="vireo-footer-col flex flex-col space-y-4">
              {/* Pink / Purple Gradient Heading Matching Reference */}
              <h3 className="text-xs font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400">
                {col.title}
              </h3>

              <ul className="space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                {col.links.map((link) => {
                  const isInternalRoute = link.href.startsWith('/') && !link.href.includes('#');

                  return (
                    <li key={link.label}>
                      {isInternalRoute ? (
                        <Link
                          to={link.href}
                          className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
                        >
                          <span>{link.label}</span>
                          {link.badge && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              {link.badge}
                            </span>
                          )}
                        </Link>
                      ) : link.isExternal ? (
                        <a
                          href={link.href}
                          className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
                        >
                          <span>{link.label}</span>
                        </a>
                      ) : (
                        <a
                          href={link.href}
                          onClick={(e) => handleLinkClick(e, link.href)}
                          className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
                        >
                          <span>{link.label}</span>
                          {link.badge && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30">
                              {link.badge}
                            </span>
                          )}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Legal & Copyright Bar */}
      <div className="border-t border-white/[0.08] bg-black/30">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:px-10 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>© {new Date().getFullYear()} VireoClip by Vertex Digitals. All rights reserved.</span>
            <span>Support: vertexdigitals07@gmail.com</span>
          </div>

          <div className="flex items-center gap-6">
            <Link
              to="/terms"
              className="transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
            >
              Privacy Policy
            </Link>
            <Link
              to="/support"
              className="transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 focus-visible:rounded"
            >
              Official Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

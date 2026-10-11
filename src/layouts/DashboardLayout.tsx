import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Scissors,
  Video,
  Sparkles,
  FolderClosed,
  Share2,
  TrendingUp,
  FlaskConical,
  Brain,
  Building2,
  GitBranch,
  Settings,
  HelpCircle,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Search,
  Bell,
  Plus,
  Zap,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useBillingUsage } from '../hooks/useBillingUsage';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Create',
    items: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/projects/new', label: 'Create Clips', icon: Scissors },
      { to: '/dashboard#editor', label: 'Video Editor', icon: Video },
      { to: '/dashboard#studio', label: 'Content Studio', icon: Sparkles },
      { to: '/history', label: 'Media Library', icon: FolderClosed },
    ],
  },
  {
    title: 'Publish',
    items: [
      { to: '/publishing', label: 'Publishing', icon: Share2 },
      { to: '/analytics', label: 'Analytics', icon: TrendingUp },
      { to: '/ab-testing', label: 'A/B Testing', icon: FlaskConical },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { to: '/brand', label: 'Brand Brain', icon: Brain },
      { to: '/workspaces', label: 'Workspaces', icon: Building2 },
      { to: '/workflows', label: 'Workflows', icon: GitBranch },
    ],
  },
];

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user, profile } = useAuth();
  const { usage } = useBillingUsage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Creator';

  const userInitial = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const planLabel = usage?.is_unlimited
    ? 'Unlimited'
    : usage?.plan_tier
    ? `${usage.plan_tier.charAt(0).toUpperCase() + usage.plan_tier.slice(1)} Plan`
    : 'Free Plan';

  const usagePercent = usage?.is_unlimited
    ? 100
    : Math.min(
        100,
        Math.max(
          4,
          Math.round(
            ((usage?.total_used_minutes || 0) / (usage?.limit_minutes || 1)) * 100
          )
        )
      );

  return (
    <div className="min-h-screen bg-[#080B12] text-[#F4F6FB] flex flex-col lg:flex-row antialiased selection:bg-[#8B5CF6]/30 selection:text-white">
      {/* Mobile Drawer Overlay */}
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden cursor-default"
          aria-label="Close navigation drawer"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/[0.07] bg-[#0A0E17]/95 backdrop-blur-2xl transition-all duration-300 lg:sticky lg:top-0 lg:h-screen ${
          collapsed ? 'w-[78px] px-2.5 py-4' : 'w-[252px] px-3.5 py-4'
        } ${
          menuOpen
            ? 'translate-x-0 shadow-[0_0_50px_rgba(0,0,0,0.8)]'
            : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Main sidebar navigation"
      >
        {/* Brand & Collapse Header */}
        <div className="flex items-center justify-between pb-3 px-1.5 border-b border-white/[0.05]">
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <Logo to="/dashboard" compact={false} />
            </div>
          ) : (
            <div className="mx-auto">
              <Logo to="/dashboard" compact />
            </div>
          )}

          {/* Desktop collapse toggle */}
          <button
            type="button"
            className="hidden lg:grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[#8E9AB4] hover:text-[#F4F6FB] hover:bg-white/[0.08] transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronDown className={`size-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-lg text-[#8E9AB4] hover:bg-white/[0.06] hover:text-[#F4F6FB] transition-colors"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Workspace Switcher Button */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => navigate('/workspaces')}
            className="mt-3.5 flex items-center gap-2.5 w-full p-2 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.06] text-left transition-all group"
            title="Switch or manage workspaces"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#6D4AFF] text-white text-xs font-bold font-['Sora',sans-serif] shadow-[0_2px_8px_rgba(109,74,255,0.35)]">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-xs font-semibold text-[#F4F6FB] leading-tight group-hover:text-white">
                {displayName}&apos;s Studio
              </span>
              <span className="block truncate text-[11px] text-[#8E9AB4] leading-tight">
                {planLabel} · 1 member
              </span>
            </span>
            <ChevronDown className="size-3.5 text-[#8E9AB4] shrink-0 group-hover:text-[#F4F6FB] transition-colors" />
          </button>
        )}

        {/* Navigation Sections */}
        <nav
          aria-label="Dashboard links"
          className="mt-3 flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-0.5 scrollbar-none"
        >
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              {!collapsed && (
                <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-bold tracking-wider uppercase text-[#64748B] font-['Sora',sans-serif]">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const isExact = item.to === '/dashboard';
                const isActive = isExact
                  ? location.pathname === '/dashboard' && !location.hash
                  : item.to.includes('#')
                  ? location.hash === item.to.replace('/dashboard', '')
                  : location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'vireo-nav-active font-semibold'
                        : 'text-[#9AA6BF] hover:bg-white/[0.05] hover:text-[#F4F6FB] border border-transparent'
                    }`}
                  >
                    <item.icon className="size-[17px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}

          {/* Admin console link if authorized */}
          {user?.email === 'vertexdigitals07@gmail.com' && (
            <div className="space-y-0.5 pt-1">
              {!collapsed && (
                <div className="px-2.5 text-[10.5px] font-bold tracking-wider uppercase text-amber-500/80 font-['Sora',sans-serif]">
                  Admin
                </div>
              )}
              <NavLink
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                      : 'text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 border border-transparent'
                  }`
                }
              >
                <Shield className="size-[17px] shrink-0" />
                {!collapsed && <span>Owner Console</span>}
              </NavLink>
            </div>
          )}

          {/* Utility bottom links */}
          <div className="pt-2 border-t border-white/[0.05] space-y-0.5">
            <NavLink
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'vireo-nav-active font-semibold'
                    : 'text-[#9AA6BF] hover:bg-white/[0.05] hover:text-[#F4F6FB] border border-transparent'
                }`
              }
            >
              <Settings className="size-[17px] shrink-0" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
            <NavLink
              to="/support"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'vireo-nav-active font-semibold'
                    : 'text-[#9AA6BF] hover:bg-white/[0.05] hover:text-[#F4F6FB] border border-transparent'
                }`
              }
            >
              <HelpCircle className="size-[17px] shrink-0" />
              {!collapsed && <span>Help &amp; tutorials</span>}
            </NavLink>
          </div>
        </nav>

        {/* Sidebar Footer: Actual Plan and Usage */}
        {!collapsed && (
          <div className="mt-auto pt-3 border-t border-white/[0.06]">
            <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] p-3 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#F4F6FB]">{planLabel}</span>
                <span className="text-[11px] font-mono text-[#8E9AB4]">
                  {usage?.is_unlimited
                    ? 'Unlimited'
                    : `${(usage?.total_used_minutes || 0).toFixed(0)} / ${usage?.limit_minutes || 0}m`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>

              {/* Upgrade CTA Button */}
              <NavLink
                to="/billing"
                onClick={() => setMenuOpen(false)}
                className="mt-2.5 flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D4AFF] text-white text-xs font-semibold shadow-[0_4px_14px_rgba(109,74,255,0.3)] hover:brightness-110 active:scale-[0.98] transition-all"
              >
                <span>Upgrade Plan</span>
              </NavLink>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Top Navigation Bar Matching Reference */}
        <header className="sticky top-0 z-30 flex h-[64px] sm:h-[68px] items-center justify-between gap-2.5 sm:gap-3 border-b border-white/[0.06] bg-[#080B12]/85 px-3.5 sm:px-6 lg:px-8 backdrop-blur-xl">
          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-xl text-[#8E9AB4] hover:bg-white/[0.06] hover:text-[#F4F6FB] transition-colors shrink-0"
            aria-label="Open navigation drawer"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </button>

          {/* Search bar with Ctrl K (compact icon on mobile, input on sm+) */}
          <div className="hidden sm:flex items-center flex-1 max-w-[420px]">
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/history')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate('/history');
              }}
              className="flex items-center gap-2.5 w-full h-[38px] sm:h-[40px] px-3.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs sm:text-[13px] text-[#8E9AB4] hover:border-white/[0.15] hover:bg-white/[0.06] transition-all cursor-pointer"
            >
              <Search className="size-4 shrink-0 text-[#8E9AB4]" />
              <span className="flex-1 truncate">Search projects, clips, and tools</span>
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono text-[#8E9AB4] border border-white/10 rounded-md bg-white/[0.03]">
                Ctrl K
              </kbd>
            </div>
          </div>

          {/* Mobile search icon button */}
          <button
            type="button"
            onClick={() => navigate('/history')}
            className="sm:hidden grid size-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[#8E9AB4]"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 ml-auto shrink-0">
            {/* Minutes left quota badge */}
            <div className="hidden xl:inline-flex items-center gap-1.5 h-[36px] sm:h-[38px] px-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-[#C9D2E6]">
              <Zap className="size-3.5 text-[#22D3EE]" />
              <span>
                {usage?.is_unlimited
                  ? 'Unlimited'
                  : `${Math.max(0, usage?.remaining_minutes || 0).toFixed(0)} min left`}
              </span>
            </div>

            {/* Upgrade Plan button */}
            <NavLink
              to="/billing"
              className="hidden lg:inline-flex items-center justify-center h-[36px] sm:h-[38px] px-3.5 rounded-xl border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.09] text-xs font-semibold text-[#E4E9F5] transition-all"
            >
              Upgrade
            </NavLink>

            {/* Prominent Create CTA Button */}
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className="inline-flex items-center justify-center gap-1.5 h-[36px] sm:h-[38px] px-3 sm:px-4 rounded-xl vireo-btn-purple text-xs sm:text-sm font-semibold text-white cursor-pointer shrink-0"
            >
              <Plus className="size-4 stroke-[2.5]" />
              <span>Create</span>
            </button>

            {/* Notifications Button */}
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => navigate('/history')}
              className="relative grid size-9 sm:size-[38px] place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[#C9D2E6] hover:bg-white/[0.08] hover:text-[#F4F6FB] transition-all shrink-0"
            >
              <Bell className="size-4" />
              <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[#22D3EE] ring-2 ring-[#080B12]" />
            </button>

            {/* User Profile dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-[38px] px-1.5 sm:px-2 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-[#C9D2E6] transition-all"
              >
                <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#22D3EE] font-bold text-white text-[11px]">
                  {userInitial}
                </span>
                <span className="hidden md:inline-block max-w-[100px] truncate text-xs font-semibold text-[#F4F6FB]">
                  {displayName}
                </span>
                <ChevronDown className="size-3 text-[#8E9AB4]" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-white/[0.1] bg-[#0B0F19]/95 p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl z-50">
                  <div className="px-3 py-2.5 border-b border-white/[0.06] mb-1">
                    <p className="text-xs font-semibold text-[#F4F6FB] truncate">{displayName}</p>
                    <p className="text-[11px] text-[#8E9AB4] truncate">{user?.email}</p>
                    <span className="mt-1.5 inline-block text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-[#A78BFA] border border-white/[0.08]">
                      {planLabel}
                    </span>
                  </div>
                  <NavLink
                    to="/settings"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-[#C9D2E6] hover:text-[#F4F6FB] hover:bg-white/[0.06] transition-colors"
                  >
                    <Settings className="size-3.5 text-[#8E9AB4]" />
                    Account Settings
                  </NavLink>
                  <NavLink
                    to="/billing"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-[#C9D2E6] hover:text-[#F4F6FB] hover:bg-white/[0.06] transition-colors"
                  >
                    <Zap className="size-3.5 text-[#8E9AB4]" />
                    Billing &amp; Subscription
                  </NavLink>
                  <NavLink
                    to="/support"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-[#C9D2E6] hover:text-[#F4F6FB] hover:bg-white/[0.06] transition-colors"
                  >
                    <HelpCircle className="size-3.5 text-[#8E9AB4]" />
                    Support &amp; Feedback
                  </NavLink>
                  <div className="my-1 border-t border-white/[0.05]" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 w-full max-w-[1300px] mx-auto px-4 py-7 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Search,
  Bell,
  Crown,
  ArrowRight,
  Share2,
  CreditCard,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects/new', label: 'New Project', icon: PlusCircle },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp },
  { to: '/publishing', label: 'Publishing', icon: Share2 },
  { to: '/billing', label: 'Billing & Plans', icon: CreditCard },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Creator';
  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-cream text-foreground lg:flex">
      {menuOpen && (
        <button
          className="fixed inset-0 z-40 bg-forest/30 lg:hidden backdrop-blur-xs"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-border bg-white px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Logo to="/dashboard" />
          <button
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-cream"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="mt-8 space-y-1">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#eaf3eb] text-vireo-green font-semibold shadow-2xs'
                    : 'text-foreground/80 hover:bg-cream hover:text-foreground'
                }`
              }
            >
              <item.icon className="size-[18px] shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {user?.email === 'vertexdigitals07@gmail.com' && (
            <NavLink
              to="/admin"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-clay text-white font-semibold shadow-clay'
                    : 'text-clay hover:bg-clay/10 font-semibold'
                }`
              }
            >
              <Shield className="size-[18px] shrink-0" />
              <span>Owner Console</span>
            </NavLink>
          )}
        </nav>

        {/* Upgrade to Pro Card (matching reference design) */}
        <div className="mt-auto rounded-2xl border border-clay/20 bg-[#fffaf6] p-4 space-y-2">
          <div className="flex items-center gap-2 text-clay">
            <div className="grid size-6 place-items-center rounded-md bg-clay/10">
              <Crown className="size-3.5" />
            </div>
            <p className="font-display text-sm font-semibold text-foreground">Upgrade to Pro</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Unlock more videos, AI templates and advanced features.
          </p>
          <NavLink
            to="/settings"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-clay px-3 py-2 text-xs font-semibold text-white shadow-clay hover:bg-[#bd3f1d] transition-colors"
          >
            <span>Upgrade Now</span>
            <ArrowRight className="size-3.5" />
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-border bg-white/90 px-4 backdrop-blur-md sm:px-7 lg:px-9">
          <button
            className="rounded-lg p-2 hover:bg-cream lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </button>

          {/* Search bar matching reference */}
          <div className="hidden sm:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search projects, transcripts, or content..."
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/80 bg-[#f8f9f7] text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-sage/40 focus:border-sage transition-all"
                onClick={() => navigate('/history')}
                readOnly
              />
            </div>
          </div>

          {/* Right Header: Notification + Account */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Notification Bell */}
            <button
              type="button"
              aria-label="Notifications"
              className="relative grid size-10 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-cream transition-colors"
            >
              <Bell className="size-[18px]" />
              <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-clay border-2 border-white" />
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-cream transition-colors"
              >
                <span className="grid size-9 place-items-center rounded-full bg-[#e5f0e7] font-semibold text-vireo-green text-sm shadow-2xs">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[140px] truncate text-sm font-semibold text-foreground leading-tight">
                    {displayName}
                  </span>
                  <span className="block text-[11px] font-medium text-vireo-green">
                    Pro Plan
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-border bg-white p-1.5 shadow-lift z-50">
                  <div className="px-3 py-2 border-b border-border/60 mb-1">
                    <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <NavLink
                    to="/settings"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-cream transition-colors"
                  >
                    <Settings className="size-4 text-muted-foreground" />
                    Settings
                  </NavLink>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto max-w-[1500px] w-full px-4 pb-16 pt-7 sm:px-7 lg:px-9 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};


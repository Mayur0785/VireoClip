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
  Brain,
  FlaskConical,
  CheckSquare,
  Building2,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
  { to: '/workflows', label: 'Workflows', icon: CheckSquare },
  { to: '/projects/new', label: 'New Project', icon: PlusCircle },
  { to: '/brand', label: 'Brand Brain', icon: Brain },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp },
  { to: '/ab-testing', label: 'A/B Studio', icon: FlaskConical },
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
    <div className="min-h-screen bg-[#060B12] text-[#F4F7FB] selection:bg-[#20E3A2]/30 selection:text-white lg:flex">
      {menuOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/60 lg:hidden backdrop-blur-sm"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-white/5 bg-[#0A111B]/95 backdrop-blur-xl px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Logo to="/dashboard" light />
          <button
            className="lg:hidden p-1.5 rounded-lg text-[#A6B4C6] hover:bg-white/5 hover:text-[#F4F7FB]"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="mt-8 space-y-1 overflow-y-auto pr-1">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#20E3A2]/10 text-[#20E3A2] border border-[#20E3A2]/25 font-semibold shadow-[0_0_15px_rgba(32,227,162,0.1)]'
                    : 'text-[#A6B4C6] hover:bg-white/5 hover:text-[#F4F7FB] border border-transparent'
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
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                    : 'text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 border border-transparent font-medium'
                }`
              }
            >
              <Shield className="size-[18px] shrink-0" />
              <span>Owner Console</span>
            </NavLink>
          )}
        </nav>

        {/* Upgrade to Pro Card */}
        <div className="mt-auto rounded-2xl border border-[#20E3A2]/20 bg-gradient-to-b from-[#20E3A2]/5 via-white/[0.02] to-transparent p-4 space-y-2 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[#20E3A2]">
            <div className="grid size-6 place-items-center rounded-md bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30">
              <Crown className="size-3.5" />
            </div>
            <p className="font-display text-sm font-semibold text-[#F4F7FB]">Upgrade to Pro</p>
          </div>
          <p className="text-xs leading-relaxed text-[#78889B]">
            Unlock more videos, 4K clips, AI templates and priority rendering.
          </p>
          <NavLink
            to="/settings"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#20E3A2] to-[#00DCC8] px-3 py-2 text-xs font-bold text-[#060B12] shadow-[0_0_15px_rgba(32,227,162,0.25)] hover:shadow-[0_0_22px_rgba(32,227,162,0.4)] transition-all"
          >
            <span>Upgrade Now</span>
            <ArrowRight className="size-3.5" />
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-white/5 bg-[#060B12]/80 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <button
            className="rounded-lg p-2 text-[#A6B4C6] hover:bg-white/5 hover:text-[#F4F7FB] lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </button>

          {/* Search bar matching reference */}
          <div className="hidden sm:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#78889B]" />
              <input
                type="text"
                placeholder="Search projects, transcripts, or content..."
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-xs sm:text-sm text-[#F4F7FB] placeholder:text-[#78889B] focus:outline-none focus:ring-1 focus:ring-[#20E3A2]/50 focus:border-[#20E3A2]/50 transition-all cursor-pointer"
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
              className="relative grid size-10 place-items-center rounded-xl text-[#A6B4C6] hover:text-[#F4F7FB] hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
            >
              <Bell className="size-[18px]" />
              <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-[#20E3A2] ring-2 ring-[#060B12]" />
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
              >
                <span className="grid size-9 place-items-center rounded-full bg-gradient-to-tr from-[#20E3A2]/30 to-[#00DCC8]/20 font-bold text-[#20E3A2] text-sm border border-[#20E3A2]/30">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[140px] truncate text-sm font-semibold text-[#F4F7FB] leading-tight">
                    {displayName}
                  </span>
                  <span className="block text-[11px] font-medium text-[#20E3A2]">
                    Creator Plan
                  </span>
                </span>
                <ChevronDown className="size-4 text-[#78889B]" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/10 bg-[#0A111B]/95 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl z-50">
                  <div className="px-3 py-2 border-b border-white/5 mb-1">
                    <p className="text-xs font-semibold text-[#F4F7FB] truncate">{displayName}</p>
                    <p className="text-[11px] text-[#78889B] truncate">{user?.email}</p>
                  </div>
                  <NavLink
                    to="/settings"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#A6B4C6] hover:text-[#F4F7FB] hover:bg-white/5 transition-colors"
                  >
                    <Settings className="size-4 text-[#78889B]" />
                    Settings
                  </NavLink>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
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


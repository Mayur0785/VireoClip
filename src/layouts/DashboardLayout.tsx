import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, History, Settings, LogOut, Menu, X, ChevronDown } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects/new', label: 'New Project', icon: PlusCircle },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Creator';
  const handleSignOut = async () => { await signOut(); navigate('/login'); };
  return (
    <div className="min-h-screen bg-cream text-foreground lg:flex">
      {menuOpen && <button className="fixed inset-0 z-40 bg-forest/30 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[230px] flex-col border-r border-border bg-white px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2"><Logo to="/dashboard" /><button className="lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X className="size-5" /></button></div>
        <nav aria-label="Main navigation" className="mt-12 space-y-1.5">
          {links.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({isActive}) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-[#e7f1e8] text-forest font-semibold' : 'text-[#344249] hover:bg-cream hover:text-forest'}`}><item.icon className="size-[19px]" />{item.label}</NavLink>)}
        </nav>
        <div className="mt-auto rounded-2xl border border-[#f2e9de] bg-[#fffaf5] p-4"><p className="font-display text-lg font-semibold text-forest">Create more from every video.</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your next content kit is one upload away.</p><NavLink to="/projects/new" className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-clay px-3 py-2 text-xs font-semibold text-white hover:bg-[#c93f1e]">New Project</NavLink></div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur-md sm:px-7 lg:px-9">
          <button className="rounded-lg p-2 hover:bg-cream lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu className="size-5" /></button>
          <p className="hidden text-sm text-muted-foreground lg:block">Your creator workspace</p>
          <div className="relative ml-auto">
            <button onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-cream">
              <span className="grid size-9 place-items-center rounded-full bg-[#e5f0e7] font-semibold text-forest">{displayName.charAt(0).toUpperCase()}</span>
              <span className="hidden text-left sm:block"><span className="block max-w-[150px] truncate text-sm font-semibold">{displayName}</span><span className="block text-xs text-muted-foreground">My account</span></span><ChevronDown className="size-4 text-muted-foreground" />
            </button>
            {accountOpen && <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-white p-1.5 shadow-lift"><NavLink to="/settings" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-cream"><Settings className="size-4" />Settings</NavLink><button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream"><LogOut className="size-4" />Sign out</button></div>}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-7 sm:px-7 lg:px-9"><Outlet /></main>
      </div>
    </div>
  );
};

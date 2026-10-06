import React, { useState, useEffect } from 'react';
import {
  Users,
  Film,
  Zap,
  CreditCard,
  Video,
  Send,
  Share2,
  Activity,
  RefreshCw,
  Search,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  Layers,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { Button } from '../components/Button';
import { SpotlightCard } from '../components/react-bits/SpotlightCard';
import {
  AdminService,
  AdminOverviewData,
  AdminUserItem,
  AdminProjectItem,
  AdminSubscriptionItem,
  AdminRenderJobItem,
  AdminPublishingItem,
  AdminSocialAccountItem,
  AdminHealthData,
} from '../services/adminService';

type Tab =
  | 'overview'
  | 'users'
  | 'projects'
  | 'usage'
  | 'subscriptions'
  | 'renders'
  | 'publishing'
  | 'social'
  | 'health';

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [projects, setProjects] = useState<AdminProjectItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionItem[]>([]);
  const [renderJobs, setRenderJobs] = useState<AdminRenderJobItem[]>([]);
  const [publishingJobs, setPublishingJobs] = useState<AdminPublishingItem[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<AdminSocialAccountItem[]>([]);
  const [health, setHealth] = useState<AdminHealthData | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const fetchTabData = async () => {
    try {
      setLoading(true);
      setError(null);

      switch (activeTab) {
        case 'overview': {
          const data = await AdminService.getOverview();
          setOverview(data);
          break;
        }
        case 'users': {
          const data = await AdminService.getUsers({ page, limit: 25, search: searchQuery });
          setUsers(data.users);
          setTotalItems(data.total);
          break;
        }
        case 'projects': {
          const data = await AdminService.getProjects({ page, limit: 25, search: searchQuery });
          setProjects(data.projects);
          setTotalItems(data.total);
          break;
        }
        case 'subscriptions': {
          const data = await AdminService.getSubscriptions({ page, limit: 25 });
          setSubscriptions(data.subscriptions);
          setTotalItems(data.total);
          break;
        }
        case 'renders': {
          const data = await AdminService.getRenderJobs({ page, limit: 25 });
          setRenderJobs(data.renderJobs);
          setTotalItems(data.total);
          break;
        }
        case 'publishing': {
          const data = await AdminService.getPublishing({ page, limit: 25 });
          setPublishingJobs(data.jobs);
          setTotalItems(data.total);
          break;
        }
        case 'social': {
          const data = await AdminService.getSocialAccounts({ page, limit: 25 });
          setSocialAccounts(data.accounts);
          setTotalItems(data.total);
          break;
        }
        case 'health': {
          const data = await AdminService.getHealth();
          setHealth(data);
          break;
        }
        case 'usage': {
          const data = await AdminService.getOverview();
          setOverview(data);
          break;
        }
      }
    } catch (err: any) {
      if (err.statusCode === 403 || err.message?.includes('Forbidden')) {
        setError('Access Denied: Your account is not authorized as an administrator.');
      } else {
        setError(err.message || 'Failed to load administrative data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabData();
  }, [activeTab, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTabData();
  };

  if (error && error.includes('Access Denied')) {
    return (
      <div className="mx-auto max-w-2xl mt-16 p-8 rounded-3xl border border-destructive/20 bg-destructive/10 text-center space-y-4">
        <ShieldAlert className="size-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold font-display text-foreground">Admin Console Restricted</h2>
        <p className="text-sm text-muted-foreground">
          This portal is an internal owner tool. Your verified login does not have administrative privileges.
        </p>
        <Button variant="outline" onClick={() => (window.location.href = '/dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              VireoClip Owner Console
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-clay/15 text-clay border border-clay/30">
              OWNER PRIVILEGES
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Internal telemetry, user metrics, real processing jobs, and billing diagnostics.
            {activeTab !== 'overview' && activeTab !== 'health' && (
              <span className="ml-2 font-mono text-clay font-medium">({totalItems} records loaded)</span>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchTabData}
          disabled={loading}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Metrics</span>
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-border/40 scrollbar-none text-xs">
        {[
          { id: 'overview', label: 'Overview', icon: Layers },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'projects', label: 'Projects', icon: Film },
          { id: 'usage', label: 'Usage', icon: Zap },
          { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
          { id: 'renders', label: 'Render Jobs', icon: Video },
          { id: 'publishing', label: 'Publishing', icon: Send },
          { id: 'social', label: 'Social Accounts', icon: Share2 },
          { id: 'health', label: 'System Health', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as Tab);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                isActive
                  ? 'bg-clay text-white shadow-soft font-semibold'
                  : 'text-muted-foreground hover:bg-cream/60 hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-4 animate-pulse">
          <div className="h-32 bg-cream/70 rounded-2xl" />
          <div className="h-32 bg-cream/70 rounded-2xl" />
          <div className="h-32 bg-cream/70 rounded-2xl" />
          <div className="h-32 bg-cream/70 rounded-2xl" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={fetchTabData}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && overview && (
            <div className="space-y-6">
              {/* Top Stats Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SpotlightCard className="p-5 bg-card border rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                    <Users className="size-4 text-clay" />
                  </div>
                  <div className="text-2xl font-bold font-display text-foreground">{overview.users.total}</div>
                  <div className="text-[11px] text-muted-foreground">
                    +{overview.users.createdToday} today · +{overview.users.createdThisWeek} this week
                  </div>
                </SpotlightCard>

                <SpotlightCard className="p-5 bg-card border rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">Active Subscriptions</span>
                    <CreditCard className="size-4 text-vireo-green" />
                  </div>
                  <div className="text-2xl font-bold font-display text-foreground">
                    {overview.subscriptions.activeSubscriptions}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {overview.subscriptions.proSubscribers} Pro · {overview.subscriptions.studioSubscribers} Studio
                  </div>
                </SpotlightCard>

                <SpotlightCard className="p-5 bg-card border rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Projects</span>
                    <Film className="size-4 text-clay" />
                  </div>
                  <div className="text-2xl font-bold font-display text-foreground">{overview.projects.total}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {overview.projects.processing} processing · {overview.projects.failed} failed
                  </div>
                </SpotlightCard>

                <SpotlightCard className="p-5 bg-card border rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">Minutes Processed</span>
                    <Zap className="size-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-bold font-display text-foreground">
                    {overview.usage.sourceMinutesCurrentMonth.toFixed(1)}m
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {overview.usage.clipRendersCurrentMonth} clip renders current month
                  </div>
                </SpotlightCard>
              </div>

              {/* Subscriptions & Operational Breakdown */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-4">
                  <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                    <CreditCard className="size-4 text-muted-foreground" />
                    <span>Subscription Plan Distribution</span>
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Free Starter</span>
                      <span className="font-semibold text-foreground">{overview.subscriptions.freeUsers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Creator Tier</span>
                      <span className="font-semibold text-foreground">{overview.subscriptions.creatorSubscribers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Pro Tier ⭐</span>
                      <span className="font-semibold text-foreground">{overview.subscriptions.proSubscribers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Studio Tier</span>
                      <span className="font-semibold text-foreground">{overview.subscriptions.studioSubscribers}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2 flex items-center justify-between font-semibold">
                      <span>Total Active Paid</span>
                      <span>{overview.subscriptions.activeSubscriptions}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-4">
                  <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    <span>Real-time Operational Status</span>
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Render Jobs in Progress</span>
                      <span className="font-semibold text-foreground">{overview.renders.processing}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Render Jobs Completed</span>
                      <span className="font-semibold text-foreground">{overview.renders.completed}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Render Jobs Failed</span>
                      <span className="font-semibold text-destructive">{overview.renders.failed}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Social Posts Published</span>
                      <span className="font-semibold text-foreground">{overview.publishing.published}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2 flex items-center justify-between font-semibold">
                      <span>Database Health</span>
                      <span className={overview.system.mongoConnected ? 'text-vireo-green' : 'text-destructive'}>
                        {overview.system.mongoConnected ? 'Connected (Atlas)' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md">
                <div className="relative flex-1">
                  <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by email or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border/80 bg-card text-xs focus:outline-none focus:ring-1 focus:ring-clay"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Search
                </Button>
              </form>

              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">Plan</th>
                      <th className="p-3">Projects</th>
                      <th className="p-3">Clips</th>
                      <th className="p-3">Social</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-cream/30">
                        <td className="p-3">
                          <div className="font-semibold text-foreground">{u.email}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{u.id}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-muted text-foreground">
                            {u.plan_id.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3">{u.project_count}</td>
                        <td className="p-3">{u.clip_count}</td>
                        <td className="p-3">{u.social_connection_count}</td>
                        <td className="p-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Title</th>
                      <th className="p-3">User ID</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {projects.map((p) => (
                      <tr key={p.id} className="hover:bg-cream/30">
                        <td className="p-3 font-semibold text-foreground">{p.title}</td>
                        <td className="p-3 font-mono text-[10px] text-muted-foreground">{p.user_id}</td>
                        <td className="p-3 uppercase text-[10px]">{p.source_type}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                              p.video_status === 'ready'
                                ? 'bg-sage/15 text-sage'
                                : p.video_status === 'failed'
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {p.video_status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: RENDERS */}
          {activeTab === 'renders' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Job ID</th>
                      <th className="p-3">Clip ID</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Progress</th>
                      <th className="p-3">Attempts</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {renderJobs.map((j) => (
                      <tr key={j.id} className="hover:bg-cream/30">
                        <td className="p-3 font-mono text-[10px]">{j.id}</td>
                        <td className="p-3 font-mono text-[10px] text-muted-foreground">{j.clip_id}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                              j.status === 'completed'
                                ? 'bg-sage/15 text-sage'
                                : j.status === 'failed'
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {j.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3">{j.progress}%</td>
                        <td className="p-3">{j.attempts}</td>
                        <td className="p-3 text-muted-foreground">{new Date(j.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SUBSCRIPTIONS */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Subscription</th>
                      <th className="p-3">Provider</th>
                      <th className="p-3">Plan</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Interval</th>
                      <th className="p-3">Period End</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {subscriptions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          No paid subscriptions registered in database yet.
                        </td>
                      </tr>
                    ) : (
                      subscriptions.map((s) => (
                        <tr key={s.id} className="hover:bg-cream/30">
                          <td className="p-3 font-mono text-[10px]">{s.provider_subscription_id}</td>
                          <td className="p-3 uppercase text-[10px] font-semibold">{s.provider}</td>
                          <td className="p-3 uppercase text-[10px]">{s.plan_id}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-sage/15 text-sage">
                              {s.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 capitalize">{s.billing_interval}</td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(s.current_period_end).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: PUBLISHING */}
          {activeTab === 'publishing' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Job ID</th>
                      <th className="p-3">Provider</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Scheduled For</th>
                      <th className="p-3">Attempts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {publishingJobs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          No publishing jobs registered yet.
                        </td>
                      </tr>
                    ) : (
                      publishingJobs.map((p) => (
                        <tr key={p.id} className="hover:bg-cream/30">
                          <td className="p-3 font-mono text-[10px]">{p.id}</td>
                          <td className="p-3 uppercase font-semibold text-[10px]">{p.provider}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-muted text-foreground">
                              {p.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(p.scheduled_for).toLocaleString()}
                          </td>
                          <td className="p-3">{p.attempts}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SOCIAL */}
          {activeTab === 'social' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Account</th>
                      <th className="p-3">Provider</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Connected At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {socialAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          No social connections recorded yet.
                        </td>
                      </tr>
                    ) : (
                      socialAccounts.map((a) => (
                        <tr key={a.id} className="hover:bg-cream/30">
                          <td className="p-3 font-semibold text-foreground">{a.account_name}</td>
                          <td className="p-3 uppercase text-[10px] font-semibold">{a.provider}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-sage/15 text-sage">
                              {a.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(a.connected_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: USAGE */}
          {activeTab === 'usage' && overview && (
            <div className="space-y-4">
              <SpotlightCard className="p-6 bg-card border rounded-2xl space-y-4">
                <h3 className="font-display font-bold text-base text-foreground">Usage Summary</h3>
                <div className="grid gap-4 sm:grid-cols-3 text-xs">
                  <div className="p-4 rounded-xl bg-cream/40 border border-border/50">
                    <span className="text-muted-foreground">Source Minutes (Month)</span>
                    <div className="text-xl font-bold font-display mt-1">
                      {overview.usage.sourceMinutesCurrentMonth.toFixed(1)}m
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-cream/40 border border-border/50">
                    <span className="text-muted-foreground">Clip Renders (Month)</span>
                    <div className="text-xl font-bold font-display mt-1">
                      {overview.usage.clipRendersCurrentMonth}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-cream/40 border border-border/50">
                    <span className="text-muted-foreground">Total Metering Events</span>
                    <div className="text-xl font-bold font-display mt-1">
                      {overview.usage.totalUsageEvents}
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </div>
          )}

          {/* TAB: SYSTEM HEALTH */}
          {activeTab === 'health' && health && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Server className="size-4" />
                      <span>MongoDB Atlas</span>
                    </span>
                    {health.services.mongo.connected ? (
                      <CheckCircle2 className="size-4 text-vireo-green" />
                    ) : (
                      <XCircle className="size-4 text-destructive" />
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {health.services.mongo.connected ? 'Operational' : 'Disconnected'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Latency: {health.services.mongo.latencyMs}ms
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <HardDrive className="size-4" />
                      <span>Cloudflare R2</span>
                    </span>
                    {health.services.r2.configured ? (
                      <CheckCircle2 className="size-4 text-vireo-green" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-500" />
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {health.services.r2.configured ? 'Configured' : 'Missing credentials'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Buckets: {health.services.r2.sourceBucket}, {health.services.r2.clipsBucket}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Cpu className="size-4" />
                      <span>FFmpeg Engine</span>
                    </span>
                    {health.services.ffmpeg.available ? (
                      <CheckCircle2 className="size-4 text-vireo-green" />
                    ) : (
                      <XCircle className="size-4 text-destructive" />
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {health.services.ffmpeg.available ? 'Binary Available' : 'FFmpeg not in PATH'}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {health.services.ffmpeg.version || 'Local execution'}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="size-4" />
                      <span>Paddle Billing</span>
                    </span>
                    {health.services.billing.paddle.configured ? (
                      <CheckCircle2 className="size-4 text-vireo-green" />
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground">UNCONFIGURED</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {health.services.billing.paddle.configured ? 'Active' : 'Missing API Key'}
                  </div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    Mode: {health.services.billing.paddle.environment}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="size-4" />
                      <span>Razorpay Subscriptions</span>
                    </span>
                    {health.services.billing.razorpay.configured ? (
                      <CheckCircle2 className="size-4 text-vireo-green" />
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground">UNCONFIGURED</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {health.services.billing.razorpay.configured ? 'Active' : 'Missing Key ID/Secret'}
                  </div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    Mode: {health.services.billing.razorpay.mode}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Zap className="size-4" />
                      <span>AI Engine</span>
                    </span>
                    {health.services.ai.openRouterConfigured ? (
                      <CheckCircle2 className="size-4 text-vireo-green" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-500" />
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {health.services.ai.openRouterConfigured ? 'OpenRouter Active' : 'Missing OpenRouter Key'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Transcription: {health.services.ai.transcriptionProvider}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
export default AdminPage;

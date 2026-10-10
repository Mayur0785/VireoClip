import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Eye,
  Sparkles,
  RefreshCw,
  Award,
  Lightbulb,
  Brain,
  Layers,
  AlertCircle,
  Filter,
  ArrowUpRight,
  CheckCircle2,
  Info,
  MousePointerClick,
  Target,
  FileText,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
} from 'lucide-react';
import {
  analyticsService,
  PlatformStat,
  GrowthRecommendation,
  ContentMemory,
} from '../services/analyticsService';
import {
  ContentPerformanceDashboardResponse,
  DashboardContentItem,
  DashboardPlatformStat,
  DashboardTimelinePoint,
} from '../types';

export const AnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'growth'>('dashboard');

  // Dashboard Filters State
  const [days, setDays] = useState<number | undefined>(30);
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [metricHighlight, setMetricHighlight] = useState<'views' | 'impressions' | 'clicks' | 'conversions'>('views');
  const [page, setPage] = useState<number>(1);

  // Dashboard Data State
  const [dashboard, setDashboard] = useState<ContentPerformanceDashboardResponse | null>(null);

  // Growth Coach Data State
  const [platforms, setPlatforms] = useState<PlatformStat[]>([]);
  const [recommendations, setRecommendations] = useState<GrowthRecommendation[]>([]);
  const [memories, setMemories] = useState<ContentMemory[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
      setLoading(true);

      const [dashData, pl, rec, mem] = await Promise.all([
        analyticsService.getDashboard({
          days,
          platform: platformFilter || undefined,
          status: statusFilter,
          page,
          limit: 10,
        }),
        analyticsService.getPlatforms(),
        analyticsService.getGrowthCoach(),
        analyticsService.getMemories(),
      ]);

      setDashboard(dashData);
      setPlatforms(pl);
      setRecommendations(rec);
      setMemories(mem);
    } catch (err: any) {
      setError(err?.message || 'Failed to load content performance dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days, platformFilter, statusFilter, page]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await analyticsService.syncAnalytics();
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const summary = dashboard?.summary;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Content Performance Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
              <CheckCircle2 className="h-3 w-3" />
              Evidence-Backed
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Unified, honest performance intelligence across published content, platform exports, and A/B Studio experiments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Top Tabs Toggle */}
          <div className="inline-flex rounded-xl border border-border bg-white p-1 shadow-2xs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-forest text-white'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Performance Dashboard
            </button>
            <button
              onClick={() => setActiveTab('growth')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'growth'
                  ? 'bg-forest text-white'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Growth Coach & Memory
            </button>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-cream transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
          <button
            onClick={loadData}
            className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                <Filter className="h-3.5 w-3.5" />
                Filters:
              </div>

              {/* Date Range Selector */}
              <div className="inline-flex rounded-lg border border-border bg-sand/30 p-0.5">
                {[
                  { label: '7d', value: 7 },
                  { label: '14d', value: 14 },
                  { label: '30d', value: 30 },
                  { label: '90d', value: 90 },
                  { label: 'All Time', value: undefined },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setDays(item.value);
                      setPage(1);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      days === item.value
                        ? 'bg-forest text-white shadow-2xs'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Platform Filter */}
              <select
                value={platformFilter}
                onChange={(e) => {
                  setPlatformFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground outline-hidden focus:border-forest"
              >
                <option value="">All Platforms</option>
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
                <option value="x">X / Twitter</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground outline-hidden focus:border-forest"
              >
                <option value="all">All Content Statuses</option>
                <option value="ready">Ready</option>
                <option value="published">Published</option>
                <option value="in_experiment">In Experiment</option>
              </select>
            </div>

            {/* Metric Highlight Selector for Timeline */}
            <div className="flex items-center gap-2">
              <span className="text-2xs font-semibold uppercase text-muted">Chart Metric:</span>
              <div className="inline-flex rounded-lg border border-border bg-sand/30 p-0.5">
                {[
                  { id: 'views', label: 'Views' },
                  { id: 'impressions', label: 'Impressions' },
                  { id: 'clicks', label: 'Clicks' },
                  { id: 'conversions', label: 'Conversions' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMetricHighlight(m.id as any)}
                    className={`rounded-md px-2 py-0.5 text-2xs font-semibold transition-colors ${
                      metricHighlight === m.id
                        ? 'bg-white text-forest shadow-2xs border border-border/80'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 animate-pulse rounded-2xl bg-white border border-border/50" />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-2xl bg-white border border-border/50" />
            </div>
          ) : (
            <>
              {/* Provenance & Data Sufficiency Banner */}
              {dashboard?.data_provenance_sources && dashboard.data_provenance_sources.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/20 bg-forest/5 px-4 py-2.5 text-xs text-foreground">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-forest" />
                    <span className="font-semibold">Underlying Provenance Sources:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {dashboard.data_provenance_sources.map((src) => (
                        <span
                          key={src}
                          className="rounded-md border border-forest/30 bg-white px-2 py-0.5 text-2xs font-mono font-medium text-forest"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>
                  {dashboard.summary.provenance_breakdown && (
                    <span className="text-2xs text-muted">
                      {dashboard.summary.provenance_breakdown.platform_sync_count} sync records •{' '}
                      {dashboard.summary.provenance_breakdown.csv_import_count} CSV import batches •{' '}
                      {dashboard.summary.provenance_breakdown.ab_studio_count} A/B experiments
                    </span>
                  )}
                </div>
              )}

              {/* Insufficient Data Warning / Explanation */}
              {!summary?.has_sufficient_data && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <Info className="h-4 w-4 text-amber-600" />
                    <span>Data Sufficiency Advisory:</span>
                  </div>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-amber-800">
                    {summary?.insufficient_data_reasons?.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-2xs text-amber-700">
                    Metrics are computed strictly from real recorded data without synthetic interpolation or assumed zero baselines.
                  </p>
                </div>
              )}

              {/* 4 Core KPI Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Total Content & In Experiment */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-semibold uppercase tracking-wider">Content Library</span>
                    <FileText className="h-4 w-4 text-forest" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {summary?.total_clips || 0}
                    </span>
                    <span className="text-xs text-muted">clips</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted border-t border-border/50 pt-2">
                    <span>Published: {summary?.published_posts_count || 0}</span>
                    <span className="font-medium text-forest">In Exp: {summary?.in_experiment_clips_count || 0}</span>
                  </div>
                </div>

                {/* 2. Recorded Video Views & Watch Time */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-semibold uppercase tracking-wider">Recorded Views</span>
                    <Eye className="h-4 w-4 text-sage" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {summary?.recorded_views ? summary.recorded_views.toLocaleString() : '0'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted border-t border-border/50 pt-2">
                    <span>Watch Time: {Math.round((summary?.recorded_watch_time_seconds || 0) / 60)} min</span>
                    <span>
                      Avg Eng:{' '}
                      {summary?.average_engagement_rate !== null && summary?.average_engagement_rate !== undefined
                        ? `${(summary.average_engagement_rate * 100).toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* 3. Impressions, Clicks & Honest CTR */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-semibold uppercase tracking-wider">Feed Impressions</span>
                    <MousePointerClick className="h-4 w-4 text-terracotta" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {summary?.recorded_impressions ? summary.recorded_impressions.toLocaleString() : '0'}
                    </span>
                    <span className="text-xs text-muted">impressions</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted border-t border-border/50 pt-2">
                    <span>Clicks: {summary?.recorded_clicks ? summary.recorded_clicks.toLocaleString() : '0'}</span>
                    <span className="font-semibold text-terracotta">
                      CTR:{' '}
                      {summary?.click_through_rate !== null && summary?.click_through_rate !== undefined
                        ? `${(summary.click_through_rate * 100).toFixed(2)}%`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* 4. A/B Exposures, Conversions & Rate */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-semibold uppercase tracking-wider">A/B Conversions</span>
                    <Target className="h-4 w-4 text-olive" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {summary?.recorded_conversions ? summary.recorded_conversions.toLocaleString() : '0'}
                    </span>
                    <span className="text-xs text-muted">actions</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted border-t border-border/50 pt-2">
                    <span>Exposures: {summary?.recorded_exposures ? summary.recorded_exposures.toLocaleString() : '0'}</span>
                    <span className="font-semibold text-olive">
                      Conv Rate:{' '}
                      {summary?.conversion_rate !== null && summary?.conversion_rate !== undefined
                        ? `${(summary.conversion_rate * 100).toFixed(2)}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Trends Timeline Visualizer */}
              <div className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-forest" />
                    <h2 className="text-base font-bold text-foreground">Performance Trends</h2>
                  </div>
                  <span className="text-xs text-muted">
                    Metric: <span className="capitalize font-semibold text-foreground">{metricHighlight}</span>
                  </span>
                </div>

                {dashboard?.timeline && dashboard.timeline.length > 0 ? (
                  <div className="space-y-3">
                    <div className="h-44 flex items-end gap-2 border-b border-border/60 pb-2 overflow-x-auto">
                      {dashboard.timeline.map((point: DashboardTimelinePoint) => {
                        const val = point[metricHighlight] || 0;
                        const maxVal = Math.max(
                          1,
                          ...dashboard.timeline.map((p: any) => p[metricHighlight] || 0)
                        );
                        const heightPct = Math.max(8, Math.round((val / maxVal) * 100));

                        return (
                          <div
                            key={point.date}
                            className="group flex flex-1 flex-col items-center justify-end h-full min-w-8 gap-1.5"
                          >
                            <div className="text-2xs font-semibold text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                              {val.toLocaleString()}
                            </div>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-md transition-all ${
                                metricHighlight === 'views'
                                  ? 'bg-sage/80 hover:bg-sage'
                                  : metricHighlight === 'impressions'
                                  ? 'bg-forest/80 hover:bg-forest'
                                  : metricHighlight === 'clicks'
                                  ? 'bg-terracotta/80 hover:bg-terracotta'
                                  : 'bg-olive/80 hover:bg-olive'
                              }`}
                            />
                            <span className="text-3xs text-muted truncate max-w-10">
                              {point.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-2xs text-muted">
                      <span>Timeline points: {dashboard.timeline.length} date entries</span>
                      <span>Measured observations chronologically grouped</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-sm text-muted">
                    No timestamped observations recorded for the selected filter range.
                  </div>
                )}
              </div>

              {/* Platform Performance Breakdown (Only Platforms with Stored Data) */}
              <div className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-forest" />
                    <h2 className="text-base font-bold text-foreground">Platform Distribution</h2>
                  </div>
                  <span className="text-2xs text-muted">Platforms with recorded data</span>
                </div>

                {dashboard?.platforms && dashboard.platforms.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-2xs uppercase tracking-wider text-muted">
                        <tr>
                          <th className="pb-2.5 font-semibold">Platform</th>
                          <th className="pb-2.5 font-semibold">Tracked Posts</th>
                          <th className="pb-2.5 font-semibold">Views</th>
                          <th className="pb-2.5 font-semibold">Impressions</th>
                          <th className="pb-2.5 font-semibold">Clicks</th>
                          <th className="pb-2.5 font-semibold">CTR</th>
                          <th className="pb-2.5 font-semibold">A/B Conversions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {dashboard.platforms.map((p: DashboardPlatformStat) => (
                          <tr key={p.platform} className="hover:bg-sand/20 transition-colors">
                            <td className="py-3 font-semibold text-foreground capitalize">
                              {p.platform}
                            </td>
                            <td className="py-3 text-muted">{p.posts_count}</td>
                            <td className="py-3 text-foreground">{p.views.toLocaleString()}</td>
                            <td className="py-3 text-foreground">{p.impressions.toLocaleString()}</td>
                            <td className="py-3 text-foreground">{p.clicks.toLocaleString()}</td>
                            <td className="py-3 font-medium text-foreground">
                              {p.ctr !== null ? `${(p.ctr * 100).toFixed(2)}%` : '—'}
                            </td>
                            <td className="py-3 text-foreground">
                              {p.conversions > 0 ? `${p.conversions.toLocaleString()} (${p.exposures.toLocaleString()} exp)` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted">
                    No platform distribution recorded yet. Connect and sync social channels or import analytics to view platform breakdowns.
                  </div>
                )}
              </div>

              {/* Content-Level Performance Comparison Table */}
              <div className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
                <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Content-Level Performance</h2>
                    <p className="text-xs text-muted">
                      Direct performance breakdown of workspace clips with linked A/B tests and observation provenance.
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    Showing {dashboard?.content_items?.length || 0} of {dashboard?.total_content_items || 0} items
                  </span>
                </div>

                {dashboard?.content_items && dashboard.content_items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-2xs uppercase tracking-wider text-muted">
                        <tr>
                          <th className="pb-2.5 font-semibold">Clip / Content</th>
                          <th className="pb-2.5 font-semibold">Status</th>
                          <th className="pb-2.5 font-semibold">Views</th>
                          <th className="pb-2.5 font-semibold">Impressions</th>
                          <th className="pb-2.5 font-semibold">Clicks / CTR</th>
                          <th className="pb-2.5 font-semibold">Exposures / Conv</th>
                          <th className="pb-2.5 font-semibold">A/B Experiment</th>
                          <th className="pb-2.5 font-semibold">Provenance</th>
                          <th className="pb-2.5 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {dashboard.content_items.map((item: DashboardContentItem) => (
                          <tr key={item.clip_id} className="hover:bg-sand/20 transition-colors">
                            <td className="py-3.5 pr-4">
                              <div className="font-semibold text-foreground line-clamp-1">
                                {item.title}
                              </div>
                              <div className="text-2xs text-muted">
                                {new Date(item.created_at).toLocaleDateString()}
                                {item.duration_seconds ? ` • ${item.duration_seconds}s` : ''}
                              </div>
                            </td>
                            <td className="py-3.5 pr-4">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold capitalize ${
                                  item.status === 'published'
                                    ? 'bg-forest/10 text-forest'
                                    : item.status === 'in_experiment'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-sand/60 text-muted'
                                }`}
                              >
                                {item.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3.5 pr-4 text-foreground">
                              {item.views > 0 ? item.views.toLocaleString() : '—'}
                            </td>
                            <td className="py-3.5 pr-4 text-foreground">
                              {item.impressions > 0 ? item.impressions.toLocaleString() : '—'}
                            </td>
                            <td className="py-3.5 pr-4">
                              {item.impressions > 0 ? (
                                <div>
                                  <span className="font-semibold text-foreground">
                                    {item.clicks.toLocaleString()}
                                  </span>
                                  <span className="text-2xs text-muted ml-1">
                                    ({item.ctr !== null ? `${(item.ctr * 100).toFixed(1)}%` : '—'})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="py-3.5 pr-4">
                              {item.exposures > 0 ? (
                                <div>
                                  <span className="font-semibold text-foreground">
                                    {item.conversions.toLocaleString()}
                                  </span>
                                  <span className="text-2xs text-muted ml-1">
                                    / {item.exposures.toLocaleString()}{' '}
                                    ({item.conversion_rate !== null ? `${(item.conversion_rate * 100).toFixed(1)}%` : '—'})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="py-3.5 pr-4">
                              {item.experiment ? (
                                <div>
                                  <Link
                                    to={`/clips/${item.clip_id}/edit?tab=ab_studio`}
                                    className="font-medium text-forest hover:underline text-xs flex items-center gap-1"
                                  >
                                    <span className="line-clamp-1">{item.experiment.name}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </Link>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span
                                      className={`rounded-md px-1.5 py-0.2 text-3xs font-semibold ${
                                        item.experiment.status === 'CONCLUDED'
                                          ? 'bg-forest/15 text-forest'
                                          : item.experiment.status === 'ACTIVE'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-sand/80 text-muted'
                                      }`}
                                    >
                                      {item.experiment.status}
                                    </span>
                                    {item.experiment.is_significant && (
                                      <span className="rounded-md bg-sage/20 px-1.5 py-0.2 text-3xs font-semibold text-forest">
                                        Significant
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-2xs text-muted">None</span>
                              )}
                            </td>
                            <td className="py-3.5 pr-4">
                              <div className="flex flex-wrap gap-1">
                                {item.provenance_sources.length > 0 ? (
                                  item.provenance_sources.map((src) => (
                                    <span
                                      key={src}
                                      className="rounded-md bg-sand/60 px-1.5 py-0.5 text-3xs font-mono text-muted"
                                    >
                                      {src}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-2xs text-muted">—</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5">
                              <Link
                                to={`/clips/${item.clip_id}/edit`}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-cream transition-colors"
                              >
                                Edit Clip
                                <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    {dashboard && dashboard.total_content_items > dashboard.limit && (
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
                        <div>
                          Page {dashboard.page} of {Math.ceil(dashboard.total_content_items / dashboard.limit)}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={dashboard.page <= 1}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-cream transition-colors disabled:opacity-40"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Previous
                          </button>
                          <button
                            onClick={() => setPage((p) => p + 1)}
                            disabled={dashboard.page * dashboard.limit >= dashboard.total_content_items}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-cream transition-colors disabled:opacity-40"
                          >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <FileText className="mx-auto h-8 w-8 text-muted/60" />
                    <h3 className="mt-2 text-sm font-semibold text-foreground">No content items found</h3>
                    <p className="mt-1 text-xs text-muted">
                      No clips match the current filters. Try selecting "All Content Statuses" or clear filters.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* GROWTH COACH & MEMORIES TAB (Existing Phase 15 Experience) */}
      {activeTab === 'growth' && (
        <div className="space-y-8">
          {/* Growth Coach Recommendations Section */}
          <div className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-forest" />
                <h2 className="text-lg font-bold text-foreground">Vireo Growth Coach</h2>
              </div>
              <span className="rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                Evidence-Grounded Insights
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-cream/40 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {rec.category === 'working' ? (
                        <Award className="h-4 w-4 text-sage" />
                      ) : (
                        <Lightbulb className="h-4 w-4 text-terracotta" />
                      )}
                      <h3 className="text-sm font-bold text-foreground">{rec.title}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-foreground/90">{rec.recommendation}</p>
                    <div className="mt-3 rounded-lg border border-border/60 bg-white/70 p-2 text-2xs text-muted">
                      <span className="font-semibold text-foreground">Evidence: </span>
                      {rec.evidence}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-2xs text-muted">
                    <span className="capitalize">Confidence: {rec.confidence}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform Performance & Content Memory Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Platform Comparison */}
            <div className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
              <div className="mb-4 flex items-center gap-2">
                <Layers className="h-5 w-5 text-forest" />
                <h2 className="text-base font-bold text-foreground">Platform Performance</h2>
              </div>

              {platforms.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  No published platform performance recorded yet. Connect and publish to see distribution.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {platforms.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="capitalize font-semibold text-sm text-foreground">{p.platform}</span>
                        <span className="text-xs text-muted">({p.posts} post{p.posts !== 1 ? 's' : ''})</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted">{p.views.toLocaleString()} views</span>
                        <span className="font-semibold text-foreground">{p.engagement.toLocaleString()} eng</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Content Memory */}
            <div className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-terracotta" />
                  <h2 className="text-base font-bold text-foreground">Creator Content Memory</h2>
                </div>
                <span className="text-2xs text-muted">Feeds future AI Generation</span>
              </div>

              {memories.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  No persistent patterns locked yet. As more clips are tracked, Vireo locks successful hooks and durations here.
                </div>
              ) : (
                <div className="space-y-3">
                  {memories.map((m) => (
                    <div key={m.id} className="rounded-xl border border-border/70 bg-cream/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-forest">
                          {m.category}: {m.pattern}
                        </span>
                        <span className="rounded-md bg-white px-2 py-0.5 text-2xs font-semibold text-muted">
                          {m.confidence} confidence
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{m.evidence}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

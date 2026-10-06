import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Eye,
  Heart,
  Share2,
  Sparkles,
  RefreshCw,
  Award,
  Lightbulb,
  Brain,
  Layers,
  AlertCircle,
} from 'lucide-react';
import {
  analyticsService,
  AnalyticsOverview,
  PlatformStat,
  GrowthRecommendation,
  ContentMemory,
} from '../services/analyticsService';

export const AnalyticsPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [platforms, setPlatforms] = useState<PlatformStat[]>([]);
  const [recommendations, setRecommendations] = useState<GrowthRecommendation[]>([]);
  const [memories, setMemories] = useState<ContentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
      setLoading(true);
      const [ov, pl, rec, mem] = await Promise.all([
        analyticsService.getOverview(days),
        analyticsService.getPlatforms(),
        analyticsService.getGrowthCoach(),
        analyticsService.getMemories(),
      ]);
      setOverview(ov);
      setPlatforms(pl);
      setRecommendations(rec);
      setMemories(mem);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days]);

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Vireo Analytics & Growth Coach
          </h1>
          <p className="mt-1 text-sm text-muted">
            Measure published performance, uncover patterns, and learn what drives engagement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-border bg-white p-1 shadow-2xs">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  days === d
                    ? 'bg-forest text-white'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-cream transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync Now
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white border border-border/50" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-white border border-border/50" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Key KPI Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Views</span>
                <Eye className="h-4 w-4 text-forest" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {overview?.total_views.toLocaleString() || '0'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">Across all connected channels</p>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Engagement</span>
                <Heart className="h-4 w-4 text-terracotta" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {overview?.total_engagement.toLocaleString() || '0'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">Likes, comments, shares, saves</p>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-semibold uppercase tracking-wider">Avg Engagement Rate</span>
                <TrendingUp className="h-4 w-4 text-sage" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {overview?.average_engagement_rate
                    ? `${(overview.average_engagement_rate * 100).toFixed(1)}%`
                    : '0.0%'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">Interactions / Views</p>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-semibold uppercase tracking-wider">Published Posts</span>
                <Share2 className="h-4 w-4 text-olive" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {overview?.total_published_posts || '0'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">Clips tracked in period</p>
            </div>
          </div>

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
                        <span className="text-xs font-bold uppercase tracking-wider text-forest">{m.category}: {m.pattern}</span>
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

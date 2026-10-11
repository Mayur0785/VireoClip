import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  Video,
  Link2,
  FolderOpen,
  CheckCircle2,
  Clock3,
  FileText,
  UploadCloud,
  Sparkles,
  Zap,
  TrendingUp,
  Brain,
  Scissors,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { useBillingUsage } from '../hooks/useBillingUsage';
import { useCinematicScrollReveal } from '../hooks/useCinematicScrollReveal';
import { Project } from '../types';

const activeStatuses = [
  'uploading',
  'uploaded',
  'queued',
  'processing',
  'transcribing',
  'analyzing',
  'generating',
];
const completeStatuses = ['completed', 'complete', 'transcribed'];

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  useCinematicScrollReveal(pageRef, { threshold: 0.08 });

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const { usage, isLoading: usageLoading, error: usageError } = useBillingUsage();

  const load = async () => {
    if (!user) return;
    try {
      setError('');
      setProjects(await projectService.fetchProjects(user.id));
    } catch (err: any) {
      setError(err?.message || 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const update = () => setProjects(projectService.getProjects());
    window.addEventListener('vireo_project_updated', update);
    return () => window.removeEventListener('vireo_project_updated', update);
  }, [user?.id]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (videoUrl.trim()) {
      navigate(`/projects/new?url=${encodeURIComponent(videoUrl.trim())}`);
    } else {
      navigate('/projects/new');
    }
  };

  const getStatus = (p: Project) => p.video_status || p.status;
  const complete = projects.filter((p) => completeStatuses.includes(getStatus(p)));
  const queue = projects.filter((p) => activeStatuses.includes(getStatus(p)));

  const stats = [
    { label: 'Total Projects', value: projects.length, icon: FolderOpen, tone: 'cyan' },
    { label: 'Completed', value: complete.length, icon: CheckCircle2, tone: 'emerald' },
    { label: 'In Progress', value: queue.length, icon: Clock3, tone: 'amber' },
    {
      label: 'Transcripts Ready',
      value: projects.filter((p) => completeStatuses.includes(getStatus(p))).length,
      icon: FileText,
      tone: 'emerald',
    },
  ];

  return (
    <div ref={pageRef} className="space-y-7">
      {/* Video Ingestion & Task-focused Hero Card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0A111B]/95 via-[#060B12] to-[#0A111B]/90 p-6 sm:p-8 backdrop-blur-xl shadow-[0_16px_50px_rgba(0,0,0,0.5)] cinematic-panel-enter">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-[#20E3A2]/10 blur-[90px] rounded-full animate-glow-trail" />
        
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#20E3A2]/10 border border-[#20E3A2]/25 text-[#20E3A2] text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="size-3.5" />
            <span>AI Video Clipping Workspace</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F4F7FB] leading-tight">
            One video in.{' '}
            <span className="shimmer-gradient-text drop-shadow-[0_0_25px_rgba(32,227,162,0.4)]">
              Your best content out.
            </span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-[#A6B4C6] leading-relaxed max-w-2xl">
            Find the strongest moments, clip them, add captions, reframe, and create ready-to-share content for every platform — in minutes.
          </p>

          {/* Quick URL ingestion & Upload bar */}
          <form onSubmit={handleUrlSubmit} className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#78889B]" />
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste a YouTube, Vimeo, or video link..."
                className="w-full h-12 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-[#F4F7FB] placeholder:text-[#78889B] focus:outline-none focus:border-[#20E3A2]/50 focus:ring-1 focus:ring-[#20E3A2]/50 transition-all"
              />
            </div>
            <button
              type="submit"
              className="h-12 px-6 rounded-xl bg-gradient-to-r from-[#20E3A2] to-[#00DCC8] text-[#060B12] text-sm font-bold shadow-[0_0_20px_rgba(32,227,162,0.25)] hover:shadow-[0_0_28px_rgba(32,227,162,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <span>Get free clips</span>
              <ArrowRight className="size-4" />
            </button>
            <div className="hidden sm:flex items-center text-xs font-semibold text-[#78889B] px-1 uppercase tracking-wider">
              OR
            </div>
            <Link
              to="/projects/new"
              className="h-12 px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-semibold text-[#F4F7FB] transition-all flex items-center justify-center gap-2 shrink-0 hover:border-[#20E3A2]/30"
            >
              <UploadCloud className="size-4 text-[#20E3A2]" />
              <span>Upload video</span>
            </Link>
          </form>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"
        >
          {error}{' '}
          <button onClick={load} className="ml-2 font-semibold underline hover:text-white">
            Retry
          </button>
        </div>
      )}

      {/* Quota Usage Card */}
      <div className="rounded-2xl border border-white/10 bg-[#0A111B]/80 p-5 backdrop-blur-xl shadow-soft cinematic-reveal-init stagger-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#20E3A2] font-mono">
              <Zap className="size-3.5" />
              <span>
                Monthly Processing {usage?.is_unlimited ? '(UNLIMITED TEST PLAN)' : usage?.plan_tier ? `(${usage.plan_tier.toUpperCase()} TIER)` : ''}
              </span>
            </div>

            {usageLoading ? (
              <div className="h-8 w-48 animate-pulse rounded bg-white/5 mt-1" />
            ) : usage ? (
              usage.is_unlimited ? (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-display text-2xl font-bold text-[#F4F7FB] sm:text-3xl">
                    Unlimited
                  </span>
                  <span className="text-sm font-medium text-[#78889B]">
                    ({usage.total_used_minutes.toFixed(1)} min recorded this cycle)
                  </span>
                  <span className="ml-2 rounded-full bg-[#20E3A2]/15 px-2.5 py-0.5 text-xs font-semibold text-[#20E3A2] border border-[#20E3A2]/30 font-mono">
                    ACTIVE
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-display text-2xl font-bold text-[#F4F7FB] sm:text-3xl">
                    {usage.total_used_minutes.toFixed(1)} / {usage.limit_minutes} min used
                  </span>
                  <span className="text-sm font-medium text-[#78889B]">
                    ({usage.remaining_minutes.toFixed(1)} min remaining)
                  </span>
                  <span className="ml-2 rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-xs font-semibold text-[#20E3A2] font-mono">
                    {Math.min(100, Math.round((usage.total_used_minutes / (usage.limit_minutes || 1)) * 100))}%
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 text-sm text-[#78889B]">
                <span className="font-semibold text-[#A6B4C6]">Usage unavailable</span>
                {usageError && <span className="text-xs text-[#78889B]">({usageError})</span>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {usage?.reset_date && (
              <span className="text-xs text-[#78889B] font-mono">
                Cycle resets {new Date(usage.reset_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </span>
            )}
          </div>
        </div>

        {usage && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full transition-all duration-700 ease-out rounded-full ${
                  usage.is_unlimited
                    ? 'bg-gradient-to-r from-[#20E3A2] to-[#00DCC8]'
                    : usage.is_quota_exceeded
                    ? 'bg-rose-500'
                    : (usage.total_used_minutes / (usage.limit_minutes || 1)) > 0.8
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-[#20E3A2] to-[#00DCC8]'
                }`}
                style={{
                  width: usage.is_unlimited
                    ? '100%'
                    : `${Math.min(
                        100,
                        Math.max(2, Math.round((usage.total_used_minutes / (usage.limit_minutes || 1)) * 100))
                      )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards with Staggered Entrance */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="h-28 animate-pulse rounded-2xl bg-white/5 border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 cinematic-reveal-init stagger-2">
          {stats.map((s, idx) => (
            <div
              key={s.label}
              className={`flex items-center gap-4 rounded-2xl border border-white/5 bg-[#0A111B]/80 p-5 backdrop-blur-xl shadow-soft cinematic-hover-card transition-all ${
                idx === 1 ? 'stagger-1' : idx === 2 ? 'stagger-2' : idx === 3 ? 'stagger-3' : ''
              }`}
            >
              <span
                className={`grid size-12 place-items-center rounded-xl border ${
                  s.tone === 'amber'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    : s.tone === 'cyan'
                    ? 'bg-[#00DCC8]/10 text-[#00DCC8] border-[#00DCC8]/20'
                    : 'bg-[#20E3A2]/10 text-[#20E3A2] border-[#20E3A2]/20'
                }`}
              >
                <s.icon className="size-6" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-[#78889B]">{s.label}</p>
                <p className="mt-1 text-2xl font-bold text-[#F4F7FB]">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions & Processing Queue */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr] cinematic-reveal-init stagger-3">
        <section className="rounded-2xl border border-white/10 bg-[#0A111B]/80 p-5 backdrop-blur-xl shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#F4F7FB]">AI Creator Tools</h2>
              <p className="text-xs text-[#78889B]">Pick up where your content starts.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Link
              to="/projects/new"
              className="group rounded-xl border border-white/5 bg-white/[0.02] p-5 hover:border-[#20E3A2]/40 hover:bg-[#20E3A2]/5 transition-all cinematic-hover-card"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30 group-hover:scale-105 transition-transform">
                <Scissors className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-[#F4F7FB]">AI Clipping</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#78889B]">Auto-detect virality & trim hooks</p>
            </Link>

            <Link
              to="/brand"
              className="group rounded-xl border border-white/5 bg-white/[0.02] p-5 hover:border-[#00DCC8]/40 hover:bg-[#00DCC8]/5 transition-all cinematic-hover-card"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#00DCC8]/15 text-[#00DCC8] border border-[#00DCC8]/30 group-hover:scale-105 transition-transform">
                <Brain className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-[#F4F7FB]">Brand Brain</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#78889B]">Voice guidelines & templates</p>
            </Link>

            <Link
              to="/analytics"
              className="group rounded-xl border border-white/5 bg-white/[0.02] p-5 hover:border-[#20E3A2]/40 hover:bg-[#20E3A2]/5 transition-all cinematic-hover-card"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30 group-hover:scale-105 transition-transform">
                <TrendingUp className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-[#F4F7FB]">Growth Coach</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#78889B]">Retention scores & metrics</p>
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0A111B]/80 p-5 backdrop-blur-xl shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#F4F7FB]">Processing Queue</h2>
            <Link to="/history" className="text-xs font-semibold text-[#20E3A2] hover:text-[#00DCC8] transition-colors">
              View all <ArrowRight className="inline size-3.5 ml-0.5" />
            </Link>
          </div>
          {queue.length ? (
            <div className="mt-4 space-y-2">
              {queue.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 hover:bg-white/5 hover:border-white/10 transition-all cinematic-hover-card"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-[#F4F7FB]">{p.title}</span>
                  <StatusBadge status={getStatus(p)} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-white/10 p-8 text-center bg-white/[0.01]">
              <Sparkles className="mx-auto size-6 text-[#20E3A2]" />
              <p className="mt-2 text-sm font-semibold text-[#F4F7FB]">All caught up</p>
              <p className="mt-1 text-xs text-[#78889B]">No videos are processing right now.</p>
            </div>
          )}
        </section>
      </div>

      {/* Recent Projects */}
      <section className="rounded-2xl border border-white/10 bg-[#0A111B]/80 p-5 backdrop-blur-xl shadow-soft cinematic-reveal-init stagger-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F4F7FB]">Recent Projects</h2>
          <Link to="/history" className="text-xs font-semibold text-[#20E3A2] hover:text-[#00DCC8] transition-colors">
            View all <ArrowRight className="inline size-3.5 ml-0.5" />
          </Link>
        </div>
        {projects.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {projects.slice(0, 4).map((p) => (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="group rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-[#20E3A2]/40 hover:bg-[#20E3A2]/5 cinematic-hover-card"
              >
                <div className="relative aspect-video rounded-lg overflow-hidden bg-[#060B12] border border-white/5 flex items-center justify-center text-[#20E3A2] group-hover:scale-[1.02] transition-transform">
                  {p.source_type === 'url' ? <Link2 className="size-8" /> : <Video className="size-8" />}
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={getStatus(p)} />
                  </div>
                </div>
                <h3 className="mt-3 truncate text-sm font-semibold text-[#F4F7FB]">{p.title}</h3>
                <p className="mt-1 text-xs text-[#78889B]">
                  {new Date(p.created_at).toLocaleDateString()} · {p.source_type === 'url' ? 'URL' : 'Upload'}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-white/10 py-14 text-center bg-white/[0.01]">
            <div className="mx-auto size-12 rounded-2xl bg-[#20E3A2]/10 border border-[#20E3A2]/25 grid place-items-center text-[#20E3A2] mb-3">
              <Video className="size-6" />
            </div>
            <h3 className="font-semibold text-[#F4F7FB] text-base">Your first project starts here</h3>
            <p className="mt-1 text-xs text-[#78889B] max-w-sm mx-auto">
              Paste a link or upload a video file to generate viral clips, captions, and reframed shorts in minutes.
            </p>
            <Link
              to="/projects/new"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#20E3A2] to-[#00DCC8] px-5 py-2.5 text-xs font-bold text-[#060B12] shadow-[0_0_15px_rgba(32,227,162,0.25)] hover:shadow-[0_0_22px_rgba(32,227,162,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="size-4" />
              <span>Clip Your First Video</span>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  History,
  Sparkles,
  Zap,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { useBillingUsage } from '../hooks/useBillingUsage';
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
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { usage, isLoading: usageLoading, error: usageError } = useBillingUsage();

  const load = async () => {
    if (!user) return;
    try {
      setError('');
      setProjects(await projectService.fetchProjects(user.id));
    } catch {
      setError('Unable to load projects.');
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

  const getStatus = (p: Project) => p.video_status || p.status;
  const complete = projects.filter((p) => completeStatuses.includes(getStatus(p)));
  const queue = projects.filter((p) => activeStatuses.includes(getStatus(p)));
  const name =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Creator';

  const stats = [
    { label: 'Total Projects', value: projects.length, icon: FolderOpen, tone: 'green' },
    { label: 'Completed', value: complete.length, icon: CheckCircle2, tone: 'green' },
    { label: 'In Progress', value: queue.length, icon: Clock3, tone: 'orange' },
    {
      label: 'Transcripts Ready',
      value: projects.filter((p) => completeStatuses.includes(getStatus(p))).length,
      icon: FileText,
      tone: 'purple',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-vireo-green">Creator workspace</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
            Welcome back, {name.split(' ')[0]}.
          </h1>
          <p className="mt-2 text-muted-foreground">Turn one video into content for every channel.</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-xl bg-clay px-5 py-3 text-sm font-semibold text-white shadow-clay hover:bg-[#c93f1e]"
        >
          <Plus className="size-4" /> Clip a Video
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}{' '}
          <button onClick={load} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Quota Usage Card */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-vireo-green font-mono">
              <Zap className="size-3.5" />
              <span>
                Monthly Processing {usage?.plan_tier ? `(${usage.plan_tier.toUpperCase()} TIER)` : ''}
              </span>
            </div>

            {usageLoading ? (
              <div className="h-8 w-48 animate-pulse rounded bg-cream/70 mt-1" />
            ) : usage ? (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                  {usage.total_used_minutes.toFixed(1)} / {usage.limit_minutes} min used
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  ({usage.remaining_minutes.toFixed(1)} min remaining)
                </span>
                <span className="ml-2 rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-clay font-mono">
                  {Math.min(100, Math.round((usage.total_used_minutes / (usage.limit_minutes || 1)) * 100))}%
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-semibold text-muted-foreground">Usage unavailable</span>
                {usageError && <span className="text-xs text-muted-foreground/80">({usageError})</span>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {usage?.reset_date && (
              <span className="text-xs text-muted-foreground font-mono">
                Resets {new Date(usage.reset_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </span>
            )}
          </div>
        </div>

        {usage && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-cream">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  usage.is_quota_exceeded
                    ? 'bg-destructive'
                    : (usage.total_used_minutes / usage.limit_minutes) > 0.8
                    ? 'bg-amber-500'
                    : 'bg-vireo-green'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(2, Math.round((usage.total_used_minutes / (usage.limit_minutes || 1)) * 100))
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="h-28 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 rounded-2xl border border-border bg-white p-5 shadow-soft"
            >
              <span
                className={`grid size-12 place-items-center rounded-xl ${
                  s.tone === 'orange'
                    ? 'bg-[#fff0e9] text-clay'
                    : s.tone === 'purple'
                    ? 'bg-[#f1eafd] text-[#7848b2]'
                    : 'bg-[#e8f3e9] text-vireo-green'
                }`}
              >
                <s.icon className="size-6" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions & Processing Queue */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Quick Actions</h2>
              <p className="text-sm text-muted-foreground">Pick up where your content starts.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Link
              to="/projects/new"
              className="rounded-xl border border-[#f6e2d8] bg-[#fff8f5] p-5 hover:border-clay"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#ffebe1] text-clay">
                <UploadCloud className="size-5" />
              </span>
              <h3 className="mt-5 text-sm font-semibold">Upload a video</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Start a fresh content kit</p>
            </Link>
            <Link
              to="/history"
              className="rounded-xl border border-[#e3ece5] bg-[#f8fcf8] p-5 hover:border-vireo-green"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#e6f2e9] text-vireo-green">
                <History className="size-5" />
              </span>
              <h3 className="mt-5 text-sm font-semibold">View history</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Revisit previous projects</p>
            </Link>
            {complete[0] ? (
              <Link
                to={`/projects/${complete[0].id}`}
                className="rounded-xl border border-[#ebe4f4] bg-[#fcf9ff] p-5 hover:border-[#7848b2]"
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#f1eafd] text-[#7848b2]">
                  <FileText className="size-5" />
                </span>
                <h3 className="mt-5 text-sm font-semibold">Latest transcript</h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">{complete[0].title}</p>
              </Link>
            ) : (
              <div className="rounded-xl border border-border bg-cream/50 p-5">
                <span className="grid size-10 place-items-center rounded-full bg-white text-muted-foreground">
                  <FileText className="size-5" />
                </span>
                <h3 className="mt-5 text-sm font-semibold">Latest transcript</h3>
                <p className="mt-1 text-xs text-muted-foreground">Available after processing</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Processing Queue</h2>
            <Link to="/history" className="text-sm font-semibold text-vireo-green">
              View all <ArrowRight className="inline size-4" />
            </Link>
          </div>
          {queue.length ? (
            <div className="mt-4 space-y-2">
              {queue.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-cream/70 p-3 hover:bg-[#e9f2eb]"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{p.title}</span>
                  <StatusBadge status={getStatus(p)} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center">
              <Sparkles className="mx-auto size-6 text-vireo-green" />
              <p className="mt-2 text-sm font-semibold">All caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">No videos are processing right now.</p>
            </div>
          )}
        </section>
      </div>

      {/* Recent Projects */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Projects</h2>
          <Link to="/history" className="text-sm font-semibold text-vireo-green">
            View all <ArrowRight className="inline size-4" />
          </Link>
        </div>
        {projects.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {projects.slice(0, 4).map((p) => (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="rounded-xl border border-border p-4 transition-colors hover:border-vireo-green"
              >
                <span className="grid h-28 place-items-center rounded-lg bg-[#eff4ef] text-vireo-green">
                  {p.source_type === 'url' ? <Link2 className="size-8" /> : <Video className="size-8" />}
                </span>
                <h3 className="mt-3 truncate text-sm font-semibold">{p.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()} · {p.source_type === 'url' ? 'URL' : 'Upload'}
                </p>
                <div className="mt-3">
                  <StatusBadge status={getStatus(p)} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border py-14 text-center">
            <Video className="mx-auto size-8 text-vireo-green" />
            <h3 className="mt-3 font-semibold">Your first project starts here</h3>
            <p className="mt-1 text-sm text-muted-foreground">Upload a video to create a transcript and a content kit.</p>
            <Link
              to="/projects/new"
              className="mt-5 inline-flex rounded-xl bg-clay px-5 py-2.5 text-sm font-semibold text-white"
            >
              Clip Your First Video
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};

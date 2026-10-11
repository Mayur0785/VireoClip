import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Video, Plus, Film } from 'lucide-react';
import { HomeClippingWorkflow } from '../components/dashboard/HomeClippingWorkflow';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
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

function formatTimeAgo(dateString?: string) {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (isNaN(diffInSeconds)) return 'Recently';
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}h ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 172800) return 'Yesterday';
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function getProjectThumbnail(p: Project): string | null {
  if ((p as any).thumbnail_url) return (p as any).thumbnail_url;
  if (p.source_url) {
    try {
      const parsed = new URL(p.source_url);
      let videoId = '';
      if (parsed.hostname.includes('youtube.com')) {
        videoId = parsed.searchParams.get('v') || '';
        if (!videoId && parsed.pathname.includes('/shorts/')) {
          videoId = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
        }
      } else if (parsed.hostname.includes('youtu.be')) {
        videoId = parsed.pathname.slice(1).split('/')[0] || '';
      }
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }
    } catch {}
  }
  return null;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  const recentProjectsRef = useRef<HTMLElement>(null);
  useCinematicScrollReveal(pageRef, { threshold: 0.08 });

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectTab, setProjectTab] = useState<'all' | 'processing' | 'completed'>('all');

  const loadProjects = async () => {
    if (!user) return;
    try {
      setError('');
      const data = await projectService.fetchProjects(user.id);
      setProjects(data);
    } catch (err: any) {
      const msg = err?.message || '';
      if (!msg.toLowerCase().includes('token') && !msg.toLowerCase().includes('jwt')) {
        setError(msg || 'Unable to load projects.');
      } else {
        setProjects(projectService.getProjects());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const update = () => setProjects(projectService.getProjects());
    window.addEventListener('vireo_project_updated', update);
    return () => window.removeEventListener('vireo_project_updated', update);
  }, [user?.id]);

  const scrollToRecentProjects = () => {
    recentProjectsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getStatus = (p: Project) => p.video_status || p.status;

  const filteredProjects = projects.filter((p) => {
    const s = getStatus(p);
    if (projectTab === 'processing') return activeStatuses.includes(s);
    if (projectTab === 'completed') return completeStatuses.includes(s);
    return true;
  });

  return (
    <div ref={pageRef} className="space-y-12 sm:space-y-16">
      {/* 1. MAIN HERO & COMPLETE VIDEO CLIPPING WORKFLOW */}
      <HomeClippingWorkflow
        existingProjects={projects}
        onRefreshProjects={loadProjects}
        onScrollToProjects={scrollToRecentProjects}
      />

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300 flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            onClick={loadProjects}
            className="font-semibold underline hover:text-white ml-3"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. RECENT PROJECTS SECTION */}
      <section ref={recentProjectsRef} aria-label="Recent projects" className="space-y-4 pt-4 sm:pt-6">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold font-['Sora',sans-serif] text-[#F4F6FB]">
            Recent projects
          </h2>

          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs">
              <button
                type="button"
                onClick={() => setProjectTab('all')}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  projectTab === 'all'
                    ? 'bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40'
                    : 'text-[#8E9AB4] hover:text-[#F4F6FB]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setProjectTab('processing')}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  projectTab === 'processing'
                    ? 'bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40'
                    : 'text-[#8E9AB4] hover:text-[#F4F6FB]'
                }`}
              >
                Processing
              </button>
              <button
                type="button"
                onClick={() => setProjectTab('completed')}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  projectTab === 'completed'
                    ? 'bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40'
                    : 'text-[#8E9AB4] hover:text-[#F4F6FB]'
                }`}
              >
                Completed
              </button>
            </div>

            <Link
              to="/history"
              className="text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-[#C4B5FD] transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
        </div>

        {/* Projects Grid or Honest Empty State */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredProjects.slice(0, 8).map((p, idx) => {
              const statusStr = getStatus(p);
              const isComp = completeStatuses.includes(statusStr);
              const isProc = activeStatuses.includes(statusStr);
              const isFail = statusStr === 'failed';
              const thumbUrl = getProjectThumbnail(p);

              const gradientClass =
                idx % 4 === 0
                  ? 'from-[#4C2FB8] to-[#0F1B2D]'
                  : idx % 4 === 1
                  ? 'from-[#0E6F86] to-[#0F1B2D]'
                  : idx % 4 === 2
                  ? 'from-[#2A3350] to-[#0F1B2D]'
                  : 'from-[#6B2B3A] to-[#0F1B2D]';

              return (
                <article
                  key={p.id}
                  className="vireo-dash-glass overflow-hidden rounded-2xl flex flex-col justify-between hover:border-[#8B5CF6]/50 hover:-translate-y-1 transition-all group"
                >
                  {/* Thumbnail / Header Area */}
                  <div
                    className={`h-[132px] p-2.5 relative flex items-end justify-between overflow-hidden ${
                      !thumbUrl ? `bg-gradient-to-br ${gradientClass}` : 'bg-black'
                    }`}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={p.title || 'Project thumbnail'}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                        <Film className="size-10 text-white" />
                      </div>
                    )}

                    {/* Dark gradient overlay for badge readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent pointer-events-none" />

                    {/* Status Badge */}
                    <span
                      className={`relative z-10 text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md ${
                        isComp
                          ? 'bg-[#34D399]/20 text-[#6EE7B7] border border-[#34D399]/30'
                          : isProc
                          ? 'bg-[#22D3EE]/20 text-[#67E8F9] border border-[#22D3EE]/30 animate-pulse'
                          : isFail
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-white/10 text-[#C9D2E6] border border-white/15'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          isComp
                            ? 'bg-[#34D399]'
                            : isProc
                            ? 'bg-[#22D3EE]'
                            : isFail
                            ? 'bg-rose-400'
                            : 'bg-white/50'
                        }`}
                      />
                      <span className="capitalize">{statusStr}</span>
                    </span>

                    {/* Source / Format Badge */}
                    <span className="relative z-10 text-[11px] font-mono px-2 py-0.5 rounded-full bg-black/60 text-[#C9D2E6] border border-white/10">
                      {p.source_type === 'url' ? 'URL' : 'MP4'}
                    </span>
                  </div>

                  {/* Body Info */}
                  <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-sm text-[#F4F6FB] truncate group-hover:text-white">
                        {p.title || 'Untitled Project'}
                      </h3>
                      <p className="text-[12px] text-[#8E9AB4] mt-1">
                        Updated {formatTimeAgo(p.updated_at || p.created_at)}
                      </p>
                    </div>

                    {/* Processing progress bar if active */}
                    {isProc && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[11px] text-[#8E9AB4] mb-1">
                          <span>Analyzing moments</span>
                          <span>In progress</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                          <div className="h-full w-2/3 bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE] animate-pulse rounded-full" />
                        </div>
                      </div>
                    )}

                    {/* Action Button */}
                    <Link
                      to={`/projects/${p.id}`}
                      className="mt-3.5 inline-flex items-center justify-center h-9 w-full rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] text-xs font-semibold text-[#F4F6FB] transition-all cursor-pointer"
                    >
                      {isComp ? 'Open project' : isProc ? 'View status' : 'Continue'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : projects.length > 0 ? (
          <div className="vireo-dash-glass p-8 text-center rounded-2xl border border-white/10">
            <p className="text-sm text-[#8E9AB4]">
              No {projectTab} projects found.
            </p>
            <button
              type="button"
              onClick={() => setProjectTab('all')}
              className="mt-3 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs text-white font-medium cursor-pointer"
            >
              Show all projects
            </button>
          </div>
        ) : (
          <div className="vireo-dash-glass p-8 sm:p-12 text-center rounded-2xl border border-dashed border-white/10">
            <div className="mx-auto size-12 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 grid place-items-center text-[#C4B5FD] mb-3">
              <Video className="size-6" />
            </div>
            <h3 className="font-['Sora',sans-serif] text-base font-semibold text-[#F4F6FB]">
              Your first project starts here
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-[#8E9AB4] max-w-sm mx-auto">
              Paste a YouTube link or upload a video file above to generate viral clips, captions, and reframed shorts in minutes.
            </p>
            <Link
              to="/projects/new"
              className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-full vireo-btn-purple text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Create Your First Project</span>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};


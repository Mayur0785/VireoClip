import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ArrowUpRight, Video, Link2, Search, Plus, FolderOpen, CheckCircle2, Clock3, AlertCircle } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';

const statusOf=(p:Project)=>p.video_status||p.status;
export const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [source,setSource]=useState('all');const [sort,setSort]=useState('newest');
  const cancelRef=useRef<HTMLButtonElement>(null);
  const deleteRef=useRef<HTMLButtonElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const openDelete=(project:Project)=>{previousFocus.current=document.activeElement as HTMLElement;setProjectToDelete(project)};
  const closeDelete=()=>{setProjectToDelete(null);requestAnimationFrame(()=>previousFocus.current?.focus())};
  const hasLoadedSuccessfully = useRef(false);

  const loadProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await projectService.fetchProjects(user.id);
      setProjects(data);
      hasLoadedSuccessfully.current = true;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to retrieve your projects.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const update = () => {
      if (hasLoadedSuccessfully.current) {
        setProjects(projectService.getProjects());
      }
    };
    window.addEventListener('vireo_project_updated', update);
    return () => window.removeEventListener('vireo_project_updated', update);
  }, [user?.id]);

  useEffect(() => {
    if (projectToDelete) cancelRef.current?.focus();
  }, [projectToDelete]);

  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await projectService.deleteProject(id);
      setProjects(projectService.getProjects());
      closeDelete();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not delete project. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            p.title.toLowerCase().includes(search.toLowerCase()) &&
            (status === 'all' ||
              (status === 'completed'
                ? ['completed', 'complete', 'transcribed'].includes(statusOf(p))
                : status === 'processing'
                ? ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(statusOf(p))
                : statusOf(p) === 'failed')) &&
            (source === 'all' || p.source_type === source)
        )
        .sort((a, b) =>
          sort === 'newest'
            ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [projects, search, status, source, sort]
  );

  const summary = [
    { label: 'All Projects', value: hasLoadedSuccessfully.current ? projects.length : '-', icon: FolderOpen },
    { label: 'Completed', value: hasLoadedSuccessfully.current ? projects.filter((p) => ['completed', 'complete', 'transcribed'].includes(statusOf(p))).length : '-', icon: CheckCircle2 },
    { label: 'Processing', value: hasLoadedSuccessfully.current ? projects.filter((p) => ['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(statusOf(p))).length : '-', icon: Clock3 },
    { label: 'Failed', value: hasLoadedSuccessfully.current ? projects.filter((p) => statusOf(p) === 'failed').length : '-', icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">Project History</h1>
          <p className="mt-2 text-muted-foreground">View and manage all your video projects and generated content.</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-xl bg-clay px-5 py-3 text-sm font-semibold text-white shadow-clay hover:bg-[#c93f1e]"
        >
          <Plus className="size-4" />
          New Project
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-soft">
            <span className="grid size-11 place-items-center rounded-xl bg-[#eaf3eb] text-vireo-green">
              <s.icon className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-input px-3">
            <Search className="size-4 text-muted-foreground" />
            <span className="sr-only">Search projects</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="sr-only" htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-xl border border-input bg-white px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
          <label className="sr-only" htmlFor="source-filter">Source</label>
          <select
            id="source-filter"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-11 rounded-xl border border-input bg-white px-3 text-sm"
          >
            <option value="all">All sources</option>
            <option value="upload">Upload</option>
            <option value="url">URL</option>
          </select>
          <label className="sr-only" htmlFor="sort-filter">Sort</label>
          <select
            id="sort-filter"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-11 rounded-xl border border-input bg-white px-3 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          {(search || status !== 'all' || source !== 'all' || sort !== 'newest') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatus('all');
                setSource('all');
                setSort('newest');
              }}
              className="h-11 px-3 text-sm font-semibold text-clay hover:text-[#bd3f1d] hover:underline self-center"
            >
              Clear filters
            </button>
          )}
        </div>

        {errorMsg && (
          <p role="alert" className="m-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {errorMsg}{' '}
            <button onClick={loadProjects} className="font-semibold underline">
              Retry
            </button>
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : errorMsg && !hasLoadedSuccessfully.current ? null : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <Video className="mx-auto size-8 text-vireo-green" />
            <h2 className="mt-3 font-semibold">{projects.length ? 'No matching projects' : 'No projects yet'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {projects.length ? 'Try a different search or filter.' : 'Upload your first video to get started.'}
            </p>
            {!projects.length && (
              <Link to="/projects/new" className="mt-4 inline-block rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-white hover:bg-[#c93f1e]">
                New Project
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#fafaf8] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Project</th>
                    <th className="px-4 py-4 font-semibold">Source</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 font-semibold">Created</th>
                    <th className="px-4 py-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-cream/50">
                      <td className="max-w-[300px] px-5 py-4">
                        <Link to={`/projects/${p.id}`} className="block truncate font-semibold hover:text-vireo-green">
                          {p.title}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{p.source_type === 'url' ? 'URL' : 'Upload'}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={statusOf(p)} />
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Link to={`/projects/${p.id}`} aria-label={`Open ${p.title}`} className="rounded-lg p-2 hover:bg-[#e8f3e9]">
                            <ArrowUpRight className="size-4" />
                          </Link>
                          <button
                            onClick={() => openDelete(p)}
                            aria-label={`Delete ${p.title}`}
                            className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {filtered.map((p) => (
                <div key={p.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/projects/${p.id}`} className="block truncate font-semibold">
                        {p.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.source_type === 'url' ? <Link2 className="mr-1 inline size-3" /> : <Video className="mr-1 inline size-3" />}
                        {p.source_type === 'url' ? 'URL' : 'Upload'} · {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={statusOf(p)} />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link to={`/projects/${p.id}`} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-cream">
                      Open
                    </Link>
                    <button
                      onClick={() => openDelete(p)}
                      className="rounded-lg border border-destructive/20 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {projectToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#14241f]/45 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDelete();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeDelete();
              if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === cancelRef.current) {
                  e.preventDefault();
                  deleteRef.current?.focus();
                } else if (!e.shiftKey && document.activeElement === deleteRef.current) {
                  e.preventDefault();
                  cancelRef.current?.focus();
                }
              }
            }}
            className="w-full max-w-md rounded-2xl bg-white p-7 shadow-lift"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </span>
            <h2 id="delete-title" className="mt-4 font-display text-2xl font-semibold">
              Delete this project?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              “{projectToDelete.title}” and its associated records will be permanently removed.
            </p>
            <div className="mt-7 flex justify-end gap-3">
              <button
                ref={cancelRef}
                onClick={closeDelete}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-cream"
              >
                Cancel
              </button>
              <button
                ref={deleteRef}
                disabled={isDeleting}
                onClick={() => handleDelete(projectToDelete.id)}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#b8332b]"
              >
                {isDeleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

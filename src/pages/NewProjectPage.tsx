import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Link2, XCircle, Check, ArrowLeft, Lightbulb, FileText, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { projectService } from '../services/projectService';
import { uploadVideoFile, validateVideoFile } from '../services/storageService';
import { useAuth } from '../context/AuthContext';

const MAX_MB = 2048;

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [mode] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prefillUrl = searchParams.get('url');
    if (prefillUrl) {
      setUrl(prefillUrl);
      setErrorMsg('Video URL processing is coming soon. Please upload a video file.');
    }
  }, [searchParams]);

  const handlePickFile = (f?: File) => {
    if (!f) return;
    const validation = validateVideoFile(f);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Please select a valid video file.');
      return;
    }

    setErrorMsg(null);
    setUploadFailed(false);
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProgress(null);
    setErrorMsg('Upload was cancelled.');
    setUploadFailed(true);
  };

  const executeUploadFlow = async () => {
    if (!file) return;

    if (!user) {
      setErrorMsg('You must be signed in to create a project and upload videos.');
      return;
    }

    setErrorMsg(null);
    setUploadFailed(false);
    setProgress(0);

    const projectId = pendingProjectIdRef.current || crypto.randomUUID();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let projectCreated = false;

    try {
      // 1. Create project record in database with status 'uploading'
      if (!pendingProjectIdRef.current) {
        await projectService.createProjectAsync({
          id: projectId,
          userId: user.id,
          title: title.trim(),
          sourceType: 'upload',
          videoStatus: 'uploading',
          notes: notes.trim(),
        });
        pendingProjectIdRef.current = projectId;
      }
      projectCreated = true;

      // 2. Upload directly to R2 with byte-accurate browser progress; backend verifies the object.
      await uploadVideoFile({
        file,
        projectId,
        onProgress: (pct) => setProgress(pct),
        signal: abortController.signal,
      });

      setProgress(100);
      abortControllerRef.current = null;
      pendingProjectIdRef.current = null;
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('cancelled');
      const message = isAbort
        ? 'Upload was cancelled.'
        : err.message || 'Failed to upload video.';

      console.error('[Upload Flow Failed]', err);

      if (projectCreated) await projectService.fetchProject(projectId).catch(() => undefined);

      setErrorMsg(message);
      setUploadFailed(true);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setUploadFailed(false);

    if (mode === 'upload' && !file) {
      setErrorMsg('Please choose a video file to upload.');
      return;
    }
    if (mode === 'url' && !url.trim()) {
      setErrorMsg('Please enter a valid video URL.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Please give your project a title.');
      return;
    }

    if (mode === 'upload') {
      await executeUploadFlow();
    } else {
      // Validate URL format
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error();
        }
      } catch {
        setErrorMsg('Please enter a valid HTTP or HTTPS video URL (e.g. https://youtube.com/watch?v=…).');
        return;
      }

      try {
        const proj = await projectService.createProjectAsync({
          userId: user?.id,
          title: title.trim(),
          sourceType: 'url',
          sourceUrl: url.trim(),
          videoStatus: 'queued',
          notes: notes.trim(),
        });
        navigate(`/projects/${proj.id}`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to create project.');
      }
    }
  };

  const isUploading = progress !== null && progress < 100;

  return <div className="space-y-5">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-forest"><ArrowLeft className="size-4" />Back to Dashboard</Link>
    <div><h1 className="font-display text-4xl font-semibold tracking-tight">Create a New Project</h1><p className="mt-2 text-muted-foreground">Turn your video into engaging content. Upload a file to get started.</p></div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-soft md:p-7">
      {errorMsg && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"><span>{errorMsg}</span>{uploadFailed && file && <button type="button" onClick={executeUploadFlow} className="font-semibold underline">Retry</button>}</div>}
      <div className="grid grid-cols-2 gap-3"><div className="flex items-center justify-center gap-2 rounded-xl bg-[#eaf4eb] px-4 py-4 font-semibold text-forest"><Upload className="size-5"/>Upload Video</div><div aria-disabled="true" title="Video URL processing is coming soon" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-cream/60 px-4 py-4 text-muted-foreground"><Link2 className="size-5"/><span>Paste Video URL <small className="block text-[10px]">Coming soon</small></span></div></div>
      <div onDragOver={e=>{e.preventDefault();if(!isUploading)setIsDragOver(true)}} onDragLeave={()=>setIsDragOver(false)} onDrop={e=>{e.preventDefault();setIsDragOver(false);if(!isUploading)handlePickFile(e.dataTransfer.files[0])}} className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${isDragOver?'border-vireo-green bg-[#eaf4eb]':'border-[#d5e3d8] bg-[#fbfdfb]'} md:p-12`}><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#eaf4eb] text-vireo-green"><Upload className="size-8" /></span><h2 className="mt-5 text-lg font-semibold">{file?file.name:'Drag and drop your video file here'}</h2><p className="mt-1 text-sm text-muted-foreground">{file?`${(file.size/1024/1024).toFixed(1)} MB`:'or choose a file from your device'}</p><button type="button" disabled={isUploading} onClick={()=>fileInputRef.current?.click()} className="mt-4 rounded-xl border border-vireo-green px-4 py-2 text-sm font-semibold text-vireo-green hover:bg-[#eaf4eb]">Browse files</button><input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv" className="sr-only" disabled={isUploading} onChange={e=>handlePickFile(e.target.files?.[0])}/><p className="mt-5 text-xs text-muted-foreground">MP4, MOV, WEBM, AVI, MKV · Maximum {MAX_MB} MB</p></div>
      <div className="rounded-xl border border-border bg-[#f8faf8] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-vireo-green"/>File requirements</p><div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">{['Supported video format','Up to 50 MB'].map(x=><p key={x} className="flex items-center gap-2"><Check className="size-4 text-vireo-green"/>{x}</p>)}</div></div>
      <Input label="Project title" maxLength={100} required placeholder="e.g. My creator interview" value={title} disabled={isUploading} onChange={e=>setTitle(e.target.value)} />
      <Textarea label="Notes (optional)" rows={4} maxLength={500} placeholder="Add context or key topics for your content kit" value={notes} disabled={isUploading} onChange={e=>setNotes(e.target.value)} />
      {isUploading && <div className="space-y-2"><div className="flex justify-between text-sm"><span>Uploading video…</span><button type="button" onClick={handleCancelUpload} className="inline-flex items-center gap-1 text-destructive"><XCircle className="size-4"/>Cancel</button></div><div className="h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-vireo-green transition-all" style={{width:`${progress}%`}}/></div><p className="text-right text-xs text-muted-foreground">{progress}%</p></div>}
      <Button type="submit" variant="clay" size="lg" className="w-full" disabled={isUploading || !file}>{isUploading?'Uploading video…':'Start Processing'}</Button><p className="text-center text-xs text-muted-foreground">Your video will be processed after it uploads.</p>
    </form><aside className="space-y-4"><div className="rounded-2xl border border-border bg-[#f6faf5] p-6 shadow-soft"><h2 className="flex items-center gap-3 font-display text-xl font-semibold"><Lightbulb className="size-5 text-clay"/>Get the best results</h2><p className="mt-2 text-sm text-muted-foreground">A clear recording makes a more useful transcript.</p><ul className="mt-5 space-y-4">{['Use clear audio with little background noise','Keep the speaker easy to hear','Include an introduction and key topics'].map(x=><li key={x} className="flex gap-3 text-sm"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#dceee0] text-vireo-green"><Check className="size-3"/></span>{x}</li>)}</ul></div><div className="rounded-2xl border border-border bg-white p-6 shadow-soft"><h2 className="font-display text-xl font-semibold">What happens next?</h2><ol className="mt-5 space-y-5">{['Upload your video','Extract and transcribe audio','Generate content drafts','Review and edit'].map((x,i)=><li key={x} className="flex items-center gap-3 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#fff0e8] font-semibold text-clay">{i+1}</span>{x}</li>)}</ol></div><div className="rounded-2xl border border-border bg-[#fff8f4] p-6 text-center"><Sparkles className="mx-auto size-8 text-clay"/><p className="mt-3 font-semibold">One video, many possibilities.</p><p className="mt-2 text-sm text-muted-foreground">Get a transcript, titles, hooks and posts from your recording.</p></div></aside></div>
  </div>;
};

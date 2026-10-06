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

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [isIngestingUrl, setIsIngestingUrl] = useState(false);
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
      setMode('url');
      if (!title) {
        try {
          const u = new URL(prefillUrl);
          const name = u.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
          if (name) setTitle(decodeURIComponent(name));
        } catch {
          // ignore
        }
      }
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
      // URL Ingestion Flow
      if (!user) {
        setErrorMsg('You must be signed in to create a project.');
        return;
      }

      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Only HTTP and HTTPS URLs are supported.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Please enter a valid HTTP or HTTPS video URL.');
        return;
      }

      setErrorMsg(null);
      setIsIngestingUrl(true);

      try {
        const proj = await projectService.ingestProjectUrlAsync({
          url: url.trim(),
          title: title.trim(),
          notes: notes.trim(),
        });
        setIsIngestingUrl(false);
        navigate(`/projects/${proj.id}`);
      } catch (err: any) {
        setIsIngestingUrl(false);
        setErrorMsg(err.message || 'Failed to import video from URL.');
      }
    }
  };

  const isUploading = progress !== null && progress < 100;
  const isBusy = isUploading || isIngestingUrl;

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-forest"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          Create a New Project
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Turn your video into engaging content in minutes. Upload a file or paste a video URL to get started.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main Upload Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-soft md:p-8"
        >
          {errorMsg && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <span>{errorMsg}</span>
              {uploadFailed && file && (
                <button
                  type="button"
                  onClick={executeUploadFlow}
                  className="font-semibold underline hover:text-destructive/80"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-3 border-b border-border pb-4">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setMode('upload');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all ${
                mode === 'upload'
                  ? 'bg-[#eaf4eb] text-forest shadow-xs'
                  : 'border border-border/80 bg-white text-muted-foreground hover:bg-cream/60 hover:text-foreground'
              }`}
            >
              <Upload className="size-4 text-vireo-green" />
              <span>Upload Video</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setMode('url');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all ${
                mode === 'url'
                  ? 'bg-[#eaf4eb] text-forest shadow-xs'
                  : 'border border-border/80 bg-white text-muted-foreground hover:bg-cream/60 hover:text-foreground'
              }`}
            >
              <Link2 className="size-4 text-vireo-green" />
              <span>Paste Video URL</span>
            </button>
          </div>

          {/* Upload File Mode */}
          {mode === 'upload' && (
            <>
              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isUploading) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (!isUploading) handlePickFile(e.dataTransfer.files[0]);
                }}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all md:p-12 ${
                  isDragOver
                    ? 'border-vireo-green bg-[#eaf4eb]/70'
                    : 'border-[#d3ded5] bg-[#fafcfb] hover:border-vireo-green/60'
                }`}
              >
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#eaf4eb] text-vireo-green shadow-xs">
                  <Upload className="size-7" />
                </div>

                <h2 className="mt-4 font-display text-lg font-semibold text-foreground">
                  {file ? file.name : 'Drag and drop your video file here'}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {file ? (
                    <span className="font-mono text-xs font-semibold text-vireo-green">
                      {(file.size / 1024 / 1024).toFixed(1)} MB ready to upload
                    </span>
                  ) : (
                    <>
                      or click to{' '}
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="font-semibold text-vireo-green underline hover:text-forest"
                      >
                        browse files
                      </button>
                    </>
                  )}
                </p>

                {file && !isUploading && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-cream"
                  >
                    Change video file
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(e) => handlePickFile(e.target.files?.[0])}
                />

                <p className="mt-5 text-xs text-muted-foreground">
                  Supports MP4, MOV, AVI, WEBM &bull; Max file size: 50 MB
                </p>
              </div>

              {/* File Requirements Strip */}
              <div className="rounded-xl border border-border/80 bg-[#f9faf9] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                  <FileText className="size-3.5 text-vireo-green" />
                  <span>File requirements</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#e3f0e5] text-vireo-green">
                      <Check className="size-2.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">MP4, MOV, AVI, WEBM</p>
                      <p className="text-[11px] text-muted-foreground">Supported formats</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#e3f0e5] text-vireo-green">
                      <Check className="size-2.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Max 50 MB</p>
                      <p className="text-[11px] text-muted-foreground">File size limit</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#e3f0e5] text-vireo-green">
                      <Check className="size-2.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Up to 2 hours</p>
                      <p className="text-[11px] text-muted-foreground">Recommended length</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#e3f0e5] text-vireo-green">
                      <Check className="size-2.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">1080p or higher</p>
                      <p className="text-[11px] text-muted-foreground">Best results</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Paste Video URL Mode */}
          {mode === 'url' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-[#fafcfb] p-6">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf4eb] text-vireo-green">
                    <Link2 className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-semibold text-foreground">
                      Import Video from Web URL
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Paste a publicly accessible HTTP or HTTPS video URL.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <Input
                    label="Video Web URL *"
                    placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4"
                    value={url}
                    disabled={isIngestingUrl}
                    required
                    onChange={(e) => {
                      const val = e.target.value;
                      setUrl(val);
                      if (!title && val.trim()) {
                        try {
                          const u = new URL(val.trim());
                          if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname.toLowerCase())) {
                            // Leave title empty or default so backend/yt-dlp can populate actual YouTube video title
                          } else {
                            const filename = u.pathname.split('/').pop()?.replace(/\.[^.]+$/, '');
                            if (filename) setTitle(decodeURIComponent(filename));
                          }
                        } catch {
                          // ignore
                        }
                      }
                    }}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-border/80 bg-white p-3.5 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-semibold text-foreground">Supported Sources:</p>
                  <p className="text-forest font-medium">&bull; YouTube public video links: watch URLs, youtu.be links, and YouTube Shorts</p>
                  <p className="text-forest font-medium">&bull; Direct public video file URLs: MP4, MOV, WebM, AVI, MKV (e.g. cloud storage or CDNs)</p>
                  <p className="text-amber-800 bg-amber-50 rounded-md px-2.5 py-1.5 border border-amber-200">
                    &bull; Note: TikTok and Instagram page URLs are not currently supported. Playlists, channels, and private/age-restricted YouTube videos are not supported.
                  </p>
                  <p>&bull; Max download size: 50 MB &bull; Max duration: 2 hours</p>
                </div>
              </div>
            </div>
          )}

          {/* Form Inputs with Character Counters */}
          <div className="space-y-4">
            <Input
              label="Project Title *"
              rightLabel={`${title.length}/100`}
              maxLength={100}
              required
              placeholder="e.g. Startup Marketing Masterclass"
              value={title}
              disabled={isBusy}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Textarea
              label="Notes (Optional)"
              rightLabel={`${notes.length}/500`}
              rows={4}
              maxLength={500}
              placeholder="Add any notes, context or specific instructions for AI..."
              value={notes}
              disabled={isBusy}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Upload Progress Presentation (Real bytes only) */}
          {isUploading && (
            <div className="space-y-2 rounded-xl border border-vireo-green/20 bg-[#eaf4eb]/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-forest flex items-center gap-2">
                  <span className="size-2 rounded-full bg-vireo-green animate-ping" />
                  Uploading video…
                </span>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline"
                >
                  <XCircle className="size-3.5" />
                  Cancel
                </button>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#d5e8d8]">
                <div
                  className="h-full rounded-full bg-vireo-green transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span>
                  {file
                    ? `${(((file.size * (progress || 0)) / 100) / (1024 * 1024)).toFixed(1)} MB of ${(
                        file.size /
                        (1024 * 1024)
                      ).toFixed(1)} MB`
                    : ''}
                </span>
                <span className="font-bold text-forest">{progress}%</span>
              </div>
            </div>
          )}

          {/* URL Ingestion Indeterminate State (No fake percentages) */}
          {isIngestingUrl && (
            <div className="space-y-2 rounded-xl border border-vireo-green/20 bg-[#eaf4eb]/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-forest flex items-center gap-2">
                  <span className="size-2 rounded-full bg-vireo-green animate-ping" />
                  Importing and verifying video URL…
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Downloading source video, verifying streams with FFmpeg, and securing to Cloudflare R2…
              </p>
            </div>
          )}

          {/* Submit Action */}
          <div className="space-y-2">
            <Button
              type="submit"
              variant="clay"
              size="lg"
              className="w-full shadow-clay"
              disabled={isBusy || (mode === 'upload' && !file) || (mode === 'url' && !url.trim())}
            >
              <Sparkles className="size-4 mr-2" />
              {isUploading
                ? 'Uploading Video…'
                : isIngestingUrl
                ? 'Importing Video URL…'
                : 'Start Processing →'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Your video will be saved and processed automatically. You'll be notified when it's ready.
            </p>
          </div>
        </form>

        {/* Right Info Sidebar (Matching reference design) */}
        <aside className="space-y-5">
          {/* Card 1: Best results */}
          <div className="rounded-2xl border border-border bg-white p-6 shadow-soft">
            <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-foreground">
              <Lightbulb className="size-5 text-amber-500" />
              <span>Get the best results</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Follow these tips to get higher quality transcripts and content.
            </p>

            <ul className="mt-4 space-y-3">
              {[
                'Use clear audio with minimal background noise',
                'Ensure the speaker is easy to hear',
                'Videos with a single speaker work best',
                'Include an introduction and key topics',
                'Longer videos (10+ minutes) provide more content opportunities',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-xs text-foreground/90">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#e3f0e5] text-vireo-green">
                    <Check className="size-2.5" />
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 2: What happens next? */}
          <div className="rounded-2xl border border-border bg-white p-6 shadow-soft">
            <h2 className="font-display text-lg font-semibold text-foreground">
              What happens next?
            </h2>
            <ol className="mt-4 space-y-3.5">
              {[
                { title: 'Upload your video', desc: "We'll securely upload and process your file" },
                { title: 'AI transcription', desc: "We'll create an accurate transcript" },
                { title: 'Content generation', desc: 'Get social posts, titles, hooks and more' },
                { title: 'Review and edit', desc: 'Fine-tune your content and export' },
              ].map((step, idx) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#fff0e8] text-xs font-bold text-clay font-mono">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Card 3: Value banner */}
          <div className="rounded-2xl border border-[#fae5d9] bg-[#fffaf6] p-6 text-center shadow-soft">
            <Sparkles className="mx-auto size-7 text-clay" />
            <h3 className="mt-3 font-display text-base font-semibold text-foreground">
              Turn one video into many opportunities
            </h3>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Get transcripts, social posts, titles, hooks and more &mdash; all from a single video.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

import { CheckCircle2, Clock3, FileText, AlertCircle, Circle, Loader2 } from 'lucide-react';

const map: Record<string, { label: string; cls: string; icon: typeof Circle }> = {
  uploading: { label: 'Uploading', cls: 'bg-sky-500/15 text-sky-400 border border-sky-500/30', icon: Loader2 },
  uploaded: { label: 'Uploaded', cls: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30', icon: Circle },
  queued: { label: 'Queued', cls: 'bg-slate-500/20 text-slate-300 border border-slate-500/30', icon: Clock3 },
  processing: { label: 'Processing', cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse', icon: Loader2 },
  transcribing: { label: 'Transcribing', cls: 'bg-purple-500/15 text-purple-300 border border-purple-500/30 animate-pulse', icon: FileText },
  transcribed: { label: 'Transcribed', cls: 'bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30', icon: CheckCircle2 },
  analyzing: { label: 'Analyzing', cls: 'bg-teal-500/15 text-teal-300 border border-teal-500/30 animate-pulse', icon: Loader2 },
  generating: { label: 'Generating', cls: 'bg-[#00DCC8]/15 text-[#00DCC8] border border-[#00DCC8]/30 animate-pulse', icon: Loader2 },
  completed: { label: 'Completed', cls: 'bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30', icon: CheckCircle2 },
  complete: { label: 'Complete', cls: 'bg-[#20E3A2]/15 text-[#20E3A2] border border-[#20E3A2]/30', icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-400 border border-rose-500/30', icon: AlertCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] || map.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-xs ${s.cls}`}>
      <s.icon className="size-3.5" />
      {s.label}
    </span>
  );
}

export const isProcessing = (s: string) =>
  ['uploading', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(s);

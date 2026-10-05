import { CheckCircle2, Clock3, FileText, AlertCircle, Circle, Loader2 } from 'lucide-react';
const map: Record<string, { label: string; cls: string; icon: typeof Circle }> = {
  uploading: { label: 'Uploading', cls: 'bg-[#eef2f5] text-[#52636e]', icon: Loader2 },
  uploaded: { label: 'Uploaded', cls: 'bg-[#edf2f5] text-[#52636e]', icon: Circle },
  queued: { label: 'Queued', cls: 'bg-[#edf2f5] text-[#52636e]', icon: Clock3 },
  processing: { label: 'Processing', cls: 'bg-[#fff0e6] text-[#b34f20]', icon: Loader2 },
  transcribing: { label: 'Transcribing', cls: 'bg-[#f2eaff] text-[#7848b2]', icon: FileText },
  transcribed: { label: 'Transcribed', cls: 'bg-[#e7f3e8] text-[#126941]', icon: CheckCircle2 },
  analyzing: { label: 'Analyzing', cls: 'bg-[#fff0e6] text-[#b34f20]', icon: Loader2 },
  generating: { label: 'Generating', cls: 'bg-[#fff0e6] text-[#b34f20]', icon: Loader2 },
  completed: { label: 'Completed', cls: 'bg-[#e7f3e8] text-[#126941]', icon: CheckCircle2 },
  complete: { label: 'Complete', cls: 'bg-[#e7f3e8] text-[#126941]', icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'bg-[#ffebe9] text-[#ad3028]', icon: AlertCircle },
};
export function StatusBadge({ status }: { status: string }) { const s=map[status]||map.queued; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}><s.icon className="size-3.5" />{s.label}</span>; }
export const isProcessing = (s: string) => ['uploading','queued','processing','transcribing','analyzing','generating'].includes(s);

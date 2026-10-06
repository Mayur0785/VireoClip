import React, { useState, useEffect } from 'react';
import {
  Send,
  Calendar,
  AlertCircle,
  Check,
  Share2,
  X,
} from 'lucide-react';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { ShinyButton } from './react-bits/ShinyButton';
import {
  publishingService,
  PublishPayload,
  PublishPreviewResult,
} from '../services/publishingService';
import { socialService, SafeSocialAccountConnection, type SocialPlatform } from '../services/socialService';

export interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  clipId?: string | null;
  contentOutputId?: string | null;
  initialTitle?: string;
  initialCaption?: string;
  initialTags?: string[];
  initialPlatform?: SocialPlatform;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
  projectId,
  clipId,
  contentOutputId,
  initialTitle = '',
  initialCaption = '',
  initialTags = [],
  initialPlatform,
}) => {
  const [accounts, setAccounts] = useState<SafeSocialAccountConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Form State
  const [title, setTitle] = useState(initialTitle);
  const [caption, setCaption] = useState(initialCaption);
  const [tags, setTags] = useState(initialTags.join(', '));
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');

  // Scheduling State
  const [publishMode, setPublishMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

  // Preview & Submission State
  const [preview, setPreview] = useState<PublishPreviewResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
      setTitle(initialTitle);
      setCaption(initialCaption);
      setTags(initialTags.join(', '));
      setFeedback(null);
      setPreview(null);
    }
  }, [isOpen, initialTitle, initialCaption]);

  const loadAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const res = await socialService.getAccounts();
      const connected = res.accounts || [];
      setAccounts(connected);
      if (connected.length > 0 && !selectedConnectionId) {
        if (initialPlatform) {
          const match = connected.find((a) => a.provider === initialPlatform);
          setSelectedConnectionId(match ? match.id : connected[0].id);
        } else {
          setSelectedConnectionId(connected[0].id);
        }
      }
    } catch (err: any) {
      console.warn('Could not load social accounts:', err?.message);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedConnectionId);

  // Auto-validate preview when inputs change
  useEffect(() => {
    if (!selectedConnectionId) return;

    const runPreview = async () => {
      try {
        setIsValidating(true);
        const parsedTags = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const payload: PublishPayload = {
          title,
          caption,
          description: caption,
          tags: parsedTags,
          privacy,
        };

        const res = await publishingService.preview(selectedConnectionId, clipId, payload);
        setPreview(res);
      } catch (err: any) {
        setPreview(null);
      } finally {
        setIsValidating(false);
      }
    };

    const timer = setTimeout(runPreview, 400);
    return () => clearTimeout(timer);
  }, [selectedConnectionId, clipId, title, caption, tags, privacy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnectionId) {
      setFeedback({ type: 'error', message: 'Please select a connected social account.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);

      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: PublishPayload = {
        title,
        caption,
        description: caption,
        tags: parsedTags,
        privacy,
      };

      if (publishMode === 'now') {
        await publishingService.publishNow({
          projectId,
          clipId,
          contentOutputId,
          socialConnectionId: selectedConnectionId,
          payload,
        });
        setFeedback({
          type: 'success',
          message: 'Publishing job queued successfully! Video is publishing in the background.',
        });
      } else {
        if (!scheduleDate || !scheduleTime) {
          throw new Error('Please select both a date and time for scheduling.');
        }

        const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
        await publishingService.schedule({
          projectId,
          clipId,
          contentOutputId,
          socialConnectionId: selectedConnectionId,
          payload,
          scheduledFor,
          timezone,
        });
        setFeedback({
          type: 'success',
          message: `Post scheduled successfully for ${scheduleDate} at ${scheduleTime} (${timezone}).`,
        });
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Publishing submission failed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-border/60 flex items-center justify-between bg-card/50">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-sage/20 text-sage font-bold">
              <Share2 className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold font-display text-foreground">
                Publishing Composer
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Publish immediately or schedule your post across connected channels.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4.5 overflow-y-auto flex-1">
          {feedback && (
            <div
              role="alert"
              className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-sage/15 border border-sage/30 text-sage'
                  : 'bg-destructive/10 border border-destructive/20 text-destructive'
              }`}
            >
              {feedback.type === 'success' ? <Check className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Account Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Select Destination Account</span>
              {loadingAccounts && <span className="text-[10px] text-muted-foreground animate-pulse">Loading accounts…</span>}
              {!loadingAccounts && isValidating && <span className="text-[10px] text-clay animate-pulse">Checking platform requirements…</span>}
            </label>
            {accounts.length === 0 ? (
              <div className="p-3.5 rounded-2xl border border-dashed border-border text-center space-y-2">
                <p className="text-xs text-muted-foreground">No social accounts connected yet.</p>
                <a href="/settings" className="inline-block text-xs font-semibold text-sage hover:underline">
                  Connect in Settings →
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedConnectionId(acc.id)}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                      selectedConnectionId === acc.id
                        ? 'border-sage bg-sage/10 text-foreground ring-1 ring-sage'
                        : 'border-border/60 hover:border-border text-muted-foreground'
                    }`}
                  >
                    {acc.avatar_url ? (
                      <img src={acc.avatar_url} alt="" className="size-7 rounded-full object-cover" />
                    ) : (
                      <div className="size-7 rounded-lg bg-muted flex items-center justify-center font-bold text-xs uppercase">
                        {acc.provider[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold capitalize truncate">{acc.provider}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{acc.account_name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Publish Mode Toggle */}
          <div className="flex rounded-2xl bg-muted/60 p-1 border border-border/40">
            <button
              type="button"
              onClick={() => setPublishMode('now')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                publishMode === 'now' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Send className="size-3.5" />
              <span>Publish Now</span>
            </button>
            <button
              type="button"
              onClick={() => setPublishMode('scheduled')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                publishMode === 'scheduled' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="size-3.5" />
              <span>Schedule for Later</span>
            </button>
          </div>

          {/* Scheduling inputs */}
          {publishMode === 'scheduled' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-muted/30 border border-border/40">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full text-xs bg-card border border-border rounded-xl px-2.5 py-1.5 text-foreground"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full text-xs bg-card border border-border rounded-xl px-2.5 py-1.5 text-foreground"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full text-xs bg-card border border-border rounded-xl px-2.5 py-1.5 text-foreground font-mono"
                />
              </div>
            </div>
          )}

          {/* Platform Specific Fields */}
          <div className="space-y-3 pt-1">
            {selectedAccount?.provider === 'youtube' && (
              <Input
                label="Video Title"
                placeholder="Enter YouTube video title (max 100 chars)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
              />
            )}

            <Textarea
              label={selectedAccount?.provider === 'youtube' ? 'Description' : 'Caption / Text'}
              placeholder="Write your post caption or description..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              required
            />

            <Input
              label="Tags / Keywords (comma separated)"
              placeholder="e.g. ai, tech, innovation, videoclip"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />

            {selectedAccount?.provider === 'youtube' && (
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Privacy</label>
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as any)}
                  className="w-full text-xs bg-card border border-border rounded-2xl px-3 py-2 text-foreground"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
            )}
          </div>

          {/* Validation Warnings */}
          {preview && preview.warnings.length > 0 && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <AlertCircle className="size-3.5" />
                <span>Notice:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5">
                {preview.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-2">
            <ShinyButton
              type="submit"
              variant="sage"
              className="w-full h-11 text-sm font-semibold"
              disabled={isSubmitting || accounts.length === 0}
              leftIcon={
                isSubmitting ? (
                  <span className="size-3.5 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                ) : publishMode === 'now' ? (
                  <Send className="size-4" />
                ) : (
                  <Calendar className="size-4" />
                )
              }
            >
              {isSubmitting
                ? 'Submitting…'
                : publishMode === 'now'
                ? 'Publish Now'
                : 'Confirm Schedule'}
            </ShinyButton>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Share2,
  Calendar,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  XCircle,
  RotateCcw,
  Filter,
} from 'lucide-react';
import { Button } from '../components/Button';
import { SpotlightCard } from '../components/react-bits/SpotlightCard';
import {
  publishingService,
  PublishedPost,
  PublishStatus,
} from '../services/publishingService';

export const PublishingHistoryPage: React.FC = () => {
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setActionError(null);
      const data = await publishingService.getPosts({
        status: statusFilter || undefined,
        provider: providerFilter || undefined,
      });
      setPosts(data.posts || []);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load posts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [statusFilter, providerFilter]);

  const handleCancel = async (postId: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled post?')) return;
    try {
      setProcessingId(postId);
      await publishingService.cancelPost(postId);
      setActionSuccess('Scheduled post cancelled successfully.');
      loadPosts();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to cancel post.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRetry = async (postId: string) => {
    try {
      setProcessingId(postId);
      await publishingService.retryPost(postId);
      setActionSuccess('Publishing retry initiated.');
      loadPosts();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to retry post.');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: PublishStatus) => {
    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage/20 px-2 py-0.5 text-[10px] font-semibold text-sage">
            <CheckCircle2 className="size-3" /> Published
          </span>
        );
      case 'publishing':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-clay/20 px-2 py-0.5 text-[10px] font-semibold text-clay animate-pulse">
            <RefreshCw className="size-3 animate-spin" /> Publishing
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-500">
            <Calendar className="size-3" /> Scheduled
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            <XCircle className="size-3" /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Cancelled
          </span>
        );
      default:
        return <span className="capitalize text-xs text-muted-foreground">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2.5">
            <Share2 className="size-6 text-sage" />
            <span>Publishing & Scheduling</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track published content, manage upcoming scheduled drops, and handle retries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPosts}
            disabled={loading}
            className="text-xs font-semibold"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div role="alert" className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div role="status" className="p-3.5 rounded-2xl bg-sage/15 border border-sage/30 text-sage text-xs flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2 font-medium">
          <Filter className="size-3.5" />
          <span>Filter:</span>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs bg-muted/60 border border-border/40 rounded-xl px-2.5 py-1.5 text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="publishing">Publishing</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="text-xs bg-muted/60 border border-border/40 rounded-xl px-2.5 py-1.5 text-foreground"
        >
          <option value="">All Platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="linkedin">LinkedIn</option>
          <option value="x">X (Twitter)</option>
        </select>
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="p-12 text-center space-y-3">
          <RefreshCw className="size-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading published and scheduled posts…</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="card-soft p-12 text-center space-y-3 bg-cream/40 border-dashed border-border/80">
          <Share2 className="size-8 mx-auto text-muted-foreground/60" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">No posts found</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Publish or schedule clips from your projects to see them appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const isProcessing = processingId === post.id;
            return (
              <SpotlightCard
                key={post.id}
                spotlightColor="rgba(38, 36, 34, 0.05)"
                className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-border/70"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-xs capitalize text-foreground font-display">
                      {post.provider}
                    </span>
                    {getStatusBadge(post.status)}
                    {post.publish_type === 'scheduled' && post.scheduled_for && (
                      <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(post.scheduled_for).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })} ({post.timezone || 'UTC'})
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-foreground truncate max-w-xl">
                    {post.payload.title || post.payload.caption || post.payload.description || 'Untitled post'}
                  </p>

                  {post.last_error_message && (
                    <p className="text-[11px] text-destructive">
                      Error: {post.last_error_message}
                    </p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {post.provider_post_url && (
                    <a
                      href={post.provider_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"
                    >
                      <span>View Live</span>
                      <ExternalLink className="size-3" />
                    </a>
                  )}

                  {post.status === 'scheduled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => handleCancel(post.id)}
                      className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive h-8"
                    >
                      Cancel
                    </Button>
                  )}

                  {post.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => handleRetry(post.id)}
                      className="text-xs h-8"
                    >
                      <RotateCcw className="size-3 mr-1" />
                      Retry
                    </Button>
                  )}
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

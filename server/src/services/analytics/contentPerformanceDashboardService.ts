import { getMongoDb } from '../../db/mongoClient.js';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import {
  ContentAnalyticsRecord,
  DashboardFilterOptions,
  ContentPerformanceDashboardResponse,
  DashboardMetricSummary,
  DashboardTimelinePoint,
  DashboardPlatformStat,
  DashboardContentItem,
  AppError,
} from '../../types/index.js';

export class ContentPerformanceDashboardService {
  /**
   * Retrieves unified content performance dashboard data strictly isolated by tenant.
   */
  public static async getDashboard(
    userId: string,
    options: DashboardFilterOptions = {}
  ): Promise<ContentPerformanceDashboardResponse> {
    if (!userId) {
      throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
    }

    return await ownerContext.run(userId, async () => {
      const db = await getMongoDb();

      // 1. Resolve date boundaries
      let sinceDate: Date | null = null;
      let untilDate: Date | null = null;

      if (options.startDate) {
        const d = new Date(options.startDate);
        if (!Number.isNaN(d.getTime())) sinceDate = d;
      } else if (options.days && options.days > 0) {
        sinceDate = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
      }

      if (options.endDate) {
        const d = new Date(options.endDate);
        if (!Number.isNaN(d.getTime())) untilDate = d;
      }

      // 2. Fetch user-owned primary records
      const [clipsRes, publishedRes, experimentsRes, observationLogsRes] = await Promise.all([
        dataRepository.from('clips').select('*').eq('user_id', userId),
        dataRepository.from('published_posts').select('*').eq('user_id', userId),
        dataRepository.from('ab_experiments').select('*').eq('user_id', userId),
        dataRepository.from('ab_observation_logs').select('*').eq('user_id', userId),
      ]);

      const allClips = (clipsRes.data || []) as any[];
      const allPublished = (publishedRes.data || []) as any[];
      const allExperiments = (experimentsRes.data || []) as any[];
      const allObservationLogs = (observationLogsRes.data || []) as any[];

      // Build content analytics MongoDB query with tenant isolation
      const analyticsQuery: Record<string, any> = { user_id: userId };
      if (sinceDate || untilDate) {
        analyticsQuery.captured_at = {};
        if (sinceDate) analyticsQuery.captured_at.$gte = sinceDate;
        if (untilDate) analyticsQuery.captured_at.$lte = untilDate;
      }
      if (options.platform) {
        analyticsQuery.platform = options.platform;
      }
      if (options.clipId) {
        analyticsQuery.clip_id = options.clipId;
      }

      const allAnalyticsRecords = await db
        .collection<ContentAnalyticsRecord>('content_analytics')
        .find(analyticsQuery)
        .sort({ captured_at: -1 })
        .toArray();

      // Filter observation logs by date range & platform/clip if requested
      const filteredObservationLogs = allObservationLogs.filter((log) => {
        const logDate = log.created_at ? new Date(log.created_at) : (log.recorded_at ? new Date(log.recorded_at) : null);
        if (sinceDate && logDate && logDate < sinceDate) return false;
        if (untilDate && logDate && logDate > untilDate) return false;
        if (options.platform && log.source_label && !log.source_label.toLowerCase().includes(options.platform.toLowerCase())) {
          return false;
        }
        if (options.clipId) {
          const matchingExp = allExperiments.find((e) => e.id === log.experiment_id);
          if (!matchingExp || matchingExp.clip_id !== options.clipId) return false;
        }
        return true;
      });

      // Filter experiments by clip if requested
      const activeOrConcludedExpMap = new Map<string, any>();
      for (const exp of allExperiments) {
        if (exp.clip_id && exp.status !== 'CANCELLED') {
          activeOrConcludedExpMap.set(exp.clip_id, exp);
        }
      }

      // 3. Deduplicate latest analytics snapshot per post
      // This prevents double-counting periodic sync snapshots of the same published post
      const latestPostSnapshotMap = new Map<string, ContentAnalyticsRecord>();
      for (const record of allAnalyticsRecords) {
        const key = record.published_post_id || record.id;
        if (!latestPostSnapshotMap.has(key)) {
          latestPostSnapshotMap.set(key, record);
        }
      }
      const deduplicatedSnapshots = Array.from(latestPostSnapshotMap.values());

      // 4. Calculate Summary Totals
      let recordedViews = 0;
      let recordedImpressions = 0;
      let recordedClicks = 0;
      let recordedWatchTimeSeconds = 0;
      let totalInteractions = 0;

      for (const snap of deduplicatedSnapshots) {
        const m = snap.metrics || ({} as any);
        recordedViews += m.views || 0;
        recordedImpressions += m.impressions || 0;
        recordedClicks += m.clicks || 0;
        recordedWatchTimeSeconds += m.watch_time_seconds || 0;
        totalInteractions += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
      }

      // Experiment exposures and conversions
      let recordedExposures = 0;
      let recordedConversions = 0;

      // Group observation logs by experiment
      const obsByExpId = new Map<string, typeof filteredObservationLogs>();
      for (const log of filteredObservationLogs) {
        const list = obsByExpId.get(log.experiment_id) || [];
        list.push(log);
        obsByExpId.set(log.experiment_id, list);
      }

      for (const log of filteredObservationLogs) {
        recordedExposures += Number(log.exposures || 0);
        recordedConversions += Number(log.conversions || 0);
      }

      // If an experiment has no separate observation logs, read cumulative totals from variants
      // to avoid missing historical data, but NEVER double-count if observation logs exist!
      for (const exp of allExperiments) {
        if (options.clipId && exp.clip_id !== options.clipId) continue;
        const hasLogs = obsByExpId.has(exp.id) && obsByExpId.get(exp.id)!.length > 0;
        if (!hasLogs && Array.isArray(exp.variants)) {
          for (const v of exp.variants) {
            const obs = v.observations || {};
            const expCount = Number(obs.impressions || obs.views || 0);
            const convCount = Number(obs.conversions || 0);
            recordedExposures += expCount;
            recordedConversions += convCount;
          }
        }
      }

      // Honest rates with explicit non-zero denominators
      const clickThroughRate =
        recordedImpressions > 0 ? Math.round((recordedClicks / recordedImpressions) * 10000) / 10000 : null;
      const conversionRate =
        recordedExposures > 0 ? Math.round((recordedConversions / recordedExposures) * 10000) / 10000 : null;
      const averageEngagementRate =
        recordedViews > 0 ? Math.round((totalInteractions / recordedViews) * 10000) / 10000 : null;

      // Provenance breakdown
      const provenanceBreakdown = {
        platform_sync_count: allAnalyticsRecords.filter((r) => r.sync_status === 'synced').length,
        csv_import_count: filteredObservationLogs.filter((l) => l.data_provenance === 'CSV_IMPORT').length,
        manual_observation_count: filteredObservationLogs.filter(
          (l) => l.data_provenance === 'MANUAL_ENTRY' || l.data_provenance === 'MANUAL'
        ).length,
        ab_studio_count: allExperiments.length,
      };

      const dataProvenanceSources: string[] = [];
      if (provenanceBreakdown.platform_sync_count > 0) dataProvenanceSources.push('PLATFORM_SYNC');
      if (provenanceBreakdown.csv_import_count > 0) dataProvenanceSources.push('CSV_IMPORT');
      if (provenanceBreakdown.manual_observation_count > 0) dataProvenanceSources.push('MANUAL');
      if (provenanceBreakdown.ab_studio_count > 0) dataProvenanceSources.push('AB_STUDIO');

      // Insufficient data reasons
      const insufficientDataReasons: string[] = [];
      if (allClips.length < 3) {
        insufficientDataReasons.push('Fewer than 3 content clips tracked in workspace.');
      }
      if (recordedImpressions === 0) {
        insufficientDataReasons.push('No platform impressions recorded yet to compute CTR.');
      }
      if (recordedExposures === 0) {
        insufficientDataReasons.push('No A/B experiment exposures logged yet to compute conversion rate.');
      }
      if (recordedViews === 0) {
        insufficientDataReasons.push('No published views recorded yet for engagement trends.');
      }

      const hasSufficientData =
        allClips.length >= 3 && (recordedViews > 0 || recordedExposures > 0 || deduplicatedSnapshots.length > 0);

      const summary: DashboardMetricSummary = {
        total_clips: allClips.length,
        published_posts_count: allPublished.length,
        in_experiment_clips_count: activeOrConcludedExpMap.size,
        recorded_views: recordedViews,
        recorded_impressions: recordedImpressions,
        recorded_clicks: recordedClicks,
        recorded_conversions: recordedConversions,
        recorded_exposures: recordedExposures,
        recorded_watch_time_seconds: recordedWatchTimeSeconds,
        click_through_rate: clickThroughRate,
        conversion_rate: conversionRate,
        average_engagement_rate: averageEngagementRate,
        provenance_breakdown: provenanceBreakdown,
        has_sufficient_data: hasSufficientData,
        insufficient_data_reasons: insufficientDataReasons,
      };

      // 5. Timeline Aggregation (Daily trend points)
      const dateMap = new Map<
        string,
        {
          views: number;
          impressions: number;
          clicks: number;
          conversions: number;
          exposures: number;
          sources: Set<string>;
        }
      >();

      for (const record of allAnalyticsRecords) {
        const d = record.captured_at ? new Date(record.captured_at).toISOString().split('T')[0] : 'undated';
        const entry = dateMap.get(d) || {
          views: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          exposures: 0,
          sources: new Set<string>(),
        };
        const m = record.metrics || ({} as any);
        entry.views += m.views || 0;
        entry.impressions += m.impressions || 0;
        entry.clicks += m.clicks || 0;
        entry.sources.add('PLATFORM_SYNC');
        dateMap.set(d, entry);
      }

      for (const log of filteredObservationLogs) {
        const rawDate = log.created_at || log.recorded_at;
        const d = rawDate ? new Date(rawDate).toISOString().split('T')[0] : 'undated';
        const entry = dateMap.get(d) || {
          views: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          exposures: 0,
          sources: new Set<string>(),
        };
        entry.exposures += Number(log.exposures || 0);
        entry.conversions += Number(log.conversions || 0);
        entry.sources.add(log.data_provenance || 'AB_STUDIO');
        dateMap.set(d, entry);
      }

      const timeline: DashboardTimelinePoint[] = Array.from(dateMap.entries())
        .filter(([date]) => date !== 'undated')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, val]) => ({
          date,
          views: val.views,
          impressions: val.impressions,
          clicks: val.clicks,
          conversions: val.conversions,
          exposures: val.exposures,
          sources: Array.from(val.sources),
        }));

      // 6. Platform Breakdown
      // Only include platforms present in actual stored data!
      const platformMap = new Map<
        string,
        {
          views: number;
          impressions: number;
          clicks: number;
          conversions: number;
          exposures: number;
          posts_count: number;
        }
      >();

      for (const snap of deduplicatedSnapshots) {
        if (!snap.platform) continue;
        const p = snap.platform.toLowerCase();
        const entry = platformMap.get(p) || {
          views: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          exposures: 0,
          posts_count: 0,
        };
        const m = snap.metrics || ({} as any);
        entry.views += m.views || 0;
        entry.impressions += m.impressions || 0;
        entry.clicks += m.clicks || 0;
        entry.posts_count += 1;
        platformMap.set(p, entry);
      }

      for (const log of filteredObservationLogs) {
        if (!log.source_label) continue;
        const label = log.source_label.toLowerCase();
        // Match known social platform names in source_label
        for (const known of ['youtube', 'instagram', 'tiktok', 'linkedin', 'x', 'twitter', 'facebook', 'generic']) {
          if (label.includes(known)) {
            const entry = platformMap.get(known) || {
              views: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              exposures: 0,
              posts_count: 0,
            };
            entry.exposures += Number(log.exposures || 0);
            entry.conversions += Number(log.conversions || 0);
            platformMap.set(known, entry);
            break;
          }
        }
      }

      const platforms: DashboardPlatformStat[] = Array.from(platformMap.entries()).map(([platform, data]) => ({
        platform,
        views: data.views,
        impressions: data.impressions,
        clicks: data.clicks,
        conversions: data.conversions,
        exposures: data.exposures,
        posts_count: data.posts_count,
        ctr: data.impressions > 0 ? Math.round((data.clicks / data.impressions) * 10000) / 10000 : null,
        conversion_rate: data.exposures > 0 ? Math.round((data.conversions / data.exposures) * 10000) / 10000 : null,
      }));

      // 7. Content-Level Performance Table
      // Map clips to their analytics & experiments
      const clipAnalyticsMap = new Map<string, ContentAnalyticsRecord[]>();
      for (const record of allAnalyticsRecords) {
        if (record.clip_id) {
          const list = clipAnalyticsMap.get(record.clip_id) || [];
          list.push(record);
          clipAnalyticsMap.set(record.clip_id, list);
        }
      }

      const contentItems: DashboardContentItem[] = [];

      for (const clip of allClips) {
        // Status filter
        const exp = activeOrConcludedExpMap.get(clip.id);
        const isPublished = allPublished.some((p) => p.clip_id === clip.id);

        let derivedStatus: 'ready' | 'published' | 'in_experiment' | 'draft' = clip.status || 'ready';
        if (exp && (exp.status === 'ACTIVE' || exp.status === 'PAUSED')) {
          derivedStatus = 'in_experiment';
        } else if (isPublished) {
          derivedStatus = 'published';
        }

        if (options.status && options.status !== 'all' && derivedStatus !== options.status) {
          continue;
        }

        if (options.clipId && clip.id !== options.clipId) {
          continue;
        }

        // Aggregate analytics for this clip
        const clipRecords = clipAnalyticsMap.get(clip.id) || [];
        let clipViews = 0;
        let clipImpressions = 0;
        let clipClicks = 0;
        let clipEngagement = 0;
        const clipProvenanceSet = new Set<string>();

        // Deduplicate snapshots per post for this clip
        const clipPostMap = new Map<string, ContentAnalyticsRecord>();
        for (const r of clipRecords) {
          const k = r.published_post_id || r.id;
          if (!clipPostMap.has(k)) clipPostMap.set(k, r);
        }

        for (const r of clipPostMap.values()) {
          const m = r.metrics || ({} as any);
          clipViews += m.views || 0;
          clipImpressions += m.impressions || 0;
          clipClicks += m.clicks || 0;
          clipEngagement += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
          clipProvenanceSet.add('PLATFORM_SYNC');
        }

        // Aggregate experiment observations for this clip
        let clipExposures = 0;
        let clipConversions = 0;
        let expSummary: DashboardContentItem['experiment'] = null;

        if (exp) {
          const expLogs = obsByExpId.get(exp.id) || [];
          if (expLogs.length > 0) {
            for (const l of expLogs) {
              clipExposures += Number(l.exposures || 0);
              clipConversions += Number(l.conversions || 0);
              clipProvenanceSet.add(l.data_provenance || 'AB_STUDIO');
            }
          } else if (Array.isArray(exp.variants)) {
            for (const v of exp.variants) {
              const obs = v.observations || {};
              clipExposures += Number(obs.impressions || obs.views || 0);
              clipConversions += Number(obs.conversions || 0);
            }
            clipProvenanceSet.add('AB_STUDIO');
          }

          const stat = exp.statistical_result;
          expSummary = {
            id: exp.id,
            name: exp.name || 'A/B Experiment',
            status: exp.status,
            test_type: exp.test_type,
            winning_variant_id: exp.winning_variant_id || null,
            is_significant: stat?.is_statistically_significant === true,
            confidence_level: stat?.confidence_level || undefined,
          };
        }

        const clipCtr = clipImpressions > 0 ? Math.round((clipClicks / clipImpressions) * 10000) / 10000 : null;
        const clipConvRate = clipExposures > 0 ? Math.round((clipConversions / clipExposures) * 10000) / 10000 : null;

        contentItems.push({
          clip_id: clip.id,
          project_id: clip.project_id,
          title: clip.title || 'Untitled Clip',
          status: derivedStatus,
          created_at: clip.created_at ? new Date(clip.created_at).toISOString() : new Date().toISOString(),
          duration_seconds: clip.duration_seconds || undefined,
          views: clipViews,
          impressions: clipImpressions,
          clicks: clipClicks,
          conversions: clipConversions,
          exposures: clipExposures,
          ctr: clipCtr,
          conversion_rate: clipConvRate,
          engagement: clipEngagement,
          experiment: expSummary,
          provenance_sources: Array.from(clipProvenanceSet),
        });
      }

      // Sort content items by views + exposures descending
      contentItems.sort((a, b) => b.views + b.exposures - (a.views + a.exposures));

      // 8. Pagination
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const totalContentItems = contentItems.length;
      const startIndex = (page - 1) * limit;
      const paginatedContentItems = contentItems.slice(startIndex, startIndex + limit);

      return {
        summary,
        timeline,
        platforms,
        content_items: paginatedContentItems,
        total_content_items: totalContentItems,
        page,
        limit,
        filters_applied: {
          days: options.days,
          startDate: options.startDate,
          endDate: options.endDate,
          platform: options.platform,
          clipId: options.clipId,
          status: options.status,
        },
        data_provenance_sources: dataProvenanceSources,
        explanation: !hasSufficientData
          ? 'Content performance data is limited. Publish content, sync social platforms, or run A/B experiments to populate evidence.'
          : undefined,
      };
    });
  }
}

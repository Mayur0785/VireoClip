import crypto from 'node:crypto';
import { getMongoDb } from '../../db/mongoClient.js';
import {
  ContentAnalyticsRecord,
  ContentMemoryRecord,
  GrowthRecommendation,
  ClipRecord,
  MemoryCategory,
  MemoryConfidence,
} from '../../types/index.js';

export class GrowthCoachService {
  /**
   * Generates evidence-grounded growth recommendations based on real historical content performance.
   */
  public static async getRecommendations(userId: string): Promise<GrowthRecommendation[]> {
    const db = await getMongoDb();

    // Fetch latest post snapshots with joined clip/content metadata
    const analytics = await db.collection<ContentAnalyticsRecord>('content_analytics').find({
      user_id: userId,
      sync_status: 'synced',
    }).sort({ captured_at: -1 }).toArray();

    if (analytics.length === 0) {
      return [
        {
          id: 'rec-start',
          category: 'next_idea',
          title: 'Publish Your First Clip',
          recommendation: 'Publish your first video clip through VireoClip to unlock real performance intelligence and growth recommendations.',
          evidence: 'No published content performance data has been synced yet.',
          confidence: 'low',
          supporting_metrics: { sample_size: 0 },
        },
      ];
    }

    if (analytics.length < 3) {
      return [
        {
          id: 'rec-accumulate',
          category: 'try',
          title: 'Keep Publishing for Better Accuracy',
          recommendation: 'Vireo is still learning what works for your audience. Publish at least 3–5 clips to uncover statistical patterns.',
          evidence: `Currently analyzed sample size: ${analytics.length} published clip(s).`,
          confidence: 'low',
          supporting_metrics: { sample_size: analytics.length },
        },
      ];
    }

    const recommendations: GrowthRecommendation[] = [];

    // 1. Duration Intelligence
    const durationBuckets: Record<string, { count: number; totalViews: number; totalEngagement: number }> = {
      'under_30s': { count: 0, totalViews: 0, totalEngagement: 0 },
      '30s_to_60s': { count: 0, totalViews: 0, totalEngagement: 0 },
      'over_60s': { count: 0, totalViews: 0, totalEngagement: 0 },
    };

    for (const snap of analytics) {
      if (snap.clip_id) {
        const clip = await db.collection<ClipRecord>('clips').findOne({ id: snap.clip_id });
        if (clip) {
          const dur = clip.duration_seconds || 30;
          const bucket = dur < 30 ? 'under_30s' : dur <= 60 ? '30s_to_60s' : 'over_60s';
          durationBuckets[bucket].count++;
          durationBuckets[bucket].totalViews += snap.metrics.views || 0;
          durationBuckets[bucket].totalEngagement += (snap.metrics.likes + snap.metrics.comments);
        }
      }
    }

    let bestBucket = '';
    let highestAvgEng = -1;
    for (const [b, data] of Object.entries(durationBuckets)) {
      if (data.count > 0) {
        const avg = data.totalEngagement / data.count;
        if (avg > highestAvgEng) {
          highestAvgEng = avg;
          bestBucket = b;
        }
      }
    }

    if (bestBucket && highestAvgEng > 0) {
      const bucketLabel = bestBucket === 'under_30s' ? '<30 seconds' : bestBucket === '30s_to_60s' ? '30–60 seconds' : '>60 seconds';
      recommendations.push({
        id: 'rec-duration',
        category: 'working',
        title: `Optimal Clip Duration: ${bucketLabel}`,
        recommendation: `Your clips in the ${bucketLabel} window have generated the highest average engagement in your library.`,
        evidence: `Clips in this range averaged ${Math.round(highestAvgEng)} interactions across ${durationBuckets[bestBucket].count} published video(s).`,
        confidence: durationBuckets[bestBucket].count >= 5 ? 'high' : 'medium',
        supporting_metrics: durationBuckets[bestBucket],
      });
    }

    // 2. Next Content Idea
    recommendations.push({
      id: 'rec-hook-format',
      category: 'next_idea',
      title: 'Double Down on Top Performing Topics',
      recommendation: 'Produce a follow-up clip extending the key lesson from your highest-performing published video.',
      evidence: 'High-performing videos demonstrate strong audience resonance that typically carries over to related series.',
      confidence: analytics.length >= 5 ? 'medium' : 'low',
      supporting_metrics: { total_published: analytics.length },
    });

    return recommendations;
  }
}

export class ContentMemoryService {
  /**
   * Retrieves persistent learned patterns for the creator.
   */
  public static async getMemories(userId: string): Promise<ContentMemoryRecord[]> {
    const db = await getMongoDb();
    return db.collection<ContentMemoryRecord>('content_memories').find({ user_id: userId }).sort({ last_updated: -1 }).toArray();
  }

  /**
   * Updates or saves a learned pattern into the creator's persistent content memory.
   */
  public static async recordMemory(
    userId: string,
    category: MemoryCategory,
    pattern: string,
    evidence: string,
    sampleSize: number,
    performanceMultiplier = 1.0
  ): Promise<ContentMemoryRecord> {
    const db = await getMongoDb();
    const now = new Date();

    const confidence: MemoryConfidence = sampleSize >= 10 ? 'high' : sampleSize >= 4 ? 'medium' : 'low';

    const existing = await db.collection<ContentMemoryRecord>('content_memories').findOne({
      user_id: userId,
      category,
      pattern,
    });

    if (existing) {
      await db.collection<ContentMemoryRecord>('content_memories').updateOne(
        { id: existing.id },
        {
          $set: {
            evidence,
            confidence,
            sample_size: sampleSize,
            performance_multiplier: performanceMultiplier,
            last_updated: now,
          },
        }
      );
      return { ...existing, evidence, confidence, sample_size: sampleSize, performance_multiplier: performanceMultiplier, last_updated: now };
    }

    const newRecord: ContentMemoryRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      category,
      pattern,
      evidence,
      confidence,
      sample_size: sampleSize,
      performance_multiplier: performanceMultiplier,
      first_seen: now,
      last_updated: now,
      created_at: now,
      updated_at: now,
    };

    await db.collection<ContentMemoryRecord>('content_memories').insertOne(newRecord);
    return newRecord;
  }

  /**
   * Integration point for future AI generation (Vireo Brain, Multimodal, ClipAnything).
   * Returns structured creator performance context for prompt augmentation.
   */
  public static async getCreatorPerformanceContext(userId: string): Promise<Record<string, any>> {
    const memories = await this.getMemories(userId);

    const highConfidenceMemories = memories.filter((m) => m.confidence === 'high' || m.confidence === 'medium');

    return {
      top_duration_ranges: highConfidenceMemories.filter((m) => m.category === 'duration').map((m) => m.pattern),
      winning_topics: highConfidenceMemories.filter((m) => m.category === 'topic').map((m) => m.pattern),
      preferred_platforms: highConfidenceMemories.filter((m) => m.category === 'platform').map((m) => m.pattern),
      strong_hook_styles: highConfidenceMemories.filter((m) => m.category === 'hook').map((m) => m.pattern),
      has_established_memory: highConfidenceMemories.length > 0,
    };
  }
}

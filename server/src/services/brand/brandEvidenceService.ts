import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  BrandDimension,
  BrandEvidence,
  ConfidenceLevel,
  EvidenceSourceType,
  BRAND_RESOURCE_LIMITS,
} from '../../types/index.js';

export interface IngestEvidenceDTO {
  userId: string;
  brandBrainId: string;
  dimension: BrandDimension;
  sourceType: EvidenceSourceType;
  sourceId: string;
  value: any;
  weight?: number;
}

export class BrandEvidenceService {
  /**
   * Generates a stable SHA-256 idempotency key for an evidence point.
   */
  public static generateIdempotencyKey(
    userId: string,
    brandBrainId: string,
    dimension: BrandDimension,
    sourceType: EvidenceSourceType,
    sourceId: string,
    value: any
  ): string {
    const raw = `${userId}:${brandBrainId}:${dimension}:${sourceType}:${sourceId}:${JSON.stringify(value)}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Calculates confidence based on sample count and consistency.
   */
  public static calculateConfidence(sampleCount: number): ConfidenceLevel {
    if (sampleCount >= 8) return 'HIGH';
    if (sampleCount >= 3) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Computes time-decay multiplier for evidence.
   * Recent evidence retains high influence; older evidence decays gracefully without losing history.
   */
  public static calculateDecayMultiplier(createdAt: string | Date): number {
    const now = Date.now();
    const createdTime = new Date(createdAt).getTime();
    const ageDays = (now - createdTime) / (1000 * 60 * 60 * 24);

    if (ageDays <= 14) return 1.0;
    if (ageDays <= 45) return 0.8;
    if (ageDays <= 90) return 0.6;
    return 0.4;
  }

  /**
   * Ingests a new piece of evidence idempotently.
   */
  public static async recordEvidence(dto: IngestEvidenceDTO): Promise<BrandEvidence> {
    const { userId, brandBrainId, dimension, sourceType, sourceId, value, weight = 1.0 } = dto;

    if (!userId || !brandBrainId) {
      throw new AppError('userId and brandBrainId are required to record evidence.', 400, 'INVALID_INPUT');
    }

    const idempotencyKey = this.generateIdempotencyKey(
      userId,
      brandBrainId,
      dimension,
      sourceType,
      sourceId,
      value
    );

    return await ownerContext.run(userId, async () => {
      // 1. Check if evidence already exists with this idempotency key
      const { data: existing } = await dataRepository
        .from('brand_evidence')
        .select()
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', userId)
        .single();

      if (existing) {
        logger.info('Evidence already recorded (idempotent skipped)', { idempotencyKey, sourceId });
        return existing as BrandEvidence;
      }

      // 2. Fetch all existing evidence for this user & profile to compute confidence & check limit
      const { data: allEvidence } = await dataRepository
        .from('brand_evidence')
        .select()
        .eq('brand_brain_id', brandBrainId)
        .eq('user_id', userId);

      const count = (allEvidence || []).length;

      // 3. Prune oldest if at limit
      if (count >= BRAND_RESOURCE_LIMITS.MAX_EVIDENCE_RECORDS_PER_PROFILE) {
        const sorted = (allEvidence || []).sort(
          (a: BrandEvidence, b: BrandEvidence) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const toPrune = sorted[0];
        if (toPrune) {
          await dataRepository.from('brand_evidence').delete().eq('id', toPrune.id).eq('user_id', userId);
        }
      }

      // 4. Calculate confidence for dimension
      const dimSamples = (allEvidence || []).filter((e: BrandEvidence) => e.dimension === dimension).length + 1;
      const confidence = this.calculateConfidence(dimSamples);

      const record: BrandEvidence = {
        id: crypto.randomUUID(),
        user_id: userId,
        brand_brain_id: brandBrainId,
        dimension,
        source_type: sourceType,
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        value,
        weight,
        confidence,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await dataRepository
        .from('brand_evidence')
        .insert(record);

      if (insertError) {
        throw new AppError(`Failed to save evidence: ${insertError.message}`, 500, 'DB_ERROR');
      }

      // 5. Update summary on brand profile
      try {
        const { data: profile } = await dataRepository
          .from('brand_brain_profiles')
          .select()
          .eq('id', brandBrainId)
          .eq('user_id', userId)
          .single();

        if (profile) {
          const confidenceMap = { ...(profile.learning?.confidence_by_dimension || {}) };
          confidenceMap[dimension] = confidence;

          await dataRepository
            .from('brand_brain_profiles')
            .update({
              learning: {
                last_learned_at: new Date().toISOString(),
                evidence_count: count + 1,
                confidence_by_dimension: confidenceMap,
              },
            })
            .eq('id', brandBrainId)
            .eq('user_id', userId);
        }
      } catch (err) {
        logger.error('Failed to update brand profile learning summary', { err });
      }

      return record;
    });
  }

  /**
   * Retrieves all evidence for a brand profile, optionally filtered by dimension.
   * Returns records with calculated decayed weights.
   */
  public static async getEvidence(
    userId: string,
    brandBrainId: string,
    dimension?: BrandDimension
  ): Promise<Array<BrandEvidence & { decayed_weight: number }>> {
    return await ownerContext.run(userId, async () => {
      let query = dataRepository
        .from('brand_evidence')
        .select()
        .eq('brand_brain_id', brandBrainId)
        .eq('user_id', userId);

      if (dimension) {
        query = query.eq('dimension', dimension);
      }

      const { data: records, error } = await query;
      if (error) {
        throw new AppError(`Failed to fetch evidence: ${error.message}`, 500, 'DB_ERROR');
      }

      return (records || []).map((r: BrandEvidence) => ({
        ...r,
        decayed_weight: +(r.weight * this.calculateDecayMultiplier(r.created_at)).toFixed(3),
      }));
    });
  }

  /**
   * Computes the dominant learned value for a given dimension using weighted votes.
   */
  public static async getDominantLearnedPreference<T>(
    userId: string,
    brandBrainId: string,
    dimension: BrandDimension
  ): Promise<{ value: T; confidence: ConfidenceLevel; sampleCount: number } | null> {
    const evidenceList = await this.getEvidence(userId, brandBrainId, dimension);
    if (!evidenceList || evidenceList.length === 0) {
      return null;
    }

    const valueScores = new Map<string, { totalWeight: number; sampleCount: number; originalValue: any }>();

    for (const item of evidenceList) {
      const serialized = JSON.stringify(item.value);
      const current = valueScores.get(serialized) || {
        totalWeight: 0,
        sampleCount: 0,
        originalValue: item.value,
      };
      current.totalWeight += item.decayed_weight;
      current.sampleCount += 1;
      valueScores.set(serialized, current);
    }

    let top: { totalWeight: number; sampleCount: number; originalValue: any } | null = null;
    for (const entry of valueScores.values()) {
      if (!top || entry.totalWeight > top.totalWeight) {
        top = entry;
      }
    }

    if (!top) return null;

    const confidence = this.calculateConfidence(top.sampleCount);
    return {
      value: top.originalValue as T,
      confidence,
      sampleCount: top.sampleCount,
    };
  }
}

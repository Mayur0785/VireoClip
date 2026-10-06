import { replaceSuggestedCandidates } from '../db/repositories/clipCandidateRepository.js';
import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { defaultAiProvider, AIProviderClient } from './aiProviderClient.js';
import { ClipPromptService } from './clipPromptService.js';
import {
  ClipCandidate,
  ClipCandidateCategory,
  ClipCandidateStatus,
  AIClipCandidate,
  AIClipAnalysisResponse,
  TranscriptSegment,
  CreatorProfileData,
} from '../types/index.js';

// In-memory set to prevent multiple simultaneous analysis runs for the same project
export const activeClipAnalysisSet = new Set<string>();

export interface AnalyzeClipsOptions {
  projectId: string;
  userId: string;
  customNotes?: string;
}

export class ClipAnalysisService {
  private aiProvider: AIProviderClient;

  constructor(aiProvider: AIProviderClient = defaultAiProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * Calculates duration score component (0–100) based on short-form sweet spots:
   * 20s–60s: 100 (Optimal short-form length)
   * 15s–20s: 80 (Slightly rushed)
   * 60s–75s: 80 (Slightly long)
   * 75s–90s: 60 (Pushes upper limit of short-form attention)
   */
  public static calculateDurationScore(durationSeconds: number): number {
    if (durationSeconds >= 20 && durationSeconds <= 60) {
      return 100;
    }
    if (durationSeconds >= 15 && durationSeconds < 20) {
      return 80;
    }
    if (durationSeconds > 60 && durationSeconds <= 75) {
      return 80;
    }
    if (durationSeconds > 75 && durationSeconds <= 90) {
      return 60;
    }
    return 40;
  }

  /**
   * Deterministic hybrid engagement score (0–100 integer)
   * Weights:
   * - Hook Strength: 25%
   * - Standalone Clarity: 20%
   * - Insight/Value: 20%
   * - Emotion/Novelty: 15%
   * - Platform Suitability: 10%
   * - Duration Quality: 10%
   */
  public static computeHybridScore(ai: AIClipCandidate, durationSeconds: number): number {
    const clamp = (val: number) => Math.min(100, Math.max(0, Number(val) || 0));

    const hook = clamp(ai.hook_score);
    const standalone = clamp(ai.standalone_score);
    const insight = clamp(ai.insight_score);
    const emotion = clamp(ai.emotion_score);
    const platform = clamp(ai.platform_score);
    const duration = this.calculateDurationScore(durationSeconds);

    const weighted =
      hook * 0.25 +
      standalone * 0.20 +
      insight * 0.20 +
      emotion * 0.15 +
      platform * 0.10 +
      duration * 0.10;

    return Math.min(100, Math.max(0, Math.round(weighted)));
  }

  /**
   * Calculates overlap ratio between two time intervals relative to the shorter duration.
   * Returns a value between 0.0 and 1.0.
   */
  public static calculateOverlapRatio(
    startA: number,
    endA: number,
    startB: number,
    endB: number
  ): number {
    const durA = endA - startA;
    const durB = endB - startB;
    const shorter = Math.min(durA, durB);

    if (shorter <= 0) return 0;

    const overlap = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
    return overlap / shorter;
  }

  /**
   * Deduplicates candidates by removing lower-scoring candidates that heavily overlap (>= 70%)
   * with a higher-scoring candidate.
   */
  public static deduplicateCandidates<T extends { start_seconds: number; end_seconds: number; engagement_score: number }>(
    candidates: T[],
    overlapThreshold = 0.70
  ): T[] {
    // Sort descending by score; if tied, sort earlier start time first
    const sorted = [...candidates].sort((a, b) => {
      if (b.engagement_score !== a.engagement_score) {
        return b.engagement_score - a.engagement_score;
      }
      return a.start_seconds - b.start_seconds;
    });

    const accepted: T[] = [];

    for (const cand of sorted) {
      let isDuplicate = false;
      for (const acc of accepted) {
        const ratio = this.calculateOverlapRatio(
          cand.start_seconds,
          cand.end_seconds,
          acc.start_seconds,
          acc.end_seconds
        );
        if (ratio >= overlapThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        accepted.push(cand);
      }
    }

    return accepted;
  }

  /**
   * Parses and validates raw JSON or parsed object from LLM response
   */
  public static parseAIResponse(rawTextOrObj: string | any): AIClipCandidate[] {
    if (!rawTextOrObj) {
      throw new Error('AI returned an empty response.');
    }

    let parsed: any;
    if (typeof rawTextOrObj === 'string') {
      let cleaned = rawTextOrObj.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      try {
        parsed = JSON.parse(cleaned);
      } catch (err: any) {
        throw new Error(`Failed to parse AI clip analysis JSON: ${err.message}`);
      }
    } else {
      parsed = rawTextOrObj;
    }

    const clipsArray = Array.isArray(parsed) ? parsed : parsed?.clips;
    if (!Array.isArray(clipsArray)) {
      throw new Error('AI response does not contain a "clips" array.');
    }

    const validCategories: Set<ClipCandidateCategory> = new Set([
      'educational',
      'story',
      'controversial',
      'insight',
      'emotional',
      'entertaining',
      'tutorial',
      'general',
    ]);

    const candidates: AIClipCandidate[] = [];

    for (const item of clipsArray) {
      if (typeof item !== 'object' || item === null) continue;

      const startIndex = Number(item.start_segment_index);
      const endIndex = Number(item.end_segment_index);

      if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
      if (startIndex < 0 || endIndex < startIndex) continue;

      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const hook = typeof item.hook === 'string' ? item.hook.trim() : '';
      const reason = typeof item.reason === 'string' ? item.reason.trim() : '';

      if (!title || !hook) continue;

      const rawCat = typeof item.category === 'string' ? item.category.toLowerCase().trim() : 'general';
      const category: ClipCandidateCategory = validCategories.has(rawCat as any)
        ? (rawCat as ClipCandidateCategory)
        : 'general';

      candidates.push({
        start_segment_index: startIndex,
        end_segment_index: endIndex,
        title,
        hook,
        reason,
        category,
        hook_score: Number(item.hook_score) || 70,
        standalone_score: Number(item.standalone_score) || 70,
        insight_score: Number(item.insight_score) || 70,
        emotion_score: Number(item.emotion_score) || 70,
        platform_score: Number(item.platform_score) || 70,
      });
    }

    return candidates;
  }

  /**
   * Main pipeline method: analyzes transcript, derives timestamps, dedupes, and persists clip candidates
   */
  public async analyzeAndPersistClips(options: AnalyzeClipsOptions): Promise<ClipCandidate[]> {
    const { projectId, userId, customNotes } = options;

    if (activeClipAnalysisSet.has(projectId)) {
      const err: any = new Error('Clip analysis is already in progress for this project.');
      err.code = 'CLIP_ANALYSIS_ACTIVE';
      throw err;
    }

    activeClipAnalysisSet.add(projectId);

    try {
      // 1. Verify project exists and belongs to user
      const { data: project, error: projErr } = await dataRepository
        .from('projects')
        .select('id, user_id, title, notes')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (projErr) {
        throw new Error(`Failed to load project: ${projErr.message}`);
      }
      if (!project) {
        const notFound: any = new Error('Project not found or access denied.');
        notFound.code = 'PROJECT_NOT_FOUND';
        throw notFound;
      }

      // 2. Fetch transcript and ensure timestamped segments exist
      const { data: transcript, error: transErr } = await dataRepository
        .from('transcripts')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (transErr) {
        throw new Error(`Failed to load transcript: ${transErr.message}`);
      }
      if (!transcript || !transcript.transcript_text) {
        const transNotFound: any = new Error('Transcript not found for this project.');
        transNotFound.code = 'TRANSCRIPT_NOT_FOUND';
        throw transNotFound;
      }

      const rawSegments = transcript.segments;
      if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
        const noSegments: any = new Error('Transcript contains no timestamped segments. Cannot find clips without segment boundaries.');
        noSegments.code = 'CLIP_SEGMENTS_UNAVAILABLE';
        throw noSegments;
      }

      const segments: TranscriptSegment[] = rawSegments.map((s: any) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text || ''),
      }));

      // 3. Fetch optional creator profile for persona guidance
      let creatorProfile: CreatorProfileData | null = null;
      try {
        const { data: cpData } = await dataRepository
          .from('creator_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (cpData) {
          creatorProfile = cpData as CreatorProfileData;
        }
      } catch (cpErr: any) {
        logger.warn(`Could not load creator profile for clip analysis: ${cpErr.message}`);
      }

      // 4. Construct prompt and call LLM
      logger.info(`Starting AI clip analysis for project ${projectId} (${segments.length} segments)...`);
      const userPrompt = ClipPromptService.buildClipAnalysisPrompt({
        segments,
        durationSeconds: transcript.duration_seconds,
        creatorProfile,
        customNotes: customNotes || project.notes,
      });

      const systemPrompt = ClipPromptService.getSystemPrompt();

      const aiResponse = await this.aiProvider.generateJsonCompletion<AIClipAnalysisResponse>({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 3000,
        responseFormat: 'json_object',
      });

      logger.info(`AI clip analysis raw response for ${projectId}: ${JSON.stringify(aiResponse)}`);

      // 5. Parse and validate AI candidates
      let aiCandidates = ClipAnalysisService.parseAIResponse(aiResponse);
      if (aiCandidates.length === 0 && segments.length > 0) {
        // If the video is short (or has very few segments) and LLM produced 0 clips, create a highlight candidate spanning the transcript
        const seg = segments[0];
        const segDur = seg.end - seg.start;
        if (segDur >= 2.0) {
          logger.info(`Creating fallback clip candidate for short video (duration: ${segDur.toFixed(2)}s)`);
          aiCandidates = [{
            start_segment_index: 0,
            end_segment_index: segments.length - 1,
            title: project.title || 'Video Highlight',
            hook: seg.text.slice(0, 50),
            reason: 'Strongest standalone moment in the source clip.',
            category: 'insight',
            hook_score: 85,
            standalone_score: 85,
            insight_score: 85,
            emotion_score: 80,
            platform_score: 85,
          }];
        }
      }

      if (aiCandidates.length === 0) {
        logger.warn(`AI clip analysis returned 0 candidates for project ${projectId}.`);
        return [];
      }

      // 6. Ground segment indexes and derive actual timestamps
      const groundedCandidates: Array<{
        start_segment_index: number;
        end_segment_index: number;
        start_seconds: number;
        end_seconds: number;
        duration_seconds: number;
        title: string;
        hook: string;
        reason: string;
        category: ClipCandidateCategory;
        engagement_score: number;
      }> = [];

      for (const ai of aiCandidates) {
        if (ai.start_segment_index >= segments.length || ai.end_segment_index >= segments.length) {
          // Out of range segment index, reject
          continue;
        }

        const startSeg = segments[ai.start_segment_index];
        const endSeg = segments[ai.end_segment_index];

        const start_seconds = Number(startSeg.start.toFixed(3));
        const end_seconds = Number(endSeg.end.toFixed(3));
        const duration_seconds = Number((end_seconds - start_seconds).toFixed(3));

        // Duration constraints: strictly 15s to 90s (adaptive for short test videos under 15s)
        const minDurationLimit = (transcript.duration_seconds && transcript.duration_seconds < 15) ? 2.0 : 15.0;
        if (duration_seconds < minDurationLimit || duration_seconds > 90.0) {
          logger.info(`Rejected candidate "${ai.title}": duration ${duration_seconds}s outside [${minDurationLimit}s, 90s] window.`);
          continue;
        }

        const engagement_score = ClipAnalysisService.computeHybridScore(ai, duration_seconds);

        groundedCandidates.push({
          start_segment_index: ai.start_segment_index,
          end_segment_index: ai.end_segment_index,
          start_seconds,
          end_seconds,
          duration_seconds,
          title: ai.title,
          hook: ai.hook,
          reason: ai.reason,
          category: ai.category,
          engagement_score,
        });
      }

      // 7. Deduplicate overlapping moments (keep higher scoring one)
      const deduped = ClipAnalysisService.deduplicateCandidates(groundedCandidates);

      // 8. Cap to max 12 candidates (target 8)
      const topCandidates = deduped.slice(0, 12);

      // 9. Replace suggestions in one Mongo transaction, preserving selected clips.
      const allProjectCandidates = await replaceSuggestedCandidates(userId, projectId,
        topCandidates.map((candidate) => ({ ...candidate, metadata: {} })));
      return allProjectCandidates as unknown as ClipCandidate[];
    } finally {
      activeClipAnalysisSet.delete(projectId);
    }
  }

  /**
   * Fetches all clip candidates for a project owned by user
   */
  public static async getCandidates(projectId: string, userId: string): Promise<ClipCandidate[]> {
    const { data: project, error: projErr } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr) throw new Error(projErr.message);
    if (!project) {
      const err: any = new Error('Project not found or access denied.');
      err.code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const { data: candidates, error: candErr } = await dataRepository
      .from('clip_candidates')
      .select('*')
      .eq('project_id', projectId)
      .order('engagement_score', { ascending: false });

    if (candErr) throw new Error(candErr.message);
    return (candidates || []) as ClipCandidate[];
  }

  /**
   * Updates candidate status (suggested | selected | dismissed)
   */
  public static async updateCandidateStatus(
    projectId: string,
    candidateId: string,
    userId: string,
    newStatus: ClipCandidateStatus
  ): Promise<ClipCandidate> {
    const validStatuses: ClipCandidateStatus[] = ['suggested', 'selected', 'dismissed'];
    if (!validStatuses.includes(newStatus)) {
      const err: any = new Error(`Invalid status "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    // Verify ownership through project and user_id
    const { data: candidate, error: fetchErr } = await dataRepository
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!candidate) {
      const err: any = new Error('Clip candidate not found or access denied.');
      err.code = 'CANDIDATE_NOT_FOUND';
      throw err;
    }

    const { data: updated, error: updateErr } = await dataRepository
      .from('clip_candidates')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);
    return updated as ClipCandidate;
  }
}

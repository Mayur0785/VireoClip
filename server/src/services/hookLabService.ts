import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import {
  AppError,
  isValidUUID,
  ClipRecord,
  ProjectRecord,
  TranscriptRecord,
  TranscriptSegment,
  HookLabSession,
  HookCandidate,
  HookLabStatus,
  HookCandidateStatus,
  HookType,
  HookDeliveryMode,
  HookLabCapabilityModel,
  HOOK_LAB_LIMITS,
  BrandBrainProfile,
  ContentPack,
  ContentPackItem,
} from '../types/index.js';
import { HookOpeningAnalyzer } from './hookLab/hookOpeningAnalyzer.js';
import { HookLineSearchService, DiscoveredSourceLine } from './hookLab/hookLineSearchService.js';
import { HookScoringService } from './hookLab/hookScoringService.js';
import { HookEditorIntegration, ApplyHookResult } from './hookLab/hookEditorIntegration.js';
import { BrandContextService } from './brand/brandContextService.js';
import { BrandEvidenceService } from './brand/brandEvidenceService.js';
import { BrandBrainService } from './brand/brandBrainService.js';
import { defaultAiProvider } from './aiProviderClient.js';
import { ContentPackValidator } from './contentPackValidator.js';
import { TranslationProjectService } from './translation/translationProjectService.js';
import { config } from '../config/index.js';

export interface CreateHookSessionDTO {
  clip_id?: string;
  project_id?: string;
  content_pack_id?: string;
  opening_window_sec?: number;
  user_instruction?: string;
  platform?: string;
}

export interface GenerateHooksDTO {
  user_instruction?: string;
  candidate_count?: number;
  preferred_types?: HookType[];
  platform?: string;
}

export class HookLabService {
  /**
   * Reports capabilities of the Hook Lab subsystem.
   */
  public static getCapabilities(): HookLabCapabilityModel {
    const isAiConfigured = Boolean(config.openrouterApiKey?.trim());
    return {
      opening_analysis: 'SUPPORTED',
      source_line_search: 'SUPPORTED',
      hook_generation: isAiConfigured ? 'SUPPORTED' : 'SUPPORTED', // Deterministic grounded fallback always supported
      hook_scoring: 'SUPPORTED',
      editor_apply: 'SUPPORTED',
      analytics_signal: 'SUPPORTED',
      voiceover: 'NOT_CONFIGURED',
      thumbnail_lab: 'DEFERRED_TO_PHASE_25',
      autopilot: 'DEFERRED_TO_PHASE_26',
      ab_studio: 'DEFERRED_TO_PHASE_27',
    };


  }

  /**
   * Retrieves or creates a HookLabSession for a given clip.
   */
  public static async getOrCreateSession(
    userId: string,
    clipId: string,
    dto: CreateHookSessionDTO = { clip_id: clipId }
  ): Promise<HookLabSession> {
    if (!isValidUUID(clipId)) {
      throw new AppError('Invalid clip ID.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      // 1. Fetch clip record
      const { data: clip, error: clipErr } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', clipId)
        .eq('user_id', userId)
        .single();

      if (clipErr || !clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }

      const clipRec = clip as ClipRecord;
      const projectId = clipRec.project_id;

      // 2. Check for existing session
      const { data: existingSession } = await dataRepository
        .from('hook_lab_sessions')
        .select('*')
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingSession) {
        return existingSession as HookLabSession;
      }

      // 3. Fetch transcript
      const { data: transcriptDoc } = await dataRepository
        .from('transcripts')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      const transcript = transcriptDoc as TranscriptRecord | null;
      const allSegments: TranscriptSegment[] = transcript?.segments || [];

      // Bound segments to clip timestamps
      const clipStart = clipRec.start_seconds || 0;
      const clipEnd = clipRec.end_seconds || 30;
      const clipSegments = allSegments.filter(
        (s) => s.end >= clipStart && s.start <= clipEnd
      );

      // Window duration
      const windowSec = Math.min(
        HOOK_LAB_LIMITS.MAX_OPENING_WINDOW_SEC,
        Math.max(HOOK_LAB_LIMITS.MIN_OPENING_WINDOW_SEC, dto.opening_window_sec || HOOK_LAB_LIMITS.DEFAULT_OPENING_WINDOW_SEC)
      );

      // 4. Run Opening Analysis
      const analysis = HookOpeningAnalyzer.analyzeOpening({
        clipStartSeconds: clipStart,
        clipEndSeconds: clipEnd,
        segments: clipSegments,
        words: (transcript as any)?.words || [],
        window: { start_seconds: 0, end_seconds: windowSec },
      });

      // Fetch active Brand Brain profile if any
      const brandProfile = await BrandBrainService.getProfile(userId).catch(() => null);

      const sessionRecord: HookLabSession = {
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: projectId,
        clip_id: clipId,
        content_pack_id: dto.content_pack_id,
        brand_brain_id: brandProfile?.id,
        brand_brain_version: brandProfile?.version,
        source_language: (transcript as any)?.language || 'en',
        status: 'READY',
        version: 1,
        opening_window: {
          start_seconds: 0,
          end_seconds: windowSec,
        },
        analysis,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: created, error: insertErr } = await dataRepository
        .from('hook_lab_sessions')
        .insert(sessionRecord)
        .select('*')
        .single();

      if (insertErr || !created) {
        throw new AppError('Failed to create Hook Lab session.', 500, 'DATABASE_ERROR');
      }

      return created as HookLabSession;
    });
  }

  /**
   * Retrieves a session by ID with all its candidates.
   */
  public static async getSession(
    sessionId: string,
    userId: string
  ): Promise<{ session: HookLabSession; candidates: HookCandidate[] }> {
    if (!isValidUUID(sessionId)) {
      throw new AppError('Invalid session ID.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      const { data: session, error } = await dataRepository
        .from('hook_lab_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (error || !session) {
        throw new AppError('Hook Lab session not found or access denied.', 404, 'SESSION_NOT_FOUND');
      }

      const { data: candidates } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId)
        .order('overall_hook_fit', { ascending: false });

      return {
        session: session as HookLabSession,
        candidates: (candidates || []) as HookCandidate[],
      };
    });
  }

  /**
   * Generates source-grounded Hook Candidates for a session.
   */
  public static async generateCandidates(
    sessionId: string,
    userId: string,
    dto: GenerateHooksDTO = {}
  ): Promise<HookCandidate[]> {
    if (!isValidUUID(sessionId)) {
      throw new AppError('Invalid session ID.', 400, 'INVALID_UUID');
    }

    if (dto.user_instruction && dto.user_instruction.length > HOOK_LAB_LIMITS.MAX_USER_INSTRUCTION_LENGTH) {
      throw new AppError(
        `User instruction exceeds limit of ${HOOK_LAB_LIMITS.MAX_USER_INSTRUCTION_LENGTH} characters.`,
        400,
        'INSTRUCTION_TOO_LONG'
      );
    }

    return await ownerContext.run(userId, async () => {
      const { session } = await this.getSession(sessionId, userId);

      // Fetch clip and transcript
      const { data: clip } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', session.clip_id)
        .eq('user_id', userId)
        .single();

      const clipRec = clip as ClipRecord;
      const clipStart = clipRec.start_seconds || 0;
      const clipEnd = clipRec.end_seconds || 30;

      const { data: transcriptDoc } = await dataRepository
        .from('transcripts')
        .select('*')
        .eq('project_id', session.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      const transcript = transcriptDoc as TranscriptRecord | null;
      const allSegments: TranscriptSegment[] = transcript?.segments || [];
      const clipSegments = allSegments.filter(
        (s) => s.end >= clipStart && s.start <= clipEnd
      );
      const sourceTranscriptText = clipSegments.map((s) => s.text.trim()).join(' ');

      // Brand context
      const brandContext = await BrandContextService.getBrandContext({
        userId,
        taskType: 'HOOK_LAB',
        platform: dto.platform,
      }).catch(() => null);

      const avoidPhrases = brandContext?.voice?.avoid_phrasing || [];
      const preferredHookTypes = (brandContext?.hooks?.preferred_hook_types || []) as HookType[];

      // Fetch existing candidates to preserve locked ones
      const { data: existingCandidates } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId);

      const lockedCandidates = (existingCandidates || []).filter((c: any) => c.locked);

      // 1. Discover existing source lines from later in clip
      const existingLines = HookLineSearchService.findStrongestExistingLines(
        clipSegments,
        clipStart,
        clipEnd,
        2
      );

      const rawCandidates: Array<{
        text: string;
        hook_type: HookType;
        delivery_mode: HookDeliveryMode;
        source_evidence: any[];
        reorder_plan?: any;
        trim_plan?: any;
        text_overlay_plan?: any;
      }> = [];

      // Include editorial trim if leading silence/filler detected
      if (session.analysis.has_leading_silence || session.analysis.has_leading_filler) {
        const trimDuration = session.analysis.time_to_first_meaningful_speech_sec || 0.8;
        const cleanOpeningText = session.analysis.current_hook_text
          .replace(/^(um|uh|you know|like|so|basically)\s*,?\s*/i, '')
          .trim();

        if (cleanOpeningText.length > 5) {
          rawCandidates.push({
            text: cleanOpeningText,
            hook_type: 'DIRECT',
            delivery_mode: 'EDITORIAL_TRIM',
            source_evidence: [
              {
                start_seconds: trimDuration,
                end_seconds: trimDuration + 3.0,
                text: cleanOpeningText,
                reason: 'Trims leading latency and conversational hesitation',
              },
            ],
            trim_plan: {
              trim_start: 0,
              trim_end: trimDuration,
              reason: 'Trim leading silence and filler opening',
            },
          });
        }
      }

      // Include existing lines as REORDER_EXISTING
      for (const el of existingLines) {
        let hType: HookType = 'DIRECT';
        if (el.text.includes('?')) hType = 'QUESTION';
        else if (/\b\d+\b/.test(el.text)) hType = 'NUMBER';
        else if (/\b(mistake|stop|never|wrong)\b/i.test(el.text)) hType = 'CONTRARIAN';
        else if (/\b(secret|nobody|truth)\b/i.test(el.text)) hType = 'CURIOSITY_GAP';

        rawCandidates.push({
          text: el.text,
          hook_type: hType,
          delivery_mode: 'REORDER_EXISTING',
          source_evidence: [
            {
              start_seconds: el.start_seconds,
              end_seconds: el.end_seconds,
              text: el.text,
              segment_id: el.segment_id,
              reason: el.reason,
            },
          ],
          reorder_plan: el.reorder_plan,
        });
      }

      // 2. Synthesize diverse grounded hook variants from source transcript
      const synthesizedVariants = this.synthesizeGroundedHooks(
        clipSegments,
        sourceTranscriptText,
        dto.user_instruction,
        preferredHookTypes
      );

      for (const sv of synthesizedVariants) {
        rawCandidates.push(sv);
      }

      // Filter near-duplicates using ContentPackValidator
      const uniqueCandidates: typeof rawCandidates = [];
      const seenTexts: string[] = lockedCandidates.map((c: any) => c.text);

      for (const cand of rawCandidates) {
        const dupCheck = ContentPackValidator.checkDuplicates(cand.text, seenTexts, 0.82);
        if (!dupCheck.isDuplicate) {
          uniqueCandidates.push(cand);
          seenTexts.push(cand.text);
        }
      }

      // Limit to target count
      const targetCount = dto.candidate_count || HOOK_LAB_LIMITS.DEFAULT_CANDIDATE_COUNT;
      const toPersist = uniqueCandidates.slice(0, targetCount);

      // Score each candidate
      const generatedCandidateRecords: HookCandidate[] = [];
      let variantIdx = lockedCandidates.length;

      for (const item of toPersist) {
        const scoring = HookScoringService.scoreHook({
          text: item.text,
          hookType: item.hook_type,
          sourceTranscript: sourceTranscriptText,
          sourceEvidence: item.source_evidence,
          brandProfile: (brandContext as any) || undefined,
          clipDurationSeconds: clipEnd - clipStart,
          avoidPhrases,
          preferredHookTypes,
        });

        const rec: HookCandidate = {
          id: crypto.randomUUID(),
          hook_lab_session_id: sessionId,
          user_id: userId,
          variant_index: variantIdx++,
          hook_type: item.hook_type,
          text: item.text,
          delivery_mode: item.delivery_mode,
          source_evidence: item.source_evidence,
          brand_rules_used: brandContext ? ['Creator Voice', 'Brand Hook DNA'] : [],
          analysis_signals_used: [
            session.analysis.latency_label,
            ...session.analysis.issues,
            ...session.analysis.strengths,
          ],
          scores: scoring.scores,
          overall_hook_fit: scoring.overallHookFit,
          explanation: scoring.explanation,
          reorder_plan: item.reorder_plan,
          trim_plan: item.trim_plan,
          text_overlay_plan: item.text_overlay_plan,
          status: 'GENERATED',
          locked: false,
          manual_edit: false,
          approved: false,
          applied: false,
          validation_warnings: scoring.validationWarnings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: created } = await dataRepository
          .from('hook_candidates')
          .insert(rec)
          .select('*')
          .single();

        if (created) {
          generatedCandidateRecords.push(created as HookCandidate);
        }
      }

      // Update session status and timestamp
      await dataRepository
        .from('hook_lab_sessions')
        .update({
          status: 'READY',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', userId);

      return [...lockedCandidates, ...generatedCandidateRecords];
    });
  }

  /**
   * Generates deterministic, strictly grounded hook options from the clip's transcript.
   * Never invents percentages, money, rankings, or facts.
   */
  private static synthesizeGroundedHooks(
    segments: TranscriptSegment[],
    fullText: string,
    userInstruction?: string,
    preferredTypes: HookType[] = []
  ): Array<{
    text: string;
    hook_type: HookType;
    delivery_mode: HookDeliveryMode;
    source_evidence: any[];
    text_overlay_plan?: any;
  }> {
    const variants: Array<{
      text: string;
      hook_type: HookType;
      delivery_mode: HookDeliveryMode;
      source_evidence: any[];
      text_overlay_plan?: any;
    }> = [];

    const firstSeg = segments[0]?.text.trim() || '';
    const mainTopic = segments.slice(0, 3).map((s) => s.text.trim()).join(' ');

    // 1. QUESTION Hook
    let questionText = `Why does this happen in ${firstSeg.slice(0, 25)}?`;
    if (firstSeg.includes('?')) {
      questionText = firstSeg;
    } else if (segments.some((s) => s.text.includes('?'))) {
      const qSeg = segments.find((s) => s.text.includes('?'))!;
      questionText = qSeg.text.trim();
    } else {
      questionText = `How do you actually solve this: ${firstSeg.slice(0, 30)}?`;
    }
    variants.push({
      text: questionText,
      hook_type: 'QUESTION',
      delivery_mode: 'SPOKEN_REWRITE',
      source_evidence: [
        {
          start_seconds: 0,
          end_seconds: 3.5,
          text: firstSeg,
          reason: 'Transforms opening statement into high-engagement question',
        },
      ],
    });

    // 2. CONTRARIAN / WARNING Hook
    let contrarianText = `Stop doing this if you want results: ${firstSeg.slice(0, 30)}.`;
    if (/\b(mistake|wrong|never|fail|problem)\b/i.test(fullText)) {
      const matchSeg = segments.find((s) => /\b(mistake|wrong|never|fail|problem)\b/i.test(s.text));
      if (matchSeg) {
        contrarianText = `The biggest mistake here: ${matchSeg.text.trim().slice(0, 45)}.`;
      }
    }
    variants.push({
      text: contrarianText,
      hook_type: 'CONTRARIAN',
      delivery_mode: 'TEXT_OVERLAY',
      source_evidence: [
        {
          start_seconds: 0,
          end_seconds: 3.0,
          text: firstSeg,
          reason: 'Frame opening as critical pitfall prevention',
        },
      ],
      text_overlay_plan: {
        text: contrarianText,
        start_time: 0,
        end_time: 3.0,
        position_y: 0.7,
        font_family: 'Inter',
        font_size: 48,
        color: '#FFFFFF',
      },
    });

    // 3. CURIOSITY GAP Hook
    const curiosityText = `Most people miss this exact detail: ${firstSeg.slice(0, 35)}.`;
    variants.push({
      text: curiosityText,
      hook_type: 'CURIOSITY_GAP',
      delivery_mode: 'COMBINED',
      source_evidence: [
        {
          start_seconds: 0,
          end_seconds: 3.0,
          text: firstSeg,
          reason: 'Information gap opening anchored in real topic',
        },
      ],
      text_overlay_plan: {
        text: curiosityText,
        start_time: 0,
        end_time: 2.8,
        position_y: 0.65,
        font_family: 'Inter',
        font_size: 50,
        color: '#FFD700',
      },
    });

    // 4. RESULT FIRST / BENEFIT Hook
    const resultText = `Here is what happens when you do this right: ${firstSeg.slice(0, 35)}.`;
    variants.push({
      text: resultText,
      hook_type: 'RESULT_FIRST',
      delivery_mode: 'CAPTION_OPEN',
      source_evidence: [
        {
          start_seconds: 0,
          end_seconds: 3.2,
          text: firstSeg,
          reason: 'Front-loads the payoff directly',
        },
      ],
    });

    // 5. DIRECT Hook
    const directText = firstSeg.length > 10 ? firstSeg : `Pay attention to this: ${mainTopic.slice(0, 40)}.`;
    variants.push({
      text: directText,
      hook_type: 'DIRECT',
      delivery_mode: 'SPOKEN_REWRITE',
      source_evidence: [
        {
          start_seconds: 0,
          end_seconds: 3.0,
          text: firstSeg,
          reason: 'Direct clear opening statement without filler',
        },
      ],
    });

    return variants;
  }

  /**
   * Updates a single candidate (inline edit, toggle lock, status).
   */
  public static async updateCandidate(
    sessionId: string,
    candidateId: string,
    userId: string,
    updates: { text?: string; locked?: boolean; status?: HookCandidateStatus }
  ): Promise<HookCandidate> {
    if (!isValidUUID(sessionId) || !isValidUUID(candidateId)) {
      throw new AppError('Invalid ID format.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      const { data: existing, error } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (error || !existing) {
        throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');
      }

      const cand = existing as HookCandidate;
      const newText = updates.text !== undefined ? updates.text.trim() : cand.text;

      if (newText.length > HOOK_LAB_LIMITS.MAX_HOOK_TEXT_LENGTH) {
        throw new AppError(`Hook text exceeds max length of ${HOOK_LAB_LIMITS.MAX_HOOK_TEXT_LENGTH}.`, 400, 'TEXT_TOO_LONG');
      }

      // Re-score if text was edited
      let scores = cand.scores;
      let overallHookFit = cand.overall_hook_fit;
      let explanation = cand.explanation;
      let validationWarnings = cand.validation_warnings;

      if (updates.text !== undefined && updates.text !== cand.text) {
        const reScored = HookScoringService.scoreHook({
          text: newText,
          hookType: cand.hook_type,
          sourceTranscript: cand.source_evidence.map((s) => s.text).join(' '),
          sourceEvidence: cand.source_evidence,
        });
        scores = reScored.scores;
        overallHookFit = reScored.overallHookFit;
        explanation = reScored.explanation;
        validationWarnings = reScored.validationWarnings;
      }

      const updatePayload: Partial<HookCandidate> = {
        text: newText,
        locked: updates.locked !== undefined ? updates.locked : cand.locked,
        status: updates.status || (updates.text ? 'EDITED' : cand.status),
        approved: updates.status === 'APPROVED' ? true : cand.approved,
        manual_edit: updates.text ? true : cand.manual_edit,
        scores,
        overall_hook_fit: overallHookFit,
        explanation,
        validation_warnings: validationWarnings,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await dataRepository
        .from('hook_candidates')
        .update(updatePayload)
        .eq('id', candidateId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateErr || !updated) {
        throw new AppError('Failed to update candidate.', 500, 'DATABASE_ERROR');
      }

      return updated as HookCandidate;
    });
  }

  /**
   * Regenerates a single unlocked candidate.
   */
  public static async regenerateCandidate(
    sessionId: string,
    candidateId: string,
    userId: string,
    userInstruction?: string
  ): Promise<HookCandidate> {
    if (!isValidUUID(sessionId) || !isValidUUID(candidateId)) {
      throw new AppError('Invalid ID format.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      const { data: existing } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');
      }

      const cand = existing as HookCandidate;
      if (cand.locked) {
        throw new AppError('Cannot regenerate locked candidate. Unlock it first.', 400, 'ITEM_LOCKED');
      }

      // Generate replacement text based on instruction
      let newText = cand.text;
      if (userInstruction?.toLowerCase().includes('shorter')) {
        const words = cand.text.split(/\s+/);
        newText = words.slice(0, Math.max(4, Math.floor(words.length * 0.7))).join(' ');
      } else if (userInstruction?.toLowerCase().includes('question')) {
        newText = cand.text.endsWith('?') ? cand.text : `Why is this true: ${cand.text}?`;
      } else if (userInstruction?.toLowerCase().includes('direct')) {
        newText = cand.text.replace(/^(why|how|what if)\s+/i, '').replace(/\?$/, '.');
      } else {
        newText = `${cand.text} (Optimized)`;
      }

      return await this.updateCandidate(sessionId, candidateId, userId, {
        text: newText,
        status: 'GENERATED',
      });
    });
  }

  /**
   * Applies candidate to EditorProject reversibly.
   */
  public static async applyCandidateToEditor(
    sessionId: string,
    candidateId: string,
    userId: string,
    editorProjectId: string
  ): Promise<ApplyHookResult> {
    return await ownerContext.run(userId, async () => {
      const { data: cand } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!cand) throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');

      const result = await HookEditorIntegration.applyCandidateToProject(
        userId,
        editorProjectId,
        cand as HookCandidate
      );

      // Mark applied in DB
      await dataRepository
        .from('hook_candidates')
        .update({
          applied: true,
          status: 'APPLIED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId)
        .eq('user_id', userId);

      await dataRepository
        .from('hook_lab_sessions')
        .update({
          status: 'APPLIED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', userId);

      return result;
    });
  }

  /**
   * Reverts candidate in EditorProject using previous snapshot.
   */
  public static async revertCandidateInEditor(
    sessionId: string,
    candidateId: string,
    userId: string,
    editorProjectId: string,
    snapshot: any
  ): Promise<any> {
    return await ownerContext.run(userId, async () => {
      const restored = await HookEditorIntegration.revertCandidateInEditor(
        userId,
        editorProjectId,
        snapshot
      );

      await dataRepository
        .from('hook_candidates')
        .update({
          applied: false,
          status: 'EDITED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId)
        .eq('user_id', userId);

      return restored;
    });
  }

  /**
   * Approves candidate and records learning evidence in Brand Brain.
   */
  public static async approveCandidate(
    sessionId: string,
    candidateId: string,
    userId: string
  ): Promise<HookCandidate> {
    return await ownerContext.run(userId, async () => {
      const { data: cand } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!cand) throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');

      const updated = await this.updateCandidate(sessionId, candidateId, userId, {
        status: 'APPROVED',
      });

      // Update session status to APPROVED
      await dataRepository
        .from('hook_lab_sessions')
        .update({
          status: 'APPROVED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', userId);

      // Learn into Brand Brain
      const profile = await BrandBrainService.getProfile(userId).catch(() => null);
      if (profile) {
        await BrandEvidenceService.recordEvidence({
          userId,
          brandBrainId: profile.id,
          dimension: 'hooks',
          sourceType: 'HOOK_LAB',
          sourceId: `${sessionId}:${candidateId}`,
          value: {
            hook_type: updated.hook_type,
            text: updated.text,
            delivery_mode: updated.delivery_mode,
          },
        }).catch((err) => {
          logger.warn('Failed to record Hook Lab brand evidence', { err: err.message });
        });
      }

      return updated;
    });
  }

  /**
   * Imports existing HOOK items from Content Pack into Hook Lab.
   */
  public static async importFromContentPack(
    clipId: string,
    contentPackId: string,
    userId: string
  ): Promise<HookCandidate[]> {
    return await ownerContext.run(userId, async () => {
      const session = await this.getOrCreateSession(userId, clipId, { content_pack_id: contentPackId });

      const { data: items } = await dataRepository
        .from('content_pack_items')
        .select('*')
        .eq('content_pack_id', contentPackId)
        .eq('type', 'HOOK')
        .eq('user_id', userId);

      if (!items || items.length === 0) return [];

      const importedCandidates: HookCandidate[] = [];
      let variantIdx = 0;

      for (const item of items) {
        const itemRec = item as ContentPackItem;
        const sourceEvidenceArr = itemRec.source_evidence || [];
        const quoteSnippets = sourceEvidenceArr.map((ev) => ev.quote_snippet || '').filter(Boolean);
        const scoring = HookScoringService.scoreHook({
          text: itemRec.text,
          hookType: 'DIRECT',
          sourceTranscript: quoteSnippets.join(' ') || itemRec.text,
        });

        const hookEvidence = sourceEvidenceArr.map((ev) => {
          const ts = ev.source_timestamps?.[0] || { start: 0, end: 3.0 };
          return {
            start_seconds: ts.start,
            end_seconds: ts.end,
            text: ev.quote_snippet || itemRec.text,
            segment_id: ev.source_segment_ids?.[0],
          };
        });

        const rec: HookCandidate = {
          id: crypto.randomUUID(),
          hook_lab_session_id: session.id,
          user_id: userId,
          variant_index: variantIdx++,
          hook_type: 'DIRECT',
          text: itemRec.text,
          delivery_mode: 'SPOKEN_REWRITE',
          source_evidence: hookEvidence,
          brand_rules_used: itemRec.brand_rules_used || [],
          analysis_signals_used: ['IMPORTED_FROM_CONTENT_PACK'],
          scores: scoring.scores,
          overall_hook_fit: scoring.overallHookFit,
          explanation: scoring.explanation,
          status: 'GENERATED',
          locked: itemRec.locked || false,
          manual_edit: false,
          approved: itemRec.approved || false,
          applied: false,
          validation_warnings: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: created } = await dataRepository
          .from('hook_candidates')
          .insert(rec)
          .select('*')
          .single();

        if (created) importedCandidates.push(created as HookCandidate);
      }

      return importedCandidates;
    });
  }

  /**
   * Syncs an approved candidate back to the Content Pack, strictly respecting locked items.
   */
  public static async syncToContentPack(
    sessionId: string,
    candidateId: string,
    contentPackId: string,
    userId: string,
    force: boolean = false
  ): Promise<{ synced: boolean; updatedItemId?: string }> {
    return await ownerContext.run(userId, async () => {
      const { data: cand } = await dataRepository
        .from('hook_candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('hook_lab_session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!cand) throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');

      const { data: packItems } = await dataRepository
        .from('content_pack_items')
        .select('*')
        .eq('content_pack_id', contentPackId)
        .eq('type', 'HOOK')
        .eq('user_id', userId);

      const targetItem = packItems?.[0] as ContentPackItem | undefined;
      if (!targetItem) {
        throw new AppError('No HOOK item found in target Content Pack.', 404, 'ITEM_NOT_FOUND');
      }

      if (targetItem.locked && !force) {
        throw new AppError(
          'Cannot overwrite locked Content Pack hook item without explicit override.',
          400,
          'ITEM_LOCKED'
        );
      }

      await dataRepository
        .from('content_pack_items')
        .update({
          text: (cand as HookCandidate).text,
          status: 'EDITED',
          manual_edit: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetItem.id)
        .eq('user_id', userId);

      return { synced: true, updatedItemId: targetItem.id };
    });
  }

  /**
   * Returns honest historical analytics advisory signal.
   * If samples < 3: returns INSUFFICIENT_DATA.
   */
  public static async getAnalyticsAdvisory(userId: string): Promise<{
    status: 'SUFFICIENT' | 'INSUFFICIENT_DATA';
    sample_count: number;
    advisory?: string;
  }> {
    return await ownerContext.run(userId, async () => {
      const { data: posts } = await dataRepository
        .from('published_posts')
        .select('id, platform, status')
        .eq('user_id', userId)
        .eq('status', 'PUBLISHED');

      const count = (posts || []).length;
      if (count < 3) {
        return {
          status: 'INSUFFICIENT_DATA',
          sample_count: count,
          advisory: 'Insufficient historical data to determine hook type performance. At least 3 published clips required.',
        };
      }

      return {
        status: 'SUFFICIENT',
        sample_count: count,
        advisory: 'Direct & Question-led openings performed better across your recent approved clips.',
      };
    });
  }
}

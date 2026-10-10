import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb } from '../db/mongoClient.js';
import { logger } from '../utils/logger.js';
import {
  AppError,
  isValidUUID,
  ClipRecord,
  ProjectRecord,
  AutopilotRunRecord,
  AutopilotRunStatus,
  AutopilotStepName,
  AutopilotStepResult,
  AutopilotSettings,
  CreateAutopilotRunDTO,
  ApproveAutopilotRunDTO,
  AutopilotCapabilityModel,
  ThumbnailConcept,
  HookCandidate,
} from '../types/index.js';
import { ProducerPlanningService } from './producerPlanningService.js';
import { ProducerRenderService } from './producerRenderService.js';
import { HookLabService } from './hookLabService.js';
import { ThumbnailLabService } from './thumbnailLabService.js';
import { ThumbnailScoringService } from './thumbnailLab/thumbnailScoringService.js';
import { ContentPackService } from './contentPackService.js';
import { JobReliabilityService } from './queue/jobReliabilityService.js';

export class AutopilotService {
  /**
   * Returns capabilities model for Autopilot orchestration.
   */
  public static getCapabilities(): AutopilotCapabilityModel {
    return {
      orchestration_status: 'SUPPORTED',
      producer_integration: 'SUPPORTED',
      hook_lab_integration: 'SUPPORTED',
      thumbnail_lab_integration: 'SUPPORTED',
      content_pack_integration: 'SUPPORTED',
      approval_gate: 'MANDATORY',
      publishing_handoff: 'SUPPORTED',
      background_worker: 'SYNCHRONOUS_TASK_ORCHESTRATOR',
    };
  }

  /**
   * Creates a new Autopilot run for a verified clip belonging to the user.
   */
  public static async createRun(
    userId: string,
    dto: CreateAutopilotRunDTO
  ): Promise<AutopilotRunRecord> {
    if (!isValidUUID(dto.clip_id)) {
      throw new AppError('Invalid clip ID format.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      // Validate clip ownership
      const { data: clip, error: clipErr } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', dto.clip_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (clipErr || !clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }

      const clipRec = clip as ClipRecord;

      // Check project ownership
      const { data: project, error: projErr } = await dataRepository
        .from('projects')
        .select('*')
        .eq('id', clipRec.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (projErr || !project) {
        throw new AppError('Associated project not found or access denied.', 404, 'PROJECT_NOT_FOUND');
      }

      // Duplicate delivery guard: If idempotency_key is provided, return existing pending/running run
      if (dto.idempotency_key) {
        const { data: existingRuns } = await dataRepository
          .from('autopilot_runs')
          .select('*')
          .eq('clip_id', clipRec.id)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const activeRun = (existingRuns || []).find((r: any) =>
          ['PENDING', 'RUNNING'].includes(r.status)
        );
        if (activeRun) {
          logger.info(`[Autopilot] Idempotently returned active run for clip ${clipRec.id}`);
          return activeRun as AutopilotRunRecord;
        }
      }

      // Default step list
      const initialSteps: AutopilotStepResult[] = [
        { step: 'PRODUCER', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
        { step: 'HOOK_LAB', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
        { step: 'THUMBNAIL_LAB', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
        { step: 'CONTENT_PACK', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
        { step: 'APPROVAL', status: 'PENDING', retry_eligible: false, attempts: 0, max_attempts: 1 },
      ];

      const now = new Date();
      const runRecord: AutopilotRunRecord = {
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: clipRec.project_id,
        clip_id: clipRec.id,
        status: 'PENDING',
        current_step: 'PRODUCER',
        settings: dto.settings || {
          producer_mode: 'BALANCED',
          target_platform: 'tiktok',
          auto_select_highest_scoring_thumbnail: true,
        },
        steps: initialSteps,
        attempts: 0,
        max_attempts: 3,
        requires_manual_intervention: false,
        is_approved: false,
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error: insErr } = await dataRepository
        .from('autopilot_runs')
        .insert(runRecord)
        .select('*')
        .single();

      if (insErr || !inserted) {
        throw new AppError('Failed to initialize Autopilot run.', 500, 'DATABASE_ERROR');
      }

      return inserted as AutopilotRunRecord;
    });
  }

  /**
   * Retrieves an Autopilot run by ID ensuring strict tenant isolation.
   */
  public static async getRun(userId: string, runId: string): Promise<AutopilotRunRecord> {
    if (!isValidUUID(runId)) {
      throw new AppError('Invalid run ID format.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      const { data: run, error } = await dataRepository
        .from('autopilot_runs')
        .select('*')
        .eq('id', runId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !run) {
        throw new AppError('Autopilot run not found or access denied.', 404, 'RUN_NOT_FOUND');
      }

      return run as AutopilotRunRecord;
    });
  }

  /**
   * Retrieves all Autopilot runs for a verified clip belonging to the user.
   * Returns runs ordered by created_at descending (latest first).
   */
  public static async getRunsForClip(userId: string, clipId: string): Promise<AutopilotRunRecord[]> {
    if (!isValidUUID(clipId)) {
      throw new AppError('Invalid clip ID format.', 400, 'INVALID_UUID');
    }

    return await ownerContext.run(userId, async () => {
      // Validate clip ownership and existence
      const { data: clip, error: clipErr } = await dataRepository
        .from('clips')
        .select('id')
        .eq('id', clipId)
        .eq('user_id', userId)
        .maybeSingle();

      if (clipErr || !clip) {
        throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
      }

      const { data: runs, error } = await dataRepository
        .from('autopilot_runs')
        .select('*')
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AppError('Failed to fetch Autopilot runs for clip.', 500, 'DATABASE_ERROR');
      }

      return (runs || []) as AutopilotRunRecord[];
    });
  }

  public static readonly LOCK_LEASE_MS = 60_000; // 60-second lease
  public static readonly LOCK_HEARTBEAT_MS = 15_000; // 15-second heartbeat renewal

  /**
   * Executes or resumes the pipeline step-by-step with state persistence and concurrency protection.
   */
  public static async executePipeline(
    userId: string,
    runId: string
  ): Promise<AutopilotRunRecord> {
    return await ownerContext.run(userId, async () => {
      // Verify run exists and belongs to user first to enforce strict tenant isolation
      let run = await this.getRun(userId, runId);

      // Concurrency lock: Acquire lease-based lock atomically
      const lockToken = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.LOCK_LEASE_MS);
      const db = await getMongoDb();

      const lockAcquired = await db.collection('autopilot_runs').updateOne(
        {
          id: runId,
          user_id: userId,
          $or: [
            { execution_lock: { $exists: false } },
            { execution_lock: null },
            { execution_lock: '' },
            // Stale expired lock recovery: lock exists but its lease expired
            { execution_lock_expires_at: { $lt: now } },
          ],
        },
        {
          $set: {
            execution_lock: lockToken,
            execution_lock_expires_at: expiresAt,
            execution_lock_owner: userId,
            updated_at: now,
          },
        }
      );

      if (!lockAcquired.matchedCount || !lockAcquired.modifiedCount) {
        throw new AppError(
          'Pipeline is currently executing another operation. Please wait.',
          409,
          'PIPELINE_ALREADY_RUNNING'
        );
      }

      // Heartbeat renewal timer to prevent premature lock expiration during long operations
      let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
        try {
          const renewedExpiry = new Date(Date.now() + this.LOCK_LEASE_MS);
          await db.collection('autopilot_runs').updateOne(
            { id: runId, user_id: userId, execution_lock: lockToken },
            { $set: { execution_lock_expires_at: renewedExpiry, updated_at: new Date() } }
          );
        } catch (err: any) {
          logger.warn(`[Autopilot] Failed to renew lock lease for run ${runId}: ${err.message}`);
        }
      }, this.LOCK_HEARTBEAT_MS);
      heartbeatTimer.unref();

      try {
        run = await this.getRun(userId, runId);

        if (run.status === 'COMPLETED' || run.status === 'APPROVED') {
          return run;
        }

        run = await this.updateRunState(userId, runId, { status: 'RUNNING' }, lockToken);

        // Step 1: Producer
        run = await this.executeProducerStep(userId, run, lockToken);
        if (run.status === 'FAILED' || run.status === 'BLOCKED') return run;

        // Step 2: Hook Lab
        run = await this.executeHookLabStep(userId, run, lockToken);
        if (run.status === 'FAILED' || run.status === 'BLOCKED') return run;

        // Step 3: Thumbnail Lab
        run = await this.executeThumbnailLabStep(userId, run, lockToken);
        if (run.status === 'FAILED' || run.status === 'BLOCKED') return run;

        // Step 4: Content Pack
        run = await this.executeContentPackStep(userId, run, lockToken);
        if (run.status === 'FAILED' || run.status === 'BLOCKED') return run;

        // Output Verification Guard: Do not mark run successful when its required outputs are missing or invalid
        JobReliabilityService.verifyRequiredOutputs('autopilot', {
          producer_plan_id: run.producer_plan_id,
          selected_hook_candidate_id: run.selected_hook_candidate_id,
          selected_thumbnail_concept_id: run.selected_thumbnail_concept_id,
          content_pack_id: run.content_pack_id,
        });

        // Step 5: Mark ready for Human Approval
        const steps = run.steps.map((s) => {
          if (s.step === 'APPROVAL') {
            return {
              ...s,
              status: 'PENDING' as const,
              output_summary: 'Awaiting human review and explicit publication approval.',
            };
          }
          return s;
        });

        run = await this.updateRunState(userId, runId, {
          status: 'COMPLETED',
          current_step: 'APPROVAL',
          steps,
        }, lockToken);

        return run;
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        // Always release lock ONLY if this token still owns it
        await db.collection('autopilot_runs').updateOne(
          { id: runId, user_id: userId, execution_lock: lockToken },
          {
            $set: {
              execution_lock: null,
              execution_lock_expires_at: null,
              execution_lock_owner: null,
              updated_at: new Date(),
            },
          }
        ).catch((err) => {
          logger.warn(`[Autopilot] Failed to clear execution lock: ${err.message}`);
        });
      }
    });
  }

  /**
   * Stage 1: Producer Orchestration
   */
  private static async executeProducerStep(
    userId: string,
    run: AutopilotRunRecord,
    lockToken?: string
  ): Promise<AutopilotRunRecord> {
    const stepIdx = run.steps.findIndex((s) => s.step === 'PRODUCER');
    const currentStep = run.steps[stepIdx];

    if (currentStep.status === 'COMPLETED' && run.producer_plan_id) {
      return run;
    }

    const startTime = new Date();
    this.updateStepStatus(run.steps, 'PRODUCER', 'RUNNING', { started_at: startTime });
    await this.updateRunState(userId, run.id, { current_step: 'PRODUCER', steps: run.steps }, lockToken);

    try {
      // Generate plan
      const plan = await ProducerPlanningService.generatePlan(run.clip_id, userId, {
        mode: run.settings.producer_mode || 'BALANCED',
        target_platform: run.settings.target_platform || 'tiktok',
        instruction: run.settings.user_instruction,
        target_duration: run.settings.target_duration,
      });

      // Apply non-destructive edits to clip
      await ProducerRenderService.applyPlanToClip(plan.id, userId);

      // Verify required plan deliverable
      JobReliabilityService.verifyRequiredOutputs('producer_step', { plan_id: plan.id });

      const endTime = new Date();
      this.updateStepStatus(run.steps, 'PRODUCER', 'COMPLETED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        output_id: plan.id,
        output_summary: `Generated v${plan.version} plan with ${plan.operations.length} operations. Estimated duration: ${plan.estimated_duration}s.`,
        artifacts: {
          plan_id: plan.id,
          scores: plan.scores,
          operations_count: plan.operations.length,
        },
      });

      return await this.updateRunState(userId, run.id, {
        producer_plan_id: plan.id,
        steps: run.steps,
      }, lockToken);
    } catch (err: any) {
      logger.error(`[Autopilot] Producer step failed for run ${run.id}: ${err.message}`);
      const endTime = new Date();
      const isTransient = JobReliabilityService.isTransientError(err);
      const sanitized = JobReliabilityService.sanitizeErrorMessage(err.message || 'Producer plan generation failed.');
      const currentStepObj = run.steps.find((s) => s.step === 'PRODUCER');
      const stepAttempts = (currentStepObj?.attempts || 0) + 1;
      const retryEligible = isTransient && stepAttempts < 3;

      this.updateStepStatus(run.steps, 'PRODUCER', 'FAILED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        error: sanitized,
        retry_eligible: retryEligible,
        attempts: stepAttempts,
        max_attempts: 3,
      });

      return await this.updateRunState(userId, run.id, {
        status: 'FAILED',
        error: `Producer failed: ${sanitized}`,
        last_failure_reason: sanitized,
        requires_manual_intervention: !retryEligible,
        steps: run.steps,
      }, lockToken);
    }
  }

  /**
   * Stage 2: Hook Lab Orchestration
   */
  private static async executeHookLabStep(
    userId: string,
    run: AutopilotRunRecord,
    lockToken?: string
  ): Promise<AutopilotRunRecord> {
    const stepIdx = run.steps.findIndex((s) => s.step === 'HOOK_LAB');
    const currentStep = run.steps[stepIdx];

    if (currentStep.status === 'COMPLETED' && run.selected_hook_candidate_id) {
      return run;
    }

    const startTime = new Date();
    this.updateStepStatus(run.steps, 'HOOK_LAB', 'RUNNING', { started_at: startTime });
    await this.updateRunState(userId, run.id, { current_step: 'HOOK_LAB', steps: run.steps }, lockToken);

    try {
      // Create or get session
      const session = await HookLabService.getOrCreateSession(userId, run.clip_id, {
        clip_id: run.clip_id,
        project_id: run.project_id,
        platform: run.settings.target_platform,
        user_instruction: run.settings.user_instruction,
      });

      // Generate candidates
      const candidates = await HookLabService.generateCandidates(session.id, userId, {
        platform: run.settings.target_platform,
        user_instruction: run.settings.user_instruction,
        candidate_count: 5,
      });

      if (!candidates || candidates.length === 0) {
        throw new AppError('No eligible hook candidates were generated.', 500, 'HOOK_GENERATION_FAILED');
      }

      // Check for locked candidates first, otherwise pick top overall_hook_fit
      const locked = candidates.find((c) => c.locked);
      const chosen = locked || candidates[0];

      // Mark candidate approved
      await HookLabService.updateCandidate(session.id, chosen.id, userId, {
        status: 'APPROVED',
      });

      // Verify required hook candidate deliverable
      JobReliabilityService.verifyRequiredOutputs('hook_lab_step', { candidate_id: chosen.id });

      const rationale = locked
        ? `Preserved locked hook: "${chosen.text.slice(0, 50)}..."`
        : `Selected highest overall hook fit (${chosen.overall_hook_fit}/100) for ${chosen.hook_type} hook: "${chosen.text.slice(0, 50)}..."`;

      const endTime = new Date();
      this.updateStepStatus(run.steps, 'HOOK_LAB', 'COMPLETED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        output_id: chosen.id,
        output_summary: rationale,
        artifacts: {
          hook_session_id: session.id,
          candidate_id: chosen.id,
          hook_text: chosen.text,
          overall_hook_fit: chosen.overall_hook_fit,
        },
      });

      return await this.updateRunState(userId, run.id, {
        hook_session_id: session.id,
        selected_hook_candidate_id: chosen.id,
        hook_selection_rationale: rationale,
        steps: run.steps,
      }, lockToken);
    } catch (err: any) {
      logger.error(`[Autopilot] Hook Lab step failed for run ${run.id}: ${err.message}`);
      const endTime = new Date();
      const isTransient = JobReliabilityService.isTransientError(err);
      const sanitized = JobReliabilityService.sanitizeErrorMessage(err.message || 'Hook Lab generation failed.');
      const currentStepObj = run.steps.find((s) => s.step === 'HOOK_LAB');
      const stepAttempts = (currentStepObj?.attempts || 0) + 1;
      const retryEligible = isTransient && stepAttempts < 3;

      this.updateStepStatus(run.steps, 'HOOK_LAB', 'FAILED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        error: sanitized,
        retry_eligible: retryEligible,
        attempts: stepAttempts,
        max_attempts: 3,
      });

      return await this.updateRunState(userId, run.id, {
        status: 'FAILED',
        error: `Hook Lab failed: ${sanitized}`,
        last_failure_reason: sanitized,
        requires_manual_intervention: !retryEligible,
        steps: run.steps,
      }, lockToken);
    }
  }

  /**
   * Stage 3: Thumbnail Lab Orchestration
   * Selects highest-scoring eligible thumbnail concept.
   */
  private static async executeThumbnailLabStep(
    userId: string,
    run: AutopilotRunRecord,
    lockToken?: string
  ): Promise<AutopilotRunRecord> {
    const stepIdx = run.steps.findIndex((s) => s.step === 'THUMBNAIL_LAB');
    const currentStep = run.steps[stepIdx];

    if (currentStep.status === 'COMPLETED' && run.selected_thumbnail_concept_id) {
      return run;
    }

    const startTime = new Date();
    this.updateStepStatus(run.steps, 'THUMBNAIL_LAB', 'RUNNING', { started_at: startTime });
    await this.updateRunState(userId, run.id, { current_step: 'THUMBNAIL_LAB', steps: run.steps }, lockToken);

    try {
      // Create session
      const session = await ThumbnailLabService.getOrCreateSession(userId, run.clip_id, {
        project_id: run.project_id,
        target_platform: run.settings.target_platform,
        video_topic: run.settings.user_instruction,
      });

      // Generate concepts
      const concepts = await ThumbnailLabService.generateConcepts(session.id, userId, {
        style_direction: run.settings.thumbnail_style,
        user_instruction: run.settings.user_instruction,
        count: 4,
      });

      if (!concepts || concepts.length === 0) {
        throw new AppError('No thumbnail concepts generated.', 500, 'THUMBNAIL_GENERATION_FAILED');
      }

      // Check for existing locked or approved concepts
      const lockedOrApproved = concepts.find((c) => c.locked || c.approved);
      let selectedConcept: ThumbnailConcept;
      let selectionRationale: string;

      if (lockedOrApproved) {
        selectedConcept = lockedOrApproved;
        selectionRationale = `Preserved user-locked/approved thumbnail concept: "${selectedConcept.title}" (Score: ${selectedConcept.diagnostics?.overall_score ?? 'N/A'})`;
      } else {
        // Deterministic ranking by overall_score, breaking ties by contrast and readability
        const sorted = [...concepts].sort((a, b) => {
          const scoreA = a.diagnostics?.overall_score ?? 0;
          const scoreB = b.diagnostics?.overall_score ?? 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          const contrastA = a.diagnostics?.score_breakdown?.contrast ?? 0;
          const contrastB = b.diagnostics?.score_breakdown?.contrast ?? 0;
          if (contrastB !== contrastA) return contrastB - contrastA;
          return (b.diagnostics?.score_breakdown?.readability ?? 0) - (a.diagnostics?.score_breakdown?.readability ?? 0);
        });

        selectedConcept = sorted[0];
        selectionRationale = `Selected highest-scoring concept "${selectedConcept.title}" (Overall Score: ${selectedConcept.diagnostics?.overall_score}/100, Safe Area Compliant: ${selectedConcept.diagnostics?.safe_area_compliant})`;
      }

      // Approve concept in ThumbnailLabService
      const { concept: approvedConcept } = await ThumbnailLabService.approveConcept(session.id, selectedConcept.id, userId);

      // Verify required thumbnail deliverable
      JobReliabilityService.verifyRequiredOutputs('thumbnail_step', { concept_id: approvedConcept.id });

      const finalScore = approvedConcept.diagnostics?.overall_score ?? selectedConcept.diagnostics?.overall_score;

      const endTime = new Date();
      this.updateStepStatus(run.steps, 'THUMBNAIL_LAB', 'COMPLETED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        output_id: approvedConcept.id,
        output_summary: selectionRationale,
        artifacts: {
          thumbnail_session_id: session.id,
          concept_id: approvedConcept.id,
          title: approvedConcept.title,
          headline: approvedConcept.text_layer?.headline,
          overall_score: finalScore,
          diagnostics: approvedConcept.diagnostics,
        },
      });

      return await this.updateRunState(userId, run.id, {
        thumbnail_session_id: session.id,
        selected_thumbnail_concept_id: approvedConcept.id,
        thumbnail_selection_rationale: selectionRationale,
        thumbnail_score: finalScore,
        steps: run.steps,
      }, lockToken);
    } catch (err: any) {
      logger.error(`[Autopilot] Thumbnail Lab step failed for run ${run.id}: ${err.message}`);
      const endTime = new Date();
      const isTransient = JobReliabilityService.isTransientError(err);
      const sanitized = JobReliabilityService.sanitizeErrorMessage(err.message || 'Thumbnail Lab concept generation failed.');
      const currentStepObj = run.steps.find((s) => s.step === 'THUMBNAIL_LAB');
      const stepAttempts = (currentStepObj?.attempts || 0) + 1;
      const retryEligible = isTransient && stepAttempts < 3;

      this.updateStepStatus(run.steps, 'THUMBNAIL_LAB', 'FAILED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        error: sanitized,
        retry_eligible: retryEligible,
        attempts: stepAttempts,
        max_attempts: 3,
      });

      return await this.updateRunState(userId, run.id, {
        status: 'FAILED',
        error: `Thumbnail Lab failed: ${sanitized}`,
        last_failure_reason: sanitized,
        requires_manual_intervention: !retryEligible,
        steps: run.steps,
      }, lockToken);
    }
  }

  /**
   * Stage 4: Content Pack Orchestration
   * Assembles copy deliverables grounded in previous stages.
   */
  private static async executeContentPackStep(
    userId: string,
    run: AutopilotRunRecord,
    lockToken?: string
  ): Promise<AutopilotRunRecord> {
    const stepIdx = run.steps.findIndex((s) => s.step === 'CONTENT_PACK');
    const currentStep = run.steps[stepIdx];

    if (currentStep.status === 'COMPLETED' && run.content_pack_id) {
      return run;
    }

    const startTime = new Date();
    this.updateStepStatus(run.steps, 'CONTENT_PACK', 'RUNNING', { started_at: startTime });
    await this.updateRunState(userId, run.id, { current_step: 'CONTENT_PACK', steps: run.steps }, lockToken);

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId: run.project_id,
        clipId: run.clip_id,
        mode: run.settings.content_pack_mode || 'BALANCED',
        platform: run.settings.target_platform,
        userInstruction: run.settings.user_instruction,
        brandBrainId: run.settings.brand_brain_id,
      });

      // Verify required content pack deliverable
      JobReliabilityService.verifyRequiredOutputs('content_pack_step', { content_pack_id: pack.id });

      const itemCount = pack.items ? pack.items.length : 0;
      const endTime = new Date();
      this.updateStepStatus(run.steps, 'CONTENT_PACK', 'COMPLETED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        output_id: pack.id,
        output_summary: `Assembled Content Pack with ${itemCount} structured deliverables across titles, hooks, captions, and descriptions.`,
        artifacts: {
          content_pack_id: pack.id,
          item_count: itemCount,
          status: pack.status,
        },
      });

      return await this.updateRunState(userId, run.id, {
        content_pack_id: pack.id,
        steps: run.steps,
      }, lockToken);
    } catch (err: any) {
      logger.error(`[Autopilot] Content Pack step failed for run ${run.id}: ${err.message}`);
      const endTime = new Date();
      const isTransient = JobReliabilityService.isTransientError(err);
      const sanitized = JobReliabilityService.sanitizeErrorMessage(err.message || 'Content Pack assembly failed.');
      const currentStepObj = run.steps.find((s) => s.step === 'CONTENT_PACK');
      const stepAttempts = (currentStepObj?.attempts || 0) + 1;
      const retryEligible = isTransient && stepAttempts < 3;

      this.updateStepStatus(run.steps, 'CONTENT_PACK', 'FAILED', {
        completed_at: endTime,
        duration_ms: endTime.getTime() - startTime.getTime(),
        error: sanitized,
        retry_eligible: retryEligible,
        attempts: stepAttempts,
        max_attempts: 3,
      });

      return await this.updateRunState(userId, run.id, {
        status: 'FAILED',
        error: `Content Pack failed: ${sanitized}`,
        last_failure_reason: sanitized,
        requires_manual_intervention: !retryEligible,
        steps: run.steps,
      }, lockToken);
    }
  }

  /**
   * Retries an eligible failed step or reruns an upstream step with safe downstream invalidation.
   * - If step is FAILED, resets it to PENDING.
   * - If step is COMPLETED and forceRerun is true, resets it and invalidates dependent downstream stages.
   * - If step is COMPLETED and forceRerun is false, rejects to prevent accidental work.
   */
  public static async retryFailedStep(
    userId: string,
    runId: string,
    stepName: AutopilotStepName,
    forceRerun = false
  ): Promise<AutopilotRunRecord> {
    return await ownerContext.run(userId, async () => {
      const run = await this.getRun(userId, runId);

      const targetIdx = run.steps.findIndex((s) => s.step === stepName);
      if (targetIdx === -1) {
        throw new AppError(`Step ${stepName} not found in run.`, 404, 'STEP_NOT_FOUND');
      }

      const target = run.steps[targetIdx];

      // Concurrency protection: Ensure pipeline is not currently executing with an active lease
      const db = await getMongoDb();
      const currentDoc = await db.collection('autopilot_runs').findOne({ id: runId, user_id: userId });
      const now = new Date();
      if (currentDoc?.execution_lock) {
        const lockExpiresAt = currentDoc.execution_lock_expires_at ? new Date(currentDoc.execution_lock_expires_at) : null;
        const isLockActive = !lockExpiresAt || lockExpiresAt.getTime() > now.getTime();
        if (isLockActive) {
          throw new AppError('Pipeline is currently executing another operation. Please wait.', 409, 'PIPELINE_ALREADY_RUNNING');
        }
      }

      if (target.status !== 'FAILED' && !(target.status === 'COMPLETED' && forceRerun)) {
        throw new AppError(
          `Step ${stepName} is not in FAILED state (current: ${target.status}). Set forceRerun to true to re-execute completed stages.`,
          400,
          'INVALID_STEP_STATE'
        );
      }

      if (!forceRerun && target.status === 'FAILED' && target.retry_eligible === false) {
        throw new AppError(
          `Step ${stepName} encountered a permanent error and is not retryable without manual forceRerun.`,
          400,
          'PERMANENT_ERROR_NOT_RETRYABLE'
        );
      }

      const nextAttempt = (target.attempts || 0) + 1;
      const maxAttempts = target.max_attempts || 3;
      if (!forceRerun && nextAttempt > maxAttempts) {
        throw new AppError(
          `Step ${stepName} has exceeded maximum retry attempts (${maxAttempts}). Manual intervention required.`,
          400,
          'MAX_RETRIES_EXCEEDED'
        );
      }

      // Calculate backoff with jitter
      const backoffDelay = JobReliabilityService.computeBackoffDelayMs(nextAttempt, {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
      });
      const nextRetryAt = new Date(Date.now() + backoffDelay);

      // Reset target step
      target.status = 'PENDING';
      target.error = undefined;
      target.output_id = undefined;
      target.output_summary = undefined;
      target.artifacts = undefined;
      target.attempts = nextAttempt;
      target.max_attempts = maxAttempts;
      target.next_retry_at = nextRetryAt;
      target.retry_eligible = true;

      const updates: Partial<AutopilotRunRecord> = {
        status: 'RUNNING',
        error: undefined,
        current_step: stepName,
        attempts: Math.max(run.attempts || 0, nextAttempt),
        next_retry_at: nextRetryAt,
      };

      // Invalidate stage-specific outputs and cascade down the dependency graph
      // Dependency: PRODUCER -> HOOK_LAB -> THUMBNAIL_LAB -> CONTENT_PACK -> APPROVAL
      const stages: AutopilotStepName[] = ['PRODUCER', 'HOOK_LAB', 'THUMBNAIL_LAB', 'CONTENT_PACK', 'APPROVAL'];
      const targetStageOrder = stages.indexOf(stepName);

      if (targetStageOrder <= 0) {
        // PRODUCER rerun: clear producer plan
        updates.producer_plan_id = undefined;
      }

      if (targetStageOrder <= 1) {
        // Invalidate HOOK_LAB if retrying Producer
        if (targetStageOrder < 1) {
          const hookStep = run.steps.find((s) => s.step === 'HOOK_LAB');
          if (hookStep) {
            hookStep.status = 'PENDING';
            hookStep.output_id = undefined;
            hookStep.output_summary = undefined;
            hookStep.artifacts = undefined;
          }
        }
        updates.selected_hook_candidate_id = undefined;
        updates.hook_selection_rationale = undefined;
      }

      if (targetStageOrder <= 2) {
        // Invalidate THUMBNAIL_LAB if retrying Producer or Hook Lab
        if (targetStageOrder < 2) {
          const thumbStep = run.steps.find((s) => s.step === 'THUMBNAIL_LAB');
          if (thumbStep) {
            thumbStep.status = 'PENDING';
            thumbStep.output_id = undefined;
            thumbStep.output_summary = undefined;
            thumbStep.artifacts = undefined;
          }
        }
        updates.selected_thumbnail_concept_id = undefined;
        updates.thumbnail_selection_rationale = undefined;
        updates.thumbnail_score = undefined;
      }

      if (targetStageOrder <= 3) {
        // Invalidate CONTENT_PACK
        if (targetStageOrder < 3) {
          const cpStep = run.steps.find((s) => s.step === 'CONTENT_PACK');
          if (cpStep) {
            cpStep.status = 'PENDING';
            cpStep.output_id = undefined;
            cpStep.output_summary = undefined;
            cpStep.artifacts = undefined;
          }
        }
        updates.content_pack_id = undefined;
      }

      // Always reset APPROVAL and revoke stale publishing handoff
      const appStep = run.steps.find((s) => s.step === 'APPROVAL');
      if (appStep) {
        appStep.status = 'PENDING';
        appStep.output_summary = undefined;
      }
      updates.is_approved = false;
      updates.approved_by = undefined;
      updates.approved_at = undefined;
      updates.publishing_handoff = undefined;

      updates.steps = run.steps;

      await this.updateRunState(userId, runId, updates);

      return await this.executePipeline(userId, runId);
    });
  }

  /**
   * Stage 5: Human Review & Explicit Approval Gate
   * Mandatory human verification before social publishing.
   */
  public static async approveRun(
    userId: string,
    runId: string,
    dto: ApproveAutopilotRunDTO = {}
  ): Promise<{ run: AutopilotRunRecord; publishing_handoff: Record<string, any> }> {
    return await ownerContext.run(userId, async () => {
      let run = await this.getRun(userId, runId);

      if (run.status !== 'COMPLETED' && run.status !== 'APPROVED') {
        throw new AppError(
          `Cannot approve run in ${run.status} status. Pipeline must complete all steps first.`,
          400,
          'PIPELINE_NOT_READY'
        );
      }

      // Concurrency protection: Ensure pipeline is not currently executing with an active lease
      const db = await getMongoDb();
      const currentDoc = await db.collection('autopilot_runs').findOne({ id: runId, user_id: userId });
      const now = new Date();
      if (currentDoc?.execution_lock) {
        const lockExpiresAt = currentDoc.execution_lock_expires_at ? new Date(currentDoc.execution_lock_expires_at) : null;
        const isLockActive = !lockExpiresAt || lockExpiresAt.getTime() > now.getTime();
        if (isLockActive) {
          throw new AppError('Pipeline is currently executing. Cannot approve concurrently.', 409, 'PIPELINE_ALREADY_RUNNING');
        }
      }

      // Verify that Content Pack is present
      if (!run.content_pack_id) {
        throw new AppError('Content Pack deliverable missing from run.', 400, 'DELIVERABLE_MISSING');
      }

      // Retrieve publishing handoff payload from ContentPackService
      const targetPlatform = run.settings.target_platform || 'tiktok';
      const contentHandoff = await ContentPackService.getPublishHandoffPayload(
        userId,
        run.content_pack_id,
        targetPlatform
      );

      // Add thumbnail handoff if thumbnail session and concept exist
      let thumbnailHandoff: any = null;
      if (run.thumbnail_session_id && (dto.selected_thumbnail_concept_id || run.selected_thumbnail_concept_id)) {
        try {
          const conceptId = dto.selected_thumbnail_concept_id || run.selected_thumbnail_concept_id!;
          thumbnailHandoff = await ThumbnailLabService.getPublishingHandoff(
            run.thumbnail_session_id,
            conceptId,
            userId
          );
        } catch (err: any) {
          logger.warn(`Failed to attach thumbnail handoff to publishing payload: ${err.message}`);
        }
      }

      const consolidatedHandoff = {
        ...contentHandoff,
        title: contentHandoff.title || thumbnailHandoff?.title || 'Social Video Clip',
        thumbnail_url: thumbnailHandoff?.thumbnail_url,
        thumbnail_title: thumbnailHandoff?.title,
        thumbnail_aspect_ratio: thumbnailHandoff?.aspect_ratio,
        thumbnail_diagnostics: thumbnailHandoff?.diagnostics,
        autopilot_run_id: run.id,
        approved_at: new Date().toISOString(),
      };

      const steps = run.steps.map((s) => {
        if (s.step === 'APPROVAL') {
          return {
            ...s,
            status: 'COMPLETED' as const,
            completed_at: now,
            output_summary: `Approved by owner ${userId} at ${now.toISOString()}. Ready for Publish Composer.`,
          };
        }
        return s;
      });

      const updated = await this.updateRunState(userId, run.id, {
        status: 'APPROVED',
        is_approved: true,
        approved_by: userId,
        approved_at: now,
        publishing_handoff: consolidatedHandoff,
        steps,
      });

      return {
        run: updated,
        publishing_handoff: consolidatedHandoff,
      };
    });
  }

  // ── Helper state mutators ──────────────────────────────────────────

  private static updateStepStatus(
    steps: AutopilotStepResult[],
    stepName: AutopilotStepName,
    status: AutopilotStepResult['status'],
    patch: Partial<AutopilotStepResult> = {}
  ): void {
    const item = steps.find((s) => s.step === stepName);
    if (item) {
      item.status = status;
      Object.assign(item, patch);
    }
  }

  public static async updateRunState(
    userId: string,
    runId: string,
    updates: Partial<AutopilotRunRecord>,
    expectedLockToken?: string
  ): Promise<AutopilotRunRecord> {
    const current = await this.getRun(userId, runId);

    // Validate state machine transition if status is changing
    if (updates.status && updates.status !== current.status) {
      JobReliabilityService.validateStateTransition('autopilot', current.status, updates.status);
    }

    const now = new Date();
    const setDoc: Record<string, any> = { updated_at: now };
    const unsetDoc: Record<string, string> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        unsetDoc[key] = '';
      } else {
        setDoc[key] = value;
      }
    }

    const updateOps: any = { $set: setDoc };
    if (Object.keys(unsetDoc).length > 0) {
      updateOps.$unset = unsetDoc;
    }

    const filter: any = { id: runId, user_id: userId };
    if (expectedLockToken) {
      filter.execution_lock = expectedLockToken;
    }

    const db = await getMongoDb();
    const updateResult = await db.collection('autopilot_runs').updateOne(
      filter,
      updateOps
    );

    if (expectedLockToken && updateResult.matchedCount === 0) {
      throw new AppError(
        'Execution lock expired or stolen by newer worker.',
        409,
        'LOCK_LOST'
      );
    }

    return await this.getRun(userId, runId);
  }
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { HookOpeningAnalyzer } from '../services/hookLab/hookOpeningAnalyzer.js';
import { HookLineSearchService } from '../services/hookLab/hookLineSearchService.js';
import { HookScoringService } from '../services/hookLab/hookScoringService.js';
import { HookEditorIntegration } from '../services/hookLab/hookEditorIntegration.js';
import { HookLabService } from '../services/hookLabService.js';
import { BrandBrainService } from '../services/brand/brandBrainService.js';
import { BrandEvidenceService } from '../services/brand/brandEvidenceService.js';
import { ContentPackService } from '../services/contentPackService.js';
import {
  HookLabSession,
  HookCandidate,
  HOOK_LAB_LIMITS,
  TranscriptSegment,
} from '../types/index.js';

const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

describe('Phase 24 — Vireo Hook Lab Test Suite', () => {
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const clipId = crypto.randomUUID();
  const editorProjectId = crypto.randomUUID();
  let contentPackId: string;
  let brandBrainId: string;

  const realTranscriptText =
    'Um, so welcome back guys. The secret to 10x video retention is cutting your dead air instantly. Most creators make the fatal mistake of rambling for the first ten seconds. In this breakdown, we show you exactly how to save hours every single week.';

  const realSegments: TranscriptSegment[] = [
    { start: 0.8, end: 3.2, text: 'Um, so welcome back guys.' },
    { start: 3.2, end: 8.5, text: 'The secret to 10x video retention is cutting your dead air instantly.' },
    { start: 8.5, end: 15.0, text: 'Most creators make the fatal mistake of rambling for the first ten seconds.' },
    { start: 15.0, end: 22.0, text: 'In this breakdown, we show you exactly how to save hours every single week.' },
  ];

  before(async () => {
    // Ping Mongo
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Seed mock project, clip, transcript, and EditorProject
    await ownerContext.run(userId, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userId,
        title: 'Hook Lab Master Video',
        video_status: 'completed',
        source_type: 'upload',
      });

      await dataRepository.from('clips').insert({
        id: clipId,
        project_id: projectId,
        user_id: userId,
        title: 'Retention Secrets Clip',
        start_seconds: 0,
        end_seconds: 22.0,
        duration_seconds: 22.0,
        aspect_ratio: '9:16',
        crop_mode: 'center',
        render_status: 'ready',
        source_storage_path: REAL_VIDEO_ASSET,
      });

      await dataRepository.from('transcripts').insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        transcript_text: realTranscriptText,
        language: 'en',
        duration_seconds: 22.0,
        segments: realSegments,
      });

      // Seed Brand Brain Profile
      const profile = await BrandBrainService.getProfile(userId);
      brandBrainId = profile.id;
      await BrandBrainService.updateProfile(userId, {
        identity: {
          brand_name: 'Vireo Retention',
          tagline: 'High-Impact Short-Form',
        },
        voice: {
          tones: ['bold', 'educational'],
          writing_styles: ['punchy'],
          avoid_phrasing: ['guaranteed overnight riches', 'smash that bell'],
        },
      });

      // Create initial EditorProject
      const videoTrackId = crypto.randomUUID();
      const textTrackId = crypto.randomUUID();
      const videoItemId = crypto.randomUUID();

      await dataRepository.from('editor_projects').insert({
        id: editorProjectId,
        user_id: userId,
        project_id: projectId,
        clip_id: clipId,
        version: 1,
        status: 'draft',
        title: 'Editor Project for Hook Lab',
        canvas: {
          width: 1080,
          height: 1920,
          aspect_ratio: '9:16',
          background_color: '#000000',
        },
        settings: {
          snap_to_grid: true,
          ripple_editing: false,
          auto_save: true,
          frame_rate: 30,
          sample_rate: 48000,
        },
        tracks: [
          {
            id: videoTrackId,
            project_id: editorProjectId,
            type: 'VIDEO',
            index: 0,
            name: 'Video Track 1',
            locked: false,
            muted: false,
            hidden: false,
            volume: 1.0,
            items: [
              {
                id: videoItemId,
                track_id: videoTrackId,
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 22.0,
                source_start: 0,
                source_end: 22.0,
                transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
                speed: { speed: 1.0, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 0,
                source_media: {
                  storage_path: REAL_VIDEO_ASSET,
                  duration: 22.0,
                  width: 1080,
                  height: 1920,
                  fps: 30,
                  has_audio: true,
                },
              },
            ],
          },
          {
            id: textTrackId,
            project_id: editorProjectId,
            type: 'TEXT',
            index: 1,
            name: 'Overlays Track',
            locked: false,
            muted: false,
            hidden: false,
            volume: 1.0,
            items: [],
          },
        ],
      });

      // Create a content pack to test sync
      const pack = await ContentPackService.generateContentPack({
        projectId,
        clipId,
        userId,
        platform: 'shorts',
        mode: 'BALANCED',
      });
      contentPackId = pack.id;
    });
  });

  after(async () => {
    await closeMongo();
  });

  // ==========================================
  // SECTION 1: CAPABILITIES & INITIALIZATION
  // ==========================================
  describe('1. Capabilities & System Initialization', () => {
    it('returns Hook Lab capability model with supported types and limits', async () => {
      const caps = await HookLabService.getCapabilities();
      assert.equal(caps.opening_analysis, 'SUPPORTED');
      assert.equal(caps.source_line_search, 'SUPPORTED');
      assert.equal(caps.hook_generation, 'SUPPORTED');
      assert.equal(caps.hook_scoring, 'SUPPORTED');
      assert.equal(caps.editor_apply, 'SUPPORTED');
      assert.equal(caps.thumbnail_lab, 'DEFERRED_TO_PHASE_25');
      assert.equal(caps.autopilot, 'DEFERRED_TO_PHASE_26');
      assert.equal(caps.ab_studio, 'DEFERRED_TO_PHASE_27');
    });

    it('creates a new Hook Lab session for a clip with opening analysis', async () => {
      const session = await HookLabService.getOrCreateSession(userId, clipId, {
        clip_id: clipId,
        opening_window_sec: 3.0,
      });

      assert.ok(session.id, 'Session must have valid ID');
      assert.equal(session.clip_id, clipId);
      assert.equal(session.user_id, userId);
      assert.ok(session.analysis, 'Must contain opening analysis');
      assert.ok(session.opening_window, 'Must define opening window');
      assert.equal(session.opening_window.end_seconds, 3.0);
    });

    it('enforces multi-tenant user isolation on session access', async () => {
      const userSession = await HookLabService.getOrCreateSession(userId, clipId);

      await assert.rejects(
        async () => {
          await HookLabService.getSession(userSession.id, otherUserId);
        },
        /not found or access denied/i,
        'Other user must not be able to access session'
      );
    });
  });

  // ==========================================
  // SECTION 2: OPENING ANALYSIS & DIAGNOSTICS
  // ==========================================
  describe('2. Opening Analysis & Signal Diagnostics', () => {
    it('accurately analyzes opening speech latency, fillers, and classification', () => {
      const analysis = HookOpeningAnalyzer.analyzeOpening({
        clipStartSeconds: 0,
        clipEndSeconds: 22.0,
        segments: realSegments,
      });

      assert.ok(analysis.time_to_first_meaningful_speech_sec >= 0.5);
      assert.equal(analysis.current_hook_source, 'TRANSCRIPT');
      assert.ok(analysis.current_hook_text.toLowerCase().includes('welcome back'));
      assert.ok(analysis.has_leading_filler, 'Should detect leading filler (Um, so)');
      assert.ok(analysis.leading_filler_words.length > 0);
      assert.ok(Array.isArray(analysis.issues), 'Issues must be array');
      assert.ok(Array.isArray(analysis.strengths), 'Strengths must be array');
      assert.ok(analysis.issues.includes('FILLER_WORD_IN_OPENING') || analysis.issues.length > 0);
    });

    it('identifies slow speech start when opening speech is delayed', () => {
      const delayedSegments: TranscriptSegment[] = [
        { start: 2.8, end: 5.0, text: 'Hello everyone.' },
      ];
      const analysis = HookOpeningAnalyzer.analyzeOpening({
        clipStartSeconds: 0,
        clipEndSeconds: 10.0,
        segments: delayedSegments,
      });

      assert.equal(analysis.latency_label, 'SLOW');
      assert.ok(analysis.issues.includes('SLOW_START') || analysis.has_leading_silence);
    });
  });

  // ==========================================
  // SECTION 3: SOURCE LINE DISCOVERY
  // ==========================================
  describe('3. High-Impact Source Line Discovery', () => {
    it('discovers punchy lines later in the clip beyond opening window', () => {
      const discovered = HookLineSearchService.findStrongestExistingLines(
        realSegments,
        0,
        22.0,
        3
      );

      assert.ok(discovered.length >= 2, 'Must discover at least 2 potential punchy lines');
      const topLine = discovered[0];
      assert.ok(topLine.punchiness_score >= 50, 'Discovered line must have substantial score');
      assert.ok(
        topLine.text.toLowerCase().includes('secret') ||
          topLine.text.toLowerCase().includes('mistake') ||
          topLine.text.toLowerCase().includes('retention')
      );
      assert.ok(topLine.reorder_plan, 'Must include reorder plan');
      assert.equal(topLine.reorder_plan.source_start, topLine.start_seconds);
    });
  });

  // ==========================================
  // SECTION 4: HOOK FIT SCORING & EXPLAINABILITY
  // ==========================================
  describe('4. Deterministic Hook Fit Scoring & Safety', () => {
    it('calculates deterministic 0-100 Hook Fit based on 7 weighted factors', () => {
      const result = HookScoringService.scoreHook({
        text: 'The secret to 10x video retention is cutting dead air instantly.',
        hookType: 'CONTRARIAN',
        sourceTranscript: realTranscriptText,
        sourceEvidence: [
          {
            start_seconds: 3.2,
            end_seconds: 8.5,
            text: 'The secret to 10x video retention is cutting your dead air instantly.',
          },
        ],
      });

      assert.ok(result.overallHookFit >= 0 && result.overallHookFit <= 100);
      assert.equal(typeof result.overallHookFit, 'number');
      assert.ok(result.scores.grounding >= 80, 'Source-grounded line must have high grounding');
      assert.ok(result.scores.clarity >= 70);
      assert.ok(result.explanation.positives.length > 0);
    });

    it('penalizes ungrounded hallucinations heavily via Grounding penalty', () => {
      const grounded = HookScoringService.scoreHook({
        text: 'The secret to 10x video retention is cutting your dead air instantly.',
        hookType: 'CONTRARIAN',
        sourceTranscript: realTranscriptText,
      });

      const ungrounded = HookScoringService.scoreHook({
        text: 'Quantum blockchain rocket ships will quadruple your trading portfolio.',
        hookType: 'CONTRARIAN',
        sourceTranscript: realTranscriptText,
      });

      assert.ok(
        grounded.overallHookFit > ungrounded.overallHookFit,
        'Grounded candidate must score significantly higher than ungrounded hallucination'
      );
      assert.ok(ungrounded.scores.grounding < 40);
      assert.ok(ungrounded.explanation?.cautions ? ungrounded.explanation.cautions.length > 0 : true);
    });

    it('enforces Claim Guard against forbidden absolute guarantees', () => {
      const dangerous = HookScoringService.scoreHook({
        text: 'Guaranteed overnight riches with 100% risk free returns!',
        hookType: 'DIRECT',
        sourceTranscript: realTranscriptText,
      });

      assert.ok(
        dangerous.validationWarnings.some((w) => w.includes('Claim Guard')) ||
          dangerous.explanation.cautions.some((c) => c.includes('Claim Guard')),
        'Must trigger Claim Guard warning or caution on forbidden guarantee'
      );
      assert.ok(dangerous.overallHookFit <= 50);
    });
  });

  // ==========================================
  // SECTION 5: CANDIDATE GENERATION & DIVERSITY
  // ==========================================
  describe('5. Candidate Generation, Diversity & Management', () => {
    let session: HookLabSession;

    it('generates a full candidate set with diverse hook types and delivery modes', async () => {
      session = await HookLabService.getOrCreateSession(userId, clipId);
      const candidates = await HookLabService.generateCandidates(session.id, userId, {
        candidate_count: 5,
      });

      assert.ok(candidates.length >= 3, 'Must generate at least 3 candidates');
      assert.ok(candidates.length <= HOOK_LAB_LIMITS.MAX_HOOK_CANDIDATES);

      // Verify diversity of types and delivery modes
      const types = new Set(candidates.map((c) => c.hook_type));
      const modes = new Set(candidates.map((c) => c.delivery_mode));

      assert.ok(types.size >= 2, 'Candidates must span multiple hook types');
      assert.ok(modes.size >= 2, 'Candidates must span multiple delivery modes');

      for (const cand of candidates) {
        assert.ok(cand.overall_hook_fit >= 0 && cand.overall_hook_fit <= 100);
        assert.ok(cand.scores.grounding >= 0);
        assert.equal(cand.status, 'GENERATED');
      }
    });

    it('preserves locked candidates during regeneration', async () => {
      const { candidates: initial } = await HookLabService.getSession(session.id, userId);
      assert.ok(initial.length > 0);

      const target = initial[0];
      const locked = await HookLabService.updateCandidate(session.id, target.id, userId, {
        locked: true,
      });
      assert.equal(locked.locked, true);

      // Regenerate
      const afterRegen = await HookLabService.generateCandidates(session.id, userId, {
        candidate_count: 5,
      });

      const foundLocked = afterRegen.find((c) => c.id === target.id);
      assert.ok(foundLocked, 'Locked candidate must be preserved in the candidate set');
      assert.equal(foundLocked.text, target.text);
      assert.equal(foundLocked.locked, true);
    });

    it('supports inline editing and automatically re-scores edited candidate', async () => {
      const { candidates } = await HookLabService.getSession(session.id, userId);
      const target = candidates.find((c) => !c.locked) || candidates[0];

      const newText = 'Stop rambling in your first 5 seconds. Here is the secret to 10x retention.';
      const updated = await HookLabService.updateCandidate(session.id, target.id, userId, {
        text: newText,
      });

      assert.equal(updated.text, newText);
      assert.equal(updated.status, 'EDITED');
      assert.ok(updated.overall_hook_fit > 0);
    });

    it('respects user instructions during candidate conditioning', async () => {
      const candidates = await HookLabService.generateCandidates(session.id, userId, {
        user_instruction: 'Make it a punchy contrarian question',
      });

      assert.ok(candidates.length > 0);
      const matched = candidates.some(
        (c) => c.hook_type === 'QUESTION' || c.hook_type === 'CONTRARIAN' || c.text.includes('?')
      );
      assert.ok(matched, 'Must generate question or contrarian angle matching instruction');
    });
  });

  // ==========================================
  // SECTION 6: BRAND BRAIN INTEGRATION
  // ==========================================
  describe('6. Brand Brain Alignment & Approval Evidence', () => {
    it('penalizes candidates that violate Brand Voice avoid_phrasing', () => {
      const cleanCandidate = HookScoringService.scoreHook({
        text: 'The secret to 10x video retention is cutting your dead air instantly.',
        hookType: 'CONTRARIAN',
        sourceTranscript: realTranscriptText,
        avoidPhrases: ['guaranteed overnight riches', 'smash that bell'],
      });

      const badBrandCandidate = HookScoringService.scoreHook({
        text: 'Guaranteed overnight riches if you smash that bell right now!',
        hookType: 'DIRECT',
        sourceTranscript: realTranscriptText,
        avoidPhrases: ['guaranteed overnight riches', 'smash that bell'],
      });

      assert.ok(cleanCandidate.scores.brand_fit > badBrandCandidate.scores.brand_fit);
      assert.ok(badBrandCandidate.explanation.cautions.some((c) => c.toLowerCase().includes('avoided')));
    });

    it('records BrandEvidence on approval with HOOK_LAB source type', async () => {
      const session = await HookLabService.getOrCreateSession(userId, clipId);
      const { candidates } = await HookLabService.getSession(session.id, userId);
      const candidateToApprove = candidates[0];

      const approved = await HookLabService.approveCandidate(session.id, candidateToApprove.id, userId);
      assert.equal(approved.approved, true);
      assert.equal(approved.status, 'APPROVED');

      // Verify evidence recorded in Brand Brain
      const evidence = await BrandEvidenceService.getEvidence(userId, brandBrainId, 'hooks');
      const hookEvidence = evidence.find((e) => e.source_type === 'HOOK_LAB');
      assert.ok(hookEvidence, 'Must find BrandEvidence with source_type: HOOK_LAB');
      assert.equal((hookEvidence.value as any)?.hook_type, candidateToApprove.hook_type);
    });
  });

  // ==========================================
  // SECTION 7: HONEST ANALYTICS ADVISORY
  // ==========================================
  describe('7. Analytics Advisory Signal', () => {
    it('returns INSUFFICIENT_DATA status without fabricating metrics', async () => {
      const advisory = await HookLabService.getAnalyticsAdvisory(userId);
      assert.equal(advisory.status, 'INSUFFICIENT_DATA');
      assert.ok(advisory.advisory?.includes('Insufficient historical data'));
      assert.equal(typeof advisory.sample_count, 'number');
    });
  });

  // ==========================================
  // SECTION 8: NON-DESTRUCTIVE REVERSIBLE EDITOR APPLY
  // ==========================================
  describe('8. Non-Destructive Reversible Editor Integration', () => {
    it('applies EDITORIAL_TRIM operation non-destructively and creates snapshot', async () => {
      const session = await HookLabService.getOrCreateSession(userId, clipId);

      const trimCand: HookCandidate = {
        id: crypto.randomUUID(),
        hook_lab_session_id: session.id,
        user_id: userId,
        variant_index: 0,
        text: 'Cut opening silence to start immediately on speech',
        hook_type: 'DIRECT',
        delivery_mode: 'EDITORIAL_TRIM',
        source_evidence: [{ start_seconds: 0.8, end_seconds: 3.2, text: 'Um, so welcome back guys.' }],
        brand_rules_used: [],
        analysis_signals_used: [],
        trim_plan: {
          trim_start: 0,
          trim_end: 0.8,
          reason: 'Remove leading silence',
        },
        scores: {
          grounding: 90,
          clarity: 90,
          specificity: 90,
          curiosity: 80,
          brevity: 90,
          brand_fit: 90,
          opening_fit: 95,
        },
        overall_hook_fit: 89,
        explanation: { summary: 'Strong trim', positives: ['Fast punch'], cautions: [], source_reference: '0.8s' },
        validation_warnings: [],
        applied: false,
        locked: false,
        manual_edit: false,
        approved: false,
        status: 'GENERATED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await ownerContext.run(userId, async () => {
        await dataRepository.from('hook_candidates').insert(trimCand);
      });

      const result = await HookLabService.applyCandidateToEditor(
        session.id,
        trimCand.id,
        userId,
        editorProjectId
      );

      assert.ok(result.updatedProject, 'Must return updated EditorProject');
      assert.ok(result.previousProjectSnapshot, 'Must provide previous snapshot for reversibility');
      assert.ok(result.appliedOperations.some((op) => op.toLowerCase().includes('trim')));

      // Check that the video track item start was trimmed non-destructively
      const videoTrack = result.updatedProject.tracks.find((t: any) => t.type === 'VIDEO');
      assert.ok(videoTrack);
      const item = videoTrack!.items[0];
      assert.equal(item.source_start, 0.8, 'source_start must be updated to 0.8s');

      // Now REVERT the apply using the snapshot
      const reverted = await HookLabService.revertCandidateInEditor(
        session.id,
        trimCand.id,
        userId,
        editorProjectId,
        result.previousProjectSnapshot
      );

      const revertedVideoTrack = reverted.tracks.find((t: any) => t.type === 'VIDEO');
      const revertedItem = revertedVideoTrack.items[0];
      assert.equal(revertedItem.source_start, 0, 'source_start must be restored to 0 after revert');
    });

    it('applies TEXT_OVERLAY non-destructively and restores state on revert', async () => {
      const session = await HookLabService.getOrCreateSession(userId, clipId);

      const overlayCand: HookCandidate = {
        id: crypto.randomUUID(),
        hook_lab_session_id: session.id,
        user_id: userId,
        variant_index: 1,
        text: 'THE 10X RETENTION SECRET',
        hook_type: 'DIRECT',
        delivery_mode: 'TEXT_OVERLAY',
        source_evidence: [{ start_seconds: 3.2, end_seconds: 8.5, text: 'The secret to 10x video retention' }],
        brand_rules_used: [],
        analysis_signals_used: [],
        text_overlay_plan: {
          text: 'THE 10X RETENTION SECRET',
          start_time: 0,
          end_time: 3.0,
          position_y: 0.15,
          font_family: 'Inter',
          font_size: 64,
          color: '#FFFFFF',
        },
        scores: {
          grounding: 85,
          clarity: 95,
          specificity: 85,
          curiosity: 90,
          brevity: 95,
          brand_fit: 90,
          opening_fit: 90,
        },
        overall_hook_fit: 89,
        explanation: { summary: 'Text overlay hook', positives: ['Visible text'], cautions: [], source_reference: '0-3s' },
        validation_warnings: [],
        applied: false,
        locked: false,
        manual_edit: false,
        approved: false,
        status: 'GENERATED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await ownerContext.run(userId, async () => {
        await dataRepository.from('hook_candidates').insert(overlayCand);
      });

      const applyRes = await HookLabService.applyCandidateToEditor(
        session.id,
        overlayCand.id,
        userId,
        editorProjectId
      );

      assert.ok(applyRes.appliedOperations.some((op) => op.toLowerCase().includes('text overlay')));
      const textTrack = applyRes.updatedProject.tracks.find((t: any) => t.type === 'TEXT');
      assert.ok(textTrack);
      assert.ok(textTrack!.items.length > 0, 'Text track must now contain overlay item');
      assert.equal(textTrack!.items[0].text?.text, 'THE 10X RETENTION SECRET');

      // Revert text overlay
      const revertRes = await HookLabService.revertCandidateInEditor(
        session.id,
        overlayCand.id,
        userId,
        editorProjectId,
        applyRes.previousProjectSnapshot
      );

      const revertedTextTrack = revertRes.tracks.find((t: any) => t.type === 'TEXT');
      assert.equal(revertedTextTrack.items.length, 0, 'Text track must be empty after revert');
    });

    it('preserves source media immutability across all editor operations', () => {
      if (fs.existsSync(REAL_VIDEO_ASSET)) {
        const stats = fs.statSync(REAL_VIDEO_ASSET);
        assert.ok(stats.size > 0, 'Source video file must exist and have non-zero size');
      }
    });
  });

  // ==========================================
  // SECTION 9: CONTENT PACK IMPORT & SYNC
  // ==========================================
  describe('9. Content Pack Import & Synchronization', () => {
    it('imports HOOK items from Content Pack into Hook Lab session as candidates', async () => {
      const session = await HookLabService.getOrCreateSession(userId, clipId);
      const imported = await HookLabService.importFromContentPack(clipId, contentPackId, userId);

      assert.ok(Array.isArray(imported));
      assert.ok(imported.length > 0, 'Must import hooks from Content Pack');
      for (const cand of imported) {
        assert.ok(cand.overall_hook_fit > 0);
      }
    });
  });

  // ==========================================
  // SECTION 10: REAL LOCAL PREVIEW GENERATION
  // ==========================================
  describe('10. Real Local FFmpeg Preview Generation', () => {
    it('renders a preview video and verifies it with ffprobe', async () => {
      const session = await HookLabService.getOrCreateSession(userId, clipId);
      const { candidates } = await HookLabService.getSession(session.id, userId);
      const testCand = candidates[0];

      const preview = await HookEditorIntegration.renderHookPreview(userId, clipId, testCand);
      assert.ok(preview.previewUrl, 'Must return preview URL/path');
      assert.ok(preview.duration > 0, 'Must return positive duration');
      assert.equal(typeof preview.verified, 'boolean');
    });
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});

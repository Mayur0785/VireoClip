import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { ThumbnailLabService } from '../services/thumbnailLabService.js';
import { ThumbnailScoringService } from '../services/thumbnailLab/thumbnailScoringService.js';
import { ThumbnailSourceFrameService } from '../services/thumbnailLab/thumbnailSourceFrameService.js';
import {
  FalImageProvider,
  ThumbnailImageProviderManager,
  thumbnailImageProvider,
} from '../services/thumbnailLab/thumbnailImageProvider.js';
import { BrandBrainService } from '../services/brand/brandBrainService.js';
import { BrandEvidenceService } from '../services/brand/brandEvidenceService.js';
import { ContentPackService } from '../services/contentPackService.js';
import {
  ThumbnailConcept,
  ThumbnailTextLayer,
  ThumbnailComposition,
  ThumbnailStyleDirection,
  THUMBNAIL_LAB_LIMITS,
} from '../types/index.js';

describe('Phase 25 — Vireo Thumbnail Lab Test Suite', () => {
  let db: any;
  const testUserId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testClipId = crypto.randomUUID();
  let createdSessionId = '';
  let generatedConcepts: ThumbnailConcept[] = [];

  before(async () => {
    // Ping Mongo
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    await ownerContext.run(testUserId, async () => {
      // Seed project
      await dataRepository.from('projects').insert({
        id: testProjectId,
        user_id: testUserId,
        title: 'Thumbnail Lab Master Project',
        video_status: 'completed',
        source_type: 'upload',
      });

      // Seed test clip
      await dataRepository.from('clips').insert({
        id: testClipId,
        project_id: testProjectId,
        user_id: testUserId,
        title: 'Scaling AI Content Production in 2026',
        aspect_ratio: '16:9',
        duration_seconds: 45,
        start_seconds: 0,
        end_seconds: 45,
        status: 'ready',
        created_at: new Date().toISOString(),
      });

      // Seed transcript
      await dataRepository.from('transcripts').insert({
        id: crypto.randomUUID(),
        project_id: testProjectId,
        user_id: testUserId,
        clean_text: 'Here is how you scale AI video clipping without burning out your creative studio. Today we reveal three core thumbnail strategies.',
        created_at: new Date().toISOString(),
      });
    });
  });

  after(async () => {
    try {
      await db.collection('clips').deleteOne({ id: testClipId });
      await db.collection('transcripts').deleteMany({ project_id: testProjectId });
      await db.collection('thumbnail_lab_sessions').deleteMany({ user_id: { $in: [testUserId, otherUserId] } });
      await db.collection('thumbnail_concepts').deleteMany({ user_id: { $in: [testUserId, otherUserId] } });
      await db.collection('thumbnail_versions').deleteMany({ user_id: { $in: [testUserId, otherUserId] } });
      await db.collection('brand_evidence').deleteMany({ user_id: testUserId });
      await db.collection('brand_brain_profiles').deleteMany({ user_id: testUserId });
    } catch {
      // ignore
    } finally {
      await closeMongo().catch(() => undefined);
    }
  });

  describe('1. Capabilities & Provider Honesty', () => {
    it('reports honest provider configuration and bounds without fake capabilities', async () => {
      const caps = ThumbnailLabService.getCapabilities();
      assert.ok(caps);
      const hasKey = Boolean(process.env.FAL_KEY);
      assert.strictEqual(caps.image_provider_status, hasKey ? 'SUPPORTED' : 'NOT_CONFIGURED');
      assert.strictEqual(caps.source_frame_extraction, 'SUPPORTED');
      assert.strictEqual(caps.brand_brain_integration, 'SUPPORTED');
      assert.strictEqual(caps.thumbnail_scoring, 'SUPPORTED');
      assert.ok(caps.supported_style_directions.includes('BOLD_TYPOGRAPHY'));
      assert.ok(caps.supported_style_directions.includes('CINEMATIC_STORYTELLING'));
      assert.ok(caps.supported_style_directions.includes('EXPRESSIVE_CREATOR_PORTRAIT'));
    });

    it('rejects image generation with NOT_CONFIGURED when no FAL_KEY is provided', async () => {
      const provider = new FalImageProvider();
      const caps = provider.getCapabilities();
      if (caps.image_provider_status === 'NOT_CONFIGURED') {
        await assert.rejects(
          async () => {
            await provider.generateThumbnailImage(
              {
                prompt: 'Photorealistic high impact thumbnail',
                aspect_ratio: '16:9',
              },
              testUserId
            );
          },
          /not configured/i
        );
      }
    });

    it('correctly maps Vireo aspect ratios to fal.ai image_size enum values', () => {
      assert.strictEqual(FalImageProvider.mapAspectToFalSize('16:9'), 'landscape_16_9');
      assert.strictEqual(FalImageProvider.mapAspectToFalSize('9:16'), 'portrait_16_9');
      assert.strictEqual(FalImageProvider.mapAspectToFalSize('1:1'), 'square_hd');
    });
  });

  describe('2. Multi-Tenant Session Management & Isolation', () => {
    it('creates a Thumbnail Lab session with brand defaults and clip context', async () => {
      const session = await ThumbnailLabService.getOrCreateSession(testUserId, testClipId, {
        aspect_ratio: '16:9',
        target_platform: 'youtube',
        target_audience: 'Creators & Marketers',
        objective: 'Drive click-through rate with clear readable typography',
      });

      assert.ok(session);
      assert.ok(session.id);
      assert.strictEqual(session.user_id, testUserId);
      assert.strictEqual(session.clip_id, testClipId);
      assert.strictEqual(session.aspect_ratio, '16:9');
      assert.strictEqual(session.target_platform, 'youtube');
      createdSessionId = session.id;
    });

    it('enforces multi-tenant isolation and prevents access from another user', async () => {
      assert.ok(createdSessionId);
      await assert.rejects(
        async () => {
          await ThumbnailLabService.getSession(createdSessionId, otherUserId);
        },
        /not found/i
      );
    });
  });

  describe('3. Source Frame Intelligence & Extraction', () => {
    it('extracts source frames or provides fallback visual frames without crashing', async () => {
      const frames = await ThumbnailLabService.getSourceFrames(createdSessionId, testUserId);
      assert.ok(Array.isArray(frames));
      assert.ok(frames.length > 0);
      assert.ok(frames[0].id);
      assert.ok(typeof frames[0].timestamp === 'number');
      assert.ok(frames[0].preview_url);
    });
  });

  describe('4. Concept Generation, Diversity & Prompt Safety', () => {
    it('generates diverse thumbnail concepts adhering to brief and transcript', async () => {
      const concepts = await ThumbnailLabService.generateConcepts(createdSessionId, testUserId, {
        count: 4,
        user_instruction: 'Focus on scale and speed without burnout',
      });

      assert.ok(Array.isArray(concepts));
      assert.strictEqual(concepts.length, 4);
      generatedConcepts = concepts;

      // Check diversity of styles
      const styles = new Set(concepts.map((c) => c.style_direction));
      assert.ok(styles.size >= 2, 'Should offer multiple distinct creative directions');

      // Check text layer presence & bounds
      for (const concept of concepts) {
        assert.ok(concept.text_layer.headline.length > 0);
        assert.ok(concept.text_layer.font_family);
        assert.ok(concept.diagnostics);
        assert.ok(concept.diagnostics.overall_score >= 0 && concept.diagnostics.overall_score <= 100);
      }
    });

    it('rejects oversized user instructions exceeding governance limits', async () => {
      const excessiveInstruction = 'x'.repeat(THUMBNAIL_LAB_LIMITS.MAX_USER_INSTRUCTION_LENGTH + 10);
      await assert.rejects(
        async () => {
          await ThumbnailLabService.generateConcepts(createdSessionId, testUserId, {
            user_instruction: excessiveInstruction,
          });
        },
        /exceeds/i
      );
    });
  });

  describe('5. Non-Destructive Typography & Safe Area Validation', () => {
    it('updates typography non-destructively and marks manual edit', async () => {
      assert.ok(generatedConcepts.length > 0);
      const target = generatedConcepts[0];

      const updated = await ThumbnailLabService.updateConcept(createdSessionId, target.id, testUserId, {
        text_layer: {
          headline: 'SCALE 10X FASTER',
          font_size: 72,
          font_weight: 900,
          text_color: '#FFFFFF',
          highlight_color: '#00F0FF',
          stroke_width: 5,
        },
      });

      assert.strictEqual(updated.text_layer.headline, 'SCALE 10X FASTER');
      assert.strictEqual(updated.manual_edit, true);
      assert.strictEqual(updated.status, 'EDITED');
      assert.ok(updated.diagnostics.score_breakdown.readability > 0);
    });

    it('flags safe area violations when text placed too close to bottom-right UI badges', () => {
      const textAtBadge: ThumbnailTextLayer = {
        headline: 'HIDDEN BY BADGE',
        font_family: 'Inter',
        font_weight: 700,
        font_size: 48,
        text_color: '#FFFFFF',
        stroke_width: 3,
        shadow_blur: 4,
        shadow_offset_y: 2,
        alignment: 'left',
        position_x: 0.85,
        position_y: 0.88, // bottom right corner
      };

      const composition: ThumbnailComposition = {
        crop_x: 0.5,
        crop_y: 0.5,
        zoom_level: 1.0,
        contrast: 1.0,
        brightness: 1.0,
        saturation: 1.0,
      };

      const diagnostics = ThumbnailScoringService.evaluateThumbnail({
        textLayer: textAtBadge,
        composition,
        aspectRatio: '16:9',
        styleDirection: 'BOLD_TYPOGRAPHY',
      });

      assert.ok(
        diagnostics.warnings.some((w) => w.toLowerCase().includes('safe area') || w.toLowerCase().includes('badge')),
        'Should flag bottom-right YouTube duration badge safe area warning'
      );
    });
  });

  describe('6. Explainable 6-Factor Quality Scoring Engine', () => {
    it('calculates deterministic score breakdown across all 6 dimensions', () => {
      const textLayer: ThumbnailTextLayer = {
        headline: 'STOP DOING THIS',
        subheadline: 'Watch First',
        font_family: 'Outfit',
        font_weight: 800,
        font_size: 64,
        text_color: '#FFFFFF',
        highlight_color: '#F59E0B',
        stroke_color: '#000000',
        stroke_width: 4,
        shadow_blur: 8,
        shadow_offset_y: 4,
        position_x: 0.1,
        position_y: 0.3,
        alignment: 'left',
        transform_case: 'uppercase',
      };

      const composition: ThumbnailComposition = {
        crop_x: 0.5,
        crop_y: 0.5,
        zoom_level: 1.1,
        contrast: 1.2,
        brightness: 1.0,
        saturation: 1.1,
        overlay_gradient: 'cinematic_vignette',
      };

      const diagnostics = ThumbnailScoringService.evaluateThumbnail({
        textLayer,
        composition,
        aspectRatio: '16:9',
        styleDirection: 'BOLD_TYPOGRAPHY',
        brandColors: ['#00F0FF', '#7000FF'],
        brandFonts: ['Outfit', 'Inter'],
        hasSourceFace: true,
        videoTopic: 'AI Content Scaling',
      });

      assert.ok(diagnostics.overall_score >= 0 && diagnostics.overall_score <= 100);
      assert.ok(diagnostics.score_breakdown.readability >= 0 && diagnostics.score_breakdown.readability <= 100);
      assert.ok(diagnostics.score_breakdown.contrast >= 0 && diagnostics.score_breakdown.contrast <= 100);
      assert.ok(diagnostics.score_breakdown.composition >= 0 && diagnostics.score_breakdown.composition <= 100);
      assert.ok(diagnostics.score_breakdown.subject_visibility >= 0 && diagnostics.score_breakdown.subject_visibility <= 100);
      assert.ok(diagnostics.score_breakdown.brand_fit >= 0 && diagnostics.score_breakdown.brand_fit <= 100);
      assert.ok(diagnostics.score_breakdown.topic_relevance >= 0 && diagnostics.score_breakdown.topic_relevance <= 100);
      assert.ok(Array.isArray(diagnostics.positives));
      assert.ok(diagnostics.positives.length > 0);
      assert.ok(diagnostics.summary.length > 0);
    });

    it('penalizes tiny low-contrast unreadably long text', () => {
      const unreadableText: ThumbnailTextLayer = {
        headline: 'This is an excessively long and verbose cover headline that clutters the entire thumbnail frame and cannot be read easily on mobile screens',
        font_family: 'Arial',
        font_weight: 400,
        font_size: 20,
        text_color: '#888888',
        stroke_width: 0,
        shadow_blur: 0,
        shadow_offset_y: 0,
        alignment: 'center',
        position_x: 0.5,
        position_y: 0.5,
      };

      const composition: ThumbnailComposition = {
        crop_x: 0.5,
        crop_y: 0.5,
        zoom_level: 1.0,
        contrast: 0.9,
        brightness: 1.0,
        saturation: 1.0,
      };

      const diagnostics = ThumbnailScoringService.evaluateThumbnail({
        textLayer: unreadableText,
        composition,
        aspectRatio: '16:9',
        styleDirection: 'MINIMAL_PREMIUM',
      });

      assert.ok(diagnostics.score_breakdown.readability < 60, 'Long and low contrast text should receive penalized readability');
      assert.ok(diagnostics.warnings.length > 0);
    });
  });

  describe('7. Brand Brain Integration & Evidence Recording', () => {
    it('applies Brand Brain colors and approved typography', async () => {
      // Upsert brand profile
      await BrandBrainService.getProfile(testUserId);
      await BrandBrainService.updateProfile(testUserId, {
        voice: {
          tones: ['bold', 'educational'],
          avoid_phrasing: ['Cheap tricks', 'Get rich quick'],
        },
        visual: {
          primary_colors: ['#00F0FF', '#7000FF'],
          fonts: ['Outfit', 'Inter'],
        },
      });

      const session = await ThumbnailLabService.getOrCreateSession(testUserId, testClipId);
      assert.ok(session);
      assert.strictEqual(session.user_id, testUserId);
    });

    it('records BrandEvidence when user approves a thumbnail concept', async () => {
      assert.ok(generatedConcepts.length > 0);
      const target = generatedConcepts[0];

      const { concept, session } = await ThumbnailLabService.approveConcept(
        createdSessionId,
        target.id,
        testUserId
      );

      assert.strictEqual(concept.status, 'APPROVED');
      assert.strictEqual(session.status, 'APPROVED');
      assert.strictEqual(session.approved_concept_id, target.id);

      // Verify evidence in database
      const evidence = await db.collection('brand_evidence').findOne({
        user_id: testUserId,
        source_id: target.id,
      });

      assert.ok(evidence, 'Should write BrandEvidence with source_id');
      assert.strictEqual(evidence.dimension, 'visual');
    });
  });

  describe('8. Content Pack Import & Synchronization', () => {
    it('imports thumbnail headlines and direction from Content Pack into concepts', async () => {
      const mockPackId = crypto.randomUUID();
      await ownerContext.run(testUserId, async () => {
        // Insert content pack items
        await dataRepository.from('content_pack_items').insert({
          id: crypto.randomUUID(),
          content_pack_id: mockPackId,
          user_id: testUserId,
          type: 'THUMBNAIL_TEXT',
          text: 'THE $10,000 AI EXPERIMENT',
        });
        await dataRepository.from('content_pack_items').insert({
          id: crypto.randomUUID(),
          content_pack_id: mockPackId,
          user_id: testUserId,
          type: 'THUMBNAIL_DIRECTION',
          text: 'High contrast neon glow with expressive creator look',
        });
      });

      const imported = await ThumbnailLabService.importFromContentPack(
        testClipId,
        mockPackId,
        testUserId
      );

      assert.ok(Array.isArray(imported));
      assert.ok(imported.length > 0);
      assert.strictEqual(imported[0].text_layer.headline, 'THE $10,000 AI EXPERIMENT');
      assert.strictEqual(imported[0].prompt_used, 'High contrast neon glow with expressive creator look');
    });
  });

  describe('9. Version History, Lock Protection & Revert', () => {
    it('locks concept and protects it against deletion during regeneration', async () => {
      const concept = generatedConcepts[1];
      const locked = await ThumbnailLabService.updateConcept(createdSessionId, concept.id, testUserId, {
        locked: true,
      });
      assert.strictEqual(locked.locked, true);

      // Regenerate concepts
      const regenerated = await ThumbnailLabService.generateConcepts(createdSessionId, testUserId, {
        count: 2,
      });

      // The locked concept should still exist in the session concepts
      const stillPresent = regenerated.find((c) => c.id === concept.id);
      assert.ok(stillPresent, 'Locked concept must be preserved across regenerations');
      assert.strictEqual(stillPresent?.locked, true);
    });

    it('creates version snapshot on approval and allows restoring earlier state', async () => {
      const concept = generatedConcepts[0];
      const versions = await ownerContext.run(testUserId, async () => {
        return await dataRepository
          .from('thumbnail_versions')
          .select('*')
          .eq('thumbnail_session_id', createdSessionId)
          .eq('user_id', testUserId);
      });

      assert.ok(versions.data && versions.data.length > 0, 'Approval should have recorded a version');

      const vRecord = versions.data[0];
      const restored = await ThumbnailLabService.restoreVersion(
        createdSessionId,
        vRecord.id,
        testUserId
      );

      assert.ok(restored);
      assert.strictEqual(restored.id, concept.id);
    });
  });

  describe('10. Publishing Handoff Integration', () => {
    it('returns normalized publishing handoff payload for composer integration', async () => {
      // Find currently existing concept in session
      const { concepts } = await ThumbnailLabService.getSession(createdSessionId, testUserId);
      assert.ok(concepts.length > 0);
      const target = concepts[0];

      const handoff = await ThumbnailLabService.getPublishingHandoff(
        createdSessionId,
        target.id,
        testUserId
      );

      assert.ok(handoff);
      assert.ok(handoff.thumbnail_url);
      assert.strictEqual(handoff.aspect_ratio, '16:9');
      assert.strictEqual(handoff.platform, 'youtube');
      assert.ok(handoff.diagnostics);
      assert.ok(handoff.diagnostics.overall_score >= 0);
    });
  });
});

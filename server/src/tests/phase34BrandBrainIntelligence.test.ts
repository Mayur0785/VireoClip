import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { BrandBrainService } from '../services/brand/brandBrainService.js';
import { BrandRecommendationService } from '../services/brand/brandRecommendationService.js';
import { BrandContextService } from '../services/brand/brandContextService.js';
import {
  BrandBrainProfile,
  BrandRecommendation,
  AppError,
} from '../types/index.js';

describe('Phase 34 — Vireo Brand Brain Intelligence Tests', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const userC = crypto.randomUUID();
  const clip1Id = crypto.randomUUID();
  const clip2Id = crypto.randomUUID();
  const clip3Id = crypto.randomUUID();
  const transcript1Id = crypto.randomUUID();
  const transcript2Id = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  before(async () => {
    // Ensure DB connection
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err: any) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  });

  after(async () => {
    // Cleanup test artifacts
    await ownerContext.run(userA, async () => {
      const db = await getMongoDb();
      await db.collection('brand_brain_profiles').deleteMany({ user_id: { $in: [userA, userB, userC] } });
      await db.collection('brand_recommendations').deleteMany({ user_id: { $in: [userA, userB, userC] } });
      await db.collection('brand_brain_versions').deleteMany({ user_id: { $in: [userA, userB, userC] } });
      await db.collection('clips').deleteMany({ user_id: { $in: [userA, userC] } });
      await db.collection('transcripts').deleteMany({ user_id: { $in: [userA, userC] } });
    });
  });

  it('1. Profile Creation & Reading: creates default profile with Phase 34 intelligence fields', async () => {
    const profile = await BrandBrainService.getProfile(userA);

    assert.ok(profile, 'Profile should be created');
    assert.equal(profile.user_id, userA);
    assert.equal(profile.version, 1);
    assert.equal(profile.status, 'active');

    // Phase 34 Intelligence fields present
    assert.ok('target_audience' in profile.identity, 'target_audience field should exist');
    assert.ok('content_pillars' in profile.identity, 'content_pillars field should exist');
    assert.ok('core_messaging' in profile.identity, 'core_messaging field should exist');
    assert.ok('positioning_statement' in profile.identity, 'positioning_statement field should exist');
    assert.ok('approved_terminology' in profile.voice, 'approved_terminology field should exist');
    assert.ok('forbidden_claims' in profile.voice, 'forbidden_claims field should exist');
    assert.ok('platform_guidance' in profile, 'platform_guidance field should exist');
    assert.ok('evidence_references' in profile, 'evidence_references field should exist');

    // Check version snapshot created
    const versions = await BrandBrainService.getVersionHistory(userA, profile.id);
    assert.ok(versions.length >= 1, 'Initial version snapshot should be recorded');
  });

  it('2. Profile Updating: merges Phase 34 intelligence fields and creates version snapshot', async () => {
    const updated = await BrandBrainService.updateProfile(userA, {
      identity: {
        target_audience: 'Senior backend engineers transitioning to AI systems',
        audience_needs: ['Fast code walkthroughs', 'Production architectures'],
        core_messaging: 'Architecting reliable AI without premature complexity',
        positioning_statement: 'For systems engineers, Vireo provides battle-tested production blueprints.',
        content_pillars: [
          { name: 'System Design', description: 'Deep-dive micro-architectures', keywords: ['scale', 'arch'] },
        ],
      },
      voice: {
        voice_summary: 'Direct, technical, zero-fluff',
        approved_terminology: [{ term: 'Zero-Downtime Pipeline', definition: 'Continuous deployment pattern' }],
        forbidden_claims: ['Guaranteed 100% bug free', 'Automates all programming'],
      },
    });

    assert.equal(updated.version, 2, 'Version should increment to 2');
    assert.equal(updated.identity.target_audience, 'Senior backend engineers transitioning to AI systems');
    assert.equal(updated.identity.content_pillars?.length, 1);
    assert.equal(updated.identity.content_pillars?.[0].name, 'System Design');
    assert.equal(updated.voice.voice_summary, 'Direct, technical, zero-fluff');
    assert.equal(updated.voice.approved_terminology?.length, 1);
    assert.equal(updated.voice.forbidden_claims?.length, 2);

    const versions = await BrandBrainService.getVersionHistory(userA, updated.id);
    assert.equal(versions[0].version, 2, 'Version history should contain v2 snapshot');
  });

  it('3. Insufficient Evidence Behavior: reports INSUFFICIENT_DATA and explains what is missing without inventing facts', async () => {
    // userB has 0 clips and 0 transcripts
    const recs = await BrandRecommendationService.getRecommendations(userB);

    assert.equal(recs.analytics_status, 'INSUFFICIENT_DATA');
    assert.equal(recs.analytics_sample_count, 0);
    assert.ok(recs.explanation, 'Must provide an explanation of what data is missing');
    assert.match(recs.explanation, /at least 3/i, 'Explanation should specify minimum evidence requirement');
  });

  it('4. Evidence-Based Derivation: generates proposed suggestions citing real clips and transcripts', async () => {
    // Seed 3 clips and 2 transcripts for userC
    await ownerContext.run(userC, async () => {
      await dataRepository.from('clips').insert({
        id: clip1Id,
        user_id: userC,
        project_id: projectId,
        title: 'Building Distributed Vector Databases from Scratch',
        status: 'ready',
      });
      await dataRepository.from('clips').insert({
        id: clip2Id,
        user_id: userC,
        project_id: projectId,
        title: 'Benchmarking Embedding Latency in Production',
        status: 'ready',
      });
      await dataRepository.from('clips').insert({
        id: clip3Id,
        user_id: userC,
        project_id: projectId,
        title: 'Real-time Event Streaming Architecture Tutorial',
        status: 'ready',
      });
      const project1Id = crypto.randomUUID();
      const project2Id = crypto.randomUUID();
      await dataRepository.from('transcripts').insert({
        id: transcript1Id,
        user_id: userC,
        project_id: project1Id,
        transcript_text: 'In this video we break down vector retrieval pipelines for backend software engineers building high-scale search.',
      });
      await dataRepository.from('transcripts').insert({
        id: transcript2Id,
        user_id: userC,
        project_id: project2Id,
        transcript_text: 'If you struggle with memory bottlenecks in streaming architectures, here are three tactical caching patterns.',
      });
    });

    const result = await BrandRecommendationService.getRecommendations(userC);

    assert.equal(result.analytics_status, 'SUFFICIENT_DATA');
    assert.ok(result.analytics_sample_count >= 5, 'Should count clips and transcripts as real evidence');
    assert.ok(result.recommendations.length > 0, 'Should propose evidence-derived recommendations');

    // Check evidence citations and proposed status
    for (const rec of result.recommendations) {
      assert.equal(rec.status, 'PROPOSED', 'Recommendations must start in PROPOSED status');
      assert.ok(rec.source === 'AI_DERIVED' || rec.source === 'EVIDENCE_LEARNED', 'Source must be distinct from USER_PROVIDED');
      assert.ok(rec.evidence, 'Evidence explanation must be present');
      assert.ok(Array.isArray(rec.evidence_references), 'Evidence references must be an array');
      assert.ok(rec.confidence === 'HIGH' || rec.confidence === 'MEDIUM' || rec.confidence === 'LOW');
    }

    // Recommendations are NOT silently written to the active profile
    const profile = await BrandBrainService.getProfile(userC);
    assert.equal(profile.version, 1, 'Profile must NOT be silently mutated by recommendation generation');
  });

  it('5. Human Review Approval Gate: approves proposed insight, applies it to profile, and records snapshot', async () => {
    const result = await BrandRecommendationService.getRecommendations(userC);
    const proposedRec = result.recommendations[0];
    assert.ok(proposedRec, 'At least one proposed recommendation must exist');

    // Approve the recommendation
    const approval = await BrandRecommendationService.approveRecommendation(userC, proposedRec.id, {
      confirm_overwrite: true,
    });

    assert.equal(approval.recommendation.status, 'APPROVED', 'Recommendation status must become APPROVED');
    assert.ok(approval.profile.version > 1, 'Profile version must increment upon approval');

    // Verify citations added to profile evidence_references
    if (proposedRec.evidence_references?.length) {
      assert.ok(
        approval.profile.evidence_references?.some((ref) => proposedRec.evidence_references?.includes(ref)),
        'Approved recommendation evidence citations must be linked to profile'
      );
    }

    // Verify version history includes INTELLIGENCE_APPROVAL snapshot
    const versions = await BrandBrainService.getVersionHistory(userC, approval.profile.id);
    const latestVersion = versions[0];
    assert.equal(latestVersion.source, 'INTELLIGENCE_APPROVAL');
  });

  it('6. Human Review Dismiss Gate: dismisses proposed insight and suppresses it from subsequent lists', async () => {
    const result = await BrandRecommendationService.getRecommendations(userC);
    const toDismiss = result.recommendations.find((r) => r.status === 'PROPOSED');
    assert.ok(toDismiss, 'At least one remaining proposed recommendation should exist on userC');

    const dismissed = await BrandRecommendationService.dismissRecommendation(userC, toDismiss.id);
    assert.equal(dismissed.recommendation.status, 'DISMISSED');

    // Verify dismissed recommendation is excluded from subsequent suggestions
    const reloaded = await BrandRecommendationService.getRecommendations(userC);
    const stillPresent = reloaded.recommendations.some((r) => r.id === toDismiss.id);
    assert.equal(stillPresent, false, 'Dismissed recommendation must not appear in active proposed list');
  });

  it('7. Overwrite Protection: blocks replacing approved guidelines without explicit confirmation', async () => {
    // Set an explicit approved value
    await BrandBrainService.updateProfile(userA, {
      identity: { core_messaging: 'Original approved core messaging' },
    });

    // Create a mock recommendation that targets core_messaging
    const mockRecId = crypto.randomUUID();
    await ownerContext.run(userA, async () => {
      await dataRepository.from('brand_recommendations').insert({
        id: mockRecId,
        user_id: userA,
        dimension: 'identity',
        field: 'core_messaging',
        title: 'New Messaging Suggestion',
        description: 'New derived proposition',
        evidence: 'Sample evidence',
        suggested_value: 'Overwriting message proposition',
        confidence: 'HIGH',
        source: 'AI_DERIVED',
        status: 'PROPOSED',
      });
    });

    // 1. Attempting to approve without confirm_overwrite should throw 409 CONFIRMATION_REQUIRED
    await assert.rejects(
      async () => {
        await BrandRecommendationService.approveRecommendation(userA, mockRecId, {
          confirm_overwrite: false,
        });
      },
      (err: any) => {
        return (
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'CONFIRMATION_REQUIRED' &&
          err.message.includes('confirm to overwrite')
        );
      },
      'Should block overwriting existing approved guideline without confirm_overwrite'
    );

    // 2. Supplying confirm_overwrite: true succeeds
    const approved = await BrandRecommendationService.approveRecommendation(userA, mockRecId, {
      confirm_overwrite: true,
    });
    assert.equal(approved.profile.identity.core_messaging, 'Overwriting message proposition');
  });

  it('8. Rule Lock Protection: blocks overwriting locked brand rules even if confirmation is sent', async () => {
    // Lock the setting
    await BrandBrainService.setLock(userA, 'identity.target_audience', true);

    const mockRecId = crypto.randomUUID();
    await ownerContext.run(userA, async () => {
      await dataRepository.from('brand_recommendations').insert({
        id: mockRecId,
        user_id: userA,
        dimension: 'identity',
        field: 'target_audience',
        title: 'Audience Suggestion for Locked Field',
        description: 'Trying to overwrite locked field',
        evidence: 'Test evidence',
        suggested_value: 'New locked audience value',
        confidence: 'HIGH',
        source: 'AI_DERIVED',
        status: 'PROPOSED',
      });
    });

    // Attempting to approve should throw 403 RULE_LOCKED
    await assert.rejects(
      async () => {
        await BrandRecommendationService.approveRecommendation(userA, mockRecId, {
          confirm_overwrite: true,
        });
      },
      (err: any) => {
        return (
          err instanceof AppError &&
          err.statusCode === 403 &&
          err.code === 'RULE_LOCKED' &&
          err.message.includes('locked brand rule')
        );
      },
      'Must reject modifying locked brand rules'
    );
  });

  it('9. Tenant Isolation: prevents User B from accessing or mutating User C recommendations', async () => {
    let recC: BrandRecommendation | undefined;
    await ownerContext.run(userC, async () => {
      const userCRecs = await dataRepository.from('brand_recommendations').select('*').eq('user_id', userC);
      recC = (userCRecs.data as BrandRecommendation[])[0];
    });
    assert.ok(recC, 'At least one recommendation for userC should exist in database');

    // User B tries to approve User C's recommendation
    await assert.rejects(
      async () => {
        await BrandRecommendationService.approveRecommendation(userB, recC!.id, {
          confirm_overwrite: true,
        });
      },
      (err: any) => {
        return err instanceof AppError && err.statusCode === 404;
      },
      'User B must receive 404 when attempting to access User C recommendation'
    );

    // User B tries to dismiss User C's recommendation
    await assert.rejects(
      async () => {
        await BrandRecommendationService.dismissRecommendation(userB, recC!.id);
      },
      (err: any) => {
        return err instanceof AppError && err.statusCode === 404;
      },
      'User B must receive 404 when attempting to dismiss User C recommendation'
    );
  });

  it('10. Downstream Content Workflows: BrandContextService delivers approved brand intelligence', async () => {
    // Unlock and set clean intelligence profile for userA
    await BrandBrainService.setLock(userA, 'identity.target_audience', false);
    await BrandBrainService.updateProfile(userA, {
      identity: {
        brand_name: 'Vertex Tech',
        target_audience: 'Senior cloud architects and AI engineers',
        audience_needs: ['System resilience', 'Microsecond latency'],
        core_messaging: 'Building cloud AI with measurable reliability',
        content_pillars: [
          { name: 'Architecture Blueprints', description: 'Real-world system design', keywords: ['cloud', 'ai'] },
        ],
      },
      voice: {
        tones: ['technical', 'pragmatic'],
        approved_terminology: [{ term: 'Zero-Downtime Migration', definition: 'Smooth migration pattern' }],
        forbidden_claims: ['Guaranteed 100% bug free'],
      },
    });

    // 1. Hook Lab consumption
    const hookContext = await BrandContextService.getBrandContext({
      userId: userA,
      taskType: 'HOOK_LAB',
    });
    assert.equal(hookContext.target_audience, 'Senior cloud architects and AI engineers');
    assert.deepEqual(hookContext.audience_needs, ['System resilience', 'Microsecond latency']);
    assert.deepEqual(hookContext.forbidden_claims, ['Guaranteed 100% bug free']);
    assert.ok(hookContext.content_pillars?.length === 1);
    assert.ok(hookContext.rules_applied.some((r) => r.includes('Hook DNA')));

    // 2. Content Pack consumption
    const contentPackContext = await BrandContextService.getBrandContext({
      userId: userA,
      taskType: 'CONTENT_PACK',
    });
    assert.equal(contentPackContext.target_audience, 'Senior cloud architects and AI engineers');
    assert.equal(contentPackContext.core_messaging, 'Building cloud AI with measurable reliability');
    assert.equal(contentPackContext.approved_terminology?.length, 1);
    assert.equal(contentPackContext.approved_terminology?.[0].term, 'Zero-Downtime Migration');
    assert.ok(contentPackContext.rules_applied.some((r) => r.includes('Content Pack Brand Intelligence')));

    // 3. Thumbnail Lab consumption
    const thumbContext = await BrandContextService.getBrandContext({
      userId: userA,
      taskType: 'THUMBNAIL_LAB',
    });
    assert.equal(thumbContext.target_audience, 'Senior cloud architects and AI engineers');
    assert.equal(thumbContext.core_messaging, 'Building cloud AI with measurable reliability');
    assert.ok((thumbContext.visual?.primary_colors?.length ?? 0) > 0);
    assert.ok(thumbContext.rules_applied.some((r) => r.includes('Thumbnail Lab')));

    // 4. Autopilot consumption
    const autopilotContext = await BrandContextService.getBrandContext({
      userId: userA,
      taskType: 'AUTOPILOT',
    });
    assert.equal(autopilotContext.target_audience, 'Senior cloud architects and AI engineers');
    assert.equal(autopilotContext.core_messaging, 'Building cloud AI with measurable reliability');
    assert.deepEqual(autopilotContext.forbidden_claims, ['Guaranteed 100% bug free']);
    assert.ok(autopilotContext.rules_applied.some((r) => r.includes('Autopilot full brand intelligence')));
  });

  after(async () => {
    await closeMongo().catch(() => undefined);
  });
});


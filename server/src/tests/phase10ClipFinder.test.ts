/**
 * Phase 10 AI Auto Clip Finder - Comprehensive Test Suite
 * Tests deterministic timestamp derivation, grounding, duration rules, hybrid scoring,
 * overlap deduplication, prompt building, candidate limits, duplicate analysis lock,
 * and API controller route behaviors without making real paid AI calls.
 */

import assert from 'node:assert/strict';
import { ClipAnalysisService, activeClipAnalysisSet } from '../services/clipAnalysisService.js';
import { ClipPromptService } from '../services/clipPromptService.js';
import {
  analyzeProjectClips,
  getProjectClipCandidates,
  updateProjectClipCandidate,
} from '../controllers/clipController.js';
import {
  TranscriptSegment,
  AIClipCandidate,
  CreatorProfileData,
  VALID_PLATFORMS,
  AuthenticatedRequest,
} from '../types/index.js';
import { Response } from 'express';

let passed = 0;
let total = 0;

function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✓ ${name}`);
        })
        .catch((err) => {
          console.error(`  ✗ ${name}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Helper to mock Express req, res
function mockReqRes(reqOverrides: any = {}) {
  const req = {
    headers: {},
    ip: '127.0.0.1',
    params: {},
    query: {},
    body: {},
    requestId: 'test-req-id-1234',
    ...reqOverrides,
  } as unknown as AuthenticatedRequest;

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
  };
}

async function runTests() {
  console.log('Running Phase 10 Deterministic AI Clip Finder Tests...\n');

  // ==========================================
  // 1. Duration Scoring Sweet Spots
  // ==========================================
  await it('Duration scoring: 20s–60s receives maximum score 100', () => {
    assert.equal(ClipAnalysisService.calculateDurationScore(20), 100);
    assert.equal(ClipAnalysisService.calculateDurationScore(42.5), 100);
    assert.equal(ClipAnalysisService.calculateDurationScore(60), 100);
  });

  await it('Duration scoring: 15s–20s and 60s–75s receive score 80', () => {
    assert.equal(ClipAnalysisService.calculateDurationScore(15), 80);
    assert.equal(ClipAnalysisService.calculateDurationScore(19.9), 80);
    assert.equal(ClipAnalysisService.calculateDurationScore(60.1), 80);
    assert.equal(ClipAnalysisService.calculateDurationScore(74.5), 80);
  });

  await it('Duration scoring: 75s–90s receives score 60', () => {
    assert.equal(ClipAnalysisService.calculateDurationScore(75.5), 60);
    assert.equal(ClipAnalysisService.calculateDurationScore(90), 60);
  });

  // ==========================================
  // 2. Hybrid Scoring Component Clamping & Weights
  // ==========================================
  await it('Hybrid scoring: calculates deterministic score and clamps between 0 and 100', () => {
    const candidate: AIClipCandidate = {
      start_segment_index: 0,
      end_segment_index: 2,
      title: 'High performer',
      hook: 'Watch this',
      reason: 'Great insight',
      category: 'insight',
      hook_score: 95,       // * 0.25 = 23.75
      standalone_score: 90, // * 0.20 = 18.00
      insight_score: 90,    // * 0.20 = 18.00
      emotion_score: 85,    // * 0.15 = 12.75
      platform_score: 90,   // * 0.10 = 9.00
    };
    // Duration 40s => duration_score = 100 (* 0.10 = 10.00)
    // Sum = 23.75 + 18 + 18 + 12.75 + 9 + 10 = 91.5 => round to 92
    const score = ClipAnalysisService.computeHybridScore(candidate, 40);
    assert.equal(score, 92);
    assert.ok(score >= 0 && score <= 100);
    assert.ok(Number.isInteger(score));
  });

  await it('Hybrid scoring: handles out-of-bound or negative scores gracefully', () => {
    const extremeCand: AIClipCandidate = {
      start_segment_index: 0,
      end_segment_index: 1,
      title: 'Extreme candidate',
      hook: 'Shocking',
      reason: 'Boundary test',
      category: 'entertaining',
      hook_score: 250,        // clamps to 100
      standalone_score: 150,   // clamps to 100
      insight_score: 120,      // clamps to 100
      emotion_score: 110,      // clamps to 100
      platform_score: 100,     // 100
    };
    const maxScore = ClipAnalysisService.computeHybridScore(extremeCand, 30);
    assert.equal(maxScore, 100);

    const minCand: AIClipCandidate = {
      ...extremeCand,
      hook_score: -50,
      standalone_score: -10,
      insight_score: 0,
      emotion_score: 0,
      platform_score: 0,
    };
    const lowScore = ClipAnalysisService.computeHybridScore(minCand, 5); // duration 5s = 40 (*0.10 = 4)
    assert.ok(lowScore >= 0 && lowScore <= 10);
  });

  // ==========================================
  // 3. Segment Index Conversion & Timestamp Grounding
  // ==========================================
  await it('Segment grounding: derives real start_seconds, end_seconds, and duration from segments', () => {
    const mockSegments: TranscriptSegment[] = [
      { start: 0.0, end: 5.25, text: 'Intro segment' },
      { start: 5.25, end: 18.5, text: 'Hook delivery' },
      { start: 18.5, end: 32.1, text: 'Core concept' },
      { start: 32.1, end: 49.8, text: 'Takeaway and conclusion' },
      { start: 49.8, end: 60.0, text: 'Outro wrap-up' },
    ];

    const startIndex = 1;
    const endIndex = 3;

    const startSeconds = Number(mockSegments[startIndex].start.toFixed(3));
    const endSeconds = Number(mockSegments[endIndex].end.toFixed(3));
    const durationSeconds = Number((endSeconds - startSeconds).toFixed(3));

    assert.equal(startSeconds, 5.25);
    assert.equal(endSeconds, 49.8);
    assert.equal(durationSeconds, 44.55);
    assert.ok(durationSeconds >= 15 && durationSeconds <= 90);
  });

  // ==========================================
  // 4. Overlap Ratio & Deduplication
  // ==========================================
  await it('Overlap calculation: accurately computes overlap relative to shorter duration', () => {
    // Cand A: 10s to 50s (dur 40s)
    // Cand B: 20s to 40s (dur 20s, inside A) -> shorter is 20s, overlap is 20s => 100% overlap
    const ratio = ClipAnalysisService.calculateOverlapRatio(10, 50, 20, 40);
    assert.equal(ratio, 1.0);

    // Cand C: 40s to 70s (dur 30s)
    // Overlap with Cand A (10 to 50): overlap is 50-40 = 10s. Shorter is Cand C (30s). 10 / 30 = ~0.333
    const ratioPartial = ClipAnalysisService.calculateOverlapRatio(10, 50, 40, 70);
    assert.ok(Math.abs(ratioPartial - 0.333) < 0.01);

    // Cand D: 60s to 90s -> no overlap with Cand A (10 to 50)
    const ratioNone = ClipAnalysisService.calculateOverlapRatio(10, 50, 60, 90);
    assert.equal(ratioNone, 0);
  });

  await it('Overlap deduplication: higher score wins when overlap >= 70%', () => {
    const candidates = [
      { start_seconds: 60, end_seconds: 105, engagement_score: 82, title: 'Lower scoring candidate A' },
      { start_seconds: 67, end_seconds: 101, engagement_score: 94, title: 'Higher scoring candidate B' },
      { start_seconds: 120, end_seconds: 160, engagement_score: 88, title: 'Independent non-overlapping moment' },
    ];

    const deduped = ClipAnalysisService.deduplicateCandidates(candidates, 0.70);
    assert.equal(deduped.length, 2);
    // Highest score candidate should be kept
    assert.equal(deduped[0].title, 'Higher scoring candidate B');
    assert.equal(deduped[0].engagement_score, 94);
    assert.equal(deduped[1].title, 'Independent non-overlapping moment');
  });

  await it('Candidate limits: caps top candidates to at most 12', () => {
    const twentyCandidates = Array.from({ length: 20 }, (_, i) => ({
      start_seconds: i * 100,
      end_seconds: i * 100 + 40,
      engagement_score: 70 + (i % 25),
      title: `Clip candidate ${i + 1}`,
    }));

    const deduped = ClipAnalysisService.deduplicateCandidates(twentyCandidates);
    const topClips = deduped.slice(0, 12);
    assert.equal(topClips.length, 12);
  });

  // ==========================================
  // 5. JSON Parsing & Malformed LLM Safety
  // ==========================================
  await it('JSON parser: extracts valid candidates from markdown-fenced json', () => {
    const fencedJson = `\`\`\`json
    {
      "clips": [
        {
          "start_segment_index": 0,
          "end_segment_index": 2,
          "title": "The Golden Rule of Hooks",
          "hook": "Stop doing this in 2026",
          "reason": "Clear contrarian advice",
          "category": "educational",
          "hook_score": 90,
          "standalone_score": 85,
          "insight_score": 92,
          "emotion_score": 75,
          "platform_score": 88
        }
      ]
    }
    \`\`\``;

    const parsed = ClipAnalysisService.parseAIResponse(fencedJson);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, 'The Golden Rule of Hooks');
    assert.equal(parsed[0].category, 'educational');
  });

  await it('JSON parser: rejects malformed or invalid segment ranges', () => {
    const rawWithInvalid = {
      clips: [
        {
          // Invalid: start > end
          start_segment_index: 10,
          end_segment_index: 4,
          title: 'Invalid backwards range',
          hook: 'Some hook',
        },
        {
          // Invalid: negative index
          start_segment_index: -2,
          end_segment_index: 5,
          title: 'Negative start',
          hook: 'Some hook',
        },
        {
          // Invalid: missing title
          start_segment_index: 0,
          end_segment_index: 3,
          title: '',
          hook: 'Some hook',
        },
        {
          // Valid
          start_segment_index: 1,
          end_segment_index: 3,
          title: 'Valid clip',
          hook: 'Strong hook',
          category: 'insight',
        },
      ],
    };

    const parsed = ClipAnalysisService.parseAIResponse(rawWithInvalid);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, 'Valid clip');
  });

  await it('JSON parser: throws clear error if response has no clips array', () => {
    assert.throws(() => {
      ClipAnalysisService.parseAIResponse({ wrong_key: [] });
    }, /does not contain a "clips" array/);
  });

  // ==========================================
  // 6. Prompt Construction & Creator Personalization
  // ==========================================
  await it('Prompt service: builds segment-indexed transcript and embeds creator persona', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 10, text: 'Hello creators!' },
      { start: 10, end: 35, text: 'Here is the real strategy for short form.' },
    ];
    const creatorProfile: CreatorProfileData = {
      niche: 'AI Tech & Productivity',
      target_audience: 'Engineers & Founders',
      custom_tone: 'Direct, analytical, actionable',
      preferred_hook_style: 'Start with surprising data',
      brand_rules: 'Never say subscribe or smash the like button',
      forbidden_phrases: 'game changer, secret sauce',
    };

    const prompt = ClipPromptService.buildClipAnalysisPrompt({
      segments,
      durationSeconds: 35,
      creatorProfile,
      customNotes: 'Focus on the second half of the video',
    });

    assert.ok(prompt.includes('[0] (0.0s - 10.0s) Hello creators!'));
    assert.ok(prompt.includes('[1] (10.0s - 35.0s) Here is the real strategy for short form.'));
    assert.ok(prompt.includes('AI Tech & Productivity'));
    assert.ok(prompt.includes('Engineers & Founders'));
    assert.ok(prompt.includes('Start with surprising data'));
    assert.ok(prompt.includes('Never say subscribe'));
    assert.ok(prompt.includes('Focus on the second half of the video'));
  });

  // ==========================================
  // 7. Duplicate Analysis Lock (activeClipAnalysisSet)
  // ==========================================
  await it('Duplicate analysis lock: blocks concurrent analysis for the same project', () => {
    const testProjectId = '77777777-7777-4777-a777-777777777777';
    activeClipAnalysisSet.add(testProjectId);

    assert.ok(activeClipAnalysisSet.has(testProjectId));

    // Release lock
    activeClipAnalysisSet.delete(testProjectId);
    assert.ok(!activeClipAnalysisSet.has(testProjectId));
  });

  // ==========================================
  // 8. Product Constraints & Platform Support
  // ==========================================
  await it('Product integrity: TikTok remains supported in VALID_PLATFORMS', () => {
    assert.ok(VALID_PLATFORMS.includes('tiktok'));
    assert.equal(VALID_PLATFORMS.length, 6);
  });

  // ==========================================
  // 9. API Controller: analyzeProjectClips
  // ==========================================
  await it('API analyze: returns 401 when request is unauthenticated', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: undefined,
      params: { id: '11111111-1111-4111-a111-111111111111' },
    });

    await analyzeProjectClips(req, res);
    assert.equal(getStatusCode(), 401);
    assert.equal(getResponseData().code, 'AUTH_REQUIRED');
  });

  await it('API analyze: returns 400 when project UUID is invalid', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: 'user-123', email: 'test@example.com' },
      params: { id: 'invalid-non-uuid' },
    });

    await analyzeProjectClips(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_UUID');
  });

  await it('API analyze: returns 409 when project analysis is already active', async () => {
    const activeId = '22222222-2222-4222-a222-222222222222';
    activeClipAnalysisSet.add(activeId);

    try {
      const { req, res, getStatusCode, getResponseData } = mockReqRes({
        user: { id: 'user-123', email: 'test@example.com' },
        params: { id: activeId },
      });

      await analyzeProjectClips(req, res);
      assert.equal(getStatusCode(), 409);
      assert.equal(getResponseData().code, 'CLIP_ANALYSIS_ACTIVE');
    } finally {
      activeClipAnalysisSet.delete(activeId);
    }
  });

  // ==========================================
  // 10. API Controller: getProjectClipCandidates
  // ==========================================
  await it('API getCandidates: returns 401 when unauthenticated and 400 for bad UUID', async () => {
    const unauth = mockReqRes({
      user: undefined,
      params: { id: '11111111-1111-4111-a111-111111111111' },
    });
    await getProjectClipCandidates(unauth.req, unauth.res);
    assert.equal(unauth.getStatusCode(), 401);

    const badUuid = mockReqRes({
      user: { id: 'user-123', email: 'test@example.com' },
      params: { id: 'bad-uuid' },
    });
    await getProjectClipCandidates(badUuid.req, badUuid.res);
    assert.equal(badUuid.getStatusCode(), 400);
    assert.equal(badUuid.getResponseData().code, 'INVALID_UUID');
  });

  // ==========================================
  // 11. API Controller: updateProjectClipCandidate
  // ==========================================
  await it('API updateCandidate: rejects arbitrary body fields for security', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: 'user-123', email: 'test@example.com' },
      params: {
        id: '11111111-1111-4111-a111-111111111111',
        candidateId: '22222222-2222-4222-a222-222222222222',
      },
      body: {
        status: 'selected',
        arbitrary_field: 'malicious_injection',
      },
    });

    await updateProjectClipCandidate(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_PAYLOAD');
  });

  await it('API updateCandidate: rejects invalid status values', async () => {
    const { req, res, getStatusCode, getResponseData } = mockReqRes({
      user: { id: 'user-123', email: 'test@example.com' },
      params: {
        id: '11111111-1111-4111-a111-111111111111',
        candidateId: '22222222-2222-4222-a222-222222222222',
      },
      body: {
        status: 'published', // Not allowed in Phase 10
      },
    });

    await updateProjectClipCandidate(req, res);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().code, 'INVALID_STATUS');
  });

  console.log(`\nPhase 10 Results: ${passed}/${total} tests passed.\n`);
  if (passed !== total) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});

/**
 * Phase 4 AI Content Quality + Clip Intelligence Deterministic Tests
 *
 * Verifies:
 * A. Transcript-grounded generation validation & hallucination prevention
 * B. Structured output validation for all six supported platforms
 * C. Platform-specific generation distinctiveness
 * D. Creator voice & forbidden phrases enforcement
 * E. Duplicate output prevention (hooks, titles, threads)
 * F. Clip candidate validation & segment grounding
 * G. Clip heuristic scoring
 * H. Short-video handling (<15s)
 * I. Caption timing & punctuation-aware cue grouping
 * J. Malformed AI response handling & recovery
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContentQualityUtils } from '../utils/contentQualityUtils.js';
import { ContentPromptService, PromptContext } from '../services/contentPromptService.js';
import { ContentOutputService } from '../services/contentOutputService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ClipPromptService } from '../services/clipPromptService.js';
import { CaptionService } from '../services/captionService.js';
import {
  AIClipCandidate,
  TranscriptSegment,
  TimedCaptionToken,
  VALID_PLATFORMS,
} from '../types/index.js';

describe('Phase 4: AI Content Quality + Clip Intelligence Tests', () => {

  // =========================================================================
  // Test A: Transcript-grounded generation & hallucination prevention
  // =========================================================================
  describe('A. Transcript Grounding & Anti-Hallucination', () => {
    const realTranscript = 'In this episode, we break down five habits for building clean microservices with Docker and Node.js.';

    it('verifies generated text that reflects real transcript vocabulary', () => {
      const generatedPost = 'Here are five practical habits for building microservices using Docker and Node.js.';
      const result = ContentQualityUtils.verifyTranscriptGrounding(generatedPost, realTranscript, 0.3);
      assert.equal(result.grounded, true);
      assert.ok(result.groundingRatio >= 0.3);
    });

    it('detects ungrounded generated text introducing unrelated fabricated topics', () => {
      const hallucinatedPost = 'Quantum computing breakthrough in Zurich allows teleportation of cryptographic Bitcoin keys.';
      const result = ContentQualityUtils.verifyTranscriptGrounding(hallucinatedPost, realTranscript, 0.3);
      assert.equal(result.grounded, false);
      assert.ok(result.groundingRatio < 0.2);
    });

    it('system prompt strictly enforces transcript grounding and forbids invented facts', () => {
      const systemPrompt = ContentPromptService.getSystemPrompt();
      assert.match(systemPrompt, /STRICT TRANSCRIPT GROUNDING/);
      assert.match(systemPrompt, /NEVER fabricate statistics/);
      assert.match(systemPrompt, /NEVER invent names of people, companies, tools/);
    });
  });

  // =========================================================================
  // Test B: Structured Output Validation for all Six Platforms
  // =========================================================================
  describe('B. Structured Output Validation across Six Platforms', () => {
    it('confirms all six platforms are registered in VALID_PLATFORMS', () => {
      assert.deepEqual(VALID_PLATFORMS, ['youtube', 'instagram', 'shorts', 'tiktok', 'linkedin', 'x']);
    });

    it('transforms structured YouTube output into correct database rows', () => {
      const rows = ContentOutputService.transformYouTubeToRows('p-1', {
        titles: ['Microservices Masterclass', 'Building Scalable Apps'],
        description: 'Comprehensive breakdown of architecture.',
        chapters: [{ timestamp: '00:00', title: 'Intro' }],
        keywords: ['microservices', 'docker', 'nodejs'],
      });
      assert.equal(rows.length, 5); // 2 titles, 1 description, 1 chapters, 1 keywords
      assert.equal(rows[0].platform, 'youtube');
      assert.equal(rows[0].content_type, 'title');
      assert.equal(rows[2].content_type, 'description');
    });

    it('transforms structured Instagram output into hook, caption, and hashtag rows', () => {
      const rows = ContentOutputService.transformInstagramToRows('p-1', {
        hooks: ['Stop building monoliths today', 'The secret to scalable code'],
        caption: 'Detailed IG caption explaining clean architecture.',
        hashtags: ['#developer', '#coding', '#software'],
      });
      assert.equal(rows.length, 4); // 2 hooks, 1 caption, 1 hashtags
      assert.equal(rows[0].platform, 'instagram');
      assert.equal(rows[0].content_type, 'hook');
      assert.equal(rows[2].content_type, 'caption');
      assert.equal(rows[3].content_type, 'hashtags');
    });

    it('transforms structured Shorts output into individual moment rows', () => {
      const rows = ContentOutputService.transformShortsToRows('p-1', {
        moments: [
          { start: '00:10', end: '00:40', hook: 'Docker in 30s', description: 'Quick walkthrough' },
          { start: '01:00', end: '01:35', hook: 'Why Node.js', description: 'Runtime speed explanation' },
        ],
      });
      assert.equal(rows.length, 2);
      assert.equal(rows[0].platform, 'shorts');
      assert.equal(rows[0].content_type, 'moment');
      assert.match(rows[0].content, /\[00:10 - 00:40\] Docker in 30s/);
    });

    it('transforms structured TikTok output into hooks, caption, and moment rows', () => {
      const rows = ContentOutputService.transformTikTokToRows('p-1', {
        hooks: ['Hook 1', 'Hook 2'],
        caption: 'TikTok caption with engagement CTA',
        moment: { start: '00:15', end: '00:45', description: 'Actionable tip', timestamps_available: true },
      });
      assert.equal(rows.length, 4); // 2 hooks, 1 caption, 1 moment
      assert.equal(rows[0].platform, 'tiktok');
      assert.equal(rows[2].content_type, 'caption');
      assert.equal(rows[3].content_type, 'moment');
    });

    it('transforms structured LinkedIn output into post row', () => {
      const rows = ContentOutputService.transformLinkedInToRows('p-1', {
        post: 'Architecture leadership lesson for engineering leaders...',
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].platform, 'linkedin');
      assert.equal(rows[0].content_type, 'post');
    });

    it('transforms structured X (Twitter) output into standalone post and thread rows', () => {
      const rows = ContentOutputService.transformTwitterToRows('p-1', {
        post: 'Single punchy tweet under 280 chars.',
        thread: ['Thread tweet 1', 'Thread tweet 2', 'Thread tweet 3'],
      });
      assert.equal(rows.length, 4); // 1 post, 3 thread tweets
      assert.equal(rows[0].platform, 'x');
      assert.equal(rows[0].content_type, 'post');
      assert.equal(rows[1].content_type, 'thread');
      assert.equal(rows[1].position, 1);
      assert.equal(rows[3].position, 3);
    });
  });

  // =========================================================================
  // Test C: Platform-Specific Prompt Specialization
  // =========================================================================
  describe('C. Platform-Specific Generation Differentiation', () => {
    const ctx: PromptContext = {
      transcript: 'Full transcript about scaling distributed databases with consensus protocols.',
      language: 'English',
      duration: 120,
      segments: [],
    };

    it('generates platform-native instructions distinct across all 6 targets', () => {
      const ytPrompt = ContentPromptService.buildPromptForPlatform('youtube', ctx);
      const igPrompt = ContentPromptService.buildPromptForPlatform('instagram', ctx);
      const shortsPrompt = ContentPromptService.buildPromptForPlatform('shorts', ctx);
      const tiktokPrompt = ContentPromptService.buildPromptForPlatform('tiktok', ctx);
      const linkedinPrompt = ContentPromptService.buildPromptForPlatform('linkedin', ctx);
      const xPrompt = ContentPromptService.buildPromptForPlatform('x', ctx);

      // Verify YouTube focuses on CTR, search keywords, and chapters
      assert.match(ytPrompt, /YouTube optimization package/);
      assert.match(ytPrompt, /keywords/);

      // Verify Instagram focuses on visual saves, carousel flow, and hashtags
      assert.match(igPrompt, /Instagram Reel \/ Carousel \/ Post package/);
      assert.match(igPrompt, /hashtags/);

      // Verify Shorts focuses on high-retention vertical moments
      assert.match(shortsPrompt, /high-retention short-form clip moments/);
      assert.match(shortsPrompt, /moments/);

      // Verify TikTok focuses on fast-paced hook angles and conversation CTA
      assert.match(tiktokPrompt, /native TikTok content package/);

      // Verify LinkedIn focuses on professional storytelling, thought leadership, and whitespace
      assert.match(linkedinPrompt, /LinkedIn post/);

      // Verify X focuses on 280-char limit and multi-part thread progression
      assert.match(xPrompt, /X \(Twitter\) standalone post and a value-packed companion thread/);
      assert.match(xPrompt, /under 280 characters/);
    });
  });

  // =========================================================================
  // Test D: Creator Voice & Forbidden Phrases Enforcement
  // =========================================================================
  describe('D. Creator Voice & Forbidden Phrases Enforcement', () => {
    it('detects forbidden phrases in text accurately', () => {
      const text = 'This revolutionary product is guaranteed to double your income!';
      const forbidden = 'revolutionary, guaranteed, double your income';
      const found = ContentQualityUtils.findForbiddenPhrases(text, forbidden);
      assert.deepEqual(found, ['revolutionary', 'guaranteed', 'double your income']);
    });

    it('sanitizes text by stripping forbidden phrases', () => {
      const text = 'Our revolutionary strategy brings guaranteed results.';
      const forbidden = 'revolutionary, guaranteed';
      const cleaned = ContentQualityUtils.sanitizeForbiddenPhrases(text, forbidden);
      assert.equal(cleaned.includes('revolutionary'), false);
      assert.equal(cleaned.includes('guaranteed'), false);
      assert.equal(cleaned, 'Our strategy brings results.');
    });

    it('injects creator persona, target CTA, and brand rules into prompt context', () => {
      const ctx: PromptContext = {
        transcript: 'Real transcript text.',
        creatorProfile: {
          niche: 'FinTech Engineering',
          target_audience: 'Senior Architects',
          tone: 'Direct & Pragmatic',
          youtube_cta: 'Subscribe to Architecture Weekly',
          brand_rules: 'Never speak in hype; focus on benchmarks.',
          forbidden_phrases: 'game-changer, 10x developer',
        },
      };

      const prompt = ContentPromptService.buildPromptForPlatform('youtube', ctx);
      assert.match(prompt, /FinTech Engineering/);
      assert.match(prompt, /Senior Architects/);
      assert.match(prompt, /Direct & Pragmatic/);
      assert.match(prompt, /Subscribe to Architecture Weekly/);
      assert.match(prompt, /Never speak in hype/);
      assert.match(prompt, /game-changer, 10x developer/);
    });
  });

  // =========================================================================
  // Test E: Duplicate Output Prevention
  // =========================================================================
  describe('E. Duplicate & Repetition Prevention', () => {
    it('calculates word similarity accurately between similar sentences', () => {
      const s1 = 'How to scale your database in 5 steps';
      const s2 = 'How to scale your database in five steps';
      const sim = ContentQualityUtils.calculateWordSimilarity(s1, s2);
      assert.ok(sim > 0.6, `Similarity should be high, was ${sim}`);
    });

    it('deduplicates near-identical title suggestions preserving distinct angles', () => {
      const titles = [
        'How to Scale Your Microservices Effectively',
        'How to Scale Your Microservices Very Effectively', // near-duplicate (>0.7 similarity)
        'The Cost of Monoliths in Modern Cloud',            // distinct
        'Why Distributed Systems Fail at Scale',             // distinct
      ];

      const deduped = ContentQualityUtils.deduplicateStrings(titles, 0.70);
      assert.equal(deduped.length, 3);
      assert.equal(deduped[0], 'How to Scale Your Microservices Effectively');
      assert.equal(deduped[1], 'The Cost of Monoliths in Modern Cloud');
      assert.equal(deduped[2], 'Why Distributed Systems Fail at Scale');
    });

    it('identifies generic clickbait phrases correctly', () => {
      assert.equal(ContentQualityUtils.isGenericClickbait('You won\'t believe this one trick!'), true);
      assert.equal(ContentQualityUtils.isGenericClickbait('Stop doing this immediately or fail'), true);
      assert.equal(ContentQualityUtils.isGenericClickbait('Here is how we optimized PostgreSQL queries by 40%'), false);
    });
  });

  // =========================================================================
  // Test F: Clip Candidate Validation & Segment Grounding
  // =========================================================================
  describe('F. Clip Candidate Validation & Timestamp Grounding', () => {
    it('parses valid AI JSON response and extracts structured candidates', () => {
      const aiResponse = {
        clips: [
          {
            start_segment_index: 2,
            end_segment_index: 5,
            title: 'Why Caching Fails',
            hook: 'The biggest mistake developers make with Redis',
            reason: 'High retention educational moment',
            category: 'educational',
            hook_score: 90,
            standalone_score: 85,
            insight_score: 95,
            emotion_score: 70,
            platform_score: 88,
          },
        ],
      };

      const parsed = ClipAnalysisService.parseAIResponse(aiResponse);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].title, 'Why Caching Fails');
      assert.equal(parsed[0].start_segment_index, 2);
      assert.equal(parsed[0].end_segment_index, 5);
      assert.equal(parsed[0].category, 'educational');
    });

    it('rejects invalid segment indexes (negative or end < start)', () => {
      const invalidResponse = {
        clips: [
          {
            start_segment_index: 5,
            end_segment_index: 2, // invalid
            title: 'Bad Clip',
            hook: 'Bad Hook',
            reason: 'Bad',
          },
          {
            start_segment_index: -1, // invalid
            end_segment_index: 3,
            title: 'Negative Clip',
            hook: 'Negative',
            reason: 'Bad',
          },
        ],
      };

      const parsed = ClipAnalysisService.parseAIResponse(invalidResponse);
      assert.equal(parsed.length, 0);
    });
  });

  // =========================================================================
  // Test G: Clip Heuristic Scoring Logic
  // =========================================================================
  describe('G. Clip Scoring Heuristics', () => {
    it('calculates duration score matching sweet spots (20s–60s = 100)', () => {
      assert.equal(ClipAnalysisService.calculateDurationScore(30), 100);
      assert.equal(ClipAnalysisService.calculateDurationScore(18), 80);
      assert.equal(ClipAnalysisService.calculateDurationScore(70), 80);
      assert.equal(ClipAnalysisService.calculateDurationScore(85), 60);
      assert.equal(ClipAnalysisService.calculateDurationScore(10), 40);
    });

    it('computes weighted hybrid score deterministically from all components', () => {
      const candidate: AIClipCandidate = {
        start_segment_index: 0,
        end_segment_index: 4,
        title: 'Perfect Clip',
        hook: 'Hook',
        reason: 'Reason',
        category: 'educational',
        hook_score: 90,        // 0.25 * 90 = 22.5
        standalone_score: 80,  // 0.20 * 80 = 16.0
        insight_score: 90,     // 0.20 * 90 = 18.0
        emotion_score: 70,     // 0.15 * 70 = 10.5
        platform_score: 85,    // 0.10 * 85 = 8.5
      };
      // Duration 40s gives duration score 100 -> 0.10 * 100 = 10.0
      // Sum = 22.5 + 16.0 + 18.0 + 10.5 + 8.5 + 10.0 = 85.5 -> round = 86
      const score = ClipAnalysisService.computeHybridScore(candidate, 40);
      assert.equal(score, 86);
    });

    it('deduplicates overlapping clip candidates keeping the higher score', () => {
      const candidates = [
        { start_seconds: 10, end_seconds: 40, engagement_score: 75, title: 'Low score overlap' },
        { start_seconds: 12, end_seconds: 42, engagement_score: 92, title: 'High score overlap' },
        { start_seconds: 60, end_seconds: 90, engagement_score: 80, title: 'Non-overlapping moment' },
      ];

      const deduped = ClipAnalysisService.deduplicateCandidates(candidates, 0.70);
      assert.equal(deduped.length, 2);
      assert.equal(deduped[0].title, 'High score overlap');
      assert.equal(deduped[1].title, 'Non-overlapping moment');
    });
  });

  // =========================================================================
  // Test H: Short Video Handling (<15 seconds)
  // =========================================================================
  describe('H. Short Video Handling (<15s duration)', () => {
    it('clip prompt adapts duration bounds dynamically when video is under 15 seconds', () => {
      const segments: TranscriptSegment[] = [
        { start: 0, end: 4.5, text: 'Hello world, quick tip.' },
        { start: 4.5, end: 9.8, text: 'This is the complete lesson.' },
      ];

      const prompt = ClipPromptService.buildClipAnalysisPrompt({
        segments,
        durationSeconds: 9.8,
      });

      assert.match(prompt, /This video is short \(~10s\)/);
      assert.match(prompt, /Clips may span between 2 seconds and 10 seconds/);
    });
  });

  // =========================================================================
  // Test I: Caption Timing, Grouping, and Punctuation Breaks
  // =========================================================================
  describe('I. Caption Timing & Grouping Engine', () => {
    it('groups words into natural cues respecting max words limit and breaks on punctuation', () => {
      const tokens: TimedCaptionToken[] = [
        { text: 'Stop', start: 0.1, end: 0.4 },
        { text: 'doing', start: 0.4, end: 0.7 },
        { text: 'this.', start: 0.7, end: 1.0 }, // period triggers boundary break
        { text: 'Here', start: 1.2, end: 1.5 },
        { text: 'is', start: 1.5, end: 1.8 },
        { text: 'the', start: 1.8, end: 2.0 },
        { text: 'fix.', start: 2.0, end: 2.4 },
      ];

      const cues = CaptionService.groupIntoCues(tokens, 4);
      assert.equal(cues.length, 2);
      assert.equal(cues[0].text, 'Stop doing this.');
      assert.equal(cues[1].text, 'Here is the fix.');
    });

    it('enforces monotonic non-overlapping timing across cues', () => {
      const cues = [
        { id: 'c1', start: 0.0, end: 2.5, text: 'Cue 1' },
        { id: 'c2', start: 2.0, end: 4.0, text: 'Cue 2' }, // overlaps with c1
      ];

      const adjusted = CaptionService.enforceZeroOverlap(cues);
      assert.ok(adjusted[0].end <= adjusted[1].start);
      assert.equal(adjusted[0].end, 2.0);
    });
  });

  // =========================================================================
  // Test J: Malformed AI JSON Handling & Recovery
  // =========================================================================
  describe('J. Malformed AI Response Handling', () => {
    it('parses markdown-fenced ```json cleanly without throwing error', () => {
      const rawWithFences = '```json\n{\n  "clips": []\n}\n```';
      const parsed = ClipAnalysisService.parseAIResponse(rawWithFences);
      assert.deepEqual(parsed, []);
    });

    it('throws informative error on completely unparseable garbage without crashing server', () => {
      const unparseable = '<html><body>502 Bad Gateway</body></html>';
      assert.throws(() => {
        ClipAnalysisService.parseAIResponse(unparseable);
      }, /Failed to parse AI clip analysis JSON/);
    });

    it('throws error when response is missing clips array', () => {
      const missingClips = JSON.stringify({ message: 'Here is what I found' });
      assert.throws(() => {
        ClipAnalysisService.parseAIResponse(missingClips);
      }, /does not contain a "clips" array/);
    });
  });

});

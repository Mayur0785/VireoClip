import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForbiddenPhrases,
  validateAndSanitizeCreatorProfile,
} from '../controllers/profileController.js';
import { ContentPromptService, PromptContext } from '../services/contentPromptService.js';
import { ContentQualityUtils } from '../utils/contentQualityUtils.js';

describe('Phase 8: Creator Profile & Brand Intelligence Deterministic Tests', () => {

  describe('1. Forbidden Phrases Normalization & Deterministic Enforcement', () => {
    it('normalizes forbidden phrases: trims, lower-cases deduplication, filters empty', () => {
      const raw = '  game changer , unlock your potential;\n GAME CHANGER \n fast-paced world; ; a ';
      const normalized = normalizeForbiddenPhrases(raw);
      assert.equal(normalized, 'game changer, unlock your potential, fast-paced world');
    });

    it('returns empty string for undefined or blank forbidden phrases', () => {
      assert.equal(normalizeForbiddenPhrases(undefined), '');
      assert.equal(normalizeForbiddenPhrases(''), '');
      assert.equal(normalizeForbiddenPhrases('   ; , \n '), '');
    });

    it('detects forbidden phrases deterministically in generated text', () => {
      const text = 'This new feature is a complete game changer for developers in today\'s fast-paced world!';
      const forbiddenConfig = 'game changer, fast-paced world, silver bullet';
      const matches = ContentQualityUtils.findForbiddenPhrases(text, forbiddenConfig);
      assert.deepEqual(matches, ['game changer', 'fast-paced world']);
    });

    it('sanitizes text by removing detected forbidden phrases cleanly', () => {
      const text = 'This tool is a game changer for modern workflows.';
      const forbiddenConfig = 'game changer';
      const cleaned = ContentQualityUtils.sanitizeForbiddenPhrases(text, forbiddenConfig);
      assert.equal(cleaned, 'This tool is a for modern workflows.');
      assert.equal(cleaned.toLowerCase().includes('game changer'), false);
    });
  });

  describe('2. Creator Profile Input Validation & Boundaries', () => {
    it('validates and accepts full creator profile within length limits', () => {
      const input = {
        brand_name: 'TechCraft Media',
        niche: 'AI & Automation',
        target_audience: 'Engineers & Tech Founders',
        brand_description: 'Demystifying AI infrastructure with hands-on code examples.',
        language: 'English',
        tone: 'Technical',
        custom_tone: 'Pragmatic and authoritative',
        content_goals: 'Drive authority and newsletter signups',
        website_url: 'https://techcraft.dev',
        newsletter_url: 'https://techcraft.dev/newsletter',
        podcast_url: 'https://techcraft.dev/podcast',
        youtube_cta: 'Subscribe for deep-dives',
        instagram_cta: 'Save this post for later',
        linkedin_cta: 'Follow for architecture lessons',
        twitter_cta: 'Retweet if this helped you',
        tiktok_cta: 'Check bio for source code',
        preferred_hook_style: 'Problem-first hooks',
        brand_rules: 'Never use hype; always cite reproducible benchmarks.',
        forbidden_phrases: 'game changer, 10x developer, silver bullet',
      };

      const result = validateAndSanitizeCreatorProfile(input);
      assert.equal(result.error, undefined);
      assert.equal(result.sanitized.brand_name, 'TechCraft Media');
      assert.equal(result.sanitized.brand_description, 'Demystifying AI infrastructure with hands-on code examples.');
      assert.equal(result.sanitized.content_goals, 'Drive authority and newsletter signups');
      assert.equal(result.sanitized.forbidden_phrases, 'game changer, 10x developer, silver bullet');
    });

    it('rejects non-string fields', () => {
      const result = validateAndSanitizeCreatorProfile({ niche: 12345 as any });
      assert.match(result.error || '', /must be a string/);
    });

    it('rejects oversized payload exceeding 2000 characters per field', () => {
      const hugeString = 'a'.repeat(2001);
      const result = validateAndSanitizeCreatorProfile({ brand_rules: hugeString });
      assert.match(result.error || '', /exceeds maximum length of 2000 characters/);
    });

    it('supports empty or partial creator profile gracefully', () => {
      const emptyResult = validateAndSanitizeCreatorProfile({});
      assert.equal(emptyResult.error, undefined);
      assert.deepEqual(emptyResult.sanitized, {});

      const partialResult = validateAndSanitizeCreatorProfile({ tone: 'Conversational' });
      assert.equal(partialResult.error, undefined);
      assert.equal(partialResult.sanitized.tone, 'Conversational');
      assert.equal(partialResult.sanitized.niche, undefined);
    });
  });

  describe('3. AI Prompt Construction with Brand Persona & Overrides', () => {
    it('injects all brand fields into formatCreatorContext when fully configured', () => {
      const ctx: PromptContext = {
        transcript: 'Real transcript text.',
        creatorProfile: {
          brand_name: 'Nexus Code',
          niche: 'Backend Architecture',
          target_audience: 'Senior Developers',
          brand_description: 'High-scale distributed systems principles.',
          tone: 'Professional',
          content_goals: 'Educate and demonstrate thought leadership',
          preferred_hook_style: 'Contrarian / bold take hooks',
          brand_rules: 'Keep code snippets idiomatic and concise.',
          forbidden_phrases: 'revolutionary, magic, effortless',
          youtube_cta: 'Subscribe to Nexus Code',
          linkedin_cta: 'Follow for daily systems tips',
          twitter_cta: 'Repost the thread if you learned something',
        },
      };

      const promptYT = ContentPromptService.buildPromptForPlatform('youtube', ctx);
      assert.match(promptYT, /Creator \/ Brand Name: Nexus Code/);
      assert.match(promptYT, /Niche: Backend Architecture/);
      assert.match(promptYT, /Target Audience: Senior Developers/);
      assert.match(promptYT, /Brand Story & Mission: High-scale distributed systems principles/);
      assert.match(promptYT, /Core Content Goals: Educate and demonstrate thought leadership/);
      assert.match(promptYT, /Preferred Hook Style: Contrarian \/ bold take hooks/);
      assert.match(promptYT, /Writing Style & Brand Guidelines: Keep code snippets idiomatic and concise/);
      assert.match(promptYT, /STRICT FORBIDDEN PHRASES \(DO NOT USE\): revolutionary, magic, effortless/);
      assert.match(promptYT, /Target CTA: Subscribe to Nexus Code/);

      const promptLI = ContentPromptService.buildPromptForPlatform('linkedin', ctx);
      assert.match(promptLI, /Target CTA: Follow for daily systems tips/);

      const promptX = ContentPromptService.buildPromptForPlatform('x', ctx);
      assert.match(promptX, /Target CTA: Repost the thread if you learned something/);
    });

    it('falls back cleanly when no creator profile is provided (backwards compatibility)', () => {
      const ctx: PromptContext = {
        transcript: 'Just transcript.',
      };

      const prompt = ContentPromptService.buildPromptForPlatform('youtube', ctx);
      assert.match(prompt, /- Tone of Voice: Friendly/);
      assert.match(prompt, /- Language: English/);
      assert.doesNotMatch(prompt, /BRAND RULES:/);
      assert.doesNotMatch(prompt, /STRICT FORBIDDEN PHRASES/);
      assert.doesNotMatch(prompt, /Creator \/ Brand Name:/);
      assert.doesNotMatch(prompt, /Niche:/);
    });

    it('prioritizes per-generation overrides over creator profile defaults', () => {
      const ctx: PromptContext = {
        transcript: 'Transcript text.',
        creatorProfile: {
          tone: 'Professional',
          language: 'English',
          youtube_cta: 'Default YouTube CTA',
        },
        overrides: {
          overrideTone: 'Energetic & Humorous',
          overrideLanguage: 'Spanish',
          overrideCTA: 'Override Custom CTA',
        },
      };

      assert.equal(ContentPromptService.resolveEffectiveTone(ctx), 'Energetic & Humorous');
      assert.equal(ContentPromptService.resolveEffectiveLanguage(ctx), 'Spanish');
      assert.equal(ContentPromptService.resolveEffectiveCTA('youtube', ctx), 'Override Custom CTA');

      const prompt = ContentPromptService.buildPromptForPlatform('youtube', ctx);
      assert.match(prompt, /Tone of Voice: Energetic & Humorous/);
      assert.match(prompt, /Language: Spanish/);
      assert.match(prompt, /Target CTA: Override Custom CTA/);
    });

    it('maintains transcript grounding as the top priority over creator instructions', () => {
      const systemPrompt = ContentPromptService.getSystemPrompt();
      assert.match(systemPrompt, /1\. STRICT TRANSCRIPT GROUNDING: Rely EXCLUSIVELY on facts/);
      assert.match(systemPrompt, /NEVER fabricate statistics/);
      assert.match(systemPrompt, /CREATOR VOICE FIDELITY/);
    });
  });
});

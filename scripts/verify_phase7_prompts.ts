import { ContentPromptService, PromptContext } from '../server/src/services/contentPromptService.js';
import type { CreatorProfileData, GenerationOverrides } from '../server/src/types/index.js';

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    passed++;
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== RUNNING PHASE 7 STEP 15 DETERMINISTIC PROMPT TESTS ===\n');

const sampleTranscript = 'Today we will discuss how remote founders can stay focused, manage distraction, and use time blocking.';

// Test 1: Preset tone only
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    tone: 'Bold',
    language: 'English',
    niche: 'Productivity'
  };
  const ctx: PromptContext = {
    transcript: sampleTranscript,
    creatorProfile: profile
  };
  const prompt = ContentPromptService.buildYouTubePrompt(ctx);
  assert(prompt.includes('- Tone of Voice: Bold'), 'Test 1: Preset tone Bold correctly present in prompt');
  assert(!prompt.includes('Custom Tone') && !prompt.includes('Custom Brand Voice'), 'Test 1: No Custom Tone mentioned when preset used');
}

// Test 2: Custom tone
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    tone: 'Custom',
    custom_tone: 'High-energy, direct, slightly sarcastic, practical and confident.',
    language: 'English',
    niche: 'SaaS'
  };
  const ctx: PromptContext = {
    transcript: sampleTranscript,
    creatorProfile: profile
  };
  const prompt = ContentPromptService.buildTwitterPrompt(ctx);
  assert(prompt.includes('- Tone of Voice: High-energy, direct, slightly sarcastic, practical and confident.'), 'Test 2: Custom tone string reflected');
  assert(!prompt.includes('- Tone of Voice: Custom'), 'Test 2: Raw "Custom" label avoided, resolved custom voice rendered');
}

// Test 3: Video-level tone override
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    tone: 'Professional',
    language: 'English'
  };
  const overrides: GenerationOverrides = {
    overrideTone: 'Playful and punchy'
  };
  const ctx: PromptContext = {
    transcript: sampleTranscript,
    creatorProfile: profile,
    notes: 'test notes',
    overrides
  };
  const prompt = ContentPromptService.buildInstagramPrompt(ctx);
  assert(prompt.includes('- Tone of Voice: Playful and punchy'), 'Test 3: Video-level tone override takes precedence in persona');
  assert(prompt.includes('- Video Tone Override Applied: Playful and punchy'), 'Test 3: Video-specific instruction section contains override');
}

// Test 4: Video-level language override
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    language: 'English'
  };
  const overrides: GenerationOverrides = {
    overrideLanguage: 'Spanish'
  };
  const ctx: PromptContext = {
    transcript: sampleTranscript,
    creatorProfile: profile,
    overrides
  };
  const prompt = ContentPromptService.buildLinkedInPrompt(ctx);
  assert(prompt.includes('- Language: Spanish'), 'Test 4: Video-level language override reflected in Persona');
  assert(prompt.includes('- Video Language Override Applied: Spanish'), 'Test 4: Video-level language override reflected in instructions');
}

// Test 5: Platform-specific CTA
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    youtube_cta: 'Subscribe to the YouTube channel for weekly deep dives!',
    linkedin_cta: 'Follow me on LinkedIn and ring the bell for updates.'
  };
  const ytPrompt = ContentPromptService.buildYouTubePrompt({
    transcript: sampleTranscript,
    creatorProfile: profile
  });
  assert(ytPrompt.includes('Subscribe to the YouTube channel for weekly deep dives!'), 'Test 5: YouTube prompt gets youtube_cta');
  assert(!ytPrompt.includes('Follow me on LinkedIn'), 'Test 5: YouTube prompt does not receive linkedin_cta');

  const liPrompt = ContentPromptService.buildLinkedInPrompt({
    transcript: sampleTranscript,
    creatorProfile: profile
  });
  assert(liPrompt.includes('Follow me on LinkedIn and ring the bell for updates.'), 'Test 5: LinkedIn prompt gets linkedin_cta');
  assert(!liPrompt.includes('Subscribe to the YouTube channel'), 'Test 5: LinkedIn prompt does not receive youtube_cta');
}

// Test 6: Generic CTA fallback & Video Override CTA
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    youtube_cta: 'Subscribe to YouTube!'
  };
  const overrides: GenerationOverrides = {
    overrideCTA: 'Download my free PDF guide at the link below!'
  };
  const prompt = ContentPromptService.buildYouTubePrompt({
    transcript: sampleTranscript,
    creatorProfile: profile,
    overrides
  });
  assert(prompt.includes('Download my free PDF guide at the link below!'), 'Test 6: overrideCTA supersedes platform CTA');
  assert(!prompt.includes('Subscribe to YouTube!'), 'Test 6: overridden profile CTA omitted');

  // Test shorts fallback to instagram_cta or generic
  const profileShorts: CreatorProfileData = {
    user_id: 'u1',
    instagram_cta: 'Follow @handle on Instagram!'
  };
  const shortsPrompt = ContentPromptService.buildShortsPrompt({
    transcript: sampleTranscript,
    creatorProfile: profileShorts
  });
  assert(shortsPrompt.includes('Follow @handle on Instagram!'), 'Test 6: Shorts falls back gracefully to instagram_cta');
}

// Test 7: Forbidden phrases
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    forbidden_phrases: 'game changer, unlock your potential, in today\'s fast-paced world'
  };
  const prompt = ContentPromptService.buildYouTubePrompt({
    transcript: sampleTranscript,
    creatorProfile: profile
  });
  assert(prompt.includes('STRICT FORBIDDEN PHRASES (DO NOT USE)'), 'Test 7: Forbidden phrases instruction present');
  assert(prompt.includes('game changer'), 'Test 7: Forbidden phrase listed in context');
}

// Test 8: Brand rules
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    brand_rules: 'Keep sentences short and punchy. No corporate jargon. Sound like a peer founder.'
  };
  const prompt = ContentPromptService.buildTwitterPrompt({
    transcript: sampleTranscript,
    creatorProfile: profile
  });
  assert(prompt.includes('Keep sentences short and punchy. No corporate jargon.'), 'Test 8: Brand rules section present');
}

// Test 9: Empty optional fields
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    niche: '',
    target_audience: '',
    preferred_hook_style: '',
    website_url: '',
    brand_rules: '',
    forbidden_phrases: ''
  };
  const prompt = ContentPromptService.buildYouTubePrompt({
    transcript: sampleTranscript,
    creatorProfile: profile
  });
  assert(!prompt.includes('- Preferred Hook Style:'), 'Test 9: Empty preferred hook style not listed');
  assert(!prompt.includes('BRAND RULES:'), 'Test 9: Empty brand rules block omitted completely');
  assert(!prompt.includes('CREATOR LINKS & CALL-TO-ACTION:'), 'Test 9: Empty links block omitted completely');
}

// Test 10: Existing creator profile with no new fields (backwards compatibility)
{
  const legacyProfile: CreatorProfileData = {
    user_id: 'u1',
    niche: 'Fitness',
    target_audience: 'Busy professionals',
    language: 'English',
    tone: 'Educational'
  };
  const prompt = ContentPromptService.buildInstagramPrompt({
    transcript: sampleTranscript,
    creatorProfile: legacyProfile
  });
  assert(prompt.includes('- Niche: Fitness'), 'Test 10: Legacy niche handled');
  assert(prompt.includes('- Target Audience: Busy professionals'), 'Test 10: Legacy audience handled');
  assert(prompt.includes('- Tone of Voice: Educational'), 'Test 10: Legacy tone handled');
  assert(!prompt.includes('BRAND RULES:'), 'Test 10: Brand rules omitted cleanly for legacy profile');
  assert(!prompt.includes('undefined'), 'Test 10: No undefined values leaked');
}

// Test 11: TikTok prompt personalization & tiktok_cta
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    tone: 'Casual',
    language: 'English',
    tiktok_cta: 'Drop a comment if you want part 2!',
    brand_rules: 'Keep it punchy for Gen Z',
    forbidden_phrases: 'paradigm shift'
  };
  const prompt = ContentPromptService.buildTikTokPrompt({
    transcript: sampleTranscript,
    creatorProfile: profile
  });
  assert(prompt.includes('Drop a comment if you want part 2!'), 'Test 11: TikTok prompt receives tiktok_cta');
  assert(prompt.includes('Keep it punchy for Gen Z'), 'Test 11: TikTok prompt receives brand rules');
  assert(prompt.includes('paradigm shift'), 'Test 11: TikTok prompt receives forbidden phrases');
  assert(prompt.includes('- Tone of Voice: Casual'), 'Test 11: TikTok prompt receives tone');
}

// Test 12: TikTok prompt override CTA
{
  const profile: CreatorProfileData = {
    user_id: 'u1',
    tiktok_cta: 'Default TikTok CTA'
  };
  const overrides: GenerationOverrides = {
    overrideCTA: 'Custom video TikTok override CTA!'
  };
  const prompt = ContentPromptService.buildTikTokPrompt({
    transcript: sampleTranscript,
    creatorProfile: profile,
    overrides
  });
  assert(prompt.includes('Custom video TikTok override CTA!'), 'Test 12: TikTok prompt uses overrideCTA');
  assert(!prompt.includes('Default TikTok CTA'), 'Test 12: Default TikTok CTA omitted when overridden');
}

console.log(`\n🎉 ALL ${passed}/${total} PROMPT VERIFICATION TESTS PASSED SUCCESSFULLY!`);


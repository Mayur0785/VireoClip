import {
  OutputPlatform,
  CreatorProfileData,
  GenerationOverrides,
  TranscriptSegment,
} from '../types/index.js';

export interface PromptContext {
  transcript: string;
  language?: string;
  duration?: number | null;
  segments?: TranscriptSegment[];
  creatorProfile?: CreatorProfileData;
  notes?: string;
  overrides?: GenerationOverrides;
}

export class ContentPromptService {
  /**
   * Resolves the effective CTA for a specific platform based on overrides and profile defaults.
   * Priority: overrideCTA > platform_cta > generic CTA
   */
  public static resolveEffectiveCTA(platform: OutputPlatform, ctx: PromptContext): string {
    if (ctx.overrides?.overrideCTA?.trim()) {
      return ctx.overrides.overrideCTA.trim();
    }

    const cp = ctx.creatorProfile;
    if (!cp) return '';

    switch (platform) {
      case 'youtube':
        return cp.youtube_cta?.trim() || '';
      case 'instagram':
        return cp.instagram_cta?.trim() || '';
      case 'shorts':
        return cp.instagram_cta?.trim() || cp.youtube_cta?.trim() || '';
      case 'linkedin':
        return cp.linkedin_cta?.trim() || '';
      case 'x':
        return cp.twitter_cta?.trim() || '';
      case 'tiktok':
        return cp.tiktok_cta?.trim() || '';
      default:
        return '';
    }
  }

  /**
   * Resolves the effective voice tone.
   * Priority: overrideTone > custom_tone (if tone is Custom or provided) > preset tone > fallback 'Friendly'
   */
  public static resolveEffectiveTone(ctx: PromptContext): string {
    if (ctx.overrides?.overrideTone?.trim()) {
      return ctx.overrides.overrideTone.trim();
    }

    const cp = ctx.creatorProfile;
    if (!cp) return 'Friendly';

    if (cp.tone?.toLowerCase() === 'custom' && cp.custom_tone?.trim()) {
      return cp.custom_tone.trim();
    }

    if (cp.custom_tone?.trim()) {
      return cp.custom_tone.trim();
    }

    return cp.tone?.trim() || 'Friendly';
  }

  /**
   * Resolves effective target language.
   * Priority: overrideLanguage > creatorProfile.language > ctx.language > 'English'
   */
  public static resolveEffectiveLanguage(ctx: PromptContext): string {
    if (ctx.overrides?.overrideLanguage?.trim()) {
      return ctx.overrides.overrideLanguage.trim();
    }

    return ctx.creatorProfile?.language?.trim() || ctx.language?.trim() || 'English';
  }

  /**
   * Formats the creator persona, brand guidelines, CTAs, and video-specific overrides.
   */
  public static formatCreatorContext(ctx: PromptContext, platform?: OutputPlatform): string {
    const cp = ctx.creatorProfile;
    const effectiveTone = this.resolveEffectiveTone(ctx);
    const effectiveLanguage = this.resolveEffectiveLanguage(ctx);
    const effectiveCTA = platform ? this.resolveEffectiveCTA(platform, ctx) : '';

    const sections: string[] = [];

    // 1. Creator Persona
    const personaLines: string[] = [];
    if (cp?.brand_name?.trim()) personaLines.push(`- Creator / Brand Name: ${cp.brand_name.trim()}`);
    if (cp?.niche?.trim()) personaLines.push(`- Niche: ${cp.niche.trim()}`);
    if (cp?.target_audience?.trim()) personaLines.push(`- Target Audience: ${cp.target_audience.trim()}`);
    if (cp?.brand_description?.trim()) personaLines.push(`- Brand Story & Mission: ${cp.brand_description.trim()}`);
    personaLines.push(`- Tone of Voice: ${effectiveTone}`);
    personaLines.push(`- Language: ${effectiveLanguage}`);
    if (cp?.content_goals?.trim()) personaLines.push(`- Core Content Goals: ${cp.content_goals.trim()}`);
    if (cp?.preferred_hook_style?.trim()) {
      personaLines.push(`- Preferred Hook Style: ${cp.preferred_hook_style.trim()}`);
    }

    if (personaLines.length > 0) {
      sections.push(`CREATOR PERSONA:\n${personaLines.join('\n')}`);
    }

    // 2. Brand Rules & Forbidden Phrases
    const ruleLines: string[] = [];
    if (cp?.brand_rules?.trim()) {
      ruleLines.push(`- Writing Style & Brand Guidelines: ${cp.brand_rules.trim()}`);
    }
    if (cp?.forbidden_phrases?.trim()) {
      ruleLines.push(`- STRICT FORBIDDEN PHRASES (DO NOT USE): ${cp.forbidden_phrases.trim()}`);
    }

    if (ruleLines.length > 0) {
      sections.push(`BRAND RULES:\n${ruleLines.join('\n')}`);
    }

    // 3. Links & Call-To-Action (Only when explicitly provided)
    const ctaLines: string[] = [];
    if (cp?.website_url?.trim()) ctaLines.push(`- Website: ${cp.website_url.trim()}`);
    if (cp?.newsletter_url?.trim()) ctaLines.push(`- Newsletter: ${cp.newsletter_url.trim()}`);
    if (cp?.podcast_url?.trim()) ctaLines.push(`- Podcast: ${cp.podcast_url.trim()}`);
    if (effectiveCTA) ctaLines.push(`- Target CTA: ${effectiveCTA}`);

    if (ctaLines.length > 0) {
      sections.push(`CREATOR LINKS & CALL-TO-ACTION:\n${ctaLines.join('\n')}`);
    }

    // 4. Video-Specific Instructions & Overrides
    const videoLines: string[] = [];
    if (ctx.notes?.trim()) {
      videoLines.push(`- Video Notes: ${ctx.notes.trim()}`);
    }
    if (ctx.overrides?.overrideTone?.trim()) {
      videoLines.push(`- Video Tone Override Applied: ${ctx.overrides.overrideTone.trim()}`);
    }
    if (ctx.overrides?.overrideLanguage?.trim()) {
      videoLines.push(`- Video Language Override Applied: ${ctx.overrides.overrideLanguage.trim()}`);
    }
    if (ctx.overrides?.overrideCTA?.trim()) {
      videoLines.push(`- Video CTA Override Applied: ${ctx.overrides.overrideCTA.trim()}`);
    }

    if (videoLines.length > 0) {
      sections.push(`VIDEO-SPECIFIC INSTRUCTIONS:\n${videoLines.join('\n')}`);
    }

    if (sections.length === 0) {
      return 'No specific creator persona provided. Use a natural, authentic, engaging tone.';
    }

    return sections.join('\n\n');
  }

  /**
   * Formats transcript segments into a timestamped timeline for chapters and clip cut-points.
   */
  private static formatSegments(segments?: TranscriptSegment[]): string {
    if (!segments || segments.length === 0) {
      return 'No timestamped segments available.';
    }

    // Include up to 60 segments to keep prompt context clean and focused
    return segments
      .slice(0, 60)
      .map((s) => {
        const mins = Math.floor(s.start / 60);
        const secs = Math.floor(s.start % 60);
        const stamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `[${stamp}] ${s.text}`;
      })
      .join('\n');
  }

  /**
   * System instruction shared across all platform generators to ensure factual accuracy and JSON adherence.
   */
  public static getSystemPrompt(): string {
    return `You are Vireo's elite AI Content Repurposing & Editorial Intelligence Engine.
Your task is to analyze real video transcripts and produce high-impact, platform-native content kits.

CRITICAL EDITORIAL & GROUNDING RULES:
1. STRICT TRANSCRIPT GROUNDING: Rely EXCLUSIVELY on facts, topics, quotes, and ideas explicitly spoken in the transcript.
   - NEVER fabricate statistics, percentages, metrics, case studies, or external facts not in the transcript.
   - NEVER invent names of people, companies, tools, books, or products not mentioned by the speaker.
   - If the transcript is brief or conversational, summarize only what is present. Never pad with imaginary background story or assumed facts.
2. PLATFORM ADAPTATION WITHOUT FACTUAL DRIFT:
   - Adapt the packaging, hooks, tone, and pacing to match each platform's native communication culture.
   - Do NOT simply copy-paste the same caption across platforms. Each platform must have distinct structure, framing, and hook style.
3. HOOK QUALITY & ANTI-CLICKBAIT:
   - Hooks must tease real moments, insights, or questions actually addressed in the video.
   - Avoid generic, hollow clickbait ("You won't believe what happened next", "This one trick changes everything", "Mind blown 🤯") unless justified by actual spoken content.
   - Prioritize curiosity, clear benefit, contrasting perspective, or problem/solution framing.
4. CREATOR VOICE FIDELITY:
   - Strictly honor the creator's defined tone, audience niche, brand guidelines, and forbidden phrases.
   - If forbidden phrases are provided, you MUST NEVER include any of them in any generated field.
5. NO REPETITION / NO DUPLICATES:
   - Provide genuinely distinct angles for alternative titles, hooks, and ideas—not minor synonym swaps of the exact same sentence.
6. JSON STRICTNESS:
   - Respond ONLY with valid, raw, parseable JSON matching the exact schema specified in the user prompt.
   - Do NOT wrap your output in markdown code blocks like \`\`\`json. Output raw JSON only.`;
  }

  /**
   * Prompt for YouTube package (Titles, Description, Chapters, Keywords).
   */
  public static buildYouTubePrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'youtube');
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Create a complete, high-CTR YouTube optimization package based strictly on the following video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

TIMESTAMPS / SEGMENTS:
"""
${segmentsFormatted}
"""

REQUIRED OUTPUT FORMAT (RAW JSON ONLY, NO MARKDOWN FENCES):
{
  "titles": [
    "Angle 1: Search-Optimized / Clear Value Title",
    "Angle 2: Curiosity & Question Title",
    "Angle 3: Bold / Contrarian Insight Title",
    "Angle 4: Story / Case-Study / Journey Title",
    "Angle 5: High-CTR Direct Outcome / How-To Title"
  ],
  "description": "Comprehensive YouTube description (2-3 structured paragraphs) accurately summarizing the video topics, key takeaways, and call-to-action.",
  "chapters": [
    {
      "timestamp": "00:00",
      "title": "Introduction"
    }
  ],
  "keywords": [
    "keyword 1",
    "keyword 2",
    "keyword 3",
    "keyword 4",
    "keyword 5",
    "keyword 6",
    "keyword 7",
    "keyword 8"
  ]
}

SPECIFIC RULES:
- "titles": Provide exactly 5 distinct, high-impact titles (under 70 characters each). Each title must explore a genuinely different angle (Search, Curiosity, Contrarian, Narrative, Practical Outcome). Do NOT submit repetitive variations. Every title must be truthful to the transcript.
- "description": Must faithfully summarize the actual discussion. Include a brief hook paragraph, a bulleted list of 3-4 key points discussed in the video, and natural placement of the creator's Target CTA or links (if provided in Creator Context). Do NOT invent sponsorships, affiliate links, or off-topic facts.
- "chapters": ${
      hasTimestamps
        ? 'Generate 4-8 logical, descriptive chapters based strictly on topic changes in the provided segments. Always start with 00:00 Introduction. Use MM:SS format.'
        : 'Timestamps are NOT available in this transcript. Return an empty array [] for chapters.'
    }
- "keywords": 8-12 targeted, search-relevant keywords and phrases derived directly from the video topic. Avoid generic tags like "viral" or "video".`;
  }

  /**
   * Prompt for Instagram package (Hooks, Caption, Hashtags).
   */
  public static buildInstagramPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'instagram');

    return `Create a platform-native Instagram Reel / Carousel / Post package based strictly on the following video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (RAW JSON ONLY, NO MARKDOWN FENCES):
{
  "hooks": [
    "Hook 1: Relatable problem / opening visual prompt",
    "Hook 2: Counter-intuitive insight or common mistake",
    "Hook 3: Provocative question directly answered in the video",
    "Hook 4: Spoken soundbite / takeaway hook",
    "Hook 5: Punchy short 1-line text overlay (<8 words)"
  ],
  "caption": "Scannable Instagram caption with an attention-grabbing first line, well-spaced body paragraphs with emoji bullet points, and an engagement-driving question or CTA at the end.",
  "hashtags": [
    "#relevanttag1",
    "#relevanttag2",
    "#relevanttag3",
    "#relevanttag4",
    "#relevanttag5"
  ]
}

SPECIFIC RULES:
- "hooks": Exactly 5 distinct, scroll-stopping hooks tailored for on-screen text or spoken intros. Each must represent a distinct psychological angle. Ground every hook in words and ideas actually spoken.
- "caption": Write an Instagram-native caption: strong first line (before '...more'), clean line breaks, concise takeaways from the video, and an authentic invitation to comment or take action based on the creator's Target CTA.
- "hashtags": 5-8 niche-specific, relevant hashtags directly tied to the video's subject. Do NOT include spam tags (#viral, #explorepage, #fyp).`;
  }

  /**
   * Prompt for Shorts / Reels highlight moments with timestamps or narrative boundaries.
   */
  public static buildShortsPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'shorts');
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Identify the best high-retention short-form clip moments (strictly 15-60 seconds each) from this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

TIMESTAMPS / SEGMENTS:
"""
${segmentsFormatted}
"""

REQUIRED OUTPUT FORMAT (RAW JSON ONLY, NO MARKDOWN FENCES):
{
  "moments": [
    {
      "start": "${hasTimestamps ? '00:15' : 'N/A'}",
      "end": "${hasTimestamps ? '01:05' : 'N/A'}",
      "hook": "Spoken or text hook opening this exact moment",
      "description": "Clear explanation of why this moment works standalone and a concise summary of what is said.",
      "timestamps_available": ${hasTimestamps}
    }
  ]
}

SPECIFIC RULES:
- Identify 2 to 4 distinct, high-impact standalone moments (e.g. sharp realization, emotional turning point, surprising contrast, actionable breakdown).
- Every moment MUST have a clear opening hook and a satisfying conclusion or payoff.
- Grounding: Describe strictly what happens in that segment. Do NOT invent concepts outside the transcript.
- ${
      hasTimestamps
        ? 'Use exact start and end timestamps in MM:SS format derived directly from the segment timestamps above.'
        : 'Timestamps are NOT available in this transcript. Set "start": "N/A", "end": "N/A", and "timestamps_available": false. Describe the moment conceptually using exact quotes from the transcript.'
    }
- Do NOT fabricate timestamps if they cannot be verified from the segments list.`;
  }

  /**
   * Prompt for TikTok hooks, caption, and a transcript-grounded clip idea.
   */
  public static buildTikTokPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'tiktok');
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Create a native TikTok content package based strictly on this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

TIMESTAMPS / SEGMENTS:
"""
${segmentsFormatted}
"""

REQUIRED OUTPUT FORMAT (RAW JSON ONLY, NO MARKDOWN FENCES):
{
  "hooks": [
    "Hook 1: First 3-second spoken or overlay hook",
    "Hook 2: Curiosity-driven contrast angle",
    "Hook 3: Problem/Mistake-first opening hook"
  ],
  "caption": "Concise, punchy TikTok caption with conversational phrasing, line breaks, and a conversation-starter CTA.",
  "moment": {
    "start": "${hasTimestamps ? '00:15' : 'N/A'}",
    "end": "${hasTimestamps ? '00:45' : 'N/A'}",
    "description": "One specific, coherent moment from the transcript that functions as a high-retention standalone clip.",
    "timestamps_available": ${hasTimestamps}
  }
}

SPECIFIC RULES:
- "hooks": Exactly 3 distinct, authentic hooks (under 12 words each) grounded strictly in the speaker's real words.
- "caption": Concise (under 300 characters), conversational, and formatted with clean line breaks. Incorporate the creator's Target CTA naturally if provided. Do NOT spam generic hashtags.
- "moment": Choose one specific moment from the transcript with enough context to stand alone.
- ${
      hasTimestamps
        ? 'Set "start" and "end" to real timestamps in MM:SS supported by the segments.'
        : 'Set start and end to "N/A" and "timestamps_available": false.'
    }`;
  }

  /**
   * Prompt for LinkedIn Post.
   */
  public static buildLinkedInPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'linkedin');

    return `Draft an insightful, high-engagement LinkedIn post based strictly on the ideas in this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (RAW JSON ONLY, NO MARKDOWN FENCES):
{
  "post": "Full formatted LinkedIn post with hook headline, short scannable 1-2 sentence paragraphs, bullet points if breaking down steps, and an open-ended discussion question or CTA at the end."
}

SPECIFIC RULES:
- High signal-to-noise ratio: Extract the most valuable frameworks, lessons, or stories from the transcript.
- Structure:
  1. Hook line that creates immediate curiosity without clickbait.
  2. Context / the core observation in 1-2 short paragraphs.
  3. 3-4 bulleted takeaways or actionable principles directly spoken in the video.
  4. Closing discussion prompt or Target CTA from creator context.
- Tone: Thoughtful, professional, conversational. Absolutely NO corporate jargon or generic motivational platitudes.
- Grounding: Do NOT attribute false quotes or invent case studies. Every claim must trace back to the transcript.`;
  }

  /**
   * Prompt for X (Twitter) Post & Thread.
   */
  public static buildTwitterPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'x');

    return `Draft an impactful X (Twitter) standalone post and a value-packed companion thread based strictly on this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (RAW JSON ONLY, NO MARKDOWN FENCES):
{
  "post": "Single punchy standalone tweet under 280 characters that delivers a sharp insight, quote, or key takeaway.",
  "thread": [
    "Tweet 1: Compelling thread opener / hook setting up the topic",
    "Tweet 2: Core context or problem highlighted in the video",
    "Tweet 3: Key insight, breakdown, or solution",
    "Tweet 4: Actionable summary and closing takeaway or CTA"
  ]
}

SPECIFIC RULES:
- "post": Strictly under 280 characters. High-density insight that stands completely on its own.
- "thread": 3 to 5 tweets maximum. Each tweet MUST be under 280 characters and deliver one distinct idea.
- Flow: Thread must progress logically from opening hook to conclusion.
- Grounding: Every tweet must reflect actual insights, examples, or thoughts from the transcript.
- No hashtag stuffing. Maximum 1-2 relevant hashtags on the final tweet only if helpful. Weave in the creator's Target CTA on the final tweet if provided.`;
  }

  /**
   * Dispatches to the appropriate builder based on platform.
   */
  public static buildPromptForPlatform(platform: OutputPlatform, ctx: PromptContext): string {
    switch (platform) {
      case 'youtube':
        return this.buildYouTubePrompt(ctx);
      case 'instagram':
        return this.buildInstagramPrompt(ctx);
      case 'shorts':
        return this.buildShortsPrompt(ctx);
      case 'tiktok':
        return this.buildTikTokPrompt(ctx);
      case 'linkedin':
        return this.buildLinkedInPrompt(ctx);
      case 'x':
        return this.buildTwitterPrompt(ctx);
      default:
        throw new Error(`Unsupported platform prompt: ${platform}`);
    }
  }
}

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
    if (cp?.niche?.trim()) personaLines.push(`- Niche: ${cp.niche.trim()}`);
    if (cp?.target_audience?.trim()) personaLines.push(`- Target Audience: ${cp.target_audience.trim()}`);
    personaLines.push(`- Tone of Voice: ${effectiveTone}`);
    personaLines.push(`- Language: ${effectiveLanguage}`);
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
    return `You are an expert AI social media and video content repurposing engine.
Your task is to analyze real video transcripts and produce high-impact, platform-optimized content.

CRITICAL RULES:
1. Grounding: Rely strictly on facts, ideas, and details provided in the transcript. NEVER hallucinate facts, statistics, or claims not mentioned in the transcript.
2. JSON Strictness: Respond ONLY with valid, raw, parseable JSON matching the exact schema specified.
3. No Markdown Fences: Do not wrap your response in markdown code blocks like \`\`\`json. Output raw JSON only.
4. Voice: Avoid generic AI fluff ("In today's fast-paced world", "buckle up", "game-changer"). Sound authentic, sharp, and tailored to the platform.`;
  }

  /**
   * Prompt for YouTube package (Titles, Description, Chapters, Keywords).
   */
  public static buildYouTubePrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'youtube');
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Create a complete YouTube optimization package based on the following video transcript.

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

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "titles": [
    "Angle 1 (Curiosity/Problem)",
    "Angle 2 (Direct Value/How-To)",
    "Angle 3 (Contrarian/Bold)",
    "Angle 4 (Actionable/Story)",
    "Angle 5 (High CTR/Benefit-driven)"
  ],
  "description": "Engaging 2-3 paragraph YouTube description summarizing core insights, with call-to-actions, based purely on transcript contents.",
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
- "titles": Exactly 5 distinct title angles (under 70 characters each). Do not write minor variations of one sentence.
- "description": Grounded in the transcript. Do not fabricate external links or sponsors. If a Target CTA or Links are provided in the creator context, weave them naturally into the description.
- "chapters": ${
      hasTimestamps
        ? 'Generate 4-8 logical chapters using real timestamps from the segments provided above. Always start with 00:00.'
        : 'Timestamps are NOT available in this transcript. Return an empty array [] for chapters.'
    }
- "keywords": 8-12 high-intent search tags and keywords directly relevant to the topics discussed.`;
  }

  /**
   * Prompt for Instagram package (Hooks, Caption, Hashtags).
   */
  public static buildInstagramPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'instagram');

    return `Create an Instagram Reel / Post package based on the following video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "hooks": [
    "Hook 1 (Visual/Relatable hook)",
    "Hook 2 (Mistake/Warning hook)",
    "Hook 3 (Question hook)",
    "Hook 4 (Proof/Outcome hook)",
    "Hook 5 (Short punchy one-liner)"
  ],
  "caption": "Compelling feed caption with line breaks for readability, key takeaways, and a comment-inducing CTA.",
  "hashtags": [
    "#relevanttag1",
    "#relevanttag2",
    "#relevanttag3",
    "#relevanttag4",
    "#relevanttag5"
  ]
}

SPECIFIC RULES:
- "hooks": Exactly 5 punchy opening text overlays / voiceover hooks for Reels or Carousels. Respect the creator's preferred hook style if specified.
- "caption": Engaging, easy to scan with emojis and spacing, reflecting the actual video topic. Incorporate the creator's Target CTA if provided.
- "hashtags": 5-10 curated, relevant hashtags. Avoid generic spam tags (#viral, #fyp).`;
  }

  /**
   * Prompt for Shorts / Reels highlight moments with timestamps or narrative boundaries.
   */
  public static buildShortsPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'shorts');
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Identify the best viral short-form clip moments (30-60 seconds each) from this video transcript.

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

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "moments": [
    {
      "start": "${hasTimestamps ? '00:15' : 'N/A'}",
      "end": "${hasTimestamps ? '01:05' : 'N/A'}",
      "hook": "Opening hook for this clip",
      "description": "Why this moment works as a standalone short and summary of the clip content.",
      "timestamps_available": ${hasTimestamps}
    }
  ]
}

SPECIFIC RULES:
- Identify 2 to 4 high-retention moments (surprising insight, strong opinion, emotional point, or key step). Respect the creator's preferred hook style if provided.
- ${
      hasTimestamps
        ? 'Accurate "start" and "end" timestamps formatted as MM:SS based on the provided segments.'
        : 'Timestamps are NOT available in this transcript. Set "start": "N/A", "end": "N/A", and "timestamps_available": false. Describe the moment conceptually using quotes or topic markers from the transcript.'
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

    return `Create a TikTok content package from this existing video transcript. Suggest copy and a clip idea; do not claim to edit or publish the video.

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

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "hooks": [
    "Short opening line for on-screen text or voiceover",
    "A distinct opening angle",
    "A third opening angle"
  ],
  "caption": "A concise, editable TikTok caption based on the actual video, with a natural invitation to respond.",
  "moment": {
    "start": "${hasTimestamps ? '00:15' : 'N/A'}",
    "end": "${hasTimestamps ? '00:45' : 'N/A'}",
    "description": "One specific moment or idea from the transcript that can stand alone as a short clip.",
    "timestamps_available": ${hasTimestamps}
  }
}

SPECIFIC RULES:
- Give exactly 3 distinct, brief hooks. Keep them grounded in what the speaker actually says. Respect the creator's preferred hook style if provided.
- The caption should be concise and readable. Incorporate the creator's Target CTA or discussion hook naturally if provided. Strictly adhere to brand rules and forbidden phrases. Do not add unsupported claims, links, or generic hashtag spam.
- Choose one useful moment from the transcript, with enough context to make sense on its own.
- ${
      hasTimestamps
        ? 'Use only start and end times supported by the provided segments.'
        : 'No timestamped segments are available. Set start and end to "N/A" and timestamps_available to false. Never invent times.'
    }`;
  }

  /**
   * Prompt for LinkedIn Post.
   */
  public static buildLinkedInPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'linkedin');

    return `Draft a polished, high-engagement LinkedIn post based on the insights in this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "post": "Full formatted LinkedIn post with hook headline, short scannable paragraphs, bullet points if relevant, and an engaging question at the end."
}

SPECIFIC RULES:
- High signal-to-noise ratio. Professional, thoughtful, but conversational.
- No corporate jargon, no generic motivational clichés. Strictly respect any brand rules or forbidden phrases.
- Grounded entirely in the transcript's real ideas.
- Optimized for read-time and discussion in comments. Include the creator's Target CTA if provided.`;
  }

  /**
   * Prompt for X (Twitter) Post & Thread.
   */
  public static buildTwitterPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx, 'x');

    return `Draft an impactful X (Twitter) standalone post and a companion value-packed thread based on this transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "post": "Single punchy standalone tweet under 280 characters that delivers a sharp insight or teaser.",
  "thread": [
    "Tweet 1 (Hook introducing the thread)",
    "Tweet 2 (Core insight or context)",
    "Tweet 3 (Key takeaway or breakdown)",
    "Tweet 4 (Conclusion and call-to-action)"
  ]
}

SPECIFIC RULES:
- Standalone post must be under 280 characters.
- Thread should be 3-6 tweets maximum, cleanly broken down.
- Each thread item should be standalone valuable and under 280 characters.
- No hashtag stuffing. Pure insights. Include Target CTA in the final thread conclusion if specified.`;
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

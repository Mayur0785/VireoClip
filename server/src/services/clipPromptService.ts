import { TranscriptSegment, CreatorProfileData } from '../types/index.js';

export interface ClipPromptContext {
  segments: TranscriptSegment[];
  durationSeconds?: number | null;
  creatorProfile?: Partial<CreatorProfileData> | null;
  customNotes?: string;
}

export class ClipPromptService {
  /**
   * System prompt establishing the persona and strict JSON output requirements
   */
  public static getSystemPrompt(): string {
    return [
      'You are Vireo\'s elite Short-Form Video Producer and AI Clip Finder.',
      'Your job is to analyze a timestamped, segment-indexed transcript from a long-form video and identify the strongest standalone moments for YouTube Shorts, Instagram Reels, and TikTok.',
      '',
      'CORE RULES:',
      '1. Grounding: You MUST ONLY select moments that actually exist in the transcript.',
      '2. Timestamp Integrity: NEVER invent, hallucinate, or format timestamp numbers. You MUST ONLY specify the starting and ending segment indexes (start_segment_index and end_segment_index).',
      '3. Completeness: Every clip candidate must start at a logical opening hook and finish with a complete, coherent thought. Do NOT cut off mid-sentence or mid-explanation.',
      '4. Standalone Value: A viewer watching this clip on TikTok or Reels must completely understand the message without needing the rest of the full-length video.',
      '5. Cut the Fluff: Avoid generic channel intros, pleasantries, sponsor reads, subscribe/like pitches, and rambling setups unless immediately tied to an exceptional hook.',
      '6. Output Format: Return ONLY raw, valid JSON matching the exact schema specified in the user prompt. No markdown fencing, no commentary.',
    ].join('\n');
  }

  /**
   * Builds compact segment-indexed transcript for the LLM prompt.
   * Format: [index] (start - end) text
   */
  public static formatIndexedTranscript(segments: TranscriptSegment[]): string {
    return segments
      .map((seg, idx) => `[${idx}] (${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s) ${seg.text.trim()}`)
      .join('\n');
  }

  /**
   * Assembles the complete prompt with indexed transcript and creator context
   */
  public static buildClipAnalysisPrompt(context: ClipPromptContext): string {
    const { segments, durationSeconds, creatorProfile, customNotes } = context;

    const indexedTranscript = this.formatIndexedTranscript(segments);

    let personaContext = '';
    if (creatorProfile) {
      const parts: string[] = [];
      if (creatorProfile.niche) parts.push(`- Creator Niche: ${creatorProfile.niche}`);
      if (creatorProfile.target_audience) parts.push(`- Target Audience: ${creatorProfile.target_audience}`);
      if (creatorProfile.tone) {
        const toneStr = creatorProfile.tone === 'custom' && creatorProfile.custom_tone
          ? creatorProfile.custom_tone
          : creatorProfile.tone;
        parts.push(`- Desired Tone: ${toneStr}`);
      }
      if (creatorProfile.preferred_hook_style) parts.push(`- Preferred Hook Style: ${creatorProfile.preferred_hook_style}`);
      if (creatorProfile.brand_rules) parts.push(`- Brand Guidelines: ${creatorProfile.brand_rules}`);
      if (creatorProfile.forbidden_phrases) parts.push(`- Forbidden Phrases to Avoid: ${creatorProfile.forbidden_phrases}`);

      if (parts.length > 0) {
        personaContext = [
          'CREATOR PERSONA & AUDIENCE GUIDANCE:',
          ...parts,
          'Use this guidance to prioritize moments that resonate with this specific audience, but never invent content outside the transcript.',
          '',
        ].join('\n');
      }
    }

    let notesContext = '';
    if (customNotes?.trim()) {
      notesContext = `CREATOR NOTES / FOCUS AREA:\n${customNotes.trim()}\n\n`;
    }

    return [
      personaContext,
      notesContext,
      `TRANSCRIPT SEGMENTS (${segments.length} segments, total duration ~${durationSeconds ? Math.round(durationSeconds) : 'N/A'}s):`,
      '---',
      indexedTranscript,
      '---',
      '',
      'TASK:',
      'Analyze the transcript segments above and identify 5 to 10 of the strongest standalone short-form clip opportunities.',
      '',
      'DURATION CONSTRAINTS:',
      durationSeconds && durationSeconds < 15
        ? `- This video is short (~${Math.round(durationSeconds)}s). Clips may span between 2 seconds and ${Math.round(durationSeconds)} seconds.`
        : '- Each clip MUST span between 15 seconds and 90 seconds in duration (preferably 20–60 seconds).',
      '- Calculate duration mentally by looking at the start timestamp of start_segment_index and the end timestamp of end_segment_index.',
      durationSeconds && durationSeconds < 15
        ? `- Do not return clips under 2 seconds or over ${Math.round(durationSeconds)} seconds.`
        : '- Do not return clips under 15 seconds or over 90 seconds.',
      '',
      'CATEGORIES:',
      'Assign each clip one of these categories:',
      '- "educational": Teaches a clear concept or workflow',
      '- "story": A personal anecdote, journey, or real-world example',
      '- "controversial": Challenges conventional wisdom or common mistakes',
      '- "insight": A high-impact mental model or realization',
      '- "emotional": High conviction, vulnerability, or inspiring energy',
      '- "entertaining": Humor, witty observation, or relatable situation',
      '- "tutorial": Actionable tactical step-by-step guidance',
      '- "general": High-value clip that fits broadly',
      '',
      'COMPONENT EVALUATION SCORES (Each integer 0 to 100):',
      '- hook_score: How compelling the first 3 seconds of the clip are (0–100)',
      '- standalone_score: How self-contained and clear the thought is without context (0–100)',
      '- insight_score: The depth of value or takeaway delivered (0–100)',
      '- emotion_score: Emotional resonance, tension, conviction, or humor (0–100)',
      '- platform_score: How naturally this fits short-form feeds (Shorts/Reels/TikTok) (0–100)',
      '',
      'RESPONSE FORMAT:',
      'Respond ONLY with a JSON object matching this schema:',
      '{',
      '  "clips": [',
      '    {',
      '      "start_segment_index": 12,',
      '      "end_segment_index": 21,',
      '      "title": "A concise, engaging clip title (under 60 chars)",',
      '      "hook": "The captivating opening line or angle of the clip",',
      '      "reason": "Brief explanation of why this moment will succeed on short-form feeds",',
      '      "category": "insight",',
      '      "hook_score": 92,',
      '      "standalone_score": 88,',
      '      "insight_score": 95,',
      '      "emotion_score": 80,',
      '      "platform_score": 90',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }
}

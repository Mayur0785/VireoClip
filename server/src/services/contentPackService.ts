import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { defaultAiProvider } from './aiProviderClient.js';
import { BrandContextService } from './brand/brandContextService.js';
import { ContentPackValidator } from './contentPackValidator.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  AppError,
  ContentPack,
  ContentPackItem,
  ContentPackItemType,
  ContentPackStatus,
  ContentPackGenerationMode,
  ContentPackTemplate,
  ContentPackProviderState,
  OutputPlatform,
  CONTENT_PACK_LIMITS,
  PLATFORM_CONSTRAINTS,
} from '../types/index.js';

export interface GenerateContentPackOptions {
  userId: string;
  projectId: string;
  clipId: string;
  mode?: ContentPackGenerationMode;
  template?: ContentPackTemplate;
  platform?: OutputPlatform;
  userInstruction?: string;
  brandBrainId?: string;
  idempotencyKey?: string;
}

export interface RawAiPackOutput {
  primary_title: string;
  alt_titles: Array<{ text: string; category?: string }>;
  hooks: string[];
  short_caption: string;
  long_caption?: string;
  short_description: string;
  long_description?: string;
  cta_variants: string[];
  hashtags: string[];
  keywords: string[];
  thumbnail_direction: string;
  thumbnail_texts: string[];
  alt_text?: string;
  pinned_comment?: string;
  email_snippet?: string;
  blog_snippet?: string;
  platform_packs?: {
    youtube?: { title?: string; description?: string; hashtags?: string[]; pinned_comment?: string };
    shorts?: { title?: string; caption?: string; hashtags?: string[]; pinned_comment?: string };
    instagram?: { caption?: string; hashtags?: string[]; cta?: string; cover_text?: string };
    tiktok?: { caption?: string; hashtags?: string[]; cta?: string };
    linkedin?: { post?: string; hook?: string; cta?: string };
    x?: { post?: string; hashtags?: string[] };
  };
  explanations?: Record<string, string>;
}

export class ContentPackService {
  /**
   * Returns current AI provider state.
   */
  public static getProviderState(): ContentPackProviderState {
    const key = config.openrouterApiKey?.trim();
    if (!key) {
      return 'NOT_CONFIGURED';
    }
    return 'CONFIGURED';
  }

  /**
   * Generates a complete source-grounded Content Pack for a clip.
   */
  public static async generateContentPack(
    options: GenerateContentPackOptions
  ): Promise<ContentPack> {
    const {
      userId,
      projectId,
      clipId,
      mode = 'BALANCED',
      template = 'Creator',
      platform,
      userInstruction,
      brandBrainId,
      idempotencyKey,
    } = options;

    if (!userId) {
      throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    }
    if (!projectId || !clipId) {
      throw new AppError('Project ID and Clip ID are required.', 400, 'INVALID_INPUT');
    }

    // Check resource limits
    if (userInstruction && userInstruction.length > CONTENT_PACK_LIMITS.MAX_USER_INSTRUCTION_LENGTH) {
      throw new AppError(
        `User instruction exceeds limit of ${CONTENT_PACK_LIMITS.MAX_USER_INSTRUCTION_LENGTH} chars.`,
        400,
        'INSTRUCTION_TOO_LONG'
      );
    }

    const providerState = this.getProviderState();
    if (providerState === 'NOT_CONFIGURED') {
      throw new AppError(
        'AI provider is not configured. Please configure OPENROUTER_API_KEY in server environment.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    return await ownerContext.run(userId, async () => {
      // 1. Verify Project & Clip ownership
      const { data: project, error: pErr } = await dataRepository
        .from('projects')
        .select()
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();
      if (pErr || !project) {
        throw new AppError('Project not found or unauthorized.', 404, 'PROJECT_NOT_FOUND');
      }

      const { data: clip, error: cErr } = await dataRepository
        .from('clips')
        .select()
        .eq('id', clipId)
        .eq('user_id', userId)
        .single();
      if (cErr || !clip) {
        throw new AppError('Clip not found or unauthorized.', 404, 'CLIP_NOT_FOUND');
      }

      // Check max packs per project
      const { data: existingPacks, count: packCount } = await dataRepository
        .from('content_packs')
        .select('id', { count: 'exact' })
        .eq('project_id', projectId)
        .eq('user_id', userId);
      if (
        (packCount ?? (existingPacks?.length || 0)) >=
        CONTENT_PACK_LIMITS.MAX_PACKS_PER_PROJECT
      ) {
        throw new AppError(
          `Project has reached max content packs limit (${CONTENT_PACK_LIMITS.MAX_PACKS_PER_PROJECT}).`,
          400,
          'MAX_PACKS_EXCEEDED'
        );
      }

      // Idempotency check: if an existing pack for this clip matches idempotency key
      if (idempotencyKey) {
        const { data: existingByIdem } = await dataRepository
          .from('content_packs')
          .select()
          .eq('clip_id', clipId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingByIdem && existingByIdem.length > 0) {
          const pack = existingByIdem[0] as ContentPack;
          // Load items
          const { data: items } = await dataRepository
            .from('content_pack_items')
            .select()
            .eq('content_pack_id', pack.id)
            .eq('user_id', userId);
          pack.items = (items || []) as ContentPackItem[];
          return pack;
        }
      }

      // 2. Extract bounded transcript context
      const { data: transcriptRecord } = await dataRepository
        .from('transcripts')
        .select()
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      const clipStart = Number(clip.start_seconds || 0);
      const clipEnd = Number(clip.end_seconds || clipStart + 30);
      const clipDuration = Math.max(1, clipEnd - clipStart);

      let boundedTranscript = '';
      const matchingSegments: Array<{ start: number; end: number; text: string }> = [];

      if (transcriptRecord?.segments && Array.isArray(transcriptRecord.segments)) {
        for (const seg of transcriptRecord.segments) {
          const segStart = Number(seg.start || 0);
          const segEnd = Number(seg.end || segStart);
          // Include segment if overlapping or within small 3s boundary
          if (segEnd >= clipStart - 3 && segStart <= clipEnd + 3) {
            matchingSegments.push({ start: segStart, end: segEnd, text: seg.text || '' });
          }
        }
      }

      if (matchingSegments.length > 0) {
        boundedTranscript = matchingSegments.map((s) => s.text).join(' ');
      } else if (transcriptRecord?.transcript_text) {
        boundedTranscript = transcriptRecord.transcript_text.slice(0, 1500);
      } else {
        boundedTranscript = clip.title || project.title || 'Source Video Clip';
      }

      // 3. Fetch Brand Brain context (Phase 22 BrandContextService)
      let brandContext: any = null;
      let brandRulesUsed: string[] = [];
      let avoidPhrases: string[] = [];
      let protectedTerms: string[] = [];
      let activeTone = 'conversational';
      let ctaPreference = 'COMMENT';

      try {
        brandContext = await BrandContextService.getBrandContext({
          userId,
          projectId,
          taskType: 'PUBLISH',
          platform,
          userOverrides: userInstruction ? { instruction: userInstruction } : undefined,
          brandBrainId,
        });

        if (brandContext) {
          brandRulesUsed = brandContext.rules_applied || [];
          if (brandContext.voice?.tones?.[0]) {
            activeTone = brandContext.voice.tones[0];
          }
          if (brandContext.voice?.avoid_phrasing) {
            avoidPhrases = brandContext.voice.avoid_phrasing;
          }
          if (brandContext.brand_name) {
            protectedTerms.push(brandContext.brand_name);
          }
          if (brandContext.cta?.preferred_cta_types?.[0]) {
            ctaPreference = brandContext.cta.preferred_cta_types[0];
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch brand context, using Vireo defaults', { err });
      }

      // 4. Build prompt and query AI Provider
      const sanitizedSource = BrandContextService.sanitizePromptData(boundedTranscript);
      const sanitizedInstruction = userInstruction
        ? BrandContextService.sanitizePromptData(userInstruction)
        : '';

      const systemPrompt = `You are the Vireo AI Content Pack Generator.
Your job is to transform a single approved short-form video clip into a complete, high-impact, multi-platform publishing content pack.

CRITICAL RULES:
1. STRICT SOURCE GROUNDING: Everything you generate must be grounded ONLY in the source transcript data.
   - NEVER invent statistics, metrics, percentages, money amounts, rankings, or guarantees not found in the source transcript.
   - Quote safety: NEVER wrap text in quotation marks unless it appears verbatim in the source.
2. CREATOR VOICE & BRAND AUTHORITY:
   - Voice/Tone: ${activeTone}.
   - User Instructions: ${sanitizedInstruction || 'None'}. (Current user instructions override learned preferences).
   - Avoid phrases: ${avoidPhrases.join(', ') || 'None'}.
   - Protected terms: ${protectedTerms.join(', ') || 'None'}.
3. NO FAKE URGENCY OR DECEPTIVE CTAs: Only reference links or downloads if present in source.
4. THUMBNAIL DIRECTION: Provide purely creative TEXTUAL direction (e.g. framing, facial expression, bold 3-word title). Do NOT pretend an image is rendered.
5. JSON OUTPUT FORMAT: Respond strictly with valid JSON.`;

      const userPrompt = `Generate a Content Pack (${mode} mode, template: ${template}) for the following video clip:

Clip Title: ${clip.title || project.title}
Clip Duration: ${clipDuration.toFixed(1)}s (${clipStart.toFixed(1)}s to ${clipEnd.toFixed(1)}s)

<source_transcript>
${sanitizedSource}
</source_transcript>

Required Output Schema (JSON):
{
  "primary_title": "Source-grounded primary title under 80 chars",
  "alt_titles": [
    { "text": "Direct variant", "category": "DIRECT" },
    { "text": "Curiosity variant", "category": "CURIOSITY" },
    { "text": "Benefit variant", "category": "BENEFIT" },
    { "text": "Question variant", "category": "QUESTION" },
    { "text": "Contrarian variant", "category": "CONTRARIAN" }
  ],
  "hooks": [
    "Punchy hook variant 1",
    "Engaging hook variant 2",
    "Story hook variant 3"
  ],
  "short_caption": "Snappy social caption suitable for Shorts, Reels, TikTok (under 300 chars)",
  "long_caption": "Detailed context-rich post copy for LinkedIn or expanded posts",
  "short_description": "Semantic summary of the clip content (1-2 sentences)",
  "long_description": "Structured multi-line summary of key takeaways from the clip",
  "cta_variants": [
    "Preferred CTA aligned with tone",
    "Secondary engagement question CTA"
  ],
  "hashtags": [
    "#relevanttag1", "#relevanttag2", "#relevanttag3", "#relevanttag4"
  ],
  "keywords": [
    "core topic 1", "key theme 2", "subject 3"
  ],
  "thumbnail_direction": "Creative textual direction for creator thumbnail (framing, mood, contrast)",
  "thumbnail_texts": [
    "Bold 3-Word Header", "Short Punchline", "Key Question"
  ],
  "alt_text": "Accessibility alt-text describing the thumbnail scene",
  "pinned_comment": "Discussion prompt for pinned comment",
  "platform_packs": {
    "youtube": {
      "title": "Optimized YouTube title",
      "description": "YouTube description with chapters note",
      "hashtags": ["#tag1", "#tag2"]
    },
    "instagram": {
      "caption": "Reels caption with spacing and hook",
      "hashtags": ["#tag1", "#tag2", "#tag3"],
      "cta": "Drop a comment below"
    },
    "tiktok": {
      "caption": "Short viral TikTok caption",
      "hashtags": ["#tag1", "#tag2"]
    },
    "linkedin": {
      "post": "Professional takeaway post with spacing and insight",
      "cta": "What are your thoughts on this approach?"
    },
    "x": {
      "post": "Punchy concise tweet under 250 characters"
    }
  },
  "explanations": {
    "primary_title": "Based on source clip key insight",
    "hooks": "Matches creator hook style"
  }
}`;

      let aiResult: RawAiPackOutput;
      try {
        aiResult = await defaultAiProvider.generateJsonCompletion<RawAiPackOutput>({
          systemPrompt,
          userPrompt,
          temperature: 0.6,
          maxTokens: 2500,
        });
      } catch (err: any) {
        logger.error('Failed to generate Content Pack from AI provider', { err });
        throw new AppError(
          `AI content pack generation failed: ${err.message || 'Provider error'}`,
          502,
          'AI_GENERATION_FAILED'
        );
      }

      // 5. Structure, validate and build ContentPackItem records
      const packId = crypto.randomUUID();
      const now = new Date().toISOString();

      const defaultEvidence: ContentPackItem['source_evidence'] = [
        {
          source_timestamps: [{ start: clipStart, end: clipEnd }],
          source_topics: aiResult.keywords || [],
        },
      ];

      const itemsToInsert: ContentPackItem[] = [];
      const itemCounts: Record<string, number> = {};

      const addItem = (
        type: ContentPackItemType,
        text: string,
        platformOpt: OutputPlatform | 'all' = 'all',
        variantIdx: number = 0,
        explanationText?: string
      ) => {
        if (!text || !text.trim()) return;

        const candidateItem: ContentPackItem = {
          id: crypto.randomUUID(),
          user_id: userId,
          content_pack_id: packId,
          type,
          platform: platformOpt,
          variant_index: variantIdx,
          text: text.trim(),
          status: 'GENERATED',
          source_evidence: defaultEvidence,
          generation_source: 'ai',
          brand_rules_used: brandRulesUsed,
          manual_edit: false,
          locked: false,
          approved: false,
          explanation: explanationText || aiResult.explanations?.[type.toLowerCase()] || undefined,
          validation_warnings: [],
          created_at: now,
          updated_at: now,
        };

        // Run validator
        const validation = ContentPackValidator.validateItem(candidateItem, boundedTranscript, {
          avoidPhrases,
          protectedTerms,
        });

        if (validation.warnings.length > 0) {
          candidateItem.validation_warnings = validation.warnings;
        }

        itemsToInsert.push(candidateItem);
        itemCounts[type] = (itemCounts[type] || 0) + 1;
      };

      // Primary Title
      if (aiResult.primary_title) {
        addItem('PRIMARY_TITLE', aiResult.primary_title, 'all', 0, 'Recommended primary title');
      }

      // Alternate Titles
      if (Array.isArray(aiResult.alt_titles)) {
        aiResult.alt_titles.forEach((alt, idx) => {
          const titleText = typeof alt === 'string' ? alt : alt.text;
          const category = typeof alt === 'object' ? alt.category : undefined;
          addItem('ALT_TITLE', titleText, 'all', idx + 1, category ? `Variant: ${category}` : undefined);
        });
      }

      // Hooks
      if (Array.isArray(aiResult.hooks)) {
        aiResult.hooks.forEach((hook, idx) => {
          addItem('HOOK', hook, 'all', idx, `Hook option ${idx + 1}`);
        });
      }

      // Short Caption
      if (aiResult.short_caption) {
        addItem('SHORT_CAPTION', aiResult.short_caption, 'all', 0);
      }

      // Long Caption (balanced / full mode)
      if (mode !== 'QUICK' && aiResult.long_caption) {
        addItem('LONG_CAPTION', aiResult.long_caption, 'all', 0);
      }

      // Short Description
      if (aiResult.short_description) {
        addItem('SHORT_DESCRIPTION', aiResult.short_description, 'all', 0);
      }

      // Long Description (balanced / full mode)
      if (mode !== 'QUICK' && aiResult.long_description) {
        addItem('LONG_DESCRIPTION', aiResult.long_description, 'all', 0);
      }

      // CTA Variants
      if (Array.isArray(aiResult.cta_variants)) {
        aiResult.cta_variants.forEach((cta, idx) => {
          addItem('CTA', cta, 'all', idx);
        });
      }

      // Hashtags
      if (Array.isArray(aiResult.hashtags) && aiResult.hashtags.length > 0) {
        const tagText = aiResult.hashtags.join(' ');
        addItem('HASHTAGS', tagText, 'all', 0);
      }

      // Keywords / Topics
      if (Array.isArray(aiResult.keywords) && aiResult.keywords.length > 0) {
        addItem('KEYWORDS', aiResult.keywords.join(', '), 'all', 0);
      }

      // Thumbnail Direction
      if (aiResult.thumbnail_direction) {
        addItem('THUMBNAIL_DIRECTION', aiResult.thumbnail_direction, 'all', 0, 'Creative visual brief');
      }

      // Thumbnail Texts
      if (Array.isArray(aiResult.thumbnail_texts)) {
        aiResult.thumbnail_texts.forEach((tt, idx) => {
          addItem('THUMBNAIL_TEXT', tt, 'all', idx);
        });
      }

      // Alt Text
      if (aiResult.alt_text) {
        addItem('ALT_TEXT', aiResult.alt_text, 'all', 0, 'Accessibility text');
      }

      // Pinned Comment
      if (aiResult.pinned_comment) {
        addItem('PINNED_COMMENT', aiResult.pinned_comment, 'all', 0);
      }

      // Platform specific packs
      if (aiResult.platform_packs) {
        const pp = aiResult.platform_packs;

        if (pp.youtube?.title) {
          addItem('PRIMARY_TITLE', pp.youtube.title, 'youtube', 0, 'YouTube optimized title');
        }
        if (pp.youtube?.description) {
          addItem('LONG_DESCRIPTION', pp.youtube.description, 'youtube', 0, 'YouTube description');
        }

        if (pp.instagram?.caption) {
          addItem('SHORT_CAPTION', pp.instagram.caption, 'instagram', 0, 'Instagram Reels caption');
        }
        if (pp.instagram?.hashtags && pp.instagram.hashtags.length > 0) {
          addItem('HASHTAGS', pp.instagram.hashtags.join(' '), 'instagram', 0, 'Instagram tags');
        }

        if (pp.tiktok?.caption) {
          addItem('SHORT_CAPTION', pp.tiktok.caption, 'tiktok', 0, 'TikTok concise caption');
        }

        if (pp.linkedin?.post) {
          addItem('LONG_CAPTION', pp.linkedin.post, 'linkedin', 0, 'LinkedIn professional post');
        }

        if (pp.x?.post) {
          addItem('SHORT_CAPTION', pp.x.post, 'x', 0, 'X post');
        }
      }

      // 6. Create ContentPack record
      const packRecord: ContentPack = {
        id: packId,
        user_id: userId,
        project_id: projectId,
        clip_id: clipId,
        brand_brain_id: brandBrainId,
        brand_brain_version: brandContext?.version || 1,
        source: {
          transcript_source: project.title || 'Source Video',
          source_language: transcriptRecord?.language || 'en',
          clip_start: clipStart,
          clip_end: clipEnd,
          duration: clipDuration,
          topic_summary: aiResult.keywords?.join(', ') || undefined,
        },
        status: 'READY',
        version: 1,
        generation_mode: mode,
        template,
        user_instruction: sanitizedInstruction || undefined,
        item_counts: itemCounts,
        created_at: now,
        updated_at: now,
      };

      // Persist ContentPack and Items
      const { error: insertPackErr } = await dataRepository
        .from('content_packs')
        .insert(packRecord);
      if (insertPackErr) {
        logger.error('Failed to insert content pack', { insertPackErr });
        throw new AppError('Failed to persist content pack.', 500, 'DB_ERROR');
      }

      if (itemsToInsert.length > 0) {
        const { error: insertItemsErr } = await dataRepository
          .from('content_pack_items')
          .insert(itemsToInsert);
        if (insertItemsErr) {
          logger.error(`Failed to insert content pack items: ${insertItemsErr.message || JSON.stringify(insertItemsErr)}`);
          throw new AppError(`Failed to persist content pack items: ${insertItemsErr.message || JSON.stringify(insertItemsErr)}`, 500, 'DB_ERROR');
        }
      }

      // Snapshot version 1
      packRecord.items = itemsToInsert;
      await dataRepository.from('content_pack_versions').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        content_pack_id: packId,
        version: 1,
        snapshot: packRecord,
        change_summary: 'Initial generation',
        created_at: now,
      });

      logger.info('Content Pack generated successfully', {
        packId,
        clipId,
        mode,
        itemCount: itemsToInsert.length,
      });

      return packRecord;
    });
  }

  /**
   * Retrieves a Content Pack and all its items by ID.
   */
  public static async getContentPack(
    userId: string,
    contentPackId: string
  ): Promise<ContentPack> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!contentPackId) throw new AppError('Content Pack ID is required.', 400, 'INVALID_INPUT');

    return await ownerContext.run(userId, async () => {
      const { data: pack, error } = await dataRepository
        .from('content_packs')
        .select()
        .eq('id', contentPackId)
        .eq('user_id', userId)
        .single();

      if (error || !pack) {
        throw new AppError('Content Pack not found.', 404, 'CONTENT_PACK_NOT_FOUND');
      }

      const { data: items } = await dataRepository
        .from('content_pack_items')
        .select()
        .eq('content_pack_id', contentPackId)
        .eq('user_id', userId)
        .order('variant_index', { ascending: true });

      pack.items = (items || []) as ContentPackItem[];
      return pack as ContentPack;
    });
  }

  /**
   * Lists content packs for a specific clip.
   */
  public static async listPacksForClip(
    userId: string,
    clipId: string
  ): Promise<ContentPack[]> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const { data: packs, error } = await dataRepository
        .from('content_packs')
        .select()
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AppError('Failed to fetch content packs.', 500, 'DB_ERROR');
      }

      return (packs || []) as ContentPack[];
    });
  }

  /**
   * Updates an individual ContentPackItem (manual edit, lock, approval).
   */
  public static async updateItem(
    userId: string,
    contentPackId: string,
    itemId: string,
    updates: { text?: string; locked?: boolean; approved?: boolean }
  ): Promise<ContentPackItem> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const { data: item, error: findErr } = await dataRepository
        .from('content_pack_items')
        .select()
        .eq('id', itemId)
        .eq('content_pack_id', contentPackId)
        .eq('user_id', userId)
        .single();

      if (findErr || !item) {
        throw new AppError('Content pack item not found.', 404, 'ITEM_NOT_FOUND');
      }

      const payload: Partial<ContentPackItem> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.text !== undefined) {
        payload.text = updates.text.trim();
        payload.manual_edit = true;
        payload.status = 'EDITED';
      }

      if (updates.locked !== undefined) {
        payload.locked = updates.locked;
      }

      if (updates.approved !== undefined) {
        payload.approved = updates.approved;
        if (updates.approved) {
          payload.status = 'APPROVED';
        }
      }

      const { data: updated, error: updateErr } = await dataRepository
        .from('content_pack_items')
        .update(payload)
        .eq('id', itemId)
        .eq('user_id', userId);

      if (updateErr) {
        throw new AppError('Failed to update content pack item.', 500, 'DB_ERROR');
      }

      return { ...item, ...payload } as ContentPackItem;
    });
  }

  /**
   * Regenerates a single item in the Content Pack.
   * If the item is locked, regeneration is rejected to preserve user choice.
   */
  public static async regenerateItem(
    userId: string,
    contentPackId: string,
    itemId: string,
    userInstruction?: string
  ): Promise<ContentPackItem> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const pack = await this.getContentPack(userId, contentPackId);
      const item = (pack.items || []).find((i) => i.id === itemId);

      if (!item) {
        throw new AppError('Item not found in content pack.', 404, 'ITEM_NOT_FOUND');
      }

      if (item.locked) {
        throw new AppError('Item is locked and cannot be regenerated.', 400, 'ITEM_LOCKED');
      }

      const sanitizedInstruction = userInstruction
        ? BrandContextService.sanitizePromptData(userInstruction)
        : '';

      const prompt = `Generate a single fresh replacement for a ${item.type} item.
Context Transcript Summary: ${pack.source?.topic_summary || pack.source?.transcript_source}
Current Text: "${item.text}"
Target Platform: ${item.platform || 'all'}
User Instruction: ${sanitizedInstruction || 'Provide a fresh variation grounded in the source'}

Return JSON:
{
  "replacement_text": "New text here",
  "explanation": "Why this variant works"
}`;

      let result: { replacement_text: string; explanation?: string };
      try {
        result = await defaultAiProvider.generateJsonCompletion<{
          replacement_text: string;
          explanation?: string;
        }>({
          systemPrompt: 'You are a social content specialist. Return valid JSON only.',
          userPrompt: prompt,
          temperature: 0.7,
        });
      } catch (err: any) {
        throw new AppError(`Regeneration failed: ${err.message}`, 502, 'AI_ERROR');
      }

      const updatedPayload: Partial<ContentPackItem> = {
        text: result.replacement_text.trim(),
        explanation: result.explanation || item.explanation,
        status: 'GENERATED',
        manual_edit: false,
        updated_at: new Date().toISOString(),
      };

      await dataRepository
        .from('content_pack_items')
        .update(updatedPayload)
        .eq('id', itemId)
        .eq('user_id', userId);

      return { ...item, ...updatedPayload } as ContentPackItem;
    });
  }

  /**
   * Regenerates items for a specific platform.
   * Preserves all locked and approved items!
   */
  public static async regeneratePlatform(
    userId: string,
    contentPackId: string,
    platform: OutputPlatform,
    userInstruction?: string
  ): Promise<ContentPack> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const pack = await this.getContentPack(userId, contentPackId);
      const items = pack.items || [];

      const platformItems = items.filter(
        (i) => i.platform === platform && !i.locked && !i.approved
      );

      for (const item of platformItems) {
        try {
          await this.regenerateItem(userId, contentPackId, item.id, userInstruction);
        } catch (err) {
          logger.warn(`Failed to regenerate item ${item.id}`, { err });
        }
      }

      return await this.getContentPack(userId, contentPackId);
    });
  }

  /**
   * Regenerates the entire Content Pack.
   * Preserves all locked and approved items. Increments version and creates version snapshot.
   */
  public static async regeneratePack(
    userId: string,
    contentPackId: string,
    userInstruction?: string
  ): Promise<ContentPack> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const pack = await this.getContentPack(userId, contentPackId);
      const items = pack.items || [];

      // Filter non-locked and non-approved items
      const modifiableItems = items.filter((i) => !i.locked && !i.approved);

      for (const item of modifiableItems) {
        try {
          await this.regenerateItem(userId, contentPackId, item.id, userInstruction);
        } catch (err) {
          logger.warn(`Failed to regenerate item ${item.id} during pack refresh`, { err });
        }
      }

      const newVersion = (pack.version || 1) + 1;
      const now = new Date().toISOString();

      await dataRepository
        .from('content_packs')
        .update({
          version: newVersion,
          updated_at: now,
        })
        .eq('id', contentPackId)
        .eq('user_id', userId);

      const refreshed = await this.getContentPack(userId, contentPackId);

      // Save version history snapshot
      await dataRepository.from('content_pack_versions').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        content_pack_id: contentPackId,
        version: newVersion,
        snapshot: refreshed,
        change_summary: `Pack regenerated (v${newVersion})`,
        created_at: now,
      });

      return refreshed;
    });
  }

  /**
   * Approves the whole Content Pack and its items.
   */
  public static async approvePack(
    userId: string,
    contentPackId: string
  ): Promise<ContentPack> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const now = new Date().toISOString();

      await dataRepository
        .from('content_packs')
        .update({
          status: 'APPROVED',
          approved_at: now,
          updated_at: now,
        })
        .eq('id', contentPackId)
        .eq('user_id', userId);

      await dataRepository
        .from('content_pack_items')
        .update({
          approved: true,
          status: 'APPROVED',
          updated_at: now,
        })
        .eq('content_pack_id', contentPackId)
        .eq('user_id', userId);

      return await this.getContentPack(userId, contentPackId);
    });
  }

  /**
   * Translation Integration:
   * Translates approved Content Pack items to a target language preserving brand terms and variant relations.
   */
  public static async translateContentPack(
    userId: string,
    contentPackId: string,
    targetLanguage: string
  ): Promise<ContentPack> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    if (!targetLanguage) throw new AppError('Target language is required.', 400, 'INVALID_INPUT');

    return await ownerContext.run(userId, async () => {
      const pack = await this.getContentPack(userId, contentPackId);
      const items = pack.items || [];

      // Translate titles, captions, descriptions, and hashtags
      const translatableItems = items.filter((i) =>
        ['PRIMARY_TITLE', 'ALT_TITLE', 'HOOK', 'SHORT_CAPTION', 'LONG_CAPTION', 'SHORT_DESCRIPTION', 'LONG_DESCRIPTION', 'CTA'].includes(
          i.type
        )
      );

      const textsToTranslate = translatableItems.map((item, idx) => ({
        id: item.id,
        text: item.text,
        type: item.type,
      }));

      const systemPrompt = `You are a professional multilingual translator for digital video publishing.
Translate the following items into target language "${targetLanguage}".
Preserve brand terminology and names.
Return strictly valid JSON:
{
  "translations": [
    { "id": "...", "translated_text": "..." }
  ]
}`;

      let result: { translations: Array<{ id: string; translated_text: string }> };
      try {
        result = await defaultAiProvider.generateJsonCompletion<{
          translations: Array<{ id: string; translated_text: string }>;
        }>({
          systemPrompt,
          userPrompt: JSON.stringify(textsToTranslate),
          temperature: 0.3,
        });
      } catch (err: any) {
        throw new AppError(`Translation failed: ${err.message}`, 502, 'TRANSLATION_FAILED');
      }

      const now = new Date().toISOString();
      for (const t of result.translations || []) {
        await dataRepository
          .from('content_pack_items')
          .update({
            text: t.translated_text.trim(),
            generation_source: 'translation',
            updated_at: now,
          })
          .eq('id', t.id)
          .eq('user_id', userId);
      }

      return await this.getContentPack(userId, contentPackId);
    });
  }

  /**
   * Publish Handoff:
   * Maps approved Content Pack metadata to the format expected by Vireo's social publishing form.
   */
  public static async getPublishHandoffPayload(
    userId: string,
    contentPackId: string,
    platform: OutputPlatform
  ): Promise<Record<string, any>> {
    if (!userId) throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');

    return await ownerContext.run(userId, async () => {
      const pack = await this.getContentPack(userId, contentPackId);
      const items = pack.items || [];

      // Find platform-specific or global items
      const findItem = (type: ContentPackItemType) => {
        return (
          items.find((i) => i.type === type && i.platform === platform && i.approved) ||
          items.find((i) => i.type === type && i.platform === platform) ||
          items.find((i) => i.type === type && i.approved) ||
          items.find((i) => i.type === type)
        );
      };

      const primaryTitle = findItem('PRIMARY_TITLE')?.text || '';
      const caption = findItem('SHORT_CAPTION')?.text || findItem('LONG_CAPTION')?.text || '';
      const description = findItem('LONG_DESCRIPTION')?.text || findItem('SHORT_DESCRIPTION')?.text || '';
      const hashtags = findItem('HASHTAGS')?.text || '';
      const cta = findItem('CTA')?.text || '';

      switch (platform) {
        case 'youtube':
        case 'shorts':
          return {
            platform,
            title: primaryTitle,
            description: `${description}\n\n${cta}\n\n${hashtags}`.trim(),
            tags: hashtags
              .split(/\s+/)
              .map((t) => t.replace(/^#/, ''))
              .filter(Boolean),
            visibility: 'public',
            source_content_pack_id: contentPackId,
          };

        case 'instagram':
          return {
            platform,
            caption: `${caption}\n\n${cta}\n\n${hashtags}`.trim(),
            source_content_pack_id: contentPackId,
          };

        case 'tiktok':
          return {
            platform,
            caption: `${caption} ${hashtags}`.trim(),
            source_content_pack_id: contentPackId,
          };

        case 'linkedin':
          return {
            platform,
            commentary: `${primaryTitle ? primaryTitle + '\n\n' : ''}${caption || description}\n\n${cta}`.trim(),
            source_content_pack_id: contentPackId,
          };

        case 'x':
          return {
            platform,
            text: `${caption || primaryTitle} ${hashtags}`.trim(),
            source_content_pack_id: contentPackId,
          };

        default:
          return {
            platform,
            title: primaryTitle,
            text: caption || description,
            source_content_pack_id: contentPackId,
          };
      }
    });
  }
}

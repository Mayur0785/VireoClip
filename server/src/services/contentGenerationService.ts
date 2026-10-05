import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { ContentPromptService, PromptContext } from './contentPromptService.js';
import { defaultAiProvider, AIProviderClient } from './aiProviderClient.js';
import { ContentOutputService } from './contentOutputService.js';
import {
  OutputPlatform,
  ContentOutputRecord,
  YouTubeGeneratedContent,
  InstagramGeneratedContent,
  ShortsGeneratedContent,
  TikTokGeneratedContent,
  LinkedInGeneratedContent,
  TwitterGeneratedContent,
  CreatorProfileData,
  TranscriptRecord,
  VALID_PLATFORMS,
  GenerationOverrides,
} from '../types/index.js';

export interface GenerateContentInput {
  projectId: string;
  userId: string;
  platform?: OutputPlatform;
  customNotes?: string;
  overrideTone?: string;
  overrideLanguage?: string;
  overrideCTA?: string;
  overrides?: GenerationOverrides;
}

export interface GenerationResult {
  status: 'ok' | 'error';
  message: string;
  projectId: string;
  outputs: ContentOutputRecord[];
}

export class ContentGenerationService {
  private aiProvider: AIProviderClient;

  constructor(aiProvider: AIProviderClient = defaultAiProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * Main orchestration method: verifies project ownership, checks transcript availability,
   * retrieves creator context, generates structured outputs via LLM, and persists them to content_outputs.
   */
  public async generateContentForProject(input: GenerateContentInput): Promise<GenerationResult> {
    const {
      projectId,
      userId,
      platform,
      customNotes,
      overrideTone,
      overrideLanguage,
      overrideCTA,
      overrides,
    } = input;

    // 1. Verify project ownership and fetch project info
    const { data: project, error: projErr } = await dataRepository
      .from('projects')
      .select('id, user_id, title, notes, video_status')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr) {
      logger.error('Failed to verify project ownership for content generation', {
        projectId,
        userId,
        error: projErr.message,
      });
      throw new Error(`Failed to verify project: ${projErr.message}`);
    }

    if (!project) {
      throw new Error('Project not found or access denied.');
    }

    // 2. Fetch the persisted MongoDB transcript.
    // MANDATORY CONSTRAINT: If transcript does not exist, FAIL IMMEDIATELY.
    // Never call AI, never create fake/mock transcripts.
    const { data: transcriptRecord, error: transErr } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (transErr) {
      logger.error('Error querying transcript for project', {
        projectId,
        error: transErr.message,
      });
      throw new Error(`Failed to query transcript: ${transErr.message}`);
    }

    if (!transcriptRecord || !transcriptRecord.transcript_text?.trim()) {
      logger.warn('Content generation rejected: Transcript not available yet', { projectId });
      throw new Error('Transcript is not available yet. Please complete transcription first.');
    }

    const transcript = transcriptRecord as TranscriptRecord;

    // 3. Fetch creator profile for personalization if available
    let creatorProfile: CreatorProfileData | undefined;
    const { data: profileData } = await dataRepository
      .from('creator_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileData) {
      creatorProfile = {
        niche: profileData.niche || '',
        target_audience: profileData.target_audience || '',
        language: profileData.language || 'English',
        tone: profileData.tone || 'Friendly',
        custom_tone: profileData.custom_tone || '',
        website_url: profileData.website_url || '',
        newsletter_url: profileData.newsletter_url || '',
        podcast_url: profileData.podcast_url || '',
        youtube_cta: profileData.youtube_cta || '',
        instagram_cta: profileData.instagram_cta || '',
        linkedin_cta: profileData.linkedin_cta || '',
        twitter_cta: profileData.twitter_cta || '',
        tiktok_cta: profileData.tiktok_cta || '',
        preferred_hook_style: profileData.preferred_hook_style || '',
        brand_rules: profileData.brand_rules || '',
        forbidden_phrases: profileData.forbidden_phrases || '',
      };
    }

    // 4. Update project video_status to 'generating' with scoped user_id (H7)
    await dataRepository
      .from('projects')
      .update({ video_status: 'generating' })
      .eq('id', projectId)
      .eq('user_id', userId);

    const effectiveTone = overrideTone?.trim() || overrides?.overrideTone?.trim();
    const effectiveLanguage = overrideLanguage?.trim() || overrides?.overrideLanguage?.trim();
    const effectiveCTA = overrideCTA?.trim() || overrides?.overrideCTA?.trim();

    const promptContext: PromptContext = {
      transcript: transcript.transcript_text,
      language: effectiveLanguage || transcript.language || creatorProfile?.language || 'English',
      duration: transcript.duration_seconds,
      segments: transcript.segments || [],
      creatorProfile,
      notes: customNotes || project.notes || '',
      overrides: {
        overrideTone: effectiveTone,
        overrideLanguage: effectiveLanguage,
        overrideCTA: effectiveCTA,
      },
    };

    const systemPrompt = ContentPromptService.getSystemPrompt();
    const rowsToInsert: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    const platformsToGenerate: OutputPlatform[] = platform
      ? [platform]
      : [...VALID_PLATFORMS];

    try {
      // 5. Generate content sequentially for requested platforms
      for (const p of platformsToGenerate) {
        logger.info(`Generating ${p} content for project ${projectId}...`, { projectId, platform: p });
        const userPrompt = ContentPromptService.buildPromptForPlatform(p, promptContext);

        switch (p) {
          case 'youtube': {
            const result = await this.aiProvider.generateJsonCompletion<YouTubeGeneratedContent>({
              systemPrompt,
              userPrompt,
            });
            this.validateYouTubeOutput(result);
            rowsToInsert.push(...ContentOutputService.transformYouTubeToRows(projectId, result));
            break;
          }
          case 'instagram': {
            const result = await this.aiProvider.generateJsonCompletion<InstagramGeneratedContent>({
              systemPrompt,
              userPrompt,
            });
            this.validateInstagramOutput(result);
            rowsToInsert.push(...ContentOutputService.transformInstagramToRows(projectId, result));
            break;
          }
          case 'shorts': {
            const result = await this.aiProvider.generateJsonCompletion<ShortsGeneratedContent>({
              systemPrompt,
              userPrompt,
            });
            this.validateShortsOutput(result);
            rowsToInsert.push(...ContentOutputService.transformShortsToRows(projectId, result));
            break;
          }
          case 'tiktok': {
            const result = await this.aiProvider.generateJsonCompletion<TikTokGeneratedContent>({
              systemPrompt,
              userPrompt,
            });
            this.validateTikTokOutput(result);
            if (!promptContext.segments?.length) {
              result.moment.start = 'N/A';
              result.moment.end = 'N/A';
              result.moment.timestamps_available = false;
            }
            rowsToInsert.push(...ContentOutputService.transformTikTokToRows(projectId, result));
            break;
          }
          case 'linkedin': {
            const result = await this.aiProvider.generateJsonCompletion<LinkedInGeneratedContent>({
              systemPrompt,
              userPrompt,
            });
            this.validateLinkedInOutput(result);
            rowsToInsert.push(...ContentOutputService.transformLinkedInToRows(projectId, result));
            break;
          }
          case 'x': {
            const result = await this.aiProvider.generateJsonCompletion<TwitterGeneratedContent>({
              systemPrompt,
              userPrompt,
            });
            this.validateTwitterOutput(result);
            rowsToInsert.push(...ContentOutputService.transformTwitterToRows(projectId, result));
            break;
          }
        }
      }

      // 6. Save generated content to database
      await ContentOutputService.saveOutputs(projectId, rowsToInsert, platform);

      // 7. Update project video_status to 'completed' with user_id scoped (H7)
      await dataRepository
        .from('projects')
        .update({ video_status: 'completed' })
        .eq('id', projectId)
        .eq('user_id', userId);

      // 8. Fetch and return complete outputs list for the project
      const finalOutputs = await ContentOutputService.getOutputsForProject(projectId);

      logger.info(`Successfully generated ${finalOutputs.length} content outputs for project ${projectId}`, {
        projectId,
        outputCount: finalOutputs.length,
      });

      return {
        status: 'ok',
        message: 'Content generated successfully.',
        projectId,
        outputs: finalOutputs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Content generation failed for project ${projectId}`, {
        projectId,
        error: message,
      });

      // Revert status back to 'transcribed' so user can retry generation without needing to re-transcribe (H7)
      await dataRepository
        .from('projects')
        .update({ video_status: 'transcribed' })
        .eq('id', projectId)
        .eq('user_id', userId);

      throw err;
    }
  }

  // Validation routines for structured outputs
  private validateYouTubeOutput(out: any): void {
    if (!out || typeof out !== 'object') throw new Error('Invalid YouTube output structure.');
    if (!Array.isArray(out.titles) || out.titles.length === 0) {
      throw new Error('YouTube generation did not return title suggestions.');
    }
    if (!out.description || typeof out.description !== 'string') {
      throw new Error('YouTube generation did not return description.');
    }
  }

  private validateInstagramOutput(out: any): void {
    if (!out || typeof out !== 'object') throw new Error('Invalid Instagram output structure.');
    if (!Array.isArray(out.hooks) || out.hooks.length === 0) {
      throw new Error('Instagram generation did not return hooks.');
    }
    if (!out.caption || typeof out.caption !== 'string') {
      throw new Error('Instagram generation did not return caption.');
    }
  }

  private validateShortsOutput(out: any): void {
    if (!out || typeof out !== 'object') throw new Error('Invalid Shorts output structure.');
    if (!Array.isArray(out.moments)) {
      throw new Error('Shorts generation did not return moments array.');
    }
  }

  private validateTikTokOutput(out: any): void {
    if (!out || typeof out !== 'object') throw new Error('Invalid TikTok output structure.');
    if (!Array.isArray(out.hooks) || out.hooks.length === 0 ||
      !out.hooks.every((hook: unknown) => typeof hook === 'string' && hook.trim())) {
      throw new Error('TikTok generation did not return hooks.');
    }
    if (typeof out.caption !== 'string' || !out.caption.trim()) {
      throw new Error('TikTok generation did not return a caption.');
    }
    if (!out.moment || typeof out.moment.description !== 'string' || !out.moment.description.trim()) {
      throw new Error('TikTok generation did not return a moment idea.');
    }
  }

  private validateLinkedInOutput(out: any): void {
    if (!out || typeof out !== 'object') throw new Error('Invalid LinkedIn output structure.');
    if (!out.post || typeof out.post !== 'string') {
      throw new Error('LinkedIn generation did not return post text.');
    }
  }

  private validateTwitterOutput(out: any): void {
    if (!out || typeof out !== 'object') throw new Error('Invalid Twitter output structure.');
    if (!out.post || typeof out.post !== 'string') {
      throw new Error('Twitter generation did not return post text.');
    }
  }
}

export const contentGenerationService = new ContentGenerationService();

import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  TranslationProject,
  TranslatedSegment,
  TranslationStyle,
  TRANSLATION_RESOURCE_LIMITS,
} from '../../types/index.js';
import { LanguageModel } from './languageModel.js';
import { GlossaryService } from './glossaryService.js';
import { TranslationProviderRegistry } from './translationProvider.js';

export interface CreateTranslationProjectDTO {
  project_id: string;
  clip_id: string;
  source_language: string;
  target_language: string;
  style?: TranslationStyle;
  segments: Array<{
    segment_id?: string;
    source_text: string;
    start_time: number;
    end_time: number;
    speaker_id?: string;
  }>;
}

/**
 * Phase 21: Translation Project Service
 * Manages translation projects, segment-level translation execution,
 * inline editing persistence, translation memory sync, and versioning.
 */
export class TranslationProjectService {
  /**
   * Creates a new translation project in MongoDB.
   */
  public static async createProject(
    dto: CreateTranslationProjectDTO,
    userId: string
  ): Promise<TranslationProject> {
    const sourceLang = LanguageModel.normalizeLanguageCode(dto.source_language);
    const targetLang = LanguageModel.normalizeLanguageCode(dto.target_language);

    if (!LanguageModel.isLanguageSupported(targetLang)) {
      throw new AppError(
        `Target language is unsupported: ${dto.target_language}`,
        400,
        'UNSUPPORTED_LANGUAGE'
      );
    }

    if (!dto.segments || dto.segments.length === 0) {
      throw new AppError('Translation project requires at least one segment.', 400, 'INVALID_INPUT');
    }

    if (dto.segments.length > TRANSLATION_RESOURCE_LIMITS.MAX_SEGMENTS) {
      throw new AppError(
        `Segment count exceeds limit of ${TRANSLATION_RESOURCE_LIMITS.MAX_SEGMENTS}.`,
        400,
        'PAYLOAD_TOO_LARGE'
      );
    }

    const segments: TranslatedSegment[] = dto.segments.map((s, idx) => ({
      segment_id: s.segment_id || `seg_${idx + 1}_${crypto.randomUUID().slice(0, 8)}`,
      source_text: s.source_text.trim(),
      translated_text: '',
      start_time: s.start_time,
      end_time: s.end_time,
      speaker_id: s.speaker_id,
      reviewed: false,
    }));

    const projectRecord: TranslationProject = {
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: dto.project_id,
      clip_id: dto.clip_id,
      source_language: sourceLang,
      target_language: targetLang,
      status: 'draft',
      provider: 'openrouter',
      version: 1,
      style: dto.style || 'natural',
      segments,
      stats: { segment_count: segments.length },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return await ownerContext.run(userId, async () => {
      const { error } = await dataRepository.from('translation_projects').insert(projectRecord);
      if (error) {
        throw new AppError(`Failed to persist translation project: ${error.message}`, 500);
      }
      return projectRecord;
    });
  }

  /**
   * Retrieves a translation project by ID with cross-user ownership verification.
   */
  public static async getProject(projectId: string, userId: string): Promise<TranslationProject | null> {
    return await ownerContext.run(userId, async () => {
      const { data } = await dataRepository
        .from('translation_projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      return (data as TranslationProject) || null;
    });
  }

  /**
   * Lists translation projects for a specific clip.
   */
  public static async listProjectsForClip(clipId: string, userId: string): Promise<TranslationProject[]> {
    return await ownerContext.run(userId, async () => {
      const { data } = await dataRepository
        .from('translation_projects')
        .select('*')
        .eq('clip_id', clipId);

      return (data as TranslationProject[]) || [];
    });
  }

  /**
   * Executes translation for a project. Checks translation memory for identical segments,
   * masks protected tokens, queries provider for missing segments, and updates project.
   */
  public static async translateProject(
    projectId: string,
    userId: string,
    providerName = 'openrouter'
  ): Promise<TranslationProject> {
    const project = await this.getProject(projectId, userId);
    if (!project) {
      throw new AppError('Translation project not found.', 404, 'NOT_FOUND');
    }

    const provider = TranslationProviderRegistry.getProvider(providerName);
    if (!provider.isConfigured()) {
      throw new AppError(
        `[PROVIDER_NOT_CONFIGURED] Translation provider '${providerName}' is not configured.`,
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    // Load custom project glossary terms
    const glossaryTerms = await GlossaryService.getGlossaryTerms(userId, project.project_id);
    const lockedTerms = glossaryTerms.map((t) => t.term);

    // Identify which segments need translation (preserving manual edits)
    const segmentsToTranslate: Array<{
      segment_id: string;
      source_text: string;
      start_time: number;
      end_time: number;
      speaker_id?: string;
    }> = [];

    const updatedSegments: TranslatedSegment[] = [];

    for (const seg of project.segments) {
      // If user previously manually edited this segment, preserve it!
      if (seg.is_manually_edited && seg.translated_text) {
        updatedSegments.push(seg);
        continue;
      }

      // Check translation memory
      const cached = await GlossaryService.lookupTranslationMemory(
        userId,
        seg.source_text,
        project.source_language,
        project.target_language
      );

      if (cached) {
        updatedSegments.push({
          ...seg,
          translated_text: cached,
          confidence: 1.0,
        });
      } else {
        segmentsToTranslate.push({
          segment_id: seg.segment_id,
          source_text: seg.source_text,
          start_time: seg.start_time,
          end_time: seg.end_time,
          speaker_id: seg.speaker_id,
        });
      }
    }

    let charactersBilled = 0;
    let tokensUsed = 0;

    if (segmentsToTranslate.length > 0) {
      const res = await provider.translateSegments({
        segments: segmentsToTranslate,
        source_language: project.source_language,
        target_language: project.target_language,
        style: project.style,
        glossary_terms: lockedTerms,
      });

      charactersBilled = res.characters_billed;
      tokensUsed = res.tokens_used || 0;

      // Merge provider translated segments
      for (const translated of res.segments) {
        updatedSegments.push(translated);
      }
    }

    // Sort segments chronologically
    updatedSegments.sort((a, b) => a.start_time - b.start_time);

    const updatedProject: TranslationProject = {
      ...project,
      status: 'ready',
      provider: providerName,
      version: project.version + 1,
      segments: updatedSegments,
      stats: {
        characters_billed: (project.stats?.characters_billed || 0) + charactersBilled,
        tokens_used: (project.stats?.tokens_used || 0) + tokensUsed,
        segment_count: updatedSegments.length,
      },
      updated_at: new Date().toISOString(),
    };

    await ownerContext.run(userId, async () => {
      await dataRepository
        .from('translation_projects')
        .update({
          status: 'ready',
          provider: providerName,
          version: updatedProject.version,
          segments: updatedProject.segments,
          stats: updatedProject.stats,
          updated_at: updatedProject.updated_at,
        })
        .eq('id', projectId);
    });

    return updatedProject;
  }

  /**
   * Applies manual inline edit to a translated segment and saves to translation memory.
   */
  public static async updateSegmentText(
    projectId: string,
    segmentId: string,
    newText: string,
    userId: string
  ): Promise<TranslationProject> {
    const project = await this.getProject(projectId, userId);
    if (!project) throw new AppError('Translation project not found.', 404, 'NOT_FOUND');

    const cleanText = newText.trim();
    if (!cleanText) throw new AppError('Translated text cannot be empty.', 400, 'INVALID_INPUT');

    let matchedSource = '';
    const updatedSegments = project.segments.map((s) => {
      if (s.segment_id === segmentId) {
        matchedSource = s.source_text;
        return {
          ...s,
          translated_text: cleanText,
          is_manually_edited: true,
          reviewed: true,
        };
      }
      return s;
    });

    if (!matchedSource) throw new AppError('Segment not found in project.', 404, 'SEGMENT_NOT_FOUND');

    // Automatically record manual approved edit to translation memory!
    await GlossaryService.recordTranslationMemory(
      userId,
      matchedSource,
      cleanText,
      project.source_language,
      project.target_language
    );

    const updatedProject: TranslationProject = {
      ...project,
      version: project.version + 1,
      segments: updatedSegments,
      updated_at: new Date().toISOString(),
    };

    await ownerContext.run(userId, async () => {
      await dataRepository
        .from('translation_projects')
        .update({
          segments: updatedSegments,
          version: updatedProject.version,
          updated_at: updatedProject.updated_at,
        })
        .eq('id', projectId);
    });

    return updatedProject;
  }

  /**
   * Toggles or sets the reviewed status of a specific segment.
   */
  public static async setSegmentReviewed(
    projectId: string,
    segmentId: string,
    reviewed: boolean,
    userId: string
  ): Promise<TranslationProject> {
    const project = await this.getProject(projectId, userId);
    if (!project) throw new AppError('Translation project not found.', 404, 'NOT_FOUND');

    const updatedSegments = project.segments.map((s) => {
      if (s.segment_id === segmentId) {
        return { ...s, reviewed };
      }
      return s;
    });

    await ownerContext.run(userId, async () => {
      await dataRepository
        .from('translation_projects')
        .update({
          segments: updatedSegments,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    });

    return {
      ...project,
      segments: updatedSegments,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Approves all segments in a project.
   */
  public static async approveAllSegments(projectId: string, userId: string): Promise<TranslationProject> {
    const project = await this.getProject(projectId, userId);
    if (!project) throw new AppError('Translation project not found.', 404, 'NOT_FOUND');

    const updatedSegments = project.segments.map((s) => ({
      ...s,
      reviewed: true,
    }));

    await ownerContext.run(userId, async () => {
      await dataRepository
        .from('translation_projects')
        .update({
          status: 'reviewed',
          segments: updatedSegments,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    });

    return {
      ...project,
      status: 'reviewed',
      segments: updatedSegments,
      updated_at: new Date().toISOString(),
    };
  }
}

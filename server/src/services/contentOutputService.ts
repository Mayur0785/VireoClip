import { ownerContext } from '../db/repositories/dataRepository.js';
import { replaceContentOutputs } from '../db/repositories/contentOutputRepository.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import {
  OutputPlatform,
  ContentOutputRecord,
  YouTubeGeneratedContent,
  InstagramGeneratedContent,
  ShortsGeneratedContent,
  TikTokGeneratedContent,
  LinkedInGeneratedContent,
  TwitterGeneratedContent,
} from '../types/index.js';

export class ContentOutputService {
  /**
   * Retrieves all content outputs for an owner-scoped project.
   */
  public static async getOutputsForProject(projectId: string): Promise<ContentOutputRecord[]> {
    const { data, error } = await dataRepository
      .from('content_outputs')
      .select('*')
      .eq('project_id', projectId)
      .order('platform', { ascending: true })
      .order('position', { ascending: true });

    if (error) {
      logger.error(`[ContentOutputService] Error fetching outputs for project ${projectId}:`, error.message);
      throw new Error(`Failed to load content outputs: ${error.message}`);
    }

    return (data || []) as ContentOutputRecord[];
  }

  /**
   * Converts a structured YouTube output into individual content_output rows.
   */
  public static transformYouTubeToRows(
    projectId: string,
    data: YouTubeGeneratedContent
  ): Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> {
    const rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    // Titles
    if (Array.isArray(data.titles)) {
      data.titles.slice(0, 5).forEach((title, idx) => {
        if (title?.trim()) {
          rows.push({
            project_id: projectId,
            platform: 'youtube',
            content_type: 'title',
            content: title.trim(),
            position: idx,
          });
        }
      });
    }

    // Description
    if (data.description?.trim()) {
      rows.push({
        project_id: projectId,
        platform: 'youtube',
        content_type: 'description',
        content: data.description.trim(),
        position: 0,
      });
    }

    // Chapters
    if (Array.isArray(data.chapters) && data.chapters.length > 0) {
      const chaptersText = data.chapters
        .map((c) => `${c.timestamp} - ${c.title}`)
        .join('\n');
      rows.push({
        project_id: projectId,
        platform: 'youtube',
        content_type: 'chapters',
        content: chaptersText,
        position: 0,
      });
    }

    // Keywords
    if (Array.isArray(data.keywords) && data.keywords.length > 0) {
      rows.push({
        project_id: projectId,
        platform: 'youtube',
        content_type: 'keywords',
        content: data.keywords.join(', '),
        position: 0,
      });
    }

    return rows;
  }

  /**
   * Converts structured Instagram output into content_output rows.
   */
  public static transformInstagramToRows(
    projectId: string,
    data: InstagramGeneratedContent
  ): Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> {
    const rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    // Hooks
    if (Array.isArray(data.hooks)) {
      data.hooks.slice(0, 5).forEach((hook, idx) => {
        if (hook?.trim()) {
          rows.push({
            project_id: projectId,
            platform: 'instagram',
            content_type: 'hook',
            content: hook.trim(),
            position: idx,
          });
        }
      });
    }

    // Caption
    if (data.caption?.trim()) {
      rows.push({
        project_id: projectId,
        platform: 'instagram',
        content_type: 'caption',
        content: data.caption.trim(),
        position: 0,
      });
    }

    // Hashtags
    if (Array.isArray(data.hashtags) && data.hashtags.length > 0) {
      rows.push({
        project_id: projectId,
        platform: 'instagram',
        content_type: 'hashtags',
        content: data.hashtags.join(' '),
        position: 0,
      });
    }

    return rows;
  }

  /**
   * Converts structured Shorts/Reels output into content_output rows.
   */
  public static transformShortsToRows(
    projectId: string,
    data: ShortsGeneratedContent
  ): Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> {
    const rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    if (Array.isArray(data.moments)) {
      data.moments.forEach((moment, idx) => {
        const timeHeader =
          moment.start && moment.end && moment.start !== 'N/A'
            ? `[${moment.start} - ${moment.end}] `
            : '';
        const momentContent = `${timeHeader}${moment.hook}\n\n${moment.description}`;

        rows.push({
          project_id: projectId,
          platform: 'shorts',
          content_type: 'moment',
          content: momentContent.trim(),
          position: idx,
        });
      });
    }

    return rows;
  }

  /**
   * Converts TikTok hooks, caption, and clip idea into editable content rows.
   */
  public static transformTikTokToRows(
    projectId: string,
    data: TikTokGeneratedContent
  ): Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> {
    const rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    data.hooks.slice(0, 3).forEach((hook, idx) => {
      if (hook?.trim()) {
        rows.push({
          project_id: projectId,
          platform: 'tiktok',
          content_type: 'hook',
          content: hook.trim(),
          position: idx,
        });
      }
    });

    rows.push({
      project_id: projectId,
      platform: 'tiktok',
      content_type: 'caption',
      content: data.caption.trim(),
      position: 0,
    });

    const moment = data.moment;
    const timeHeader = moment.timestamps_available && moment.start && moment.end &&
      moment.start !== 'N/A' && moment.end !== 'N/A'
      ? `[${moment.start} - ${moment.end}] `
      : '';
    rows.push({
      project_id: projectId,
      platform: 'tiktok',
      content_type: 'moment',
      content: `${timeHeader}${moment.description.trim()}`,
      position: 0,
    });

    return rows;
  }

  /**
   * Converts structured LinkedIn output into content_output rows.
   */
  public static transformLinkedInToRows(
    projectId: string,
    data: LinkedInGeneratedContent
  ): Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> {
    const rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    if (data.post?.trim()) {
      rows.push({
        project_id: projectId,
        platform: 'linkedin',
        content_type: 'post',
        content: data.post.trim(),
        position: 0,
      });
    }

    return rows;
  }

  /**
   * Converts structured Twitter / X output into content_output rows.
   */
  public static transformTwitterToRows(
    projectId: string,
    data: TwitterGeneratedContent
  ): Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> {
    const rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>> = [];

    // Standalone post
    if (data.post?.trim()) {
      rows.push({
        project_id: projectId,
        platform: 'x',
        content_type: 'post',
        content: data.post.trim(),
        position: 0,
      });
    }

    // Thread
    if (Array.isArray(data.thread) && data.thread.length > 0) {
      data.thread.forEach((tweet, idx) => {
        if (tweet?.trim()) {
          rows.push({
            project_id: projectId,
            platform: 'x',
            content_type: 'thread',
            content: tweet.trim(),
            position: idx + 1,
          });
        }
      });
    }

    return rows;
  }

  /**
   * Saves or replaces generated rows for a specific platform or full project.
   * If platform is provided, replaces only outputs for that platform.
   */
  public static async saveOutputs(
    projectId: string,
    rows: Array<Omit<ContentOutputRecord, 'id' | 'created_at' | 'updated_at'>>,
    platform?: OutputPlatform
  ): Promise<ContentOutputRecord[]> {
    if (rows.length === 0) {
      return [];
    }

    const userId = ownerContext.getStore();
    if (!userId) throw new Error('Authenticated user context is required.');
    const saved = await replaceContentOutputs(userId, projectId, rows, platform);
    return saved as unknown as ContentOutputRecord[];
  }

  /**
   * Updates content of a single content_output record.
   */
  public static async updateOutputContent(
    outputId: string,
    projectId: string,
    newContent: string
  ): Promise<ContentOutputRecord> {
    const { data, error } = await dataRepository
      .from('content_outputs')
      .update({ content: newContent.trim() })
      .eq('id', outputId)
      .eq('project_id', projectId)
      .select('*')
      .single();

    if (error) {
      logger.error(`[ContentOutputService] Error updating output ${outputId}:`, error.message);
      throw new Error(`Failed to update output: ${error.message}`);
    }

    return data as ContentOutputRecord;
  }
}

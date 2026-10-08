import crypto from 'node:crypto';
import { dataRepository } from '../db/repositories/dataRepository.js';
import {
  AppError,
  isValidUUID,
  BrollPlanRecord,
  BrollStyle,
  BrollSuggestion,
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  ClipRecord,
} from '../types/index.js';
import { MediaAssetService } from './mediaAssetService.js';
import { BrollOpportunityService } from './brollOpportunityService.js';
import { ProEditorService } from './proEditorService.js';
import { logger } from '../utils/logger.js';

export class BrollPlanService {
  /**
   * Generates a new reviewable B-roll plan for a clip without immediately mutating the editor.
   */
  public static async createPlan(
    clipId: string,
    userId: string,
    options: { style?: BrollStyle } = {}
  ): Promise<BrollPlanRecord> {
    if (!isValidUUID(clipId)) {
      throw new AppError('Invalid clip ID.', 400, 'INVALID_UUID');
    }

    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
    }

    const clipRecord = clip as ClipRecord;
    const style: BrollStyle = options.style || 'BALANCED';

    // 1. Index project media to ensure real assets are available
    if (clipRecord.project_id) {
      await MediaAssetService.indexProjectMedia(clipRecord.project_id, userId);
    }

    // 2. Fetch or create editor project
    const editorProject = await ProEditorService.getOrCreateEditorProject(clipId, userId);

    // 3. Detect B-roll opportunities
    const opportunities = await BrollOpportunityService.detectOpportunities(clipId, userId, style);

    // 4. Discover and rank candidate suggestions
    const suggestions = await BrollOpportunityService.discoverSuggestionsForOpportunities(
      userId,
      clipRecord.project_id || null,
      opportunities
    );

    const now = new Date();
    const planRecord: BrollPlanRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      clip_id: clipId,
      editor_project_id: editorProject.id,
      status: 'ready',
      style,
      opportunities,
      suggestions,
      created_at: now,
      updated_at: now,
    };

    const { error: insertErr } = await dataRepository.from('broll_plans').insert(planRecord);
    if (insertErr) {
      logger.error('[BrollPlanService] Failed to persist B-roll plan', { error: insertErr.message });
      throw new AppError(`Failed to save B-roll plan: ${insertErr.message}`, 500, 'DATABASE_ERROR');
    }

    logger.info(`[BrollPlanService] Created B-roll plan ${planRecord.id} with ${suggestions.length} suggestions`);
    return planRecord;
  }

  /**
   * Retrieves a B-roll plan by ID verifying ownership.
   */
  public static async getPlan(planId: string, userId: string): Promise<BrollPlanRecord | null> {
    if (!isValidUUID(planId)) return null;

    const { data, error } = await dataRepository
      .from('broll_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data as BrollPlanRecord;
  }

  /**
   * Retrieves the latest B-roll plan for a clip.
   */
  public static async getLatestPlanForClip(clipId: string, userId: string): Promise<BrollPlanRecord | null> {
    if (!isValidUUID(clipId)) return null;

    const { data, error } = await dataRepository
      .from('broll_plans')
      .select('*')
      .eq('clip_id', clipId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error || !data) return null;
    return data as BrollPlanRecord;
  }

  /**
   * Applies approved B-roll suggestions into the Pro Editor timeline.
   * Inserts items onto a VIDEO B-roll layer track above base video.
   * Enforces non-destructive trims, muted audio default, and idempotency.
   */
  public static async applyPlan(
    planId: string,
    userId: string,
    selectedSuggestionIds?: string[]
  ): Promise<{ editorProject: EditorProject; appliedCount: number }> {
    const plan = await this.getPlan(planId, userId);
    if (!plan) {
      throw new AppError('B-roll plan not found or access denied.', 404, 'PLAN_NOT_FOUND');
    }

    const editorProject = await ProEditorService.getOrCreateEditorProject(plan.clip_id, userId);

    // Filter suggestions to apply
    const suggestionsToApply = selectedSuggestionIds && selectedSuggestionIds.length > 0
      ? plan.suggestions.filter((s) => selectedSuggestionIds.includes(s.id) && s.selected_asset)
      : plan.suggestions.filter((s) => s.status === 'suggested' && s.selected_asset);

    if (suggestionsToApply.length === 0) {
      return { editorProject, appliedCount: 0 };
    }

    // Locate or create B-roll track
    let brollTrack = editorProject.tracks.find(
      (t) => t.type === 'VIDEO' && t.name.toLowerCase().includes('b-roll')
    );

    if (!brollTrack) {
      // Check for BROLL_PLACEHOLDER track to promote
      const placeholderTrack = editorProject.tracks.find((t) => t.type === 'BROLL_PLACEHOLDER');
      if (placeholderTrack) {
        placeholderTrack.type = 'VIDEO';
        placeholderTrack.name = 'B-Roll Layer';
        brollTrack = placeholderTrack;
      } else {
        brollTrack = {
          id: crypto.randomUUID(),
          type: 'VIDEO',
          name: 'B-Roll Layer',
          locked: false,
          muted: false,
          hidden: false,
          height: 64,
          items: [],
        };

        // Insert B-roll track above main video (index 1)
        const mainVideoIdx = editorProject.tracks.findIndex((t) => t.type === 'VIDEO');
        if (mainVideoIdx !== -1) {
          editorProject.tracks.splice(mainVideoIdx + 1, 0, brollTrack);
        } else {
          editorProject.tracks.unshift(brollTrack);
        }
      }
    }

    let appliedCount = 0;

    for (const sug of suggestionsToApply) {
      const asset = sug.selected_asset!;
      const slotDuration = sug.opportunity
        ? sug.opportunity.end_time - sug.opportunity.start_time
        : sug.suggested_timeline_end - sug.suggested_timeline_start;
      const assetDuration = asset.duration && asset.duration > 0 ? asset.duration : slotDuration;

      // Non-destructive trim: clamp to available asset duration without stretching
      const finalDuration = Math.min(slotDuration, assetDuration);
      const timelineStart = sug.opportunity ? sug.opportunity.start_time : sug.suggested_timeline_start;
      const timelineEnd = Number((timelineStart + finalDuration).toFixed(3));

      // Idempotency: avoid adding duplicate item at exact same start time on this track
      const existingItemAtTime = brollTrack.items.find(
        (i) => Math.abs(i.timeline_start - timelineStart) < 0.1
      );
      if (existingItemAtTime) {
        continue;
      }

      const brollItem: EditorTrackItem = {
        id: crypto.randomUUID(),
        track_id: brollTrack.id,
        type: asset.media_type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
        source_asset_id: asset.id,
        source_path: asset.source_url || asset.preview_url,
        timeline_start: timelineStart,
        timeline_end: timelineEnd,
        source_start: 0,
        source_end: Number(finalDuration.toFixed(3)),
        transform: {
          position_x: 0,
          position_y: 0,
          scale: 1.0,
          rotation: 0,
          opacity: 1.0,
        },
        crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
        speed: { speed: 1.0, pitch_preserved: true },
        audio: {
          volume: 0, // Muted by default!
          fade_in: 0.1,
          fade_out: 0.1,
          normalized: false,
          target_lufs: -16,
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true, // Default stock B-roll audio behavior: MUTED
        hidden: false,
        z_index: 5, // Above base video (0), below text (10) and captions (20)
      };

      brollTrack.items.push(brollItem);
      sug.status = 'applied';
      sug.applied_item_id = brollItem.id;
      appliedCount++;
    }

    // Sort items on B-roll track
    brollTrack.items.sort((a, b) => a.timeline_start - b.timeline_start);

    // Save updated editor project
    const updatedProject = await ProEditorService.updateEditorProject(
      editorProject.id,
      userId,
      { tracks: editorProject.tracks }
    );

    // Mark plan as applied
    await dataRepository
      .from('broll_plans')
      .update({
        status: 'applied',
        suggestions: plan.suggestions,
        updated_at: new Date(),
      })
      .eq('id', planId)
      .eq('user_id', userId);

    logger.info(`[BrollPlanService] Successfully applied ${appliedCount} B-roll items into EditorProject ${editorProject.id}`);
    return { editorProject: updatedProject, appliedCount };
  }

  /**
   * Directly inserts a single chosen media asset into an editor project.
   */
  public static async insertDirectAsset(
    editorProjectId: string,
    userId: string,
    assetId: string,
    targetStartTime: number,
    targetDuration: number = 3.0
  ): Promise<EditorProject> {
    const editorProject = await ProEditorService.getEditorProject(editorProjectId, userId);
    const asset = await MediaAssetService.getAsset(assetId, userId);

    if (!asset) {
      throw new AppError('Media asset not found or access denied.', 404, 'ASSET_NOT_FOUND');
    }

    let brollTrack = editorProject.tracks.find(
      (t) => t.type === 'VIDEO' && t.name.toLowerCase().includes('b-roll')
    );

    if (!brollTrack) {
      brollTrack = {
        id: crypto.randomUUID(),
        type: 'VIDEO',
        name: 'B-Roll Layer',
        locked: false,
        muted: false,
        hidden: false,
        height: 64,
        items: [],
      };
      const mainVideoIdx = editorProject.tracks.findIndex((t) => t.type === 'VIDEO');
      if (mainVideoIdx !== -1) {
        editorProject.tracks.splice(mainVideoIdx + 1, 0, brollTrack);
      } else {
        editorProject.tracks.unshift(brollTrack);
      }
    }

    const assetDuration = asset.duration || targetDuration;
    const finalDuration = Math.min(targetDuration, assetDuration);

    const brollItem: EditorTrackItem = {
      id: crypto.randomUUID(),
      track_id: brollTrack.id,
      type: asset.media_type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
      source_asset_id: asset.id,
      source_path: asset.storage_path || asset.external_preview_url,
      timeline_start: Number(targetStartTime.toFixed(3)),
      timeline_end: Number((targetStartTime + finalDuration).toFixed(3)),
      source_start: 0,
      source_end: Number(finalDuration.toFixed(3)),
      transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
      crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
      speed: { speed: 1.0, pitch_preserved: true },
      effects: [],
      keyframes: [],
      locked: false,
      muted: true,
      hidden: false,
      z_index: 5,
    };

    brollTrack.items.push(brollItem);
    brollTrack.items.sort((a, b) => a.timeline_start - b.timeline_start);

    return ProEditorService.updateEditorProject(editorProjectId, userId, {
      tracks: editorProject.tracks,
    });
  }
}

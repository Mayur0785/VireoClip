import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { ProEditorService } from '../proEditorService.js';
import { BrandBrainService } from './brandBrainService.js';
import { BrandContextService } from './brandContextService.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  SafeEditorFont,
  SAFE_EDITOR_FONTS,
} from '../../types/index.js';

export interface ApplyBrandOptions {
  brandBrainId?: string;
  applyColors?: boolean;
  applyFonts?: boolean;
  applyCaptions?: boolean;
  applyLogo?: boolean;
  applyAudio?: boolean;
}

export interface ApplyBrandResult {
  updatedProject: EditorProject;
  previousProjectSnapshot: EditorProject;
  changesApplied: string[];
}

export class BrandEditorIntegration {
  /**
   * Applies the user's Brand Brain identity to an active EditorProject.
   * Operations are non-destructive, reviewable, and return a previous state snapshot
   * for immediate Undo/Redo support.
   */
  public static async applyBrandToProject(
    userId: string,
    editorProjectId: string,
    options: ApplyBrandOptions = {}
  ): Promise<ApplyBrandResult> {
    const {
      brandBrainId,
      applyColors = true,
      applyFonts = true,
      applyCaptions = true,
      applyLogo = true,
      applyAudio = true,
    } = options;

    return await ownerContext.run(userId, async () => {
      const currentProject = await ProEditorService.getEditorProject(editorProjectId, userId);
      const previousSnapshot = JSON.parse(JSON.stringify(currentProject)) as EditorProject;

      const profile = await BrandBrainService.getProfile(userId, brandBrainId);
      const changesApplied: string[] = [];

      // Deep clone tracks for safe modification
      const updatedTracks: EditorTrack[] = JSON.parse(JSON.stringify(currentProject.tracks));

      const primaryColor = profile.visual.primary_colors[0] || '#3B82F6';
      const accentColor = profile.visual.accent_colors[0] || '#10B981';
      const brandFont = profile.visual.fonts[0] || 'Inter';
      const safeFont = (SAFE_EDITOR_FONTS as readonly string[]).includes(brandFont)
        ? (brandFont as SafeEditorFont)
        : 'Inter';

      // 1. Apply Brand to Captions and Text tracks
      for (const track of updatedTracks) {
        for (const item of track.items) {
          // Caption item styling
          if (item.type === 'CAPTION' && item.caption && applyCaptions) {
            if (applyColors) {
              item.caption.primary_color = '#FFFFFF';
              item.caption.highlight_color = accentColor;
            }
            if (profile.captions.default_style) {
              item.caption.style = profile.captions.default_style as any;
            }
            changesApplied.push('Applied brand highlight color and caption preset');
          }

          // Text overlay styling
          if (item.type === 'TEXT' && item.text) {
            if (applyFonts) {
              item.text.font_family = safeFont;
              changesApplied.push(`Applied safe brand font (${safeFont}) to text layer`);
            }
            if (applyColors && profile.visual.text_color) {
              item.text.color = profile.visual.text_color;
            }
          }

          // Audio targets
          if (applyAudio && item.audio && profile.audio) {
            item.audio.target_lufs = profile.audio.loudness_target_lufs;
            changesApplied.push(`Applied target LUFS (${profile.audio.loudness_target_lufs}) to audio track`);
          }
        }
      }

      // 2. Apply Brand Logo / Watermark if enabled & asset exists
      if (applyLogo && profile.visual.watermark_asset_id) {
        const watermarkAssetId = profile.visual.watermark_asset_id;
        const config = profile.visual.watermark_config || {
          position: 'top_right',
          opacity: 0.85,
          scale: 0.15,
          padding: 24,
        };

        // Determine offset from center in pixels
        let posX = 380;
        let posY = -700;
        if (config.position === 'top_left') {
          posX = -380;
          posY = -700;
        } else if (config.position === 'bottom_left') {
          posX = -380;
          posY = 700;
        } else if (config.position === 'bottom_right') {
          posX = 380;
          posY = 700;
        }

        // Look for existing watermark overlay track
        let overlayTrack = updatedTracks.find((t) => t.name === 'Brand Overlay' || t.type === 'OVERLAY');
        if (!overlayTrack) {
          overlayTrack = {
            id: crypto.randomUUID(),
            type: 'OVERLAY',
            name: 'Brand Overlay',
            locked: false,
            muted: false,
            hidden: false,
            items: [],
          };
          updatedTracks.push(overlayTrack);
        }

        // Check if watermark item already exists
        const existingWatermarkIndex = overlayTrack.items.findIndex(
          (i) => i.source_asset_id === watermarkAssetId || i.id.startsWith('watermark-')
        );

        const projectDuration = currentProject.canvas?.duration || 60;

        const watermarkItem: EditorTrackItem = {
          id: existingWatermarkIndex >= 0 ? overlayTrack.items[existingWatermarkIndex].id : `watermark-${crypto.randomUUID()}`,
          track_id: overlayTrack.id,
          type: 'OVERLAY',
          source_asset_id: watermarkAssetId,
          timeline_start: 0,
          timeline_end: projectDuration,
          source_start: 0,
          source_end: projectDuration,
          transform: {
            position_x: posX,
            position_y: posY,
            scale: config.scale,
            rotation: 0,
            opacity: config.opacity,
          },
          speed: { speed: 1.0, pitch_preserved: true },
          effects: [],
          keyframes: [],
          locked: false,
          muted: false,
          hidden: false,
          z_index: 99,
        };

        if (existingWatermarkIndex >= 0) {
          overlayTrack.items[existingWatermarkIndex] = watermarkItem;
        } else {
          overlayTrack.items.push(watermarkItem);
        }

        changesApplied.push(`Applied brand watermark (${config.position}, opacity ${config.opacity})`);
      }

      // Save updated project
      const updatedProject = await ProEditorService.updateEditorProject(editorProjectId, userId, {
        tracks: updatedTracks,
        version: currentProject.version + 1,
      });

      return {
        updatedProject,
        previousProjectSnapshot: previousSnapshot,
        changesApplied,
      };
    });
  }

  /**
   * Reverts an "Apply Brand" operation using a previously captured project snapshot.
   */
  public static async revertApplyBrand(
    userId: string,
    editorProjectId: string,
    snapshot: EditorProject
  ): Promise<EditorProject> {
    return await ownerContext.run(userId, async () => {
      return await ProEditorService.updateEditorProject(editorProjectId, userId, {
        tracks: snapshot.tracks,
        canvas: snapshot.canvas,
        settings: snapshot.settings,
        version: snapshot.version + 1,
      });
    });
  }
}

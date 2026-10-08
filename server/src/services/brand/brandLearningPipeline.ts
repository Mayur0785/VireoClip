import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { BrandBrainService } from './brandBrainService.js';
import { BrandEvidenceService } from './brandEvidenceService.js';
import { logger } from '../../utils/logger.js';
import {
  EditorProject,
  ProducerEditPlan,
  BrandBrainProfile,
} from '../../types/index.js';

export interface LearningResult {
  learned: boolean;
  reason?: string;
  evidenceRecordedCount: number;
}

export class BrandLearningPipeline {
  /**
   * Learns only from approved, finalized EditorProject exports.
   * STRICT: Ignores discarded drafts, abandoned edits, or failed renders.
   */
  public static async learnFromApprovedEditorProject(
    userId: string,
    editorProjectId: string,
    brandBrainId?: string
  ): Promise<LearningResult> {
    if (!userId || !editorProjectId) {
      return { learned: false, reason: 'INVALID_PARAMETERS', evidenceRecordedCount: 0 };
    }

    return await ownerContext.run(userId, async () => {
      // 1. Fetch project
      const { data: projectDoc, error } = await dataRepository
        .from('editor_projects')
        .select()
        .eq('id', editorProjectId)
        .eq('user_id', userId)
        .single();

      if (error || !projectDoc) {
        return { learned: false, reason: 'PROJECT_NOT_FOUND', evidenceRecordedCount: 0 };
      }

      const project = projectDoc as EditorProject;

      // STRICT: Must not be a discarded or failed state
      if (project.status === 'failed') {
        logger.info('Brand Brain skipped learning: render was failed or abandoned', { editorProjectId });
        return { learned: false, reason: 'DISCARDED_OR_FAILED_RENDER', evidenceRecordedCount: 0 };
      }

      const profile = await BrandBrainService.getProfile(userId, brandBrainId);
      let evidenceCount = 0;

      // Extract caption DNA from caption tracks
      for (const track of project.tracks || []) {
        for (const item of track.items || []) {
          if (item.type === 'CAPTION' && item.caption) {
            // Learn caption style & colors
            await BrandEvidenceService.recordEvidence({
              userId,
              brandBrainId: profile.id,
              dimension: 'captions',
              sourceType: 'APPROVED_EDIT',
              sourceId: `${editorProjectId}:caption:${item.id}`,
              value: {
                style: item.caption.style,
                highlight_color: item.caption.highlight_color,
                primary_color: item.caption.primary_color,
                max_words_per_line: item.caption.cues?.[0]?.words?.length || 4,
              },
            });
            evidenceCount++;

            // If captions.default_style is not locked, check if we should update learned state
            if (!profile.locks['captions.default_style'] && item.caption.style) {
              const dominant = await BrandEvidenceService.getDominantLearnedPreference<{ style: string }>(
                userId,
                profile.id,
                'captions'
              );
              if (dominant && dominant.sampleCount >= 3 && dominant.value?.style) {
                await BrandBrainService.updateProfile(
                  userId,
                  {
                    captions: { default_style: dominant.value.style },
                    rule_states: { 'captions.default_style': 'LEARNED' },
                  },
                  'LEARNED_UPDATE',
                  profile.id
                );
              }
            }
          }

          // Extract text DNA (fonts)
          if (item.type === 'TEXT' && item.text?.font_family) {
            await BrandEvidenceService.recordEvidence({
              userId,
              brandBrainId: profile.id,
              dimension: 'visual',
              sourceType: 'APPROVED_EDIT',
              sourceId: `${editorProjectId}:text:${item.id}`,
              value: {
                font: item.text.font_family,
                color: item.text.color,
              },
            });
            evidenceCount++;
          }

          // Extract audio target LUFS
          if (item.audio?.target_lufs) {
            await BrandEvidenceService.recordEvidence({
              userId,
              brandBrainId: profile.id,
              dimension: 'audio',
              sourceType: 'APPROVED_EDIT',
              sourceId: `${editorProjectId}:audio:${item.id}`,
              value: {
                target_lufs: item.audio.target_lufs,
              },
            });
            evidenceCount++;
          }
        }
      }

      // Extract editing pacing DNA (duration & cut count)
      const duration = project.canvas?.duration || 0;
      if (duration > 0) {
        const videoItemsCount = (project.tracks || [])
          .flatMap((t) => t.items)
          .filter((i) => i.type === 'VIDEO').length;

        const avgCutLength = duration / Math.max(1, videoItemsCount);
        const inferredPacing = avgCutLength < 3 ? 'fast' : avgCutLength < 6 ? 'balanced' : 'slow';

        await BrandEvidenceService.recordEvidence({
          userId,
          brandBrainId: profile.id,
          dimension: 'editing',
          sourceType: 'APPROVED_EDIT',
          sourceId: `${editorProjectId}:pacing`,
          value: {
            pacing_style: inferredPacing,
            duration,
            cut_count: videoItemsCount,
          },
        });
        evidenceCount++;

        // If editing pacing is not locked, check if we should update learned state
        if (!profile.locks['editing.pacing_style']) {
          const dominantPacing = await BrandEvidenceService.getDominantLearnedPreference<{ pacing_style: string }>(
            userId,
            profile.id,
            'editing'
          );
          if (dominantPacing && dominantPacing.sampleCount >= 4 && dominantPacing.value?.pacing_style) {
            await BrandBrainService.updateProfile(
              userId,
              {
                editing: { pacing_style: dominantPacing.value.pacing_style as any },
                rule_states: { 'editing.pacing_style': 'LEARNED' },
              },
              'LEARNED_UPDATE',
              profile.id
            );
          }
        }
      }

      return {
        learned: true,
        evidenceRecordedCount: evidenceCount,
      };
    });
  }

  /**
   * Learns from a user-approved Producer Edit Plan (status = 'applied').
   * STRICT: Never learns from draft or rejected producer suggestions.
   */
  public static async learnFromApprovedProducerPlan(
    userId: string,
    producerPlanId: string,
    brandBrainId?: string
  ): Promise<LearningResult> {
    return await ownerContext.run(userId, async () => {
      const { data: planDoc, error } = await dataRepository
        .from('producer_plans')
        .select()
        .eq('id', producerPlanId)
        .eq('user_id', userId)
        .single();

      if (error || !planDoc) {
        return { learned: false, reason: 'PLAN_NOT_FOUND', evidenceRecordedCount: 0 };
      }

      const plan = planDoc as ProducerEditPlan;

      // Must be explicitly approved/applied by user
      if (plan.status !== 'applied') {
        return { learned: false, reason: 'PLAN_NOT_APPROVED', evidenceRecordedCount: 0 };
      }

      const profile = await BrandBrainService.getProfile(userId, brandBrainId);
      let count = 0;

      // Hook learning from operations
      const hookOp = (plan.operations || []).find((o) => o.type === 'HOOK_TEXT');
      if (hookOp?.parameters?.text) {
        await BrandEvidenceService.recordEvidence({
          userId,
          brandBrainId: profile.id,
          dimension: 'hooks',
          sourceType: 'APPROVED_EDIT',
          sourceId: `${producerPlanId}:hook`,
          value: {
            hook: hookOp.parameters.text,
          },
        });
        count++;
      }

      // CTA learning from operations
      const textOp = (plan.operations || []).find(
        (o) => o.type === 'TEXT_OVERLAY' && o.parameters?.position_overlay === 'bottom'
      );
      if (textOp?.parameters?.text) {
        await BrandEvidenceService.recordEvidence({
          userId,
          brandBrainId: profile.id,
          dimension: 'cta',
          sourceType: 'APPROVED_EDIT',
          sourceId: `${producerPlanId}:cta`,
          value: {
            cta: textOp.parameters.text,
          },
        });
        count++;
      }

      return {
        learned: true,
        evidenceRecordedCount: count,
      };
    });
  }

  /**
   * Learns from successfully published content metadata.
   */
  public static async learnFromPublishedContent(
    userId: string,
    publishJobId: string,
    platform: string,
    metadata: { hashtags?: string[]; cta?: string },
    brandBrainId?: string
  ): Promise<LearningResult> {
    return await ownerContext.run(userId, async () => {
      const profile = await BrandBrainService.getProfile(userId, brandBrainId);
      let count = 0;

      if (metadata.hashtags && metadata.hashtags.length > 0) {
        await BrandEvidenceService.recordEvidence({
          userId,
          brandBrainId: profile.id,
          dimension: 'publishing',
          sourceType: 'PUBLISHED_CONTENT',
          sourceId: `${publishJobId}:hashtags`,
          value: {
            platform,
            hashtag_count: metadata.hashtags.length,
          },
        });
        count++;
      }

      return {
        learned: true,
        evidenceRecordedCount: count,
      };
    });
  }
}

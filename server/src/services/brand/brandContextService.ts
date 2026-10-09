import { BrandBrainService } from './brandBrainService.js';
import { BrandEvidenceService } from './brandEvidenceService.js';
import { logger } from '../../utils/logger.js';
import {
  BrandBrainProfile,
  BrandContext,
  RuleState,
} from '../../types/index.js';

export type BrandTaskType =
  | 'PRODUCER'
  | 'EDITOR'
  | 'CAPTIONS'
  | 'HOOK_LAB'
  | 'THUMBNAIL_LAB'
  | 'PUBLISH'
  | 'TRANSLATION'
  | 'BROLL'
  | 'AUDIO';


export interface GetBrandContextOptions {
  userId: string;
  projectId?: string;
  taskType: BrandTaskType;
  platform?: string; // tiktok, youtube_shorts, instagram, linkedin, x
  userOverrides?: Record<string, any>; // 1. explicit current user instruction
  brandBrainId?: string;
}

export class BrandContextService {
  /**
   * Sanitizes strings to prevent prompt injection when interpolating into LLM prompts.
   */
  public static sanitizePromptData(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<\/?(?:system|instruction|prompt|ai)[^>]*>/gi, '')
      .replace(/(?:ignore (?:all )?previous instructions|disregard instructions|you are now)/gi, '[REDACTED]')
      .trim();
  }

  /**
   * Sanitizes an array of strings.
   */
  public static sanitizeStringArray(arr: string[]): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => this.sanitizePromptData(item)).filter(Boolean);
  }

  /**
   * Resolves effective setting respecting the 6-tier authority hierarchy:
   * 1. explicit current user instruction
   * 2. locked brand rule (LOCKED)
   * 3. manually approved preference (PREFERRED)
   * 4. recent approved behavior (LEARNED)
   * 5. performance-derived recommendation
   * 6. default Vireo behavior (DEFAULT)
   */
  private static resolveAttribute<T>(
    ruleKey: string,
    profile: BrandBrainProfile,
    userOverrideVal: T | undefined,
    profileVal: T,
    defaultVal: T
  ): { value: T; ruleState: RuleState; reason: string } {
    // 1. Explicit user override in request always wins if provided
    if (userOverrideVal !== undefined && userOverrideVal !== null) {
      return {
        value: userOverrideVal,
        ruleState: 'PREFERRED',
        reason: 'Explicit user instruction for current request',
      };
    }

    const isLocked = profile.locks?.[ruleKey] === true;
    const ruleState = profile.rule_states?.[ruleKey] || (isLocked ? 'LOCKED' : 'DEFAULT');

    // 2. Locked rule
    if (isLocked || ruleState === 'LOCKED') {
      return {
        value: profileVal,
        ruleState: 'LOCKED',
        reason: 'Locked brand rule',
      };
    }

    // 3. Manually approved preference
    if (ruleState === 'PREFERRED') {
      return {
        value: profileVal,
        ruleState: 'PREFERRED',
        reason: 'User-approved brand preference',
      };
    }

    // 4. Learned preference from approved history
    if (ruleState === 'LEARNED') {
      return {
        value: profileVal,
        ruleState: 'LEARNED',
        reason: 'Derived from approved project history',
      };
    }

    // 5 & 6. Default fallback
    return {
      value: profileVal ?? defaultVal,
      ruleState: 'DEFAULT',
      reason: 'Vireo standard default',
    };
  }

  /**
   * Returns a task-specific minimized Brand Context slice.
   * Ensures cost reduction, low noise, and strict prompt-injection defense.
   */
  public static async getBrandContext(options: GetBrandContextOptions): Promise<BrandContext> {
    const { userId, projectId, taskType, platform, userOverrides = {}, brandBrainId } = options;

    const profile = await BrandBrainService.getProfile(userId, brandBrainId);
    const rulesApplied: string[] = [];

    const baseContext: BrandContext = {
      brand_name: this.sanitizePromptData(profile.identity.brand_name),
      task_type: taskType,
      rules_applied: rulesApplied,
    };

    // Platform overrides resolution if platform provided
    const platformConfig = platform && profile.publishing?.platform_preferences?.[platform.toLowerCase()];

    switch (taskType) {
      case 'PRODUCER': {
        const pacingRes = this.resolveAttribute(
          'editing.pacing_style',
          profile,
          userOverrides['pacing_style'],
          profile.editing.pacing_style,
          'fast'
        );
        rulesApplied.push(`pacing: ${pacingRes.value} (${pacingRes.reason})`);

        baseContext.editing = {
          pacing_style: pacingRes.value,
          broll_density: profile.editing.broll_density,
          transition_style: profile.editing.transition_style,
          punch_in_frequency: profile.editing.punch_in_frequency,
          silence_style: profile.editing.silence_style,
          intro_style: profile.editing.intro_style,
          outro_style: profile.editing.outro_style,
        };

        baseContext.hooks = {
          preferred_hook_types: profile.hooks.preferred_hook_types,
          preferred_hook_length: profile.hooks.preferred_hook_length,
          banned_patterns: this.sanitizeStringArray(profile.hooks.banned_patterns),
          example_hooks: this.sanitizeStringArray(profile.hooks.example_hooks),
        };

        baseContext.cta = {
          preferred_cta_types: profile.cta.preferred_cta_types,
          approved_phrases: this.sanitizeStringArray(profile.cta.approved_phrases),
          blocked_phrases: this.sanitizeStringArray(profile.cta.blocked_phrases),
        };

        baseContext.audio = {
          cleanup_preset: profile.audio.cleanup_preset,
          loudness_target_lufs: profile.audio.loudness_target_lufs,
          music_level: profile.audio.music_level,
          ducking_style: profile.audio.ducking_style,
        };

        baseContext.captions = {
          default_style: profile.captions.default_style,
          highlight_style: profile.captions.highlight_style,
          font: profile.captions.font,
          max_words_per_line: profile.captions.max_words_per_line,
        };
        break;
      }

      case 'EDITOR': {
        baseContext.visual = {
          primary_colors: profile.visual.primary_colors,
          secondary_colors: profile.visual.secondary_colors,
          accent_colors: profile.visual.accent_colors,
          background_color: profile.visual.background_color,
          text_color: profile.visual.text_color,
          fonts: profile.visual.fonts,
          logo_asset_ids: profile.visual.logo_asset_ids,
          watermark_asset_id: profile.visual.watermark_asset_id,
          watermark_config: profile.visual.watermark_config,
        };

        baseContext.captions = profile.captions;
        baseContext.audio = profile.audio;
        rulesApplied.push('Applied visual palette, fonts, captions, and audio targets');
        break;
      }

      case 'CAPTIONS': {
        const fontRes = this.resolveAttribute(
          'captions.font',
          profile,
          userOverrides['font'],
          profile.captions.font,
          'Inter'
        );
        rulesApplied.push(`font: ${fontRes.value} (${fontRes.reason})`);

        baseContext.captions = {
          default_style: profile.captions.default_style,
          highlight_style: profile.captions.highlight_style,
          font: fontRes.value,
          case_style: profile.captions.case_style,
          max_words_per_line: profile.captions.max_words_per_line,
          stroke_color: profile.captions.stroke_color,
          stroke_width: profile.captions.stroke_width,
          background_color: profile.captions.background_color,
          emphasis_rules: profile.captions.emphasis_rules,
          position_y: profile.captions.position_y,
        };

        baseContext.visual = {
          primary_colors: profile.visual.primary_colors,
          accent_colors: profile.visual.accent_colors,
        };
        break;
      }

      case 'HOOK_LAB': {
        baseContext.voice = {
          tones: profile.voice.tones,
          writing_styles: profile.voice.writing_styles,
          preferred_phrasing: this.sanitizeStringArray(profile.voice.preferred_phrasing),
          avoid_phrasing: this.sanitizeStringArray(profile.voice.avoid_phrasing),
        };

        baseContext.hooks = {
          preferred_hook_types: profile.hooks.preferred_hook_types,
          preferred_hook_length: profile.hooks.preferred_hook_length,
          banned_patterns: this.sanitizeStringArray(profile.hooks.banned_patterns),
          example_hooks: this.sanitizeStringArray(profile.hooks.example_hooks),
        };
        rulesApplied.push('Hook DNA and Creator Voice active');
        break;
      }

      case 'PUBLISH': {
        let activeTone = profile.voice.tones[0] || 'engaging';
        let activeCta = profile.cta.approved_phrases[0] || '';

        // Apply platform override layer if available
        if (platformConfig) {
          if (platformConfig.tone) {
            activeTone = platformConfig.tone;
            rulesApplied.push(`Platform override: ${platform} tone -> ${activeTone}`);
          }
          if (platformConfig.cta_type) {
            rulesApplied.push(`Platform override: ${platform} CTA -> ${platformConfig.cta_type}`);
          }
        }

        baseContext.publishing = {
          platform_preferences: profile.publishing.platform_preferences,
          metadata_style: profile.publishing.metadata_style,
          hashtag_style: profile.publishing.hashtag_style,
        };

        baseContext.voice = {
          tones: [activeTone],
          avoid_phrasing: this.sanitizeStringArray(profile.voice.avoid_phrasing),
        };

        baseContext.cta = {
          approved_phrases: activeCta ? [activeCta] : [],
          blocked_phrases: this.sanitizeStringArray(profile.cta.blocked_phrases),
        };
        break;
      }

      case 'TRANSLATION': {
        baseContext.translation = {
          glossary_id: profile.translation.glossary_id,
          tone_preservation_mode: profile.translation.tone_preservation_mode,
        };
        baseContext.voice = {
          avoid_phrasing: this.sanitizeStringArray(profile.voice.avoid_phrasing),
          tones: profile.voice.tones,
        };
        rulesApplied.push('Glossary and protected brand tone preservation active');
        break;
      }

      case 'BROLL': {
        baseContext.editing = {
          broll_density: profile.editing.broll_density,
        };
        baseContext.identity = {
          industry: profile.identity.industry,
        };
        baseContext.visual = {
          primary_colors: profile.visual.primary_colors,
          logo_asset_ids: profile.visual.logo_asset_ids,
        };
        rulesApplied.push('B-roll density and industry context applied');
        break;
      }

      case 'AUDIO': {
        baseContext.audio = profile.audio;
        rulesApplied.push('Target LUFS and cleanup presets applied');
        break;
      }
    }

    return baseContext;
  }
}

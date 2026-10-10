import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  BrandBrainProfile,
  BrandBrainVersion,
  BrandDimension,
  RuleState,
  ConfidenceLevel,
  BRAND_RESOURCE_LIMITS,
  SAFE_EDITOR_FONTS,
  SafeEditorFont,
  PlatformContentGuidance,
  BrandContentPillar,
  BrandApprovedTerm,
} from '../../types/index.js';

export interface UpdateBrandBrainDTO {
  identity?: Partial<BrandBrainProfile['identity']>;
  voice?: Partial<BrandBrainProfile['voice']>;
  visual?: Partial<BrandBrainProfile['visual']>;
  captions?: Partial<BrandBrainProfile['captions']>;
  hooks?: Partial<BrandBrainHooksDTO>;
  cta?: Partial<BrandBrainProfile['cta']>;
  editing?: Partial<BrandBrainProfile['editing']>;
  audio?: Partial<BrandBrainProfile['audio']>;
  publishing?: Partial<BrandBrainProfile['publishing']>;
  translation?: Partial<BrandBrainProfile['translation']>;
  platform_guidance?: Record<string, PlatformContentGuidance>;
  evidence_references?: string[];
  locks?: Record<string, boolean>;
  rule_states?: Record<string, RuleState>;
}

export type BrandBrainHooksDTO = BrandBrainProfile['hooks'];

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const RGB_COLOR_REGEX = /^rgba?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;

export class BrandBrainService {
  /**
   * Validates color strings to prevent arbitrary CSS injection.
   */
  public static validateColor(color: string): boolean {
    if (!color || typeof color !== 'string') return false;
    const trimmed = color.trim();
    return HEX_COLOR_REGEX.test(trimmed) || RGB_COLOR_REGEX.test(trimmed);
  }

  /**
   * Validates a list of colors. Throws AppError if invalid or exceeds limit.
   */
  public static validateColors(colors: string[]): string[] {
    if (!Array.isArray(colors)) return [];
    if (colors.length > BRAND_RESOURCE_LIMITS.MAX_BRAND_COLORS) {
      throw new AppError(
        `Exceeded maximum brand colors limit (${BRAND_RESOURCE_LIMITS.MAX_BRAND_COLORS}).`,
        400,
        'MAX_COLORS_EXCEEDED'
      );
    }
    for (const c of colors) {
      if (!this.validateColor(c)) {
        throw new AppError(
          `Invalid color format "${c}". Colors must be valid Hex (#RGB, #RRGGBB) or RGB/RGBA values.`,
          400,
          'INVALID_COLOR_FORMAT'
        );
      }
    }
    return colors;
  }

  /**
   * Checks font against allowlisted editor fonts.
   * If unsupported, reports NOT_AVAILABLE.
   */
  public static validateFont(font: string): { font: string; available: boolean } {
    if (!font || typeof font !== 'string') {
      return { font: 'Inter', available: true };
    }
    const isSafe = (SAFE_EDITOR_FONTS as readonly string[]).includes(font.trim());
    return {
      font: font.trim(),
      available: isSafe,
    };
  }

  /**
   * Creates default brand profile template
   */
  public static createDefaultProfile(userId: string, brandName = 'My Brand'): BrandBrainProfile {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      version: 1,
      status: 'active',
      identity: {
        brand_name: brandName,
        tagline: '',
        description: '',
        industry: 'General',
        website_url: '',
        target_audience: '',
        audience_needs: [],
        audience_pain_points: [],
        target_demographics: '',
        core_messaging: '',
        positioning_statement: '',
        value_propositions: [],
        brand_mission: '',
        content_pillars: [],
      },
      voice: {
        tones: ['conversational', 'engaging'],
        writing_styles: ['direct', 'story-driven'],
        preferred_phrasing: [],
        avoid_phrasing: [],
        formality: 'neutral',
        humor_level: 'subtle',
        sentence_length_preference: 'medium',
        emoji_policy: 'minimal',
        voice_summary: '',
        approved_terminology: [],
        forbidden_claims: [],
        styles_to_avoid: [],
      },
      visual: {
        primary_colors: ['#0A0A0A', '#3B82F6'],
        secondary_colors: ['#F3F4F6'],
        accent_colors: ['#10B981'],
        background_color: '#000000',
        text_color: '#FFFFFF',
        fonts: ['Inter', 'Montserrat'],
        logo_asset_ids: [],
        preferred_aspect_ratios: ['9:16', '16:9'],
        preferred_layouts: ['vertical_center', 'fullscreen'],
      },
      captions: {
        default_style: 'clean_bottom',
        highlight_style: 'active_word_pop',
        font: 'Inter',
        case_style: 'uppercase',
        max_words_per_line: 4,
        stroke_color: '#000000',
        stroke_width: 2,
        background_color: 'rgba(0,0,0,0.5)',
        emphasis_rules: ['highlight_keywords', 'bold_numbers'],
        position_y: 80,
      },
      hooks: {
        preferred_hook_types: ['QUESTION', 'RESULT_FIRST', 'CURIOSITY'],
        preferred_hook_length: 'short',
        banned_patterns: ['Wait till the end', 'You will not believe this'],
        example_hooks: [],
      },
      cta: {
        preferred_cta_types: ['SOFT', 'FOLLOW'],
        approved_phrases: ['Follow for more insights', 'Save this for later'],
        blocked_phrases: ['Smash that subscribe button', 'Link in bio please please'],
      },
      editing: {
        pacing_style: 'fast',
        broll_density: 'balanced',
        transition_style: 'cut',
        punch_in_frequency: 'moderate',
        silence_style: 'tight',
        preferred_clip_length_range: { min: 20, max: 45 },
        intro_style: 'immediate',
        outro_style: 'cta_card',
      },
      audio: {
        cleanup_preset: 'clean',
        loudness_target_lufs: -14,
        music_level: 0.18,
        ducking_style: 'balanced',
      },
      publishing: {
        platform_preferences: {
          tiktok: { tone: 'casual', caption_speed: 'fast', cta_type: 'FOLLOW', hashtag_count: 4 },
          youtube_shorts: { tone: 'engaging', caption_speed: 'balanced', cta_type: 'SOFT', hashtag_count: 3 },
          instagram: { tone: 'conversational', caption_speed: 'balanced', cta_type: 'SAVE', hashtag_count: 5 },
          linkedin: { tone: 'professional', caption_speed: 'balanced', cta_type: 'COMMENT', hashtag_count: 3 },
          x: { tone: 'direct', caption_speed: 'fast', cta_type: 'SHARE', hashtag_count: 2 },
        },
        metadata_style: 'engaging',
        hashtag_style: 'targeted',
      },
      translation: {
        tone_preservation_mode: 'adaptive',
      },
      platform_guidance: {
        tiktok: {
          tone: 'casual',
          best_practices: ['Hook within 2s', 'Vertical 9:16 framing', 'Fast pacing'],
          preferred_format: '9:16 vertical',
          cta_style: 'FOLLOW',
          max_duration_seconds: 60,
        },
        youtube_shorts: {
          tone: 'engaging',
          best_practices: ['Strong visual premise', 'Seamless replay loop'],
          preferred_format: '9:16 vertical',
          cta_style: 'SOFT',
          max_duration_seconds: 60,
        },
        instagram: {
          tone: 'conversational',
          best_practices: ['High aesthetic fidelity', 'Save-triggering insight'],
          preferred_format: '9:16 vertical',
          cta_style: 'SAVE',
          max_duration_seconds: 90,
        },
        linkedin: {
          tone: 'professional',
          best_practices: ['Actionable career/industry takeaway', 'Clear thesis'],
          preferred_format: '9:16 or 1:1',
          cta_style: 'COMMENT',
          max_duration_seconds: 120,
        },
      },
      evidence_references: [],
      locks: {
        'captions.font': false,
        'captions.default_style': false,
        'visual.primary_colors': false,
        'voice.avoid_phrasing': false,
        'cta.preferred_cta_types': false,
      },
      rule_states: {
        'captions.font': 'DEFAULT',
        'captions.default_style': 'DEFAULT',
        'visual.primary_colors': 'DEFAULT',
        'voice.tones': 'DEFAULT',
        'hooks.preferred_hook_types': 'DEFAULT',
        'cta.preferred_cta_types': 'DEFAULT',
        'editing.pacing_style': 'DEFAULT',
      },
      learning: {
        evidence_count: 0,
        confidence_by_dimension: {},
      },
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Retrieves or creates active brand brain profile for user.
   */
  public static async getProfile(userId: string, brandBrainId?: string): Promise<BrandBrainProfile> {
    if (!userId) {
      throw new AppError('User ID is required to access Brand Brain.', 401, 'UNAUTHORIZED');
    }

    return await ownerContext.run(userId, async () => {
      if (brandBrainId) {
        const { data: specific, error } = await dataRepository
          .from('brand_brain_profiles')
          .select()
          .eq('id', brandBrainId)
          .eq('user_id', userId)
          .single();
        if (error || !specific) {
          throw new AppError('Brand Brain profile not found.', 404, 'BRAND_PROFILE_NOT_FOUND');
        }
        return specific as BrandBrainProfile;
      }

      // Find active profile
      const { data: profiles, error } = await dataRepository
        .from('brand_brain_profiles')
        .select()
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        throw new AppError(`Failed to fetch brand profile: ${error.message}`, 500, 'DB_ERROR');
      }

      if (profiles && profiles.length > 0) {
        return profiles[0] as BrandBrainProfile;
      }

      // Check if user has an existing Creator Profile to seed initial brand values
      let brandName = 'My Brand';
      let tone = 'conversational';
      try {
        const { data: creatorProfile } = await dataRepository
          .from('creator_profiles')
          .select()
          .eq('user_id', userId)
          .single();
        if (creatorProfile) {
          if (creatorProfile.brand_name) brandName = creatorProfile.brand_name;
          if (creatorProfile.tone) tone = creatorProfile.tone;
        }
      } catch (err) {
        logger.info('No creator profile found to seed Brand Brain', { err });
      }

      // Create new initial profile
      const newProfile = this.createDefaultProfile(userId, brandName);
      if (tone) {
        newProfile.voice.tones = [tone];
      }

      const { error: insertError } = await dataRepository
        .from('brand_brain_profiles')
        .insert(newProfile);

      if (insertError) {
        throw new AppError(`Failed to create Brand Brain profile: ${insertError?.message}`, 500, 'DB_ERROR');
      }

      // Record version 1 snapshot
      await this.recordVersionSnapshot(userId, newProfile, 'Initial Brand Brain creation', 'USER_ONBOARDING');

      return newProfile;
    });
  }

  /**
   * Updates Brand Brain profile.
   * Honors rule locks: if a setting is LOCKED, it cannot be overridden by learned/automated updates.
   */
  public static async updateProfile(
    userId: string,
    updates: UpdateBrandBrainDTO,
    source: 'USER_EDIT' | 'LEARNED_UPDATE' | 'IMPORT' | 'INTELLIGENCE_APPROVAL' = 'USER_EDIT',
    brandBrainId?: string
  ): Promise<BrandBrainProfile> {
    if (!userId) {
      throw new AppError('User ID is required.', 401, 'UNAUTHORIZED');
    }

    return await ownerContext.run(userId, async () => {
      const current = await this.getProfile(userId, brandBrainId);

      // Validate visual colors if provided
      if (updates.visual?.primary_colors) {
        this.validateColors(updates.visual.primary_colors);
      }
      if (updates.visual?.secondary_colors) {
        this.validateColors(updates.visual.secondary_colors);
      }
      if (updates.visual?.accent_colors) {
        this.validateColors(updates.visual.accent_colors);
      }

      // Validate fonts if provided
      if (updates.captions?.font) {
        const check = this.validateFont(updates.captions.font);
        if (!check.available) {
          throw new AppError(
            `Font "${updates.captions.font}" is NOT_AVAILABLE in editor safe font list. Supported fonts: ${SAFE_EDITOR_FONTS.slice(0, 5).join(', ')}...`,
            400,
            'UNSUPPORTED_FONT'
          );
        }
      }

      // Check locks if update is automated/learned
      if (source === 'LEARNED_UPDATE') {
        const locks = current.locks || {};
        for (const [key, isLocked] of Object.entries(locks)) {
          if (isLocked) {
            // Cannot modify locked fields via automated learning
            const [dim, prop] = key.split('.');
            if (updates[dim as keyof UpdateBrandBrainDTO]) {
              delete (updates[dim as keyof UpdateBrandBrainDTO] as any)[prop];
            }
          }
        }
      }

      // Merge deep objects carefully
      const newVersionNum = current.version + 1;
      const updatedProfile: BrandBrainProfile = {
        ...current,
        version: newVersionNum,
        updated_at: new Date().toISOString(),
        identity: {
          ...current.identity,
          ...(updates.identity || {}),
          audience_needs: (updates.identity?.audience_needs || current.identity.audience_needs || []).slice(0, 15),
          audience_pain_points: (updates.identity?.audience_pain_points || current.identity.audience_pain_points || []).slice(0, 15),
          value_propositions: (updates.identity?.value_propositions || current.identity.value_propositions || []).slice(0, 15),
          content_pillars: (updates.identity?.content_pillars || current.identity.content_pillars || []).slice(0, 10),
        },
        voice: {
          ...current.voice,
          ...(updates.voice || {}),
          preferred_phrasing: (updates.voice?.preferred_phrasing || current.voice.preferred_phrasing).slice(
            0,
            BRAND_RESOURCE_LIMITS.MAX_APPROVED_PHRASES
          ),
          avoid_phrasing: (updates.voice?.avoid_phrasing || current.voice.avoid_phrasing).slice(
            0,
            BRAND_RESOURCE_LIMITS.MAX_AVOID_PHRASES
          ),
          approved_terminology: (updates.voice?.approved_terminology || current.voice.approved_terminology || []).slice(0, 30),
          forbidden_claims: (updates.voice?.forbidden_claims || current.voice.forbidden_claims || []).slice(0, 30),
          styles_to_avoid: (updates.voice?.styles_to_avoid || current.voice.styles_to_avoid || []).slice(0, 15),
        },
        visual: {
          ...current.visual,
          ...(updates.visual || {}),
          primary_colors: (updates.visual?.primary_colors || current.visual.primary_colors).slice(
            0,
            BRAND_RESOURCE_LIMITS.MAX_BRAND_COLORS
          ),
        },
        captions: { ...current.captions, ...(updates.captions || {}) },
        hooks: {
          ...current.hooks,
          ...(updates.hooks || {}),
          example_hooks: (updates.hooks?.example_hooks || current.hooks.example_hooks).slice(
            0,
            BRAND_RESOURCE_LIMITS.MAX_EXAMPLES_PER_DIMENSION
          ),
        },
        cta: {
          ...current.cta,
          ...(updates.cta || {}),
          approved_phrases: (updates.cta?.approved_phrases || current.cta.approved_phrases).slice(
            0,
            BRAND_RESOURCE_LIMITS.MAX_APPROVED_PHRASES
          ),
          blocked_phrases: (updates.cta?.blocked_phrases || current.cta.blocked_phrases).slice(
            0,
            BRAND_RESOURCE_LIMITS.MAX_AVOID_PHRASES
          ),
        },
        editing: { ...current.editing, ...(updates.editing || {}) },
        audio: { ...current.audio, ...(updates.audio || {}) },
        publishing: { ...current.publishing, ...(updates.publishing || {}) },
        translation: { ...current.translation, ...(updates.translation || {}) },
        platform_guidance: {
          ...(current.platform_guidance || {}),
          ...(updates.platform_guidance || {}),
        },
        evidence_references: updates.evidence_references || current.evidence_references || [],
        locks: { ...current.locks, ...(updates.locks || {}) },
        rule_states: {
          ...current.rule_states,
          ...(updates.rule_states || {}),
        },
      };

      // If user explicitly updated a rule, set its state to PREFERRED or LOCKED if requested
      if (source === 'USER_EDIT' && updates.rule_states) {
        for (const [key, state] of Object.entries(updates.rule_states)) {
          updatedProfile.rule_states[key] = state;
          if (state === 'LOCKED') {
            updatedProfile.locks[key] = true;
          } else if (state === 'PREFERRED') {
            updatedProfile.locks[key] = false;
          }
        }
      }

      const { error } = await dataRepository
        .from('brand_brain_profiles')
        .update(updatedProfile)
        .eq('id', current.id)
        .eq('user_id', userId);

      if (error) {
        throw new AppError(`Failed to update Brand Brain profile: ${error.message}`, 500, 'DB_ERROR');
      }

      // Record version snapshot
      const changeSummary = `Profile updated by ${source}: ${Object.keys(updates).join(', ')}`;
      await this.recordVersionSnapshot(userId, updatedProfile, changeSummary, source);

      return updatedProfile;
    });
  }

  /**
   * Toggles a lock on a specific brand attribute.
   */
  public static async setLock(
    userId: string,
    ruleKey: string,
    locked: boolean,
    brandBrainId?: string
  ): Promise<BrandBrainProfile> {
    const current = await this.getProfile(userId, brandBrainId);
    const updatedLocks = { ...(current.locks || {}), [ruleKey]: locked };
    const updatedStates = { ...(current.rule_states || {}) };
    if (locked) {
      updatedStates[ruleKey] = 'LOCKED';
    } else if (updatedStates[ruleKey] === 'LOCKED') {
      updatedStates[ruleKey] = 'PREFERRED';
    }

    return await this.updateProfile(
      userId,
      { locks: updatedLocks, rule_states: updatedStates },
      'USER_EDIT',
      brandBrainId
    );
  }

  /**
   * Resets all LEARNED preferences back to default or initial state.
   * Strictly preserves LOCKED and explicit user settings.
   */
  public static async resetLearnedLayer(userId: string, brandBrainId?: string): Promise<BrandBrainProfile> {
    return await ownerContext.run(userId, async () => {
      const current = await this.getProfile(userId, brandBrainId);
      const defaults = this.createDefaultProfile(userId, current.identity.brand_name);

      const cleanedRuleStates = { ...current.rule_states };
      const cleanedEditing = { ...current.editing };
      const cleanedHooks = { ...current.hooks };
      const cleanedCaptions = { ...current.captions };

      // Revert any rule state marked LEARNED
      for (const [key, state] of Object.entries(cleanedRuleStates)) {
        if (state === 'LEARNED') {
          cleanedRuleStates[key] = 'DEFAULT';
          if (key === 'editing.pacing_style') cleanedEditing.pacing_style = defaults.editing.pacing_style;
          if (key === 'captions.default_style') cleanedCaptions.default_style = defaults.captions.default_style;
          if (key === 'hooks.preferred_hook_types') cleanedHooks.preferred_hook_types = defaults.hooks.preferred_hook_types;
        }
      }

      // Reset learning summary
      const updatedProfile: BrandBrainProfile = {
        ...current,
        version: current.version + 1,
        rule_states: cleanedRuleStates,
        editing: cleanedEditing,
        hooks: cleanedHooks,
        captions: cleanedCaptions,
        learning: {
          last_learned_at: undefined,
          evidence_count: 0,
          confidence_by_dimension: {},
        },
        updated_at: new Date().toISOString(),
      };

      const { error } = await dataRepository
        .from('brand_brain_profiles')
        .update(updatedProfile)
        .eq('id', current.id)
        .eq('user_id', userId);

      if (error) {
        throw new AppError(`Failed to reset learned layer: ${error.message}`, 500, 'DB_ERROR');
      }

      await this.recordVersionSnapshot(userId, updatedProfile, 'Reset learned intelligence layer', 'USER_RESET');
      return updatedProfile;
    });
  }

  /**
   * Records a snapshot of the Brand Brain profile in brand_brain_versions.
   */
  public static async recordVersionSnapshot(
    userId: string,
    profile: BrandBrainProfile,
    changeSummary: string,
    source: string
  ): Promise<BrandBrainVersion> {
    const versionRecord: BrandBrainVersion = {
      id: crypto.randomUUID(),
      user_id: userId,
      brand_brain_id: profile.id,
      version: profile.version,
      snapshot: profile,
      change_summary: changeSummary,
      source,
      created_at: new Date().toISOString(),
    };

    const { error } = await dataRepository.from('brand_brain_versions').insert(versionRecord);
    if (error) {
      logger.error('Failed to record brand version snapshot', { error, userId, profileId: profile.id });
    }
    return versionRecord;
  }

  /**
   * Retrieves version history for a Brand Brain profile.
   */
  public static async getVersionHistory(userId: string, brandBrainId?: string): Promise<BrandBrainVersion[]> {
    return await ownerContext.run(userId, async () => {
      const profile = await this.getProfile(userId, brandBrainId);
      const { data: versions, error } = await dataRepository
        .from('brand_brain_versions')
        .select()
        .eq('brand_brain_id', profile.id)
        .eq('user_id', userId);

      if (error) {
        throw new AppError(`Failed to fetch version history: ${error.message}`, 500, 'DB_ERROR');
      }

      return (versions || []).sort(
        (a: BrandBrainVersion, b: BrandBrainVersion) => b.version - a.version
      ) as BrandBrainVersion[];
    });
  }

  /**
   * Restores a previous version snapshot of a Brand Brain profile.
   */
  public static async restoreVersion(
    userId: string,
    versionNumber: number,
    brandBrainId?: string
  ): Promise<BrandBrainProfile> {
    return await ownerContext.run(userId, async () => {
      const profile = await this.getProfile(userId, brandBrainId);

      const { data: versionDoc, error } = await dataRepository
        .from('brand_brain_versions')
        .select()
        .eq('brand_brain_id', profile.id)
        .eq('user_id', userId)
        .eq('version', versionNumber)
        .single();

      if (error || !versionDoc) {
        throw new AppError(`Brand Brain version ${versionNumber} not found.`, 404, 'VERSION_NOT_FOUND');
      }

      const snapshot = versionDoc.snapshot as BrandBrainProfile;
      const nextVersion = profile.version + 1;

      const restoredProfile: BrandBrainProfile = {
        ...snapshot,
        id: profile.id,
        user_id: userId,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await dataRepository
        .from('brand_brain_profiles')
        .update(restoredProfile)
        .eq('id', profile.id)
        .eq('user_id', userId);

      if (updateError) {
        throw new AppError(`Failed to restore version: ${updateError.message}`, 500, 'DB_ERROR');
      }

      await this.recordVersionSnapshot(
        userId,
        restoredProfile,
        `Restored from version ${versionNumber}`,
        'VERSION_RESTORE'
      );

      return restoredProfile;
    });
  }
}

import {
  AudioDuckingConfig,
  AudioDuckingPreset,
  AUDIO_DUCKING_PRESETS,
} from '../types/index.js';

/**
 * Phase 20: Audio Ducking Service
 * Compiles dynamic sidechain compression filter graphs in FFmpeg:
 * - Detects presence of speech signal on main dialogue lane
 * - Automatically attenuates background audio (music / B-roll audio)
 * - Releases smoothly when speech pauses or ends
 *
 * Utilizes FFmpeg's native sidechaincompress filter for hardware-accurate mixing.
 */
export class AudioDuckingService {
  /**
   * Resolves ducking configuration for a preset name or custom config.
   */
  public static resolveDuckingConfig(presetOrConfig?: AudioDuckingPreset | AudioDuckingConfig): AudioDuckingConfig {
    if (!presetOrConfig) {
      return {
        enabled: true,
        preset: 'balanced',
        ...AUDIO_DUCKING_PRESETS.balanced,
      };
    }

    if (typeof presetOrConfig === 'string') {
      const preset = AUDIO_DUCKING_PRESETS[presetOrConfig] || AUDIO_DUCKING_PRESETS.balanced;
      return {
        enabled: true,
        preset: presetOrConfig,
        ...preset,
      };
    }

    return presetOrConfig;
  }

  /**
   * Compiles FFmpeg filter complex fragment for sidechain ducking.
   *
   * @param dialogueLabel Input audio label for main speech/dialogue (e.g., '[0:a]')
   * @param backgroundLabel Input audio label for background music/b-roll (e.g., '[1:a]')
   * @param outputLabel Desired label for ducked background audio (e.g., '[ducked_bg]')
   * @param config Ducking configuration
   * @returns Array of FFmpeg filter complex statements
   */
  public static compileSidechainFilter(
    dialogueLabel: string,
    backgroundLabel: string,
    outputLabel: string,
    config: AudioDuckingConfig
  ): string[] {
    const filters: string[] = [];

    if (!config.enabled) {
      // Pass through un-ducked
      filters.push(`${backgroundLabel}anull${outputLabel}`);
      return filters;
    }

    // Convert threshold in dB to linear amplitude for FFmpeg sidechaincompress (0.0 to 1.0)
    // 0 dB = 1.0; -20 dB = 0.1; -30 dB = ~0.0316; -40 dB = 0.01
    const threshDb = Math.min(-6, Math.max(-50, config.threshold_db ?? -30));
    const linearThreshold = Math.pow(10, threshDb / 20);
    const thresholdFormatted = linearThreshold.toFixed(4);

    const ratio = Math.min(20, Math.max(2, config.duck_ratio ?? 8));
    const attack = Math.min(200, Math.max(5, config.attack_ms ?? 30));
    const release = Math.min(1000, Math.max(50, config.release_ms ?? 350));

    // FFmpeg sidechaincompress takes two audio inputs:
    // 1st input: main signal to be compressed (background audio)
    // 2nd input: sidechain control signal (dialogue)
    // Format: [main][sidechain]sidechaincompress=threshold=T:ratio=R:attack=A:release=R[out]
    const sidechainFilter = `${backgroundLabel}${dialogueLabel}sidechaincompress=threshold=${thresholdFormatted}:ratio=${ratio}:attack=${attack}:release=${release}${outputLabel}`;
    filters.push(sidechainFilter);

    return filters;
  }

  /**
   * Compiles complete dual-stream mix (dialogue + ducked background).
   *
   * @param dialogueLabel Clean dialogue stream label
   * @param backgroundLabel Background audio stream label
   * @param mixedOutLabel Target output label
   * @param config Ducking configuration
   */
  public static compileDuckedMix(
    dialogueLabel: string,
    backgroundLabel: string,
    mixedOutLabel: string,
    config: AudioDuckingConfig
  ): string[] {
    const statements: string[] = [];
    const duckedBgLabel = '[bg_ducked]';

    // 1. Duck background audio under dialogue
    const duckFilters = this.compileSidechainFilter(
      dialogueLabel,
      backgroundLabel,
      duckedBgLabel,
      config
    );
    statements.push(...duckFilters);

    // 2. Mix dialogue and ducked background together using amix
    // duration=first ensures the final mix matches dialogue length
    // dropout_transition=2 prevents abrupt volume jumps when a stream ends
    statements.push(`${dialogueLabel}${duckedBgLabel}amix=inputs=2:duration=first:dropout_transition=2${mixedOutLabel}`);

    return statements;
  }
}

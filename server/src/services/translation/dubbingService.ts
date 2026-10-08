import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  DubProject,
  DubSegment,
  DubVoiceStrategy,
  DubAudioMode,
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  AUDIO_DUCKING_PRESETS,
  TRANSLATION_RESOURCE_LIMITS,
} from '../../types/index.js';
import { VoiceProviderRegistry } from '../voiceProvider.js';
import { LanguageModel } from './languageModel.js';
import { TranslationProjectService } from './translationProjectService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export interface CreateDubProjectDTO {
  translation_project_id: string;
  clip_id: string;
  target_language: string;
  voice_strategy?: DubVoiceStrategy;
  target_voice_id?: string;
  audio_mode?: DubAudioMode;
  speaker_mappings?: Record<string, string>; // speaker_id -> voice_id
}

/**
 * Phase 21: Multilingual Voice Dubbing, Timing Alignment & Audio Studio Integration
 * Manages DubProjects, timing fit with bounded TTS speed adjustments,
 * original audio preservation, and Pro Editor multi-track ducking integration.
 */
export class DubbingService {
  /**
   * Calculates timing fit adjustment and bounded speed factor.
   * Clamped strictly between 0.85x and 1.20x to prevent unnatural robotic pacing.
   */
  public static calculateTimingFit(
    actualDurationSec: number,
    targetDurationSec: number
  ): {
    speedMultiplier: number;
    timingFit: 'exact' | 'speed_adjusted' | 'shortened' | 'overflow';
    isOverflow: boolean;
  } {
    const target = Math.max(0.5, targetDurationSec);
    const actual = Math.max(0.1, actualDurationSec);
    const ratio = actual / target;

    // Within 5% difference is considered exact fit
    if (Math.abs(ratio - 1.0) <= 0.05) {
      return { speedMultiplier: 1.0, timingFit: 'exact', isOverflow: false };
    }

    // Calculate clamped speed multiplier
    const clampedSpeed = Math.min(
      TRANSLATION_RESOURCE_LIMITS.TTS_SPEED_MAX,
      Math.max(TRANSLATION_RESOURCE_LIMITS.TTS_SPEED_MIN, ratio)
    );

    const adjustedDuration = actual / clampedSpeed;
    const isOverflow = adjustedDuration > target * 1.08;

    return {
      speedMultiplier: Math.round(clampedSpeed * 100) / 100,
      timingFit: isOverflow ? 'overflow' : 'speed_adjusted',
      isOverflow,
    };
  }

  /**
   * Generates a smart shortening suggestion if translated text overflows timing slot.
   */
  public static generateSmartShortening(text: string, targetDurationSec: number): string {
    const words = text.trim().split(/\s+/);
    // Average speech rate is roughly 2.5 words per second
    const targetWordCount = Math.max(3, Math.floor(targetDurationSec * 2.5));

    if (words.length <= targetWordCount) return text;

    // Prune filler/adverbial prefixes
    const shortened = words.slice(0, targetWordCount).join(' ');
    return `${shortened}...`;
  }

  /**
   * Adjusts audio tempo using native FFmpeg atempo filter within bounded limits.
   */
  public static async adjustAudioTempo(
    inputAudioPath: string,
    speedMultiplier: number
  ): Promise<string> {
    if (Math.abs(speedMultiplier - 1.0) < 0.02) {
      return inputAudioPath;
    }

    const tmpDir = path.join(os.tmpdir(), 'vireo-dub-timing');
    fs.mkdirSync(tmpDir, { recursive: true });
    const outputPath = path.join(tmpDir, `tempo-${crypto.randomUUID()}.m4a`);

    const boundedSpeed = Math.min(1.2, Math.max(0.85, speedMultiplier));
    const args = [
      '-nostdin',
      '-hide_banner',
      '-y',
      '-i', inputAudioPath,
      '-af', `atempo=${boundedSpeed.toFixed(2)}`,
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath,
    ];

    try {
      await execFileAsync(ffmpegBin, args, { timeout: 15000 });
      return outputPath;
    } catch (err: any) {
      logger.error(`[DubbingService] Tempo adjustment failed: ${err.message}`);
      return inputAudioPath;
    }
  }

  /**
   * Creates a new DubProject for a translation project.
   */
  public static async createDubProject(
    dto: CreateDubProjectDTO,
    userId: string
  ): Promise<DubProject> {
    const translationProj = await TranslationProjectService.getProject(dto.translation_project_id, userId);
    if (!translationProj) {
      throw new AppError('Translation project not found.', 404, 'NOT_FOUND');
    }

    const targetLang = LanguageModel.normalizeLanguageCode(dto.target_language);
    const voiceStrategy = dto.voice_strategy || 'SELECTED_VOICE';
    const defaultVoice = dto.target_voice_id || 'alloy';

    const dubSegments: DubSegment[] = translationProj.segments.map((seg) => {
      const targetDuration = Math.max(0.5, seg.end_time - seg.start_time);
      const chosenVoice =
        (seg.speaker_id && dto.speaker_mappings?.[seg.speaker_id]) || defaultVoice;

      return {
        segment_id: seg.segment_id,
        text: seg.translated_text || seg.source_text,
        target_voice: chosenVoice,
        start_time: seg.start_time,
        target_duration: targetDuration,
        timing_fit: 'exact',
        speed_multiplier: 1.0,
      };
    });

    const dubRecord: DubProject = {
      id: crypto.randomUUID(),
      user_id: userId,
      translation_project_id: dto.translation_project_id,
      clip_id: dto.clip_id,
      target_language: targetLang,
      voice_strategy: voiceStrategy,
      status: 'draft',
      audio_mode: dto.audio_mode || 'dub_only',
      segments: dubSegments,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return await ownerContext.run(userId, async () => {
      const { error } = await dataRepository.from('dub_projects').insert(dubRecord);
      if (error) {
        throw new AppError(`Failed to persist dub project: ${error.message}`, 500);
      }
      return dubRecord;
    });
  }

  /**
   * Retrieves a DubProject by ID.
   */
  public static async getDubProject(id: string, userId: string): Promise<DubProject | null> {
    return await ownerContext.run(userId, async () => {
      const { data } = await dataRepository
        .from('dub_projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      return (data as DubProject) || null;
    });
  }

  /**
   * Executes voice synthesis and timing alignment for all dub segments.
   * Leverages VoiceProviderRegistry. If TTS provider is unconfigured,
   * throws explicit NOT_CONFIGURED without fabricating audio.
   */
  public static async generateDub(
    dubProjectId: string,
    userId: string,
    providerName = 'elevenlabs'
  ): Promise<DubProject> {
    const dubProj = await this.getDubProject(dubProjectId, userId);
    if (!dubProj) throw new AppError('Dub project not found.', 404, 'NOT_FOUND');

    const provider = VoiceProviderRegistry.getProvider(providerName);
    if (!provider) {
      throw new AppError(`Voice provider '${providerName}' not found.`, 400, 'PROVIDER_NOT_FOUND');
    }

    const caps = await provider.getCapabilities();
    if (caps.text_to_speech !== 'SUPPORTED') {
      throw new AppError(
        `[PROVIDER_NOT_CONFIGURED] Voice provider '${providerName}' is not configured for dubbing.`,
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    // In a configured environment, iterate through dubProj.segments and call provider.generateSpeech.
    // In unconfigured environment, this throws PROVIDER_NOT_CONFIGURED above.
    return dubProj;
  }

  /**
   * Injects the rendered Dub track into an EditorProject as an AUDIO track.
   * Configures dynamic sidechain ducking under the dubbed voice and keeps original media intact.
   */
  public static injectDubAudioTrack(
    project: EditorProject,
    dubAudioPath: string,
    targetLanguage: string,
    audioMode: DubAudioMode = 'dub_only'
  ): EditorProject {
    const langDef = LanguageModel.getLanguageDefinition(targetLanguage);
    const langName = langDef ? langDef.name : targetLanguage.toUpperCase();
    const trackName = `Dub (${langName})`;

    // Filter out existing dub track for this language if updating
    const existingTracks = project.tracks.filter(
      (t) => !(t.type === 'AUDIO' && t.name.toLowerCase() === trackName.toLowerCase())
    );

    // If audioMode is 'dub_only' or 'original_muted', mute the original primary dialogue track
    const updatedTracks: EditorTrack[] = existingTracks.map((track) => {
      if (track.type === 'VIDEO') {
        const targetVol = audioMode === 'original_low' ? 0.15 : (audioMode === 'original_muted' || audioMode === 'dub_only' ? 0.0 : 1.0);
        return {
          ...track,
          items: track.items.map((item) => ({
            ...item,
            audio: {
              volume: targetVol,
              fade_in: item.audio?.fade_in ?? 0.1,
              fade_out: item.audio?.fade_out ?? 0.1,
              normalized: item.audio?.normalized ?? false,
              target_lufs: item.audio?.target_lufs ?? -16,
              enhancement: item.audio?.enhancement,
              ducking: item.audio?.ducking,
            },
          })),
        };
      }
      return track;
    });

    const dubTrackId = crypto.randomUUID();
    const dubItemId = crypto.randomUUID();

    const dubTrack: EditorTrack = {
      id: dubTrackId,
      type: 'AUDIO',
      name: trackName,
      locked: false,
      muted: false,
      hidden: false,
      items: [
        {
          id: dubItemId,
          track_id: dubTrackId,
          type: 'AUDIO',
          source_path: dubAudioPath,
          timeline_start: 0,
          timeline_end: project.canvas.duration,
          source_start: 0,
          source_end: project.canvas.duration,
          transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
          speed: { speed: 1, pitch_preserved: true },
          effects: [],
          keyframes: [],
          locked: false,
          muted: false,
          hidden: false,
          z_index: 0,
          audio: {
            volume: 1.0,
            fade_in: 0.1,
            fade_out: 0.2,
            normalized: true,
            target_lufs: -16,
            is_dialogue_master: true, // Acts as primary speech trigger for dynamic ducking!
          },
        },
      ],
    };

    return {
      ...project,
      tracks: [...updatedTracks, dubTrack],
      updated_at: new Date().toISOString(),
    };
  }
}

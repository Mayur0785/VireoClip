import { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { AppError, isValidUUID } from '../types/index.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { AudioAnalysisService } from '../services/audioAnalysisService.js';
import { AudioEnhancementService } from '../services/audioEnhancementService.js';
import { SpeechIntelligenceService } from '../services/speechIntelligenceService.js';
import { AudioDuckingService } from '../services/audioDuckingService.js';
import { VoiceProviderRegistry } from '../services/voiceProvider.js';
import { ProEditorService } from '../services/proEditorService.js';

export class AudioStudioController {
  /**
   * POST /api/audio/analyze
   * Non-destructive acoustic analysis (LUFS, RMS, peak, clipping, silence).
   */
  public static async analyzeAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { file_path, project_id, clip_id } = req.body;
      let targetPath = file_path;

      if (project_id) {
        if (!isValidUUID(project_id)) throw new AppError('Invalid project ID.', 400, 'INVALID_UUID');
        const { data: project } = await dataRepository
          .from('projects')
          .select('source_storage_path')
          .eq('id', project_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!project || !project.source_storage_path) {
          throw new AppError('Project not found or access denied.', 404, 'PROJECT_NOT_FOUND');
        }
        targetPath = project.source_storage_path;
      } else if (clip_id) {
        if (!isValidUUID(clip_id)) throw new AppError('Invalid clip ID.', 400, 'INVALID_UUID');
        const { data: clip } = await dataRepository
          .from('clips')
          .select('storage_path')
          .eq('id', clip_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!clip || !clip.storage_path) {
          throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
        }
        targetPath = clip.storage_path;
      }

      if (!targetPath || !fs.existsSync(targetPath)) {
        throw new AppError('Media file path not found.', 404, 'FILE_NOT_FOUND');
      }

      const metrics = await AudioAnalysisService.analyzeAudio(targetPath);
      res.json({ success: true, metrics });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/audio/enhance-preview
   * Generates a fast 5-second A/B snippet with before/after metrics.
   */
  public static async enhancePreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { file_path, project_id, config, start_time = 0, duration = 5.0 } = req.body;
      let targetPath = file_path;

      if (project_id) {
        if (!isValidUUID(project_id)) throw new AppError('Invalid project ID.', 400, 'INVALID_UUID');
        const { data: project } = await dataRepository
          .from('projects')
          .select('source_storage_path')
          .eq('id', project_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!project || !project.source_storage_path) {
          throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
        }
        targetPath = project.source_storage_path;
      }

      if (!targetPath || !fs.existsSync(targetPath)) {
        throw new AppError('Media file not found for preview.', 404, 'FILE_NOT_FOUND');
      }

      const cleanConfig = config || AudioEnhancementService.getPresetConfig('clean');
      const result = await AudioEnhancementService.generatePreviewSnippet(
        targetPath,
        cleanConfig,
        Math.max(0, Number(start_time) || 0),
        Math.min(15, Math.max(1, Number(duration) || 5.0))
      );

      res.json({
        success: true,
        preview_audio_path: result.preview_audio_path,
        before: result.before_metrics,
        after: result.after_metrics,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/audio/filler-words
   * Detects filler words from transcript words.
   */
  public static async detectFillerWords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { words } = req.body;
      if (!Array.isArray(words)) {
        throw new AppError('Words array is required.', 400, 'INVALID_INPUT');
      }

      const matches = SpeechIntelligenceService.detectFillerWords(words);
      res.json({ success: true, filler_words: matches });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/audio/repeated-phrases
   * Detects repeated takes / false starts.
   */
  public static async detectRepeatedPhrases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { words } = req.body;
      if (!Array.isArray(words)) {
        throw new AppError('Words array is required.', 400, 'INVALID_INPUT');
      }

      const repeated = SpeechIntelligenceService.detectRepeatedPhrases(words);
      res.json({ success: true, repeated_phrases: repeated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/audio/silence-tighten
   * Calculates silence tightening recommendations.
   */
  public static async calculateSilenceTightening(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { intervals, mode = 'natural' } = req.body;
      if (!Array.isArray(intervals)) {
        throw new AppError('Intervals array is required.', 400, 'INVALID_INPUT');
      }

      const plan = SpeechIntelligenceService.calculateSilenceTightening(intervals, mode);
      res.json({ success: true, plan });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/audio/capabilities
   * Returns aggregated voice/TTS/enhancement provider status.
   */
  public static async getCapabilities(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const caps = await VoiceProviderRegistry.getAggregatedCapabilities();
      res.json({
        success: true,
        capabilities: {
          audio_analysis: 'SUPPORTED',
          speech_enhancement: 'SUPPORTED',
          dynamic_ducking: 'SUPPORTED',
          noise_reduction: 'LOCAL_BASIC',
          echo_reduction: caps.echo_reduction,
          voice_isolation: 'NOT_CONFIGURED',
          stem_separation: caps.stem_separation,
          text_to_speech: caps.text_to_speech,
          multilingual_tts: caps.multilingual_tts,
          voice_cloning: caps.voice_cloning,
          languages: caps.languages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/audio/voices
   * Lists available real voices from configured providers.
   */
  public static async listVoices(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const voices = await VoiceProviderRegistry.listAvailableVoices();
      res.json({ success: true, voices });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/audio/voiceover/preview
   * Synthesizes voiceover script with real configured provider.
   */
  public static async generateVoiceover(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { text, language = 'en', voice_id, provider = 'elevenlabs' } = req.body;
      const prov = VoiceProviderRegistry.getProvider(provider) || VoiceProviderRegistry.getProvider('elevenlabs');

      if (!prov) {
        throw new AppError('Voice provider not found.', 404, 'PROVIDER_NOT_FOUND');
      }

      const result = await prov.generateSpeech(
        { text, language, voice_id },
        userId
      );

      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/audio/voice-clone
   * Gated voice cloning with explicit affirmative consent check.
   */
  public static async cloneVoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { display_name, source_asset_id, consent_confirmed, consent_statement, provider = 'elevenlabs' } = req.body;

      if (!consent_confirmed || !consent_statement?.trim()) {
        throw new AppError(
          'Explicit affirmative consent statement is required for voice cloning.',
          400,
          'CONSENT_REQUIRED'
        );
      }

      const prov = VoiceProviderRegistry.getProvider(provider);
      if (!prov) {
        throw new AppError('Voice cloning provider not found.', 404, 'PROVIDER_NOT_FOUND');
      }

      const profile = await prov.cloneVoice(
        { display_name, source_asset_id, consent_confirmed, consent_statement },
        userId
      );

      res.json({ success: true, profile });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/editor-projects/:id/audio-studio
   * Applies Audio Studio settings (enhancement, ducking, track volumes) to EditorProject.
   */
  public static async applyAudioStudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');

      const { id } = req.params;
      if (!isValidUUID(id)) throw new AppError('Invalid project ID.', 400, 'INVALID_UUID');

      const project = await ProEditorService.getEditorProject(id, userId);

      const { enhancement, ducking, dialogue_volume, music_volume, broll_audio_mode } = req.body;

      // Update video items on Track 0 (dialogue)
      for (const track of project.tracks) {
        if (track.type === 'VIDEO' && !track.name.toLowerCase().includes('b-roll')) {
          for (const item of track.items) {
            item.audio = {
              volume: dialogue_volume !== undefined ? Number(dialogue_volume) : item.audio?.volume ?? 1.0,
              fade_in: item.audio?.fade_in ?? 0.15,
              fade_out: item.audio?.fade_out ?? 0.25,
              normalized: enhancement?.normalize_enabled ?? true,
              target_lufs: enhancement?.target_lufs ?? -16,
              enhancement: enhancement ? enhancement : item.audio?.enhancement,
              ducking: ducking ? ducking : item.audio?.ducking,
            };
          }
        } else if (track.name.toLowerCase().includes('b-roll')) {
          // B-roll track items
          for (const item of track.items) {
            if (broll_audio_mode) {
              item.audio = item.audio || {
                volume: 0.8,
                fade_in: 0.1,
                fade_out: 0.1,
                normalized: false,
                target_lufs: -16,
              };
              item.audio.broll_audio_mode = broll_audio_mode;
              item.muted = broll_audio_mode === 'muted';
            }
          }
        } else if (track.type === 'AUDIO') {
          // Secondary audio tracks (music/sfx)
          for (const item of track.items) {
            if (music_volume !== undefined) {
              item.audio = item.audio || {
                volume: Number(music_volume),
                fade_in: 0.2,
                fade_out: 0.2,
                normalized: false,
                target_lufs: -16,
              };
              item.audio.volume = Number(music_volume);
            }
            if (ducking) {
              item.audio = item.audio || {
                volume: 0.8,
                fade_in: 0.2,
                fade_out: 0.2,
                normalized: false,
                target_lufs: -16,
              };
              item.audio.ducking = ducking;
            }
          }
        }
      }

      const updated = await ProEditorService.updateEditorProject(
        id,
        userId,
        { tracks: project.tracks }
      );

      res.json({ success: true, project: updated });
    } catch (err) {
      next(err);
    }
  }
}

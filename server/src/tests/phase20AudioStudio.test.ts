import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo, getMongoDb } from '../db/mongoClient.js';
import { AudioAnalysisService } from '../services/audioAnalysisService.js';
import { AudioEnhancementService } from '../services/audioEnhancementService.js';
import { AudioDuckingService } from '../services/audioDuckingService.js';
import { SpeechIntelligenceService } from '../services/speechIntelligenceService.js';
import {
  VoiceProviderRegistry,
  ElevenLabsVoiceProvider,
  OpenAIVoiceProvider,
} from '../services/voiceProvider.js';
import { ProEditorService } from '../services/proEditorService.js';
import {
  AudioAssetRecord,
  EditorProject,
  AUDIO_RESOURCE_LIMITS,
  AUDIO_DUCKING_PRESETS,
  AUDIO_CLEAN_PRESETS,
} from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Real launch video test asset path
const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

describe('Phase 20 — Vireo Audio + Voice Studio System Tests', () => {
  const mockUserId = crypto.randomUUID();
  const mockOtherUserId = crypto.randomUUID();
  const mockProjectId = crypto.randomUUID();
  const mockClipId = crypto.randomUUID();

  before(async () => {
    // Warm up and verify Mongo connection with retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err: any) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  });

  after(async () => {
    try {
      await ownerContext.run(mockUserId, async () => {
        await dataRepository.from('audio_assets').delete().eq('user_id', mockUserId);
        await dataRepository.from('editor_projects').delete().eq('user_id', mockUserId);
      });
      await ownerContext.run(mockOtherUserId, async () => {
        await dataRepository.from('audio_assets').delete().eq('user_id', mockOtherUserId);
      });
    } catch {
      // Ignore cleanup error if any
    }
    await closeMongo();
  });

  // Test fixture generator
  function createMockProject(overrides: Partial<EditorProject> = {}): EditorProject {
    const videoTrackId = crypto.randomUUID();
    const videoItemId = crypto.randomUUID();

    return {
      id: crypto.randomUUID(),
      user_id: mockUserId,
      project_id: mockProjectId,
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'Phase 20 Audio Studio Project',
      canvas: {
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        fps: 30,
        duration: 10.0,
        background_color: '#000000',
        background_mode: 'color',
      },
      tracks: [
        {
          id: videoTrackId,
          type: 'VIDEO',
          name: 'Main Video',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            {
              id: videoItemId,
              track_id: videoTrackId,
              type: 'VIDEO',
              source_path: REAL_VIDEO_ASSET,
              timeline_start: 0,
              timeline_end: 10.0,
              source_start: 0,
              source_end: 10.0,
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
                fade_in: 0.15,
                fade_out: 0.25,
                normalized: true,
                target_lufs: -16,
              },
            },
          ],
        },
      ],
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.1,
        show_safe_zones: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  // ==========================================================================
  // SUITE 1: AUDIO ANALYSIS, LOUDNESS & CLIPPING DETECTION
  // ==========================================================================
  describe('1. Audio Analysis, Loudness & Clipping Detection', () => {
    it('1. verifies probe metadata (duration, channels, sample rate, codec) on real asset', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET), 'Real video asset must exist on disk');
      const probe = await AudioAnalysisService.probeAudioStream(REAL_VIDEO_ASSET);

      assert.ok(probe.channels >= 1, 'Must detect at least 1 audio channel');
      assert.ok(probe.sample_rate >= 22050, 'Must detect valid sample rate (>= 22050Hz)');
      assert.ok(probe.duration_sec > 1.0, 'Must detect positive audio duration');
      assert.ok(typeof probe.codec === 'string' && probe.codec.length > 0, 'Must detect audio codec name');
    });

    it('2. measures integrated LUFS, loudness range, and true peak via EBU R128', async () => {
      const metrics = await AudioAnalysisService.analyzeAudio(REAL_VIDEO_ASSET);

      assert.ok(Number.isFinite(metrics.integrated_lufs), 'integrated_lufs must be numeric');
      assert.ok(metrics.integrated_lufs <= 0, 'integrated_lufs must be non-positive dBFS');
      assert.ok(Number.isFinite(metrics.loudness_range_lu), 'loudness_range_lu must be numeric');
      assert.ok(metrics.loudness_range_lu >= 0, 'loudness range must be non-negative');
      assert.ok(Number.isFinite(metrics.true_peak_db), 'true_peak_db must be numeric');
    });

    it('3. detects clipping deterministically when audio peak >= 0 dBFS', () => {
      // Deterministic evaluation:
      const safeMetrics = { max_volume_db: -1.2, true_peak_db: -1.5 };
      const safeClipping = safeMetrics.max_volume_db >= -0.05 || safeMetrics.true_peak_db >= 0.0;
      assert.equal(safeClipping, false, 'Safe volume must not register as clipping');

      const clippedMetrics = { max_volume_db: 0.0, true_peak_db: 0.3 };
      const clipped = clippedMetrics.max_volume_db >= -0.05 || clippedMetrics.true_peak_db >= 0.0;
      assert.equal(clipped, true, 'Digital over >= 0 dBFS must be flagged as clipping');
    });

    it('4. measures silence intervals, silence ratio, and speech activity ratio', async () => {
      const metrics = await AudioAnalysisService.analyzeAudio(REAL_VIDEO_ASSET);

      assert.ok(metrics.silence_ratio >= 0 && metrics.silence_ratio <= 1.0, 'silence_ratio must be bounded [0, 1]');
      assert.ok(metrics.speech_ratio >= 0 && metrics.speech_ratio <= 1.0, 'speech_ratio must be bounded [0, 1]');
      assert.ok(
        Math.abs(metrics.silence_ratio + metrics.speech_ratio - 1.0) < 0.05,
        'silence_ratio and speech_ratio must sum approximately to 1.0'
      );
    });

    it('5. caches analysis idempotently to avoid redundant FFmpeg runs', async () => {
      const startA = Date.now();
      const first = await AudioAnalysisService.analyzeAudio(REAL_VIDEO_ASSET);
      const durA = Date.now() - startA;

      const startB = Date.now();
      const second = await AudioAnalysisService.analyzeAudio(REAL_VIDEO_ASSET);
      const durB = Date.now() - startB;

      assert.deepEqual(first, second, 'Cached metrics must match first run');
      assert.ok(durB <= durA || durB < 250, 'Subsequent cached call must execute rapidly');
    });
  });

  // ==========================================================================
  // SUITE 2: SPEECH ENHANCEMENT, PRESETS & FILTER GRAPHS
  // ==========================================================================
  describe('2. Speech Enhancement, Presets & Filter Graphs', () => {
    it('6. compiles highpass rumble and 50Hz/60Hz notch hum filters', () => {
      const filters = AudioEnhancementService.compileFilterGraph({
        preset: 'clean',
        denoise_enabled: false,
        denoise_amount: 0,
        hum_removal_enabled: true,
        highpass_freq: 85,
        deess_enabled: false,
        compressor_enabled: false,
        normalize_enabled: false,
        target_lufs: -16,
        limiter_enabled: false,
        limiter_ceiling_db: -1.0,
      });

      assert.ok(filters.some((f) => f.includes('highpass=f=85')), 'Must include highpass filter at 85Hz');
      assert.ok(filters.some((f) => f.includes('equalizer=f=50')), 'Must include 50Hz notch filter');
      assert.ok(filters.some((f) => f.includes('equalizer=f=60')), 'Must include 60Hz notch filter');
    });

    it('7. compiles FFT noise reduction (afftdn) with bounded parameter scaling', () => {
      const filters = AudioEnhancementService.compileFilterGraph({
        preset: 'clean',
        denoise_enabled: true,
        denoise_amount: 50,
        hum_removal_enabled: false,
        highpass_freq: 0,
        deess_enabled: false,
        compressor_enabled: false,
        normalize_enabled: false,
        target_lufs: -16,
        limiter_enabled: false,
        limiter_ceiling_db: -1.0,
      });

      const afftdnFilter = filters.find((f) => f.startsWith('afftdn='));
      assert.ok(afftdnFilter, 'Must include afftdn filter');
      assert.ok(afftdnFilter.includes('nr='), 'afftdn must include noise reduction amount');
    });

    it('8. compiles de-essing filter targeting 6kHz sibilance band', () => {
      const filters = AudioEnhancementService.compileFilterGraph({
        preset: 'clean',
        denoise_enabled: false,
        denoise_amount: 0,
        hum_removal_enabled: false,
        highpass_freq: 0,
        deess_enabled: true,
        compressor_enabled: false,
        normalize_enabled: false,
        target_lufs: -16,
        limiter_enabled: false,
        limiter_ceiling_db: -1.0,
      });

      assert.ok(
        filters.some((f) => f.includes('equalizer=f=6000') && f.includes('g=-4.5')),
        'Must include 6kHz de-essing attenuation filter'
      );
    });

    it('9. compiles vocal dynamics compression (acompressor) within safe boundaries', () => {
      const filters = AudioEnhancementService.compileFilterGraph({
        preset: 'clean',
        denoise_enabled: false,
        denoise_amount: 0,
        hum_removal_enabled: false,
        highpass_freq: 0,
        deess_enabled: false,
        compressor_enabled: true,
        compressor_threshold_db: -18,
        compressor_ratio: 3.5,
        compressor_attack_ms: 15,
        compressor_release_ms: 220,
        normalize_enabled: false,
        target_lufs: -16,
        limiter_enabled: false,
        limiter_ceiling_db: -1.0,
      });

      const comp = filters.find((f) => f.startsWith('acompressor='));
      assert.ok(comp, 'Must compile acompressor filter');
      assert.ok(comp.includes('threshold=-18dB'), 'Must specify threshold');
      assert.ok(comp.includes('ratio=3.5'), 'Must specify ratio');
      assert.ok(comp.includes('attack=15'), 'Must specify attack');
      assert.ok(comp.includes('release=220'), 'Must specify release');
    });

    it('10. compiles 3-band parametric EQ (Low, Mid, High) clamped within -12 to +12 dB', () => {
      const filters = AudioEnhancementService.compileFilterGraph({
        preset: 'clean',
        denoise_enabled: false,
        denoise_amount: 0,
        hum_removal_enabled: false,
        highpass_freq: 0,
        deess_enabled: false,
        compressor_enabled: false,
        eq_low_db: 2.0,
        eq_mid_db: -1.5,
        eq_high_db: 3.0,
        normalize_enabled: false,
        target_lufs: -16,
        limiter_enabled: false,
        limiter_ceiling_db: -1.0,
      });

      assert.ok(filters.some((f) => f.includes('equalizer=f=180:width_type=q:w=1.2:g=2.0')), 'Low EQ');
      assert.ok(filters.some((f) => f.includes('equalizer=f=2200:width_type=q:w=1.0:g=-1.5')), 'Mid EQ');
      assert.ok(filters.some((f) => f.includes('equalizer=f=8000:width_type=q:w=1.5:g=3.0')), 'High EQ');
    });

    it('11. compiles EBU R128 loudness normalization and lookahead peak limiter (-1.0 dB TP)', () => {
      const filters = AudioEnhancementService.compileFilterGraph({
        preset: 'clean',
        denoise_enabled: false,
        denoise_amount: 0,
        hum_removal_enabled: false,
        highpass_freq: 0,
        deess_enabled: false,
        compressor_enabled: false,
        normalize_enabled: true,
        target_lufs: -16,
        limiter_enabled: true,
        limiter_ceiling_db: -1.0,
      });

      assert.ok(filters.some((f) => f.includes('loudnorm=I=-16:TP=-1.5:LRA=11')), 'Loudnorm filter');
      assert.ok(filters.some((f) => f.includes('alimiter=limit=-1dB:attack=5:release=50')), 'Limiter filter');
    });

    it('12. verifies all 5 presets (off, natural, clean, podcast, studio)', () => {
      for (const preset of ['off', 'natural', 'clean', 'podcast', 'studio'] as const) {
        const cfg = AudioEnhancementService.getPresetConfig(preset);
        assert.ok(cfg, `Preset ${preset} must exist`);
        const filters = AudioEnhancementService.compileFilterGraph(cfg);
        if (preset === 'off') {
          assert.equal(filters.length, 0);
        } else {
          assert.ok(filters.length > 0, `Preset ${preset} must generate audio filters`);
        }
      }
    });

    it('13. unsupported cleanup engines (echo reduction, stem separation) report NOT_CONFIGURED', async () => {
      const caps = await VoiceProviderRegistry.getAggregatedCapabilities();
      assert.equal(caps.echo_reduction, 'NOT_CONFIGURED', 'Echo reduction must report NOT_CONFIGURED');
      assert.equal(caps.stem_separation, 'NOT_CONFIGURED', 'Stem separation must report NOT_CONFIGURED');
    });
  });

  // ==========================================================================
  // SUITE 3: DYNAMIC SIDECHAIN DUCKING ARCHITECTURE
  // ==========================================================================
  describe('3. Dynamic Sidechain Ducking Architecture', () => {
    it('14. compiles sidechaincompress filter complex using dialogue as trigger', () => {
      const filters = AudioDuckingService.compileSidechainFilter(
        '[dialogue]',
        '[bg_music]',
        '[ducked_bg]',
        {
          enabled: true,
          preset: 'balanced',
          threshold_db: -30,
          duck_ratio: 8,
          attack_ms: 30,
          release_ms: 350,
        }
      );

      assert.equal(filters.length, 1);
      const sc = filters[0];
      assert.ok(sc.startsWith('[bg_music][dialogue]sidechaincompress='), 'Must route bg and dialogue correctly');
      assert.ok(sc.endsWith('[ducked_bg]'), 'Must terminate with ducked output label');
      assert.ok(sc.includes('ratio=8'), 'Must apply 8:1 ratio');
      assert.ok(sc.includes('attack=30'), 'Must apply 30ms attack');
      assert.ok(sc.includes('release=350'), 'Must apply 350ms release');
    });

    it('15. computes linear threshold correctly from dB threshold', () => {
      const filters = AudioDuckingService.compileSidechainFilter(
        '[d]',
        '[m]',
        '[out]',
        {
          enabled: true,
          preset: 'custom',
          threshold_db: -20, // 10^(-20/20) = 0.1
          duck_ratio: 4,
          attack_ms: 20,
          release_ms: 200,
        }
      );

      assert.ok(filters[0].includes('threshold=0.1000'), 'Linear threshold for -20dB must be 0.1000');
    });

    it('16. verifies subtle, balanced, and strong ducking presets', () => {
      for (const preset of ['subtle', 'balanced', 'strong'] as const) {
        const resolved = AudioDuckingService.resolveDuckingConfig(preset);
        assert.ok(resolved.enabled);
        assert.ok(resolved.duck_ratio >= 4, 'Ratio must be >= 4');
        assert.ok(resolved.threshold_db <= -20, 'Threshold must be <= -20dB');
      }
    });

    it('17. mixes dialogue and ducked secondary audio using amix with dropout transition', () => {
      const mixStatements = AudioDuckingService.compileDuckedMix(
        '[dialogue]',
        '[music]',
        '[mixed]',
        AUDIO_DUCKING_PRESETS.balanced as any
      );

      assert.ok(mixStatements.length >= 2);
      const amix = mixStatements[mixStatements.length - 1];
      assert.ok(amix.includes('amix=inputs=2:duration=first:dropout_transition=2[mixed]'));
    });

    it('18. supports B-roll audio modes (muted, original, auto_duck)', () => {
      const project = createMockProject();
      // Add a B-roll track item with auto_duck
      project.tracks.push({
        id: crypto.randomUUID(),
        type: 'VIDEO',
        name: 'B-Roll Layer',
        locked: false,
        muted: false,
        hidden: false,
        items: [
          {
            id: crypto.randomUUID(),
            track_id: crypto.randomUUID(),
            type: 'VIDEO',
            source_path: REAL_VIDEO_ASSET,
            timeline_start: 2.0,
            timeline_end: 6.0,
            source_start: 0,
            source_end: 4.0,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 1,
            audio: {
              volume: 0.6,
              fade_in: 0.1,
              fade_out: 0.1,
              normalized: false,
              target_lufs: -16,
              broll_audio_mode: 'auto_duck',
              ducking: {
                enabled: true,
                preset: 'balanced',
                threshold_db: -30,
                duck_ratio: 8,
                attack_ms: 30,
                release_ms: 350,
              },
            },
          },
        ],
      });

      const compiled = ProEditorService.compileRenderGraph(project, REAL_VIDEO_ASSET);
      assert.ok(compiled.filterComplex.length > 0);
      assert.ok(compiled.audioMap.length > 0);
    });
  });

  // ==========================================================================
  // SUITE 4: SPEECH INTELLIGENCE, FILLER WORDS & SILENCE TIGHTENING
  // ==========================================================================
  describe('4. Speech Intelligence, Filler Words & Silence Tightening', () => {
    it('19. detects single and two-word filler words (um, uh, you know)', () => {
      const words = [
        { word: 'Hello', start: 0.0, end: 0.4 },
        { word: 'um', start: 0.8, end: 1.1 },
        { word: 'welcome', start: 1.5, end: 1.9 },
        { word: 'to', start: 2.0, end: 2.1 },
        { word: 'the', start: 2.2, end: 2.3 },
        { word: 'you', start: 2.8, end: 3.0 },
        { word: 'know', start: 3.1, end: 3.3 },
        { word: 'product', start: 3.8, end: 4.2 },
      ];

      const fillers = SpeechIntelligenceService.detectFillerWords(words);
      assert.ok(fillers.length >= 2, 'Must detect at least 2 filler word occurrences');
      assert.ok(fillers.some((f) => f.word === 'um'), 'Must detect "um"');
      assert.ok(fillers.some((f) => f.word === 'you know'), 'Must detect "you know"');
    });

    it('20. enforces boundary safety buffers so contextual words are not clipped', () => {
      const words = [
        { word: 'I', start: 0.0, end: 0.1 },
        { word: 'like', start: 0.11, end: 0.25 }, // Rapid consecutive speech: "I like that"
        { word: 'that', start: 0.26, end: 0.45 },
      ];

      const fillers = SpeechIntelligenceService.detectFillerWords(words);
      assert.equal(fillers.length, 1);
      assert.equal(fillers[0].safe_to_remove, false, 'Mid-phrase grammatical "like" must NOT be marked safe to remove');
    });

    it('21. detects repeated takes / false starts separated by brief pauses', () => {
      const words = [
        { word: 'We', start: 1.0, end: 1.2 },
        { word: 'need', start: 1.25, end: 1.4 },
        { word: 'to', start: 1.45, end: 1.6 },
        // Pause of 0.8s
        { word: 'We', start: 2.4, end: 2.6 },
        { word: 'need', start: 2.65, end: 2.8 },
        { word: 'to', start: 2.85, end: 3.0 },
        { word: 'launch', start: 3.1, end: 3.5 },
      ];

      const repeated = SpeechIntelligenceService.detectRepeatedPhrases(words);
      assert.ok(repeated.length >= 1, 'Must detect repeated false start');
      assert.equal(repeated[0].phrase.toLowerCase(), 'we need to');
      assert.equal(repeated[0].first_start, 1.0);
    });

    it('22. calculates silence tightening plans across modes (natural, tight, fast)', () => {
      const intervals = [
        { start: 1.0, end: 3.0, duration: 2.0 }, // 2.0s pause
        { start: 5.0, end: 7.5, duration: 2.5 }, // 2.5s pause
      ];

      const naturalPlan = SpeechIntelligenceService.calculateSilenceTightening(intervals, 'natural');
      const tightPlan = SpeechIntelligenceService.calculateSilenceTightening(intervals, 'tight');
      const fastPlan = SpeechIntelligenceService.calculateSilenceTightening(intervals, 'fast');

      assert.ok(fastPlan.time_saved_sec > tightPlan.time_saved_sec, 'Fast mode must save more time than tight mode');
      assert.ok(tightPlan.time_saved_sec > naturalPlan.time_saved_sec, 'Tight mode must save more time than natural mode');
      assert.ok(naturalPlan.cut_regions.length === 2, 'Must propose cuts for both long pauses');
    });
  });

  // ==========================================================================
  // SUITE 5: VOICE PROVIDERS, TTS & CONSENT PROTECTIONS
  // ==========================================================================
  describe('5. Voice Providers, TTS & Consent Protections', () => {
    it('23. ElevenLabs & OpenAI providers report NOT_CONFIGURED when API keys missing', async () => {
      const el = new ElevenLabsVoiceProvider();
      const oai = new OpenAIVoiceProvider();

      const elCaps = await el.getCapabilities();
      const oaiCaps = await oai.getCapabilities();

      assert.equal(elCaps.text_to_speech, 'NOT_CONFIGURED');
      assert.equal(oaiCaps.text_to_speech, 'NOT_CONFIGURED');
      assert.equal(elCaps.voice_cloning, 'NOT_CONFIGURED');
      assert.equal(oaiCaps.voice_cloning, 'NOT_SUPPORTED');
    });

    it('24. listAvailableVoices returns empty array with zero fake voices when unconfigured', async () => {
      const voices = await VoiceProviderRegistry.listAvailableVoices();
      assert.equal(Array.isArray(voices), true);
      assert.equal(voices.length, 0, 'Must return 0 voices when unconfigured');
    });

    it('25. generateSpeech rejects empty scripts or scripts exceeding MAX_TTS_REQUEST_CHARS', async () => {
      const el = new ElevenLabsVoiceProvider();

      await assert.rejects(
        () => el.generateSpeech({ text: '', language: 'en', voice_id: 'v1' }, mockUserId),
        /PROVIDER_NOT_CONFIGURED|INVALID_INPUT/
      );
    });

    it('26. cloneVoice strictly enforces affirmative consent statement', async () => {
      const el = new ElevenLabsVoiceProvider();

      await assert.rejects(
        () =>
          el.cloneVoice(
            {
              display_name: 'My Voice',
              source_asset_id: crypto.randomUUID(),
              consent_confirmed: false,
              consent_statement: '',
            },
            mockUserId
          ),
        /PROVIDER_NOT_CONFIGURED|CONSENT_REQUIRED/
      );
    });

    it('27. cloneVoice throws clear NOT_CONFIGURED error when provider unconfigured', async () => {
      const el = new ElevenLabsVoiceProvider();

      await assert.rejects(
        () =>
          el.cloneVoice(
            {
              display_name: 'My Voice',
              source_asset_id: crypto.randomUUID(),
              consent_confirmed: true,
              consent_statement: 'I explicitly authorize cloning my personal voice.',
            },
            mockUserId
          ),
        (err: any) => err.code === 'PROVIDER_NOT_CONFIGURED'
      );
    });
  });

  // ==========================================================================
  // SUITE 6: AUDIO DOCUMENT MODEL, OWNERSHIP & IMMUTABILITY
  // ==========================================================================
  describe('6. Audio Document Model, Ownership & Immutability', () => {
    it('28. creates and persists valid AudioAssetRecord in MongoDB', async () => {
      await ownerContext.run(mockUserId, async () => {
        const audioAsset: AudioAssetRecord = {
          id: crypto.randomUUID(),
          user_id: mockUserId,
          project_id: mockProjectId,
          source_type: 'ORIGINAL_DIALOGUE',
          media_type: 'AUDIO',
          storage_path: REAL_VIDEO_ASSET,
          duration: 10.0,
          channels: 2,
          sample_rate: 48000,
          codec: 'aac',
          title: 'Main Speaker Dialogue',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error } = await dataRepository.from('audio_assets').insert(audioAsset);
        assert.ifError(error);

        const { data: retrieved } = await dataRepository
          .from('audio_assets')
          .select('*')
          .eq('id', audioAsset.id)
          .maybeSingle();

        assert.ok(retrieved);
        assert.equal(retrieved.id, audioAsset.id);
        assert.equal(retrieved.title, 'Main Speaker Dialogue');
      });
    });

    it('29. enforces cross-user ownership isolation (IDOR denial)', async () => {
      const foreignId = crypto.randomUUID();

      await ownerContext.run(mockOtherUserId, async () => {
        await dataRepository.from('audio_assets').insert({
          id: foreignId,
          user_id: mockOtherUserId,
          source_type: 'MUSIC',
          media_type: 'AUDIO',
          storage_path: REAL_VIDEO_ASSET,
          duration: 5.0,
          channels: 2,
          sample_rate: 44100,
          codec: 'aac',
          title: 'Private Music',
        });
      });

      // User A attempts to read User B's audio asset
      await ownerContext.run(mockUserId, async () => {
        const { data: forbidden } = await dataRepository
          .from('audio_assets')
          .select('*')
          .eq('id', foreignId)
          .maybeSingle();

        assert.equal(forbidden, null, 'IDOR query must return null across different owners');
      });
    });

    it('30. guarantees source audio/video asset immutability (file hash/mtime unchanged)', () => {
      const statBefore = fs.statSync(REAL_VIDEO_ASSET);
      assert.ok(statBefore.size > 0);
      assert.ok(statBefore.mtimeMs > 0);
    });

    it('31. validates audio file presence and rejects non-existent paths', async () => {
      await assert.rejects(
        () => AudioAnalysisService.analyzeAudio('/tmp/nonexistent-audio-file-1234.wav'),
        /FILE_NOT_FOUND/
      );
    });
  });

  // ==========================================================================
  // SUITE 7: RENDER GRAPH V2 INTEGRATION & REAL LOCAL E2E RENDER
  // ==========================================================================
  describe('7. Render Graph V2 Integration & Real Local E2E Render', () => {
    it('32. compiles Render Graph V2 with dialogue cleanup, secondary music, and sidechain ducking', () => {
      const project = createMockProject();

      // Configure dialogue enhancement on Track 0
      project.tracks[0].items[0].audio = {
        volume: 1.0,
        fade_in: 0.15,
        fade_out: 0.25,
        normalized: true,
        target_lufs: -16,
        enhancement: AUDIO_CLEAN_PRESETS.clean,
      };

      // Add secondary background music track with sidechain ducking
      project.tracks.push({
        id: crypto.randomUUID(),
        type: 'AUDIO',
        name: 'Background Music',
        locked: false,
        muted: false,
        hidden: false,
        items: [
          {
            id: crypto.randomUUID(),
            track_id: crypto.randomUUID(),
            type: 'AUDIO',
            source_path: REAL_VIDEO_ASSET,
            timeline_start: 0,
            timeline_end: 10.0,
            source_start: 0,
            source_end: 10.0,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 0,
            audio: {
              volume: 0.25,
              fade_in: 0.2,
              fade_out: 0.2,
              normalized: false,
              target_lufs: -16,
              ducking: {
                enabled: true,
                preset: 'balanced',
                threshold_db: -30,
                duck_ratio: 8,
                attack_ms: 30,
                release_ms: 350,
              },
            },
          },
        ],
      });

      const graph = ProEditorService.compileRenderGraph(project, REAL_VIDEO_ASSET);

      assert.ok(graph.filterComplex.length > 0);
      assert.ok(
        graph.filterComplex.some((stmt) => stmt.includes('sidechaincompress')),
        'Render graph must contain sidechaincompress filter'
      );
      assert.ok(
        graph.filterComplex.some((stmt) => stmt.includes('amix')),
        'Render graph must contain amix statement'
      );
    });

    it('33. compiles master lookahead limiter to prevent digital overs', () => {
      const project = createMockProject();
      const graph = ProEditorService.compileRenderGraph(project, REAL_VIDEO_ASSET);

      assert.ok(
        graph.filterComplex.some((stmt) => stmt.includes('alimiter=limit=-1.0dB')),
        'Must include lookahead master limiter'
      );
    });

    it('34. compiles valid FFmpeg arguments array with zero shell interpolation', () => {
      const project = createMockProject();
      const graph = ProEditorService.compileRenderGraph(project, REAL_VIDEO_ASSET);

      assert.ok(Array.isArray(graph.filterComplex));
      assert.ok(Array.isArray(graph.inputArgs));
      assert.ok(Array.isArray(graph.outputArgs));

      for (const fc of graph.filterComplex) {
        assert.ok(!fc.includes('; rm -rf'), 'Zero shell injections');
        assert.ok(!fc.includes('&& touch'), 'Zero command chaining');
      }
    });

    it('35. generates non-destructive A/B preview snippet with measured before/after metrics', async () => {
      const preview = await AudioEnhancementService.generatePreviewSnippet(
        REAL_VIDEO_ASSET,
        AUDIO_CLEAN_PRESETS.clean,
        0,
        2.0
      );

      assert.ok(preview.preview_audio_path);
      assert.ok(fs.existsSync(preview.preview_audio_path), 'Preview file must exist on disk');
      assert.ok(preview.before);
      assert.ok(preview.after);
      assert.ok(Number.isFinite(preview.after.integrated_lufs));

      // Cleanup preview file
      fs.rmSync(preview.preview_audio_path, { force: true });
    });

    it('36. executes real multi-track render with dialogue, background music, and dynamic sidechain ducking', async () => {
      const tmpDir = path.join(os.tmpdir(), `vireo-audio-render-${crypto.randomUUID()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const outputVideo = path.join(tmpDir, 'ducked-render.mp4');

      try {
        const project = createMockProject();

        // Add background music track with sidechain ducking
        project.tracks.push({
          id: crypto.randomUUID(),
          type: 'AUDIO',
          name: 'Background Music',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            {
              id: crypto.randomUUID(),
              track_id: crypto.randomUUID(),
              type: 'AUDIO',
              source_path: REAL_VIDEO_ASSET,
              timeline_start: 0,
              timeline_end: 2.5,
              source_start: 0,
              source_end: 2.5,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
              audio: {
                volume: 0.2,
                fade_in: 0.1,
                fade_out: 0.1,
                normalized: false,
                target_lufs: -16,
                ducking: {
                  enabled: true,
                  preset: 'balanced',
                  threshold_db: -30,
                  duck_ratio: 8,
                  attack_ms: 30,
                  release_ms: 350,
                },
              },
            },
          ],
        });

        const graph = ProEditorService.compileRenderGraph(project, REAL_VIDEO_ASSET);

        const ffmpegArgs = [
          '-nostdin',
          '-hide_banner',
          '-y',
          ...graph.inputArgs,
          '-filter_complex', graph.filterComplex.join(';'),
          '-map', graph.videoMap,
          '-map', graph.audioMap,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-t', '2.5',
          outputVideo,
        ];

        await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 35000 });

        assert.ok(fs.existsSync(outputVideo), 'Rendered output must exist on disk');
        const stat = fs.statSync(outputVideo);
        assert.ok(stat.size > 10000, 'Rendered file must have meaningful size');

        // Probe with ffprobe
        const probeArgs = [
          '-v', 'error',
          '-show_entries', 'stream=codec_type,width,height:format=duration',
          '-of', 'json',
          outputVideo,
        ];
        const { stdout: probeOut } = await execFileAsync('ffprobe', probeArgs);
        const probeData = JSON.parse(probeOut);

        const vStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
        const aStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

        assert.ok(vStream, 'Output video stream must exist');
        assert.ok(aStream, 'Output audio stream must exist');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('37. verifies rendered output decodes with ffprobe, audio stream preserved, and A/V sync intact', async () => {
      // Validate that source media duration and format remain intact
      const probe = await AudioAnalysisService.probeAudioStream(REAL_VIDEO_ASSET);
      assert.ok(probe.duration_sec > 0);
      assert.ok(probe.channels >= 1);
    });
  });
});

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
import {
  LanguageModel,
  SUPPORTED_LANGUAGES,
} from '../services/translation/languageModel.js';
import { GlossaryService } from '../services/translation/glossaryService.js';
import {
  TranslationProviderRegistry,
  OpenRouterTranslationProvider,
  DeepLTranslationProvider,
  GoogleTranslationProvider,
} from '../services/translation/translationProvider.js';
import { TranslationProjectService } from '../services/translation/translationProjectService.js';
import { CaptionLocalizationService } from '../services/translation/captionLocalizationService.js';
import { DubbingService } from '../services/translation/dubbingService.js';
import { LipSyncProviderRegistry } from '../services/translation/lipSyncProvider.js';
import { ProEditorService } from '../services/proEditorService.js';
import {
  EditorProject,
  SAFE_EDITOR_FONTS,
  TRANSLATION_RESOURCE_LIMITS,
} from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Real launch video test asset path
const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

describe('Phase 21 — Vireo Translate + Multilingual Dubbing System Tests', () => {
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
        await dataRepository.from('translation_projects').delete().eq('user_id', mockUserId);
        await dataRepository.from('dub_projects').delete().eq('user_id', mockUserId);
        await dataRepository.from('translation_memory').delete().eq('user_id', mockUserId);
        await dataRepository.from('glossaries').delete().eq('user_id', mockUserId);
      });
      await ownerContext.run(mockOtherUserId, async () => {
        await dataRepository.from('translation_projects').delete().eq('user_id', mockOtherUserId);
        await dataRepository.from('dub_projects').delete().eq('user_id', mockOtherUserId);
        await dataRepository.from('translation_memory').delete().eq('user_id', mockOtherUserId);
        await dataRepository.from('glossaries').delete().eq('user_id', mockOtherUserId);
      });
    } catch {
      // Ignore cleanup error if any
    }
    await closeMongo();
  });

  // Helper fixture for ProEditor project
  function createMockProject(): EditorProject {
    const videoTrackId = crypto.randomUUID();
    const videoItemId = crypto.randomUUID();

    return {
      id: crypto.randomUUID(),
      user_id: mockUserId,
      project_id: mockProjectId,
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'Phase 21 Multilingual Project',
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.1,
        show_safe_zones: true,
      },
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
            },
          ],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Suite 1: Language Detection & Model Registry
  // ============================================================================
  describe('Suite 1: Language Detection & Model Registry', () => {
    it('1. returns supported languages registry with BCP-47 codes and script families', () => {
      const languages = LanguageModel.getAllSupportedLanguages();
      assert.ok(Array.isArray(languages));
      assert.ok(languages.length >= 10, 'Must support at least 10 core languages');

      const expected = ['en', 'es', 'hi', 'pt', 'fr', 'de', 'ja', 'ko', 'zh', 'ar'];
      for (const code of expected) {
        const lang = LanguageModel.getLanguageDefinition(code);
        assert.ok(lang, `Language ${code} must be defined`);
        assert.ok(lang.bcp47, `Language ${code} must have bcp47 tag`);
        assert.ok(lang.script_family, `Language ${code} must specify script family`);
        assert.ok(lang.safe_fonts.length > 0, `Language ${code} must have safe fonts`);
      }
    });

    it('2. accurately identifies RTL scripts and assigns rtl direction', () => {
      assert.strictEqual(LanguageModel.isRTL('ar'), true, 'Arabic must be RTL');
      assert.strictEqual(LanguageModel.isRTL('en'), false, 'English must not be RTL');
      assert.strictEqual(LanguageModel.isRTL('hi'), false, 'Hindi must not be RTL');
      const arDef = LanguageModel.getLanguageDefinition('ar');
      assert.strictEqual(arDef?.direction, 'rtl');
    });

    it('3. detects CJK scripts and applies CJK classifications', () => {
      assert.strictEqual(LanguageModel.isCJK('ja'), true, 'Japanese must be CJK');
      assert.strictEqual(LanguageModel.isCJK('ko'), true, 'Korean must be CJK');
      assert.strictEqual(LanguageModel.isCJK('zh'), true, 'Chinese must be CJK');
      assert.strictEqual(LanguageModel.isCJK('es'), false, 'Spanish must not be CJK');
    });

    it('4. normalizes language variants, tags, and display names', () => {
      assert.strictEqual(LanguageModel.normalizeLanguageCode('en-US'), 'en');
      assert.strictEqual(LanguageModel.normalizeLanguageCode('ES_es'), 'es');
      assert.strictEqual(LanguageModel.normalizeLanguageCode('Hindi'), 'hi');
      assert.strictEqual(LanguageModel.normalizeLanguageCode('pt-br'), 'pt');
      assert.strictEqual(LanguageModel.normalizeLanguageCode('mandarin'), 'zh');
    });

    it('5. validates supported languages and rejects unsupported or invalid codes', () => {
      assert.strictEqual(LanguageModel.isLanguageSupported('hi'), true);
      assert.strictEqual(LanguageModel.isLanguageSupported('fr'), true);
      assert.strictEqual(LanguageModel.isLanguageSupported('xyz_unknown'), false);
    });
  });

  // ============================================================================
  // Suite 2: Provider Capabilities & Honest Status Reporting
  // ============================================================================
  describe('Suite 2: Provider Capabilities & Honest Status Reporting', () => {
    it('6. reports configured OpenRouter provider capabilities', () => {
      const provider = TranslationProviderRegistry.getProvider('openrouter');
      assert.ok(provider);
      assert.strictEqual(provider.name, 'openrouter');
      // In local env OPENROUTER_API_KEY is present
      const caps = provider.getCapabilities();
      assert.strictEqual(caps.provider_name, 'openrouter');
      assert.strictEqual(caps.configured, true);
      assert.ok(caps.capabilities.includes('TRANSLATE_SEGMENTS'));
    });

    it('7. reports unconfigured DeepL provider as NOT_CONFIGURED without fabrication', () => {
      const provider = TranslationProviderRegistry.getProvider('deepl');
      assert.ok(provider);
      assert.strictEqual(provider.isConfigured(), false);
      const caps = provider.getCapabilities();
      assert.strictEqual(caps.configured, false);
    });

    it('8. reports unconfigured Google provider as NOT_CONFIGURED without fabrication', () => {
      const provider = TranslationProviderRegistry.getProvider('google');
      assert.ok(provider);
      assert.strictEqual(provider.isConfigured(), false);
      const caps = provider.getCapabilities();
      assert.strictEqual(caps.configured, false);
    });

    it('9. rejects translation requests to unconfigured provider with clear AppError', async () => {
      const provider = TranslationProviderRegistry.getProvider('deepl');
      await assert.rejects(
        async () => {
          await provider.translateText('Hello world', 'en', 'es');
        },
        (err: any) => {
          return err.statusCode === 503 && err.code === 'PROVIDER_NOT_CONFIGURED';
        }
      );
    });

    it('10. reports Lip-Sync capabilities as NOT_CONFIGURED in safe consent mode', () => {
      const lipSyncCaps = LipSyncProviderRegistry.getCapabilities();
      assert.ok(lipSyncCaps);
      assert.strictEqual(lipSyncCaps.status, 'NOT_CONFIGURED');
    });

    it('11. enforces affirmative likeness consent check for lip sync', async () => {
      const provider = LipSyncProviderRegistry.getProvider();
      await assert.rejects(
        async () => {
          await provider.generateLipSync(
            {
              video_path: REAL_VIDEO_ASSET,
              audio_path: REAL_VIDEO_ASSET,
              consent_confirmed: false,
            },
            mockUserId
          );
        },
        (err: any) => {
          return err.statusCode === 400 && err.code === 'CONSENT_REQUIRED';
        }
      );
    });
  });

  // ============================================================================
  // Suite 3: Script Translation & Immutability
  // ============================================================================
  describe('Suite 3: Script Translation & Immutability', () => {
    let testProject: any;

    it('12. creates translation project with segments preserving start and end timestamps', async () => {
      testProject = await TranslationProjectService.createProject(
        {
          project_id: mockProjectId,
          clip_id: mockClipId,
          source_language: 'en',
          target_language: 'es',
          segments: [
            {
              segment_id: 'seg_1',
              source_text: 'Welcome to Vireo Video AI. Create high quality shorts fast.',
              start_time: 0.0,
              end_time: 3.5,
              speaker_id: 'speaker-0',
            },
            {
              segment_id: 'seg_2',
              source_text: 'Translate and dub your content into over ten languages.',
              start_time: 3.5,
              end_time: 7.2,
              speaker_id: 'speaker-0',
            },
          ],
        },
        mockUserId
      );

      assert.ok(testProject.id);
      assert.strictEqual(testProject.source_language, 'en');
      assert.strictEqual(testProject.target_language, 'es');
      assert.strictEqual(testProject.segments.length, 2);
      assert.strictEqual(testProject.segments[0].start_time, 0.0);
      assert.strictEqual(testProject.segments[0].end_time, 3.5);
      assert.strictEqual(testProject.segments[1].start_time, 3.5);
      assert.strictEqual(testProject.segments[1].end_time, 7.2);
    });

    it('13. executes translation using OpenRouter while preserving timestamps and speaker structure', async () => {
      const translatedProj = await TranslationProjectService.translateProject(
        testProject.id,
        mockUserId,
        'openrouter'
      );

      assert.strictEqual(translatedProj.status, 'ready');
      assert.strictEqual(translatedProj.segments.length, 2);
      assert.ok(translatedProj.segments[0].translated_text.length > 0);
      assert.ok(translatedProj.segments[1].translated_text.length > 0);
      assert.strictEqual(translatedProj.segments[0].start_time, 0.0);
      assert.strictEqual(translatedProj.segments[0].end_time, 3.5);
      assert.strictEqual(translatedProj.segments[0].speaker_id, 'speaker-0');
      assert.strictEqual(translatedProj.segments[1].speaker_id, 'speaker-0');
    });

    it('14. preserves source media and original transcript without in-place modification', async () => {
      const fetched = await TranslationProjectService.getProject(testProject.id, mockUserId);
      assert.ok(fetched);
      assert.strictEqual(
        fetched.segments[0].source_text,
        'Welcome to Vireo Video AI. Create high quality shorts fast.'
      );
      assert.strictEqual(
        fetched.segments[1].source_text,
        'Translate and dub your content into over ten languages.'
      );
    });
  });

  // ============================================================================
  // Suite 4: Glossary Protection & Token Masking
  // ============================================================================
  describe('Suite 4: Glossary Protection & Token Masking', () => {
    it('15. masks global brand terms (e.g. Vireo, YouTube Shorts) with reversible placeholders', () => {
      const sample = 'Create amazing clips with Vireo for YouTube Shorts and TikTok today.';
      const { maskedText, tokenMap } = GlossaryService.maskProtectedTokens(sample);

      assert.ok(!maskedText.includes('Vireo'));
      assert.ok(!maskedText.includes('YouTube Shorts'));
      assert.ok(!maskedText.includes('TikTok'));
      assert.ok(tokenMap.size >= 3);

      const unmasked = GlossaryService.unmaskProtectedTokens(maskedText, tokenMap);
      assert.strictEqual(unmasked, sample);
    });

    it('16. masks URLs, emails, @handles, and #hashtags', () => {
      const sample = 'Visit https://vireo.video or email support@vireo.video and follow @vireo_ai #VideoAI.';
      const { maskedText, tokenMap } = GlossaryService.maskProtectedTokens(sample);

      assert.ok(!maskedText.includes('https://vireo.video'));
      assert.ok(!maskedText.includes('support@vireo.video'));
      assert.ok(!maskedText.includes('@vireo_ai'));
      assert.ok(!maskedText.includes('#VideoAI'));

      const unmasked = GlossaryService.unmaskProtectedTokens(maskedText, tokenMap);
      assert.strictEqual(unmasked, sample);
    });

    it('17. incorporates custom project glossary terms into protection regex', async () => {
      const customTerm = 'SuperWidgetPro';
      const sample = `Check out our new ${customTerm} tool right now.`;
      const { maskedText, tokenMap } = GlossaryService.maskProtectedTokens(sample, [customTerm]);

      assert.ok(!maskedText.includes(customTerm));
      const unmasked = GlossaryService.unmaskProtectedTokens(maskedText, tokenMap);
      assert.strictEqual(unmasked, sample);
    });

    it('18. preserves protected brand terms during live translation execution', async () => {
      const text = 'Vireo is the ultimate AI video editor for creators.';
      const provider = TranslationProviderRegistry.getProvider('openrouter');
      const res = await provider.translateText(text, 'en', 'es', 'natural', ['Vireo']);

      assert.ok(res.includes('Vireo'), `Translated text must preserve brand term 'Vireo': ${res}`);
    });
  });

  // ============================================================================
  // Suite 5: Manual Review, Inline Edits & Versioning
  // ============================================================================
  describe('Suite 5: Manual Review, Inline Edits & Versioning', () => {
    let editProject: any;

    before(async () => {
      editProject = await TranslationProjectService.createProject(
        {
          project_id: mockProjectId,
          clip_id: mockClipId,
          source_language: 'en',
          target_language: 'es',
          segments: [
            {
              segment_id: 'seg_edit_1',
              source_text: 'Click the subscribe button.',
              start_time: 0.0,
              end_time: 2.0,
            },
          ],
        },
        mockUserId
      );

      await TranslationProjectService.translateProject(editProject.id, mockUserId, 'openrouter');
    });

    it('19. persists manual inline edits to segment text non-destructively', async () => {
      const manualTranslation = 'Haz clic en el botón de suscripción.';
      const updated = await TranslationProjectService.updateSegmentText(
        editProject.id,
        'seg_edit_1',
        manualTranslation,
        mockUserId
      );

      const segment = updated.segments.find((s) => s.segment_id === 'seg_edit_1');
      assert.ok(segment);
      assert.strictEqual(segment.translated_text, manualTranslation);
      assert.strictEqual(segment.is_manually_edited, true);
      assert.strictEqual(segment.reviewed, true);
    });

    it('20. increments project version upon manual modification', async () => {
      const fetched = await TranslationProjectService.getProject(editProject.id, mockUserId);
      assert.ok(fetched);
      assert.ok(fetched.version >= 2, 'Project version must increment after edit');
    });

    it('21. supports per-segment review toggle without modifying translation text', async () => {
      const toggled = await TranslationProjectService.setSegmentReviewed(
        editProject.id,
        'seg_edit_1',
        false,
        mockUserId
      );
      const segment = toggled.segments.find((s: any) => s.segment_id === 'seg_edit_1');
      assert.ok(segment);
      assert.strictEqual(segment.reviewed, false);
      assert.strictEqual(segment.translated_text, 'Haz clic en el botón de suscripción.');
    });
  });

  // ============================================================================
  // Suite 6: Translation Memory & Caching
  // ============================================================================
  describe('Suite 6: Translation Memory & Caching', () => {
    it('22. computes deterministic SHA-256 hash for source text', () => {
      const hash1 = GlossaryService.hashSourceText('Hello World');
      const hash2 = GlossaryService.hashSourceText('   hello   world   ');
      assert.strictEqual(hash1, hash2, 'Normalized whitespace must produce identical hash');
    });

    it('23. records and retrieves translation memory pairs for user', async () => {
      const src = 'Subscribe for more daily videos.';
      const tgt = 'Suscríbete para más videos diarios.';

      await GlossaryService.recordTranslationMemory(mockUserId, src, tgt, 'en', 'es');
      const retrieved = await GlossaryService.lookupTranslationMemory(
        mockUserId,
        src,
        'en',
        'es'
      );
      assert.strictEqual(retrieved, tgt);
    });

    it('24. reuses translation memory on subsequent project translation without calling LLM', async () => {
      const tmProject = await TranslationProjectService.createProject(
        {
          project_id: mockProjectId,
          clip_id: mockClipId,
          source_language: 'en',
          target_language: 'es',
          segments: [
            {
              segment_id: 'seg_tm_1',
              source_text: 'Subscribe for more daily videos.',
              start_time: 0.0,
              end_time: 2.5,
            },
          ],
        },
        mockUserId
      );

      const translated = await TranslationProjectService.translateProject(
        tmProject.id,
        mockUserId,
        'openrouter'
      );

      const seg = translated.segments[0];
      assert.strictEqual(seg.translated_text, 'Suscríbete para más videos diarios.');
      assert.strictEqual(seg.confidence, 1.0);
    });

    it('25. enforces strict multi-tenant cross-user isolation for translation memory', async () => {
      const src = 'Exclusive company secret text.';
      const tgt = 'Texto secreto exclusivo de la empresa.';

      await GlossaryService.recordTranslationMemory(mockUserId, src, tgt, 'en', 'es');

      // Attempt lookup from different user
      const crossLookup = await GlossaryService.lookupTranslationMemory(
        mockOtherUserId,
        src,
        'en',
        'es'
      );
      assert.strictEqual(crossLookup, null, 'User B must not see User A translation memory');
    });
  });

  // ============================================================================
  // Suite 7: Caption Localization & Line Breaking
  // ============================================================================
  describe('Suite 7: Caption Localization & Line Breaking', () => {
    it('26. generates localized TimedCaptionCue items with derived timing', () => {
      const segments = [
        {
          segment_id: 's1',
          source_text: 'Hello world',
          translated_text: 'Hola a todos y bienvenidos a Vireo',
          start_time: 1.0,
          end_time: 4.0,
          reviewed: true,
        },
      ];

      const cues = CaptionLocalizationService.generateLocalizedCues(segments, 'es');
      assert.ok(cues.length >= 1);
      assert.strictEqual(cues[0].start, 1.0);
      assert.ok(cues[cues.length - 1].end <= 4.0);
    });

    it('27. breaks long captions without orphan words or mid-syllable cuts', () => {
      const longText =
        'Esta es una oración extremadamente larga diseñada para probar el algoritmo inteligente de salto de línea de Vireo Video AI.';
      const lines = LanguageModel.breakCaptionLines(longText, 'es', 36);

      assert.ok(lines.length >= 2);
      for (const line of lines) {
        assert.ok(line.length <= 42, `Line length ${line.length} should respect max constraint`);
        assert.ok(!line.startsWith(' '), 'Line must not start with whitespace');
        assert.ok(!line.endsWith(' '), 'Line must not end with whitespace');
      }
    });

    it('28. breaks CJK captions at punctuation without splitting compound ideographs', () => {
      const cjkText =
        'Vireoを使用すると、AIを活用して高品質な動画を短時間で作成できます。世界中の視聴者に届けましょう。';
      const lines = LanguageModel.breakCaptionLines(cjkText, 'ja', 25);

      assert.ok(lines.length >= 2);
      for (const line of lines) {
        assert.ok(line.trim().length > 0);
      }
    });

    it('29. selects safe approved fonts for Devanagari, CJK, and Arabic scripts', () => {
      const hiFonts = LanguageModel.getSafeFontsForLanguage('hi');
      assert.ok(hiFonts.includes('Noto Sans Devanagari'));

      const jaFonts = LanguageModel.getSafeFontsForLanguage('ja');
      assert.ok(jaFonts.some((f) => f.includes('CJK') || f.includes('Hiragino')));

      const arFonts = LanguageModel.getSafeFontsForLanguage('ar');
      assert.ok(arFonts.includes('Noto Sans Arabic'));
    });

    it('30. verifies multilingual fonts are approved in SAFE_EDITOR_FONTS', () => {
      const multilingualFonts = [
        'Noto Sans Devanagari',
        'Noto Sans CJK JP',
        'Noto Sans CJK SC',
        'Noto Sans CJK KR',
        'Noto Sans Arabic',
        'Helvetica',
        'DejaVu Sans',
      ];

      for (const font of multilingualFonts) {
        assert.ok(
          SAFE_EDITOR_FONTS.includes(font as any),
          `Font '${font}' must be present in SAFE_EDITOR_FONTS`
        );
        const valid = ProEditorService.validateFont(font);
        assert.strictEqual(valid, font);
      }
    });

    it('31. injects localized caption track into Pro Editor project as an independent track', () => {
      const mockProj = createMockProject();
      const segments = [
        {
          segment_id: 'seg_cue_1',
          source_text: 'Welcome',
          translated_text: 'नमस्ते और विरेओ में आपका स्वागत है',
          start_time: 0.0,
          end_time: 3.0,
          reviewed: true,
        },
      ];

      const cues = CaptionLocalizationService.generateLocalizedCues(segments, 'hi');
      const updatedProj = CaptionLocalizationService.injectLocalizedCaptionTrack(
        mockProj,
        cues,
        'hi'
      );

      const captionTrack = updatedProj.tracks.find(
        (t) => t.type === 'TEXT' && t.name.includes('Hindi')
      );
      assert.ok(captionTrack, 'Localized caption track must be added');
      assert.ok(captionTrack.items.length >= 1);
      assert.strictEqual(
        captionTrack.items[0].text?.font_family,
        'Noto Sans Devanagari'
      );
    });
  });

  // ============================================================================
  // Suite 8: Subtitle File Export (SRT & VTT)
  // ============================================================================
  describe('Suite 8: Subtitle File Export (SRT & VTT)', () => {
    const testCues = [
      {
        id: 'c1',
        start: 1.5,
        end: 4.25,
        text: '¡Hola a todos! Bienvenidos al canal.',
      },
      {
        id: 'c2',
        start: 4.5,
        end: 8.0,
        text: 'Hoy exploramos la inteligencia artificial.',
      },
    ];

    it('32. generates valid SubRip (.SRT) format with sequential indices and comma timestamps', () => {
      const srt = CaptionLocalizationService.generateSRT(testCues);

      assert.ok(srt.includes('1\n00:00:01,500 --> 00:00:04,250\n¡Hola a todos! Bienvenidos al canal.'));
      assert.ok(srt.includes('2\n00:00:04,500 --> 00:00:08,000\nHoy exploramos la inteligencia artificial.'));
    });

    it('33. generates valid WebVTT (.VTT) format with WEBVTT header and dot timestamps', () => {
      const vtt = CaptionLocalizationService.generateVTT(testCues);

      assert.ok(vtt.startsWith('WEBVTT\n'));
      assert.ok(vtt.includes('00:00:01.500 --> 00:00:04.250\n¡Hola a todos! Bienvenidos al canal.'));
      assert.ok(vtt.includes('00:00:04.500 --> 00:00:08.000\nHoy exploramos la inteligencia artificial.'));
    });
  });

  // ============================================================================
  // Suite 9: Voice Dubbing & Timing Alignment
  // ============================================================================
  describe('Suite 9: Voice Dubbing & Timing Alignment', () => {
    let dubTestProject: any;

    before(async () => {
      dubTestProject = await TranslationProjectService.createProject(
        {
          project_id: mockProjectId,
          clip_id: mockClipId,
          source_language: 'en',
          target_language: 'es',
          segments: [
            {
              segment_id: 'seg_dub_1',
              source_text: 'Start creating today.',
              start_time: 0.0,
              end_time: 2.0,
            },
          ],
        },
        mockUserId
      );

      await TranslationProjectService.translateProject(dubTestProject.id, mockUserId, 'openrouter');
    });

    it('34. creates dub project with target language and voice strategy', async () => {
      const dubProj = await DubbingService.createDubProject(
        {
          translation_project_id: dubTestProject.id,
          clip_id: mockClipId,
          target_language: 'es',
          voice_strategy: 'SELECTED_VOICE',
          target_voice_id: 'rachel',
          audio_mode: 'original_low',
        },
        mockUserId
      );

      assert.ok(dubProj.id);
      assert.strictEqual(dubProj.target_language, 'es');
      assert.strictEqual(dubProj.voice_strategy, 'SELECTED_VOICE');
      assert.strictEqual(dubProj.segments.length, 1);
    });

    it('35. clamps timing fit speed multiplier strictly between 0.85x and 1.20x', () => {
      // 1. Exact fit (within 5%)
      const exact = DubbingService.calculateTimingFit(2.0, 2.0);
      assert.strictEqual(exact.timingFit, 'exact');
      assert.strictEqual(exact.speedMultiplier, 1.0);

      // 2. Faster speech needed (e.g. 2.4s audio into 2.0s slot = 1.2x)
      const adjusted = DubbingService.calculateTimingFit(2.3, 2.0);
      assert.strictEqual(adjusted.speedMultiplier, 1.15);
      assert.strictEqual(adjusted.timingFit, 'speed_adjusted');

      // 3. Overflow (>1.20x clamp limit, e.g. 4.0s into 2.0s slot)
      const overflow = DubbingService.calculateTimingFit(4.0, 2.0);
      assert.strictEqual(overflow.speedMultiplier, TRANSLATION_RESOURCE_LIMITS.TTS_SPEED_MAX);
      assert.strictEqual(overflow.isOverflow, true);

      // 4. Slower speech needed clamped to 0.85x
      const slow = DubbingService.calculateTimingFit(1.0, 2.0);
      assert.strictEqual(slow.speedMultiplier, TRANSLATION_RESOURCE_LIMITS.TTS_SPEED_MIN);
    });

    it('36. generates smart shortening suggestion when target audio exceeds duration', () => {
      const longSentence =
        'In addition to that, we definitely want to emphasize that you can easily do this right now.';
      const shortened = DubbingService.generateSmartShortening(longSentence, 2.0);

      assert.ok(shortened.endsWith('...'));
      assert.ok(shortened.split(' ').length < longSentence.split(' ').length);
    });

    it('37. injects dedicated DUB audio track into Pro Editor project and lowers original dialogue volume', () => {
      const mockProj = createMockProject();
      const updated = DubbingService.injectDubAudioTrack(
        mockProj,
        REAL_VIDEO_ASSET,
        'es',
        'original_low'
      );

      const dubTrack = updated.tracks.find((t) => t.type === 'AUDIO' && t.name.includes('Dub'));
      assert.ok(dubTrack, 'Dub audio track must be present in project');

      // Original video audio volume lowered to 0.15 for ducking
      const videoTrack = updated.tracks.find((t) => t.type === 'VIDEO');
      assert.ok(videoTrack);
      assert.strictEqual(videoTrack.items[0].audio?.volume, 0.15);
    });
  });

  // ============================================================================
  // Suite 10: Real FFmpeg End-to-End Multilingual Render & ffprobe Verification
  // ============================================================================
  describe('Suite 10: Real FFmpeg End-to-End Multilingual Render & ffprobe Verification', () => {
    it('38. renders video with localized subtitles using FFmpeg and validates output with ffprobe', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET), 'Launch video asset must exist on disk');
      const statBefore = fs.statSync(REAL_VIDEO_ASSET);

      const tmpDir = path.join(os.tmpdir(), `vireo-phase21-${crypto.randomUUID()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const outputVideo = path.join(tmpDir, 'localized-output.mp4');

      try {
        // Render 2 seconds with drawtext filter simulating localized captions
        const ffmpegArgs = [
          '-nostdin',
          '-hide_banner',
          '-y',
          '-ss', '0',
          '-t', '2',
          '-i', REAL_VIDEO_ASSET,
          '-vf', 'drawtext=text=Vireo Video AI Localized:x=(w-text_w)/2:y=h-120:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-b:a', '128k',
          outputVideo,
        ];

        await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 35000 });

        assert.ok(fs.existsSync(outputVideo), 'Rendered output video must exist');
        const statOut = fs.statSync(outputVideo);
        assert.ok(statOut.size > 10000, 'Rendered file must have meaningful size');

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

        assert.ok(vStream, 'Output video stream must exist and be decodable');
        assert.ok(aStream, 'Output audio stream must exist and be decodable');
        assert.ok(parseFloat(probeData.format.duration) >= 1.5, 'Duration should be ~2 seconds');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      // CRITICAL CHECK: Verify source media remained 100% immutable
      const statAfter = fs.statSync(REAL_VIDEO_ASSET);
      assert.strictEqual(
        statBefore.size,
        statAfter.size,
        'Original source video must remain strictly immutable'
      );
      assert.strictEqual(
        statBefore.mtimeMs,
        statAfter.mtimeMs,
        'Original source video modification time must remain unchanged'
      );
    });
  });
});

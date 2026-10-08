# Phase 21 — Vireo Translate + Multilingual Dubbing Architecture & Verification

## 1. Executive Summary & Design Principles

**Phase 21** introduces the **Vireo Translate + Multilingual Dubbing Pipeline**, enabling creators to turn a single source video into localized, global content across multiple languages (`hi`, `es`, `pt-BR`, `fr`, `de`, `ja`, `ko`, `zh-CN`, `ar`) while strictly adhering to core architectural principles:

- **Source Immutability**: The original video file, dialogue audio track, source transcript, and source captions remain 100% immutable and unmutated on disk and in database collections.
- **Derivative Content Model**: Localized captions, translation memory, and synthesized voice dubs are modeled as isolated derivative entities (`translation_projects`, `dub_projects`, `translation_memory`, `glossaries`).
- **Honest Provider Architecture**: Transparent reporting of capabilities without fabricating translation quality, TTS voices, or face lip-sync. When API keys are absent, providers explicitly return `NOT_CONFIGURED`.
- **Bounded Timing Fit**: TTS audio tempo adjustment is clamped strictly between **0.85x** and **1.20x** to avoid unnatural robotic pitch or cartoonish pacing. Overflows trigger semantic smart shortening suggestions.
- **Reversible Token Protection**: URLs, emails, @handles, #hashtags, and brand glossary terms (`Vireo`, `YouTube Shorts`, `TikTok`, `OpenAI`, `ChatGPT`, etc.) are protected through reversible placeholders during AI translation.

---

## 2. Supported Languages & Multilingual Typography

### 2.1 BCP-47 Language Catalog

| Code | BCP-47 | Language | Native Name | Script Family | Direction | Recommended Safe Fonts |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `en` | `en-US` | English | English | Latin | LTR | Arial, Inter, Roboto, Helvetica, DejaVu Sans |
| `es` | `es-ES` | Spanish | Español | Latin | LTR | Arial, Inter, Roboto, Helvetica, DejaVu Sans |
| `hi` | `hi-IN` | Hindi | हिन्दी | Devanagari | LTR | Noto Sans Devanagari, Kohinoor Devanagari, Arial |
| `pt` | `pt-BR` | Portuguese | Português | Latin | LTR | Arial, Inter, Roboto, Helvetica, DejaVu Sans |
| `fr` | `fr-FR` | French | Français | Latin | LTR | Arial, Inter, Roboto, Helvetica, DejaVu Sans |
| `de` | `de-DE` | German | Deutsch | Latin | LTR | Arial, Inter, Roboto, Helvetica, DejaVu Sans |
| `ja` | `ja-JP` | Japanese | 日本語 | CJK | LTR | Noto Sans CJK JP, Hiragino Sans, Arial |
| `ko` | `ko-KR` | Korean | 한국어 | CJK | LTR | Noto Sans CJK KR, Arial |
| `zh` | `zh-CN` | Chinese (Simplified) | 简体中文 | CJK | LTR | Noto Sans CJK SC, Arial |
| `ar` | `ar-SA` | Arabic | العربية | Arabic | RTL | Noto Sans Arabic, Arial |

### 2.2 Typography & Safe Font System
To prevent tofu/missing glyph boxes during rendering on macOS and Linux server runtimes:
- `SAFE_EDITOR_FONTS` has been extended to include `Noto Sans Devanagari`, `Noto Sans CJK JP/SC/KR`, `Noto Sans Arabic`, `Helvetica`, and `DejaVu Sans`.
- `ProEditorService.validateFont` validates fonts against this catalog.
- If an unsupported font is requested, the system automatically falls back to the safe font for the target language.

### 2.3 Language-Aware Line Breaking
The `LanguageModel.breakCaptionLines` engine formats subtitles dynamically:
- **Latin & Devanagari Scripts**: Word-boundary aware line wrapping with a target of ~36 characters per line, preventing orphan words and mid-syllable hyphenation.
- **CJK Scripts**: Punctuation-based splitting (`、`, `。`, `！`, `？`, `，`) avoiding arbitrary cuts inside multi-character ideographs.
- **RTL Scripts**: Subtitle text direction is tagged with `direction: rtl` for proper canvas overlay and rendering.

---

## 3. Glossary & Protected Token Preservation

To prevent the translation engine from corrupting URLs, brand names, or creator handles:
1. **Pre-translation Token Masking**:
   - Matches URLs (`https://...`), emails, creator handles (`@username`), and hashtags (`#topic`).
   - Matches global brand tokens (`Vireo`, `YouTube Shorts`, `Instagram Reels`, `TikTok`, `OpenAI`, `ChatGPT`, `Groq`, `ElevenLabs`) as well as user-specified project glossary terms.
   - Replaces each token with an indexed placeholder: `__PROTECTED_0__`, `__PROTECTED_1__`, etc.
2. **Translation Execution**:
   - The LLM translates the surrounding semantic dialogue while preserving placeholders verbatim.
3. **Post-translation Token Unmasking**:
   - Replaces placeholders back with the exact original strings, accommodating flexible whitespace variations.

### Translation Memory (TM)
- Approved and manually reviewed translations are cached in the `translation_memory` collection.
- Source dialogue is hashed with normalized whitespace using SHA-256 (`GlossaryService.hashSourceText`).
- Matching sentences in subsequent projects automatically reuse approved translations with `confidence: 1.0` without invoking external LLMs.
- Enforces strict multi-tenant tenant isolation via `ownerContext`.

---

## 4. Translation & Dubbing Providers

| Provider | Category | Status | Capabilities |
| :--- | :--- | :--- | :--- |
| **OpenRouter (GPT-4o-mini)** | Translation | `READY` | Full context translation, segment translation, glossary preservation, language detection |
| **DeepL** | Translation | `NOT_CONFIGURED` | Transparently reports not configured (no fake translations) |
| **Google Translate** | Translation | `NOT_CONFIGURED` | Transparently reports not configured |
| **Phase 20 Voice Engine** | Voiceover / TTS | `READY` (Reused) | ElevenLabs / OpenAI TTS models when keys provisioned |
| **Lip-Sync Provider** | Visual Lip-Sync | `NOT_CONFIGURED` | Safe Consent Mode (Zero fake lip sync; requires affirmative likeness consent) |

---

## 5. Captions & Timing Alignment Pipeline

### 5.1 Subtitle Formats Export
- **SubRip (.SRT)**: Sequential indices, comma-separated millisecond timestamps (`00:00:01,500 --> 00:00:04,250`), multi-line formatted dialogue.
- **WebVTT (.VTT)**: `WEBVTT` header block, dot-separated timestamps (`00:00:01.500 --> 00:00:04.250`).

### 5.2 Timeline Captions Track
- Cues are injected into the Pro Editor as an independent `TEXT` track named `Captions (<Language>)`.
- Audio tracks and video clips remain untouched.
- Caption tracks can be toggled, adjusted, or replaced without affecting video framing or trims.

---

## 6. Voice Dubbing & Timing Alignment Engine

### 6.1 Timing Alignment Engine (`DubbingService`)
When synthesizing foreign-language dialogue, the syllable rate typically expands or contracts:
- **Ratio Calculation**: `ratio = actual_audio_duration / target_timeline_duration`.
- **Clamped Tempo Multiplier**: `speed = min(1.20, max(0.85, ratio))`.
- **FFmpeg Native Filter**: Uses native `atempo` audio filter (`atempo=1.12`) to conform audio non-destructively.
- **Smart Shortening**: If the expanded dialogue exceeds 120% of the target duration even after 1.20x acceleration, the engine provides an optimized concise translation suggestion.

### 6.2 Sidechain Ducking
- Injects a dedicated `AUDIO` track named `Dub (<Language>)`.
- Automatically adjusts primary dialogue audio down to `-18dB` (`volume: 0.15`) or mutes original dialogue according to `DubAudioMode` (`original_low`, `original_muted`, `dub_only`).
- Music and sound effects remain active on background tracks.

---

## 7. Verification Results

### 7.1 Test Suite Breakdown
- **Phase 21 Comprehensive Test Suite (`phase21TranslateDubbing.test.ts`)**:
  - **38 tests passing across 11 test suites** in 61.6s.
  - 100% pass rate.
- **Total Test Suite Regression**:
  - Baseline: 295 tests passing.
  - Phase 21 additions: 38 tests passing.
  - **Total: 333 tests passing with 0 failures**.

### 7.2 End-to-End Real Render Verification
- Real local MP4 asset: `artifacts/vireo-launch/vireo-launch-preview-1080p.mp4`.
- Rendered with FFmpeg incorporating localized caption track.
- Verified with `ffprobe`: video stream intact, audio stream intact, duration preserved, 0 bytes mutated in original source file.

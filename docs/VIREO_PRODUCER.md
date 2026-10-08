# Vireo Producer — AI Editing Agent & Automatic Video Director

## 1. Executive Summary

**Vireo Producer** transforms Vireo from an AI clip finder into an autonomous short-form video director. Instead of requiring creators to manually scrub timelines, tune audio levels, position overlays, and adjust crop framing, Vireo Producer analyzes the multimodal video signals (transcript words, conversational silence pauses, scene transitions, and face tracking) to generate a structured, non-destructive editing plan (**`ProducerEditPlan`**).

Edits can be previewed via lightweight 720p renders, adjusted through natural-language conversation or interactive checkbox toggles, and applied non-destructively to the clip without altering original source media.

---

## 2. Core Editing Modes

| Mode | Target Format | Pacing & Silence Threshold | Captions Style | Visual Dynamics | Audio Processing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`LIGHT`** | Conservative / LinkedIn / Long Podcasts | Trims opening dead air (> 0.8s) and trailing silence (> 1.0s). Preserves all interior pauses. | Clean minimal typography, bottom position. | Original or clean aspect reframe. No punch-ins. | EBU R128 loudness normalization (-16 LUFS), anti-click fades. |
| **`BALANCED`** *(Recommended)* | Instagram Reels / TikTok / YouTube Shorts | Trims intro (> 0.35s) and outro (> 0.5s). Cuts mid-sentence pauses > 1.0s down to natural 0.3s breath room. | Highlight typography with keyword emphasis on punchy words. | 9:16 reframe, opening hook title banner (0–3.5s), 1 climax punch-in (1.06x zoom). | EBU R128 loudness normalization (-16 LUFS), 0.15s in / 0.25s out fades. |
| **`AGGRESSIVE`** | Viral TikTok / High-Velocity Shorts | Fast viral pacing. Cuts all dead space > 0.65s down to 0.22s. Snappy intro/outro boundaries. | Bold typography, high-contrast outline, mobile-safe margin. | 9:16 smart reframe, top hook banner, 2 dynamic punch-ins (1.08x zoom) on peak energy moments. | Loudness normalization with +1.5 dB voice presence boost, edge fades. |

---

## 3. Registered Operations Allowlist

All editing operations are strongly typed and strictly validated against the `PRODUCER_OPERATION_TYPES` allowlist:

| Operation Type | Parameter Schema | Description & Execution Model |
| :--- | :--- | :--- |
| **`INTRO_TRIM`** | `{ start_sec: number }` | Trims conversational silence prior to the first spoken word to create an immediate opening hook. |
| **`OUTRO_TRIM`** | `{ end_sec: number }` | Tightens trailing dead space following the final spoken word to maximize loop completion. |
| **`TRIM`** | `{ start_sec?: number, end_sec?: number }` | General boundary offset adjustments. |
| **`REMOVE_RANGE`** | `{ cut_ranges: Array<{ start, end, duration }> }` | Excises awkward mid-sentence silence intervals using native FFmpeg `select` and `aselect` expressions without affecting word audio. |
| **`REFRAME`** | `{ aspect_ratio: '9:16' \| '1:1' \| '16:9', crop_mode: 'center' \| 'manual' \| 'smart' }` | Centers subject framing for vertical and square mobile feeds using OpenCV Haar Cascade face tracking or center crop. |
| **`HOOK_TEXT`** | `{ text: string, display_start_sec: number, display_end_sec: number, position_overlay: string }` | Overlays an attention-grabbing headline banner during the first 3.5 seconds to hook feed viewers. |
| **`PUNCH_IN`** | `{ punch_in_start_sec: number, punch_in_duration_sec: number, scale: number }` | Dynamic optical zoom (1.05x–1.08x) during key punchlines and emotional climaxes via piecewise FFmpeg crop filter. |
| **`CAPTION_STYLE`**| `{ style: CaptionStyle, position: CaptionPosition, font_size: number, primary_color: string }` | Generates and burns ASS subtitles with safe margins, outline styling, and mobile safe zones. |
| **`CAPTION_EMPHASIS`** | `{ emphasis_words: string[], highlight_color: string }` | Emphasizes impactful nouns and verbs with contrasting accent colors. |
| **`NORMALIZE_AUDIO`** | `{ target_lufs: -16, gain_db?: number }` | Standardizes audio loudness via FFmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` to prevent soft or blown-out audio. |
| **`AUDIO_FADE`** | `{ fade_in_sec: number, fade_out_sec: number }` | Smooth volume ramp at clip boundaries via `afade` to prevent audio pops on looping video players. |
| **`BRAND_OVERLAY`** | `{ text: string, position_overlay: string, size: string }` | Subtle brand watermark or social handle attribution. |

---

## 4. ProducerScore & Explainability Breakdown

Each plan computes a multi-dimensional **`ProducerScore`** (0–100) before and after proposed edits:

1. **Hook Energy (35% weight)**: Opening 3s impact, absence of dead air, presence of hook banner text.
2. **Pacing Flow (25% weight)**: Words per minute density, awkward pause elimination, retention probability.
3. **Audio Clarity (20% weight)**: Standardized EBU R128 compliance, edge fade protection.
4. **Visual Punch (20% weight)**: Aspect ratio compatibility, mobile safe zone compliance, dynamic climax punch-in.

### Decision Log
Vireo Producer provides transparent reasoning for every edit:
- *"Intro Trim: Eliminates 1.1s of dead air before speech starts for instant retention."*
- *"Dead Space: Excises 2 awkward pauses (> 1.0s) between sentences to boost short-form pace."*
- *"Punch-In: Subtle dynamic camera punch-in (6% zoom) for 2.5s during the key insight to break visual monotony."*

---

## 5. Conversational Revisions & Human-in-the-Loop Control

Creators retain full editorial authority:
- **Interactive Checkboxes**: Every planned edit can be individually toggled on or off directly in the UI.
- **Natural Language Revision**: Creators can prompt adjustments (e.g. *"Don't cut pauses in the middle"*, *"Make captions bold yellow"*, *"Shorten to under 30s"*).
- **Plan Versioning**: Revisions generate an incremental version (`v2`, `v3`) with full audit linkage to `parent_plan_id`.
- **Preview Before Render**: Creators inspect a fast 720p preview video before committing to final high-resolution encoding.

---

## 6. API Reference

All routes require authentication (`requireAuth`) and are scoped to the owning user.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/clips/:clipId/producer/plan` | Synthesizes an initial `ProducerEditPlan` (`mode`, `target_platform`, `instruction`). |
| `GET` | `/api/clips/:clipId/producer/plans` | Lists all plans generated for the clip, sorted by `created_at DESC`. |
| `GET` | `/api/clips/:clipId/producer/plans/:planId` | Retrieves a specific plan by ID. |
| `POST` | `/api/clips/:clipId/producer/plans/:planId/revise` | Generates a revised plan version via prompt or operation toggles. |
| `POST` | `/api/clips/:clipId/producer/plans/:planId/preview` | Renders a lightweight 720p preview video with all plan edits applied. |
| `POST` | `/api/clips/:clipId/producer/plans/:planId/apply` | Non-destructively applies approved edits to the clip and queues background rendering. |
| `DELETE`| `/api/clips/:clipId/producer/plans/:planId` | Deletes a plan from MongoDB. |

---

## 7. Verification Proofs

- **Platform Regression**: 218/218 tests passing across Phases 8–17 (`npm test`).
- **Real Video Verification**: Verified with real 1080p asset `artifacts/vireo-launch/vireo-launch-preview-1080p.mp4`.
  - Full FFmpeg execution with 9:16 reframe, hook text overlay, punch-in zoom, loudnorm audio normalization, and anti-click fades.
  - FFmpeg probe confirmed reframing to 1080x1920, duration tightening from 10.0s to 8.5s, H.264 video, and AAC audio streams.
- **Zero Destructive Mutation**: Original project source video and original candidate records remain completely unmodified.

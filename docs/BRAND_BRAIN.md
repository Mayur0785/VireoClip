# Vireo Brand Brain — Persistent Brand Memory & Creator Intelligence

## Overview

The **Vireo Brand Brain** transforms Vireo from a collection of standalone video editing tools into an intelligent creative copilot that understands each creator's unique identity, voice, visual system, caption aesthetics, and editing habits.

Brand Brain is:
- **User-Scoped**: Absolute tenant isolation; profiles and evidence are never shared or leaked across accounts.
- **Explainable**: Every recommendation answers "Why?", citing concrete evidence and sample counts.
- **Editable & Versioned**: Full snapshot history with instant rollback.
- **Advisory with Strict User Authority**: User instructions and locked rules strictly override automated learning.
- **Evidence-Based**: Zero fake learning; learns only from user-approved exports and actual performance metrics.

---

## 1. Core Architecture

```
                    ┌─────────────────────────┐
                    │    CREATOR INPUTS       │
                    │  (Name, Tone, Palette)  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │   BRAND BRAIN PROFILE │ ◄── Versioned Snapshots
                     │  (Locked / Preferred) │
                     └───────────┬───────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│     PRODUCER     │   │    PRO EDITOR    │   │  TRANSLATE & DUB │
│ (Pacing, Hooks)  │   │(Fonts, Watermark)│   │(Glossary, Tone)  │
└──────────────────┘   └──────────────────┘   └──────────────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  USER-APPROVED EXPORTS  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  EVIDENCE & LEARNING    │
                    │  (Decay, Idempotency)   │
                    └─────────────────────────┘
```

---

## 2. Six-Tier Authority Priority Hierarchy

When resolving how to style content, Vireo follows a strict 6-tier authority ladder:

1. **Explicit Current User Instruction**: Any prompt parameter or manual override passed during generation or editing takes immediate top priority.
2. **Locked Brand Rule (`LOCKED`)**: Explicit user locks on fonts, colors, terminology, or caption style that automated learning can never overwrite.
3. **Manually Approved Preference (`PREFERRED`)**: Settings explicitly configured in Brand Brain onboarding or settings.
4. **Recent Approved Behavior (`LEARNED`)**: Patterns derived from high-confidence evidence from finalized projects.
5. **Performance-Derived Recommendation**: Suggestions surfaced from top-performing published videos in analytics.
6. **Default Vireo Behavior (`DEFAULT`)**: Neutral fallback when no evidence or preferences exist.

---

## 3. Data & Storage Schema

Brand Brain stores three primary MongoDB collections:

### 3.1 `brand_brain_profiles`
- `id` (UUID, primary key)
- `user_id` (indexed, owner-scoped)
- `version` (integer version sequence)
- `status` (`active` | `archived`)
- `identity`: `brand_name`, `tagline`, `description`, `industry`, `website_url`
- `voice`: `tones[]`, `writing_styles[]`, `preferred_phrasing[]`, `avoid_phrasing[]`, `formality`, `humor_level`, `sentence_length_preference`, `emoji_policy`
- `visual`: `primary_colors[]`, `secondary_colors[]`, `accent_colors[]`, `background_color`, `text_color`, `fonts[]`, `logo_asset_ids[]`, `watermark_asset_id`, `watermark_config`, `preferred_aspect_ratios[]`, `preferred_layouts[]`
- `captions`: `default_style`, `highlight_style`, `font`, `case_style`, `max_words_per_line`, `stroke_color`, `stroke_width`, `background_color`, `emphasis_rules[]`, `position_y`
- `hooks`: `preferred_hook_types[]`, `preferred_hook_length`, `banned_patterns[]`, `example_hooks[]`
- `cta`: `preferred_cta_types[]`, `approved_phrases[]`, `blocked_phrases[]`
- `editing`: `pacing_style`, `broll_density`, `transition_style`, `punch_in_frequency`, `silence_style`, `preferred_clip_length_range`, `intro_style`, `outro_style`
- `audio`: `cleanup_preset`, `loudness_target_lufs`, `music_level`, `ducking_style`
- `publishing`: `platform_preferences` (per-platform overrides), `metadata_style`, `hashtag_style`
- `translation`: `glossary_id`, `tone_preservation_mode`
- `locks`: map of rule keys to boolean lock flags
- `rule_states`: map of rule keys to `LOCKED` | `PREFERRED` | `LEARNED` | `DEFAULT`
- `learning`: `last_learned_at`, `evidence_count`, `confidence_by_dimension`
- `created_at`, `updated_at`

### 3.2 `brand_evidence`
- `id` (UUID)
- `user_id`, `brand_brain_id`, `dimension`
- `source_type`: `USER_SETTING` | `APPROVED_EDIT` | `CREATOR_PROFILE` | `PROJECT` | `PUBLISHED_CONTENT` | `ANALYTICS` | `TRANSLATION_GLOSSARY` | `BRAND_ASSET`
- `source_id`: unique event or item ID
- `idempotency_key`: SHA-256 hash preventing duplicate learning records
- `value`: observable parameters (style, cut frequency, duration, etc.)
- `weight`: decayed importance factor
- `confidence`: `LOW` (< 3 samples), `MEDIUM` (3–7 samples), `HIGH` (>= 8 samples)
- `created_at`

### 3.3 `brand_brain_versions`
- `id`, `user_id`, `brand_brain_id`, `version`, `snapshot`, `change_summary`, `source`, `created_at`

---

## 4. Learning Pipeline & Strict Governance

### What Brand Brain Learns From:
- Approved finalized `EditorProject` timeline states.
- Applied `ProducerEditPlan` selections (hook styles, CTA placements).
- Selected caption presets and color adjustments.
- Real engagement metrics from `content_analytics`.
- User-approved translated terminology.

### What Brand Brain NEVER Learns From:
- Discarded drafts or abandoned editor sessions.
- Failed video renders or timed-out exports.
- Temporary preview generations rejected by the creator.
- Content from other users (strict tenant isolation).

### Temporal Decay
Evidence undergoes graceful time-weighted decay without deleting historical records:
- `< 14 days`: `1.0x` weight
- `14 – 45 days`: `0.8x` weight
- `45 – 90 days`: `0.6x` weight
- `> 90 days`: `0.4x` weight

---

## 5. System Integrations

| Subsystem | Brand Context Slice | Behavior |
| :--- | :--- | :--- |
| **Producer** | Pacing style, preferred hook types, CTA rules, audio preset, caption preset | Generates edit plans reflecting creator's tempo and hooks. Explains decisions citing evidence. |
| **Pro Editor** | Palette colors, safe fonts, watermark overlay, caption styling | "Apply Brand Style" one-click button with reversible undo/redo support. |
| **Captions** | Font, case style, line density (words/line), active word pop color | Captions automatically initialize to brand styling while allowing clip-level overrides. |
| **B-Roll** | Industry niche, preferred visual tone, density level | Filters recommended stock and user library assets matching brand density. |
| **Audio Studio** | Target LUFS (-14, -16), cleanup profile, ducking parameters | Preserves source master while setting mixing levels to creator standards. |
| **Translation** | Glossary ID, protected brand terminology, tone preservation | Masks protected names, handles, URLs, and brand tokens during multilingual dubbing. |
| **Publishing** | Platform overrides (TikTok vs LinkedIn), hashtag density, CTA | Formats post copy to fit platform tone (casual for TikTok, professional for LinkedIn). |

---

## 6. Security, Resource Limits & Prompt Injection Defense

- **Prompt Injection Defense**: Brand guidelines and examples are treated strictly as inert data. Control tokens (`<system>`, `<instruction>`, `ignore previous instructions`) are sanitized.
- **Font Allowlist**: Only fonts in `SAFE_EDITOR_FONTS` can be used. Unsupported fonts return `NOT_AVAILABLE` instead of uninspected execution.
- **Color Validation**: Colors must pass strict Hex (`#RGB`, `#RRGGBB`, `#RRGGBBAA`) or RGBA syntax. Arbitrary CSS injection is blocked.
- **Resource Limits**:
  - Max brand profiles: `5`
  - Max brand colors: `10`
  - Max approved/avoid phrases: `30`
  - Max examples per dimension: `15`
  - Max evidence records: `200`
  - Max imported guideline document: `2 MB`

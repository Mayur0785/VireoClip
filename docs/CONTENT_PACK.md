# Phase 23 — Vireo Content Pack

> **One Video → Complete Multi-Platform Content Package**  
> Source-Grounded, Brand Brain Aware, Platform Aware, Fully Editable, Regeneratable, Versioned, and Publish-Ready.

---

## 1. System Overview

Phase 23 introduces the **Content Pack** system into Vireo, taking a single approved short-form video clip and producing an entire multi-platform publishing suite with zero fabricated facts or unsupported statistics.

```
ONE VIDEO / ONE APPROVED CLIP
       + REAL TRANSCRIPT
       + BRAND BRAIN DNA
               ↓
        CONTENT PACK
  ├── Primary title (recommended)
  ├── Alternate titles (5 angles: Direct, Curiosity, Benefit, Question, Contrarian)
  ├── Hook variants (supporting variants for clip opening)
  ├── Short social caption (Shorts / Reels / TikTok)
  ├── Long social caption (LinkedIn / expanded posts)
  ├── Short description (semantic summary)
  ├── Long description (structured key takeaways)
  ├── Call to Action (CTA DNA)
  ├── Hashtags (3–8 bounded tags, platform filtered)
  ├── Topics / Keywords (semantic transcript extraction)
  ├── Thumbnail creative direction (purely textual visual brief)
  ├── Thumbnail headline text (3–5 punchy 2–6 word options)
  ├── Accessibility Alt-Text
  ├── Pinned comment prompt
  └── Platform-specific packs (YouTube, Instagram, TikTok, LinkedIn, X)
```

---

## 2. Core Architecture & Services

### `ContentPackService` (`server/src/services/contentPackService.ts`)
- **Bounded Context**: Extracts only clip transcript segments between `clip.start_seconds` and `clip.end_seconds` with a 3s boundary padding.
- **Provider Status**: Reports `CONFIGURED` vs `NOT_CONFIGURED`. Reuses `defaultAiProvider` (`OpenRouterContentProvider`). Never fabricates content if provider is unavailable.
- **Brand Brain Integration**: Calls `BrandContextService.getBrandContext` with task type `PUBLISH`. Integrates tones, avoid phrases, protected brand terms, and CTA preferences.
- **6-Tier Authority**: Current user instruction > locked Brand Brain rules > approved preferences > learned patterns > recommendations > Vireo defaults.
- **Locking & Manual Edits**: User edits persist with `manual_edit = true`, `status = 'EDITED'`. Locked items (`locked = true`) survive regenerations.
- **Regeneration**: Single item, platform-specific, or full pack regeneration. Always preserves locked and approved items. Creates version snapshot in `content_pack_versions`.
- **Publish Handoff**: Produces normalized platform payload (`getPublishHandoffPayload`) matching Vireo's `publishingService` and `PublishModal`.
- **Translation Integration**: Translates approved pack items via `translateContentPack` while preserving protected brand terms and variant relationships.

### `ContentPackValidator` (`server/src/services/contentPackValidator.ts`)
- **Conservative Claim Guard**: Scans generated copy for percentages (`90%`), multipliers (`10x`), currency (`$10,000`), rankings (`#1`), or guarantees (`100% guarantee`). If absent from source transcript, flags as ungrounded claim warning.
- **Quote Safety**: Enforces that quotation marks (`"..."`) only enclose verbatim transcript text. Paraphrases are prohibited from being presented as direct quotes.
- **Duplicate Detection**: Computes Jaccard token similarity (threshold 0.85) across alternative titles and hooks to prevent near-identical variants.
- **Platform Constraints**: Centralized rules (`PLATFORM_CONSTRAINTS`) for character lengths, hashtag bounds, and required metadata across YouTube Shorts, Instagram Reels, TikTok, LinkedIn, and X.
- **Brand Rules & Avoid Phrases**: Enforces avoid phrases from Brand Brain profile.

---

## 3. Database Collections & Schema

### `content_packs`
| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique content pack ID |
| `user_id` | UUID | Tenant owner ID |
| `project_id` | UUID | Associated project ID |
| `clip_id` | UUID | Associated clip ID |
| `brand_brain_id` | UUID (optional) | Associated Brand Brain profile ID |
| `brand_brain_version` | Number | Snapshot version of Brand Brain |
| `source` | Object | `{ transcript_source, source_language, clip_start, clip_end, duration, topic_summary }` |
| `status` | Enum | `DRAFT`, `GENERATING`, `READY`, `REVIEWED`, `APPROVED`, `PUBLISHED`, `FAILED` |
| `version` | Number | Incremental version number |
| `generation_mode` | Enum | `QUICK`, `BALANCED`, `FULL` |
| `template` | Enum | `Creator`, `Podcast`, `Education`, `Business`, `Interview`, `Gaming`, `Vlog` |
| `user_instruction` | String | Optional current user instruction |
| `item_counts` | Object | Counts by item type |
| `approved_at` | Date (optional) | Timestamp when pack was approved |
| `created_at` | Date | Creation timestamp |
| `updated_at` | Date | Last update timestamp |

### `content_pack_items`
| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique item ID |
| `user_id` | UUID | Tenant owner ID |
| `content_pack_id` | UUID | Foreign key to `content_packs.id` |
| `type` | Enum | `PRIMARY_TITLE`, `ALT_TITLE`, `HOOK`, `SHORT_CAPTION`, `LONG_CAPTION`, `SHORT_DESCRIPTION`, `LONG_DESCRIPTION`, `CTA`, `HASHTAGS`, `KEYWORDS`, `THUMBNAIL_TEXT`, `THUMBNAIL_DIRECTION`, `ALT_TEXT`, `PINNED_COMMENT`, `EMAIL_SNIPPET`, `BLOG_SNIPPET` |
| `platform` | Enum / String | `youtube`, `shorts`, `instagram`, `tiktok`, `linkedin`, `x`, `all` |
| `variant_index` | Number | Provenance index (supports future A/B testing) |
| `text` | String | Generated, edited, or translated copy |
| `status` | Enum | `DRAFT`, `GENERATED`, `EDITED`, `APPROVED`, `REJECTED` |
| `source_evidence` | Array | `[{ source_timestamps: [{ start, end }], source_topics }]` |
| `generation_source` | Enum | `ai`, `template`, `manual`, `translation` |
| `brand_rules_used` | Array | Brand Brain rules applied during generation |
| `manual_edit` | Boolean | True if user manually edited text |
| `locked` | Boolean | True if user locked item (survives regenerations) |
| `approved` | Boolean | True if item approved by user |
| `explanation` | String | "Why this?" rationale grounded in evidence/tone |
| `validation_warnings` | Array | Warnings from Claim Guard or platform constraints |
| `created_at` | Date | Creation timestamp |
| `updated_at` | Date | Last update timestamp |

### `content_pack_versions`
| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique snapshot ID |
| `user_id` | UUID | Tenant owner ID |
| `content_pack_id` | UUID | Foreign key to `content_packs.id` |
| `version` | Number | Version number |
| `snapshot` | Object | Full snapshot of `ContentPack` with all items |
| `change_summary` | String | Description of revision |
| `created_at` | Date | Timestamp |

---

## 4. API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/content-packs/capabilities` | Returns provider status, supported platforms, modes, item types |
| `POST` | `/api/projects/:projectId/clips/:clipId/content-pack` | Generates a new Content Pack for a clip |
| `GET` | `/api/content-packs/:id` | Fetches a Content Pack with all its items |
| `GET` | `/api/projects/:projectId/clips/:clipId/content-packs` | Lists all Content Packs for a clip |
| `PATCH` | `/api/content-packs/:id/items/:itemId` | Updates an item (text edit, lock, approval) |
| `POST` | `/api/content-packs/:id/items/:itemId/regenerate` | Regenerates a single unlocked item |
| `POST` | `/api/content-packs/:id/platforms/:platform/regenerate` | Regenerates platform items (preserves locked/approved) |
| `POST` | `/api/content-packs/:id/regenerate` | Regenerates pack (preserves locked/approved, increments version) |
| `POST` | `/api/content-packs/:id/approve` | Approves entire Content Pack and its items |
| `POST` | `/api/content-packs/:id/translate` | Translates approved pack to a target language |
| `GET` | `/api/content-packs/:id/publish-handoff/:platform` | Prepares publishing form payload |

---

## 5. Security & Isolation

- **Tenant Isolation**: Every database interaction is scoped through `ownerContext.run(userId, ...)`. Cross-user access is denied with 404 / 403.
- **Prompt Injection Defense**: Input transcript and instructions are treated strictly as data enclosed in XML tags. System instructions use `BrandContextService.sanitizePromptData` to strip instruction hijacking patterns (`ignore previous instructions`, `you are now`, `<instruction>`, etc.).
- **Secret Safety**: API keys are never returned in Content Pack payloads, items, or log files.
- **Resource Limits**:
  - `MAX_PACKS_PER_PROJECT`: 20
  - `MAX_VARIANTS_PER_TYPE`: 10
  - `MAX_TEXT_LENGTH`: 5000 chars
  - `MAX_USER_INSTRUCTION_LENGTH`: 500 chars

---

## 6. Frontend Entry Points

1. **Clip Workspace Card (`src/components/clips/ClipWorkspace.tsx`)**:
   - Each rendered clip card includes a purple **Content Pack** action button.
   - Clicking opens the full `ContentPackWorkspace` modal overlay.
2. **Clip Pro Editor (`src/pages/ClipEditorPage.tsx`)**:
   - Added `content_pack` tab alongside captions, layout, text, audio, producer, and translate.
   - Accessible via URL query `?tab=content_pack` or by clicking the Content Pack tab in the editor navigation.
3. **Publish Handoff**:
   - In `ContentPackWorkspace`, clicking **Use in Publish** opens `PublishModal` pre-filled with approved title, caption, hashtags, and platform metadata without auto-publishing.

---

## 7. Explicit Phase Boundaries

- **Phase 23**: Content Pack creation, grounding, Brand Brain publication rules, platform variations, claim guard, locking, and publishing handoff.
- **Phase 24 (Hook Lab)**: Advanced hook analysis, hook testing, hook rewrites. (Phase 23 provides simple supporting hook variants in a reusable schema).
- **Phase 25 (Thumbnail Lab)**: Image generation, template compositing, and visual thumbnail rendering. (Phase 23 provides textual creative direction and headline options only).
- **Phase 27 (A/B Studio)**: Multi-variant live testing. (Phase 23 preserves `variant_index` and `source_evidence` for future A/B tracking).

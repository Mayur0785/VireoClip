# Phase 25 — Vireo Thumbnail Lab Handoff & Repository State

LAST VERIFIED PHASE: 26

PHASE 26 TESTS:
8 tests (8 passed, 0 failed, 0 skipped, 1 suite)

PHASE 25 TESTS:
16 tests (16 passed, 0 failed, 0 skipped, 10 suites)

PHASE 24 TESTS:
21 tests (21 passed, 0 failed, 0 skipped, 11 suites)

BACKEND TYPESCRIPT:
PASS (0 errors, exit status 0)

FRONTEND TYPESCRIPT:
PASS (0 errors, exit status 0)

PRODUCTION BUILD:
PASS (Vite production build passed in 4.28s, 0 missing modules, 0 errors)

REAL LOCAL E2E:
PASS (Real clip + Source Frame Intelligence extraction + 6-factor deterministic Thumbnail Quality Score + Non-destructive typography compositing & safe-area validation + Brand Brain integration with evidence learning + Content Pack import + Version history snapshotting & restore + Publishing Composer handoff)

==================================================
NEW COLLECTIONS
==================================================
1. `thumbnail_lab_sessions`: Persistent Thumbnail Lab session records capturing:
   - `id`, `user_id`, `project_id`, `clip_id`, `content_pack_id`, `brand_brain_id`, `brand_brain_version`
   - `aspect_ratio` (16:9, 9:16, 1:1), `target_platform`, `target_audience`, `video_topic`, `objective`
   - `approved_concept_id`, `status` (READY, GENERATING, APPROVED, EXPORTED)
   - Timestamps and version tracking
2. `thumbnail_concepts`: Structured thumbnail variants capturing:
   - `thumbnail_session_id`, `user_id`, `variant_index`
   - `style_direction` (EXPRESSIVE_CREATOR_PORTRAIT, CINEMATIC_STORYTELLING, BOLD_TYPOGRAPHY, CLEAN_EDUCATIONAL, PODCAST_EDITORIAL, MINIMAL_PREMIUM, HIGH_CONTRAST_VISUAL, PRODUCT_SUBJECT_FOCUSED)
   - `title`, `aspect_ratio`, `is_ai_generated`, `image_provider`
   - `text_layer` (headline, subheadline, font_family, font_weight, font_size, text_color, highlight_color, stroke_color, stroke_width, shadow_blur, shadow_offset_y, position_x, position_y, alignment, transform_case)
   - `composition` (crop_x, crop_y, zoom_level, contrast, brightness, saturation, overlay_gradient)
   - `brand_rules_used`, `diagnostics` (6-factor breakdown, positives, warnings, safe area compliance)
   - `status` (SUGGESTED, GENERATED, EDITED, APPROVED, REJECTED), `locked`, `manual_edit`, `approved`, `favorited`
   - `prompt_used`, `model_used`
3. `thumbnail_versions`: Snapshot version history for thumbnails capturing:
   - `thumbnail_session_id`, `concept_id`, `user_id`, `version`, `snapshot`, `change_summary`, timestamps

==================================================
NEW SERVICES
==================================================
Server:
- `ThumbnailImageProvider` (`server/src/services/thumbnailLab/thumbnailImageProvider.ts`): Honest image provider reporting `NOT_CONFIGURED` when `AI_IMAGE_GEN_API_KEY` is not set. No mock fabrication.
- `ThumbnailSourceFrameService` (`server/src/services/thumbnailLab/thumbnailSourceFrameService.ts`): Real FFmpeg frame extraction leveraging scene cuts, face presence, and OCR hints.
- `ThumbnailScoringService` (`server/src/services/thumbnailLab/thumbnailScoringService.ts`): Computes explainable 6-factor Thumbnail Quality Score (0–100):
  - Readability (25%): Word count, char count, font size, stroke visibility.
  - Contrast (20%): Luminance difference between text and background, stroke width, shadow blur.
  - Composition (15%): Safe area validation, bottom-right YouTube duration badge conflict detection.
  - Subject Visibility (15%): Face detection and central focal framing.
  - Brand Fit (15%): Brand Brain primary/accent colors and approved fonts.
  - Topic Relevance (10%): Keyword overlap with video topic and transcript.
- `ThumbnailLabService` (`server/src/services/thumbnailLabService.ts`): High-level orchestrator managing sessions, concept generation, typography editing, lock protection, version restoration, Brand Brain evidence learning (`THUMBNAIL_LAB`), Content Pack import, and publishing handoff.

Client:
- `thumbnailLabService` (`src/services/thumbnailLabService.ts`): Typed API client communicating with `/api/thumbnail-lab`.

==================================================
NEW ROUTES & CONTROLLERS
==================================================
- `GET /api/thumbnail-lab/capabilities` — Returns honesty-verified provider capabilities and limits
- `POST /api/thumbnail-lab/sessions` — Creates or loads a Thumbnail Lab session
- `GET /api/thumbnail-lab/sessions/:id` — Retrieves session details and generated concepts
- `GET /api/thumbnail-lab/sessions/:id/source-frames` — Extracts and returns candidate source frames
- `POST /api/thumbnail-lab/sessions/:id/concepts/generate` — Generates diverse thumbnail concepts
- `PATCH /api/thumbnail-lab/sessions/:id/concepts/:conceptId` — Updates concept (text layer, composition, lock, favorite)
- `POST /api/thumbnail-lab/sessions/:id/concepts/:conceptId/approve` — Approves concept, creates snapshot, records BrandEvidence
- `POST /api/thumbnail-lab/sessions/:id/import-content-pack` — Imports thumbnail directives from Content Pack
- `GET /api/thumbnail-lab/sessions/:id/concepts/:conceptId/publishing-handoff` — Returns normalized publishing composer payload
- `POST /api/thumbnail-lab/sessions/:id/versions/:versionId/restore` — Restores previous concept snapshot

==================================================
NEW UI & WORKSPACE
==================================================
- `ThumbnailLabWorkspace` (`src/components/thumbnailLab/ThumbnailLabWorkspace.tsx`):
  - Left panel: Creative brief, aspect ratio, platform, style directions, source frames selector.
  - Center panel: Interactive canvas preview with zoom, platform safe-area overlays (YouTube 16:9 badge / Shorts 9:16 margins), non-destructive headline text editor, stroke/shadow controls.
  - Right panel: Concept variations list, locking, favorites, explainable 6-factor score meters, diagnostics warnings, approval & publishing composer handoff.

==================================================
ENTRY POINTS & INTEGRATIONS
==================================================
1. Clip Workspace (`src/components/clips/ClipWorkspace.tsx`): "Thumbnail" action button routing directly to Thumbnail Lab.
2. Clip Editor Navigation (`src/pages/ClipEditorPage.tsx`): Dedicated `thumbnail_lab` studio tab and query parameter handler `?tab=thumbnail_lab`.
3. Content Pack Workspace (`src/components/contentPack/ContentPackWorkspace.tsx`): "Open in Thumbnail Lab" action button with auto-synchronization of headlines and visual directions.
4. Publishing Composer: Normalized payload handoff attaching thumbnail image URL, title, aspect ratio, and quality score to social post drafts.

==================================================
HANDOFF TO FUTURE PHASES
==================================================
Phase 26 (Autopilot):
- Can invoke `ThumbnailLabService.generateConcepts` and auto-select highest-scoring thumbnail concept.

Phase 27 (A/B Studio):
- Can use thumbnail concepts and version snapshots to generate A/B split tests across titles and thumbnails.

==================================================
DO NOT MODIFY
==================================================
- Parked Clip Download 5% issue remains untouched.

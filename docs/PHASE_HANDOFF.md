# Phase 24 — Vireo Hook Lab Handoff & Repository State

LAST VERIFIED PHASE: 24

FULL REGRESSION TOTAL:
404 tests (404 passed, 0 failed, 0 skipped, 144 suites)

PHASE 24 TESTS:
21 tests (21 passed, 0 failed, 0 skipped, 11 suites)

BACKEND TYPESCRIPT:
PASS (0 errors, exit status 0)

FRONTEND TYPESCRIPT:
PASS (0 errors, exit status 0)

PRODUCTION BUILD:
PASS (Vite production build passed in 41.44s, 0 missing modules, 0 errors)

REAL LOCAL E2E:
PASS (Real clip + SpeechIntelligence opening analysis + High-impact source line search + 7-factor Hook Fit scoring + Reversible non-destructive EditorProject apply & snapshot revert + Brand Brain learning evidence + Content Pack import/sync + Real FFmpeg/ffprobe preview render)

==================================================
NEW COLLECTIONS
==================================================
1. `hook_lab_sessions`: Persistent Hook Lab session records capturing:
   - `clipId`, `projectId`, `userId`
   - `openingAnalysis` (latency, silences, fillers via SpeechIntelligenceService, classification: TRANSCRIPT / TEXT_OVERLAY / CAPTION / NO_CLEAR_HOOK, diagnostics)
   - `discoveredLines` (punchy lines discovered from later in the clip with keywords, brevity, timestamps)
   - `status` (ANALYZING, READY, APPLIED, REVERTED, ERROR)
   - `brandContextSnapshot`
   - Timestamps and version tracking
2. `hook_candidates`: Structured hook variants capturing:
   - `sessionId`, `clipId`, `userId`
   - `text` (the hook variant copy)
   - `deliveryMode` (EDITORIAL_TRIM, REORDER_EXISTING, TEXT_OVERLAY, CAPTION_OPEN)
   - `score` (deterministic 0-100 Hook Fit score)
   - `scoreBreakdown` (Grounding 25%, Clarity 15%, Specificity 15%, Curiosity 10%, Brevity 10%, Brand Fit 10%, Opening Fit 15%)
   - `scoreExplanation` (detailed factor explanations and applied penalties)
   - Operational plans: `trimPlan` (trimStartSeconds, originalStart), `reorderPlan` (teaserSourceStart, teaserSourceEnd, teaserDuration), `textOverlayPlan` (text, style, durationSeconds)
   - `status` (SUGGESTED, EDITED, APPLIED, REVERTED, DISCARDED)
   - `applied`, `approved`, `locked`, `manualEdit`
   - `origin` (AI_DISCOVERED, SOURCE_LINE_REORDER, MANUAL_EDIT, CONTENT_PACK_IMPORT)
   - `provenance` (reusable for future Phase 27 A/B Studio)

==================================================
NEW SERVICES
==================================================
Server:
- `HookOpeningAnalyzer` (`server/src/services/hookLab/hookOpeningAnalyzer.ts`): Analyzes the opening 1–5s window of real clips. Integrates `SpeechIntelligenceService` for filler word detection and silence identification; reuses multimodal keyframes when available; classifies opening delivery; outputs structured diagnostics (e.g. slow speech start, excessive filler words).
- `HookLineSearchService` (`server/src/services/hookLab/hookLineSearchService.ts`): Analyzes the remainder of the clip (beyond opening window) to discover high-tension, punchy dialogue lines based on punchiness heuristics, numbers, key phrases, and brevity. Compiles `HookReorderPlan` candidate structures.
- `HookScoringService` (`server/src/services/hookLab/hookScoringService.ts`): Computes explainable 0–100 Hook Fit score using 7 weighted factors:
  - Grounding (25%): Token overlap ratio check against source transcript + conservative Claim Guard from `ContentPackValidator` (penalizes hallucinations down to 10–20).
  - Clarity (15%): Directness and readability.
  - Specificity (15%): Concrete numbers, entities, specific takeaways.
  - Curiosity (10%): Intrigue without sensational clickbait.
  - Brevity (10%): Ideal short-form hook length (< 8-10 words).
  - Brand Fit (10%): Compliance with Brand Brain tone and strict avoidance of `avoid_phrasing`.
  - Opening Fit (15%): Appropriateness for detected opening window dynamics.
- `HookEditorIntegration` (`server/src/services/hookLab/hookEditorIntegration.ts`): Applies candidate operations to `EditorProject` non-destructively:
  - `EDITORIAL_TRIM`: Trims opening dead air or fillers by adjusting track item `startOffset` and project duration.
  - `REORDER_EXISTING`: Inserts a teaser clip at track start (0s) and shifts existing items rightward.
  - `TEXT_OVERLAY`: Appends a styled text overlay item to the OVERLAY track (0s to 3s).
  - `CAPTION_OPEN`: Adds or styles opening caption item on CAPTIONS track.
  - Snapshot creation & revert: Saves full snapshot of tracks before modification; restoring snapshot cleanly reverts project to exact prior state without altering source media.
  - FFmpeg preview: Generates local preview snippets and validates them with `ffprobe`.
- `HookLabService` (`server/src/services/hookLabService.ts`): High-level orchestrator managing sessions, candidate generation, locking, inline edits, re-scoring, reversible editor apply/revert, approvals with Brand Brain evidence recording, Content Pack import/sync, and honest analytics advisory (`INSUFFICIENT_DATA`).

Client:
- `hookLabService` (`src/services/hookLabService.ts`): Typed client interface supporting session loading, candidate management, inline updates, locking, regeneration, reversible editor apply/revert, approvals, and Content Pack imports.

==================================================
NEW ROUTES
==================================================
- `GET /api/hook-lab/capabilities` — Returns Hook Lab capability model and limits
- `POST /api/hook-lab/sessions` — Creates or retrieves a Hook Lab session for a clip
- `GET /api/hook-lab/sessions/:id` — Fetches session details with opening analysis & discovered lines
- `GET /api/hook-lab/sessions/:id/candidates` — Retrieves all hook candidates for a session
- `PATCH /api/hook-lab/sessions/:id/candidates/:candidateId` — Updates candidate (inline edit, lock, approval)
- `POST /api/hook-lab/sessions/:id/candidates/:candidateId/regenerate` — Regenerates candidate (respects locks)
- `POST /api/hook-lab/sessions/:id/candidates/:candidateId/apply` — Applies candidate to EditorProject non-destructively (returns snapshot)
- `POST /api/hook-lab/sessions/:id/candidates/:candidateId/revert` — Restores project from prior snapshot
- `POST /api/hook-lab/sessions/:id/candidates/:candidateId/approve` — Approves candidate and records BrandEvidence
- `POST /api/hook-lab/import-content-pack` — Imports HOOK items from Content Pack as candidates
- `GET /api/projects/:projectId/clips/:clipId/hook-lab` — Clip-nested session lookup
- `POST /api/projects/:projectId/clips/:clipId/hook-lab` — Clip-nested session creation

==================================================
NEW UI
==================================================
- `HookLabWorkspace` (`src/components/hookLab/HookLabWorkspace.tsx`): Polished Hook Lab workspace featuring:
  - Opening Analysis & Diagnostics banner (latency, fillers, speech ratio, opening classification)
  - Discovered High-Impact Lines panel (punchy source lines found later in the clip)
  - Recommended Hook Hero Card (score badge, delivery mode, breakdown drawer, inline edit, apply button)
  - Hook Variants Grid with delivery mode filters (All, Trim, Reorder, Text Overlay, Caption)
  - Score Breakdown Drawer (7-factor visual meters, explanations, penalties)
  - Local Preview Modal (FFmpeg rendered snippet preview)
  - Single-click Apply & Revert Apply buttons with local snapshot state handling

==================================================
HOOK LAB ENTRY POINTS
==================================================
1. Clip Editor Navigation (`src/pages/ClipEditorPage.tsx`): Dedicated `hook_lab` studio tab and query parameter handler `?tab=hook_lab`.
2. Content Pack Workspace (`src/components/contentPack/ContentPackWorkspace.tsx`): "Open in Hook Lab" action button on HOOK cards routing directly to Hook Lab with auto-sync.

==================================================
REVERSIBLE EDITOR APPLY ARCHITECTURE
==================================================
- Every editor apply operation (`EDITORIAL_TRIM`, `REORDER_EXISTING`, `TEXT_OVERLAY`, `CAPTION_OPEN`) generates a full prior snapshot (`previousProjectSnapshot`) before mutating tracks.
- Snapshot is returned in the API response and stored in workspace state.
- Clicking "Revert Apply" sends the snapshot back to `revertCandidateInEditor`, restoring original tracks via `ProEditorService.updateEditorProject` and resetting candidate `applied: false`.
- Source media files on disk and S3 remain 100% immutable throughout all operations.

==================================================
HONEST ANALYTICS ADVISORY
==================================================
- Zero fabricated metrics, fake virality percentages, or hallucinated retention charts.
- `HookLabService.getHistoricalAnalyticsAdvisory` inspects published performance records for the user.
- When historical clip sample count < 3, status is strictly set to `INSUFFICIENT_DATA` with a clear explanation: "Insufficient historical data (minimum 3 published clips required for hook performance insights)."

==================================================
HANDOFF TO FUTURE PHASES
==================================================
Phase 25 (Thumbnail Lab):
- Can reuse `SpeechIntelligenceService`, `BrandContextService`, and keyframe extraction utilities.
- Should consume textual briefs and headline suggestions generated by `ContentPackItem` (`type: 'THUMBNAIL_TEXT'`, `type: 'THUMBNAIL_DIRECTION'`).
- Must adhere to the same non-destructive asset guarantees and honest metrics standards.

Phase 26 (Autopilot):
- Can chain together Content Pack generation and Hook Lab candidate selection based on top Hook Fit scores.

Phase 27 (A/B Studio):
- Consume `provenance` IDs recorded on `HookCandidate` and `ContentPackItem`.
- Compare live metrics across variants once published.

==================================================
DO NOT MODIFY
==================================================
- Parked Clip Download 5% issue remains untouched.

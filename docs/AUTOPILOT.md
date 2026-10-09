# VIREO PHASE 26 — FULL PIPELINE AUTOPILOT
## Orchestrator Documentation & Architecture Reference

### 1. Executive Summary & Architecture
Phase 26 implements the **Full Pipeline Autopilot Orchestrator** in Vireo. It automatically coordinates and chains the existing core intelligence modules into an end-to-end, hands-off workflow while strictly enforcing human-in-the-loop review before any publishing action:
1. **Producer**: Validates source clip ownership, metadata, and accessibility.
2. **Hook Lab**: Generates and analyzes high-retention hook variations, scores candidate fit deterministically, and selects the optimal hook candidate.
3. **Thumbnail Lab**: Generates brand-aligned thumbnail concepts, evaluates them using the 6-factor deterministic scoring engine (`ThumbnailScoringService`), and automatically recommends and selects the highest-scoring eligible concept without overwriting locks.
4. **Content Pack**: Assembles complete multi-platform social packages (LinkedIn, Twitter/X, TikTok, Instagram, YouTube Shorts, Newsletter) preserving Brand Brain rules, quote/claim safety guards, and source provenance.
5. **Human Approval Gate**: Holds the run in a completed review state. Publishing is strictly blocked until an authenticated user with valid ownership explicitly signs off, producing the consolidated publishing handoff.

---

### 2. Strict Guardrails & Safety Guarantees
- **No Automatic Publishing**: Autopilot prepares all deliverables and stops at the approval gate. It never publishes or schedules posts autonomously.
- **Tenant Isolation**: Every database query, run fetch, execution step, retry, and approval validates `user_id` against the authenticated session.
- **Safe Resume, Retry & Idempotency**:
  - Each step is executed sequentially and marked `COMPLETED` only after its output is validated and persisted.
  - Re-running or resuming a run skips already completed steps without duplicating work or making duplicate LLM calls.
  - Retrying a failed step (`status === 'FAILED'`) resets only that step to `PENDING` without discarding prior successful stages.
- **Safe Downstream Invalidation**:
  - Dependency Graph: `PRODUCER` $\to$ `HOOK_LAB` $\to$ `THUMBNAIL_LAB` $\to$ `CONTENT_PACK` $\to$ `APPROVAL`.
  - When an upstream stage is explicitly rerun (`forceRerun: true`), all dependent downstream stages are invalidated and reset to `PENDING`.
  - Outdated artifact references (`producer_plan_id`, `selected_hook_candidate_id`, `selected_thumbnail_concept_id`, `content_pack_id`, `publishing_handoff`, `is_approved`) are cleanly unset using native MongoDB `$unset`.
  - Downstream steps recompute using the new upstream outputs when execution resumes.
  - Rejected retries do not mutate or invalidate any state.
- **Atomic Concurrency Protection**:
  - `executePipeline` atomically acquires a unique `execution_lock` via MongoDB conditional update:
    `{ id: runId, user_id: userId, $or: [{ execution_lock: { $exists: false } }, { execution_lock: null }, { execution_lock: '' }] }`.
  - Concurrent execution or approval requests while locked immediately fail with HTTP 409 `PIPELINE_ALREADY_RUNNING` without duplicating work or racing into corrupted states.
  - The lock is reliably released in a `finally` block scoped to the unique token.
- **Billing & Provider Honesty**:
  - Zero billable AI image-generation inference is initiated by default.
  - Phase 25's dedicated fal.ai live generation remains deferred pending user-configured `FAL_KEY`. Autopilot operates cleanly with legitimate text and structured concept planning without fabricating outputs.

---

### 3. Data Model & Persistence
Persistent records are stored in MongoDB under the `autopilot_runs` collection:
- `id`: Unique run identifier (`uuidv4`).
- `user_id`: Authenticated user ID (tenant boundary).
- `project_id` & `clip_id`: Source media references.
- `status`: Overall run status (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `APPROVED`, `CANCELLED`).
- `settings`: Autopilot configuration:
  - `tone`: Target voice/tone.
  - `target_platforms`: Array of target social platforms.
  - `preferred_aspect_ratio`: 16:9, 9:16, or 1:1.
  - `brand_brain_id`: Optional Brand Brain link.
  - `auto_approve`: Always `false` (enforces human gate).
- `steps`: Sequential step records (`PRODUCER`, `HOOK_LAB`, `THUMBNAIL_LAB`, `CONTENT_PACK`, `APPROVAL`):
  - `name`: Step identifier.
  - `status`: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `SKIPPED`.
  - `started_at`, `completed_at`, `error`.
  - `output_reference`: Pointers to created artifacts (e.g., `hookSessionId`, `selectedHookId`, `thumbnailSessionId`, `selectedConceptId`, `contentPackId`).
- `selected_hook`: Full details and rationale for selected hook candidate.
- `selected_thumbnail`: Full details, rationale, and 6-factor score breakdown for selected thumbnail concept.
- `content_pack`: Content pack details and deliverables list.
- `approval_status`: `PENDING`, `APPROVED`, or `REJECTED`.
- `approval_timestamp`, `approved_by`: Audit trail for human review.
- `publishing_handoff`: Consolidated package containing social copy and thumbnail media references for the publishing composer.

---

### 4. API Endpoints
All endpoints are mounted under `/api/autopilot` with mandatory tenant authentication:
- `GET /api/autopilot/capabilities`: Returns pipeline capability model, stages, and requirements.
- `POST /api/autopilot/runs`: Creates and initializes a new Autopilot run for a clip.
- `GET /api/autopilot/runs/:runId`: Retrieves real-time run state, step progress, and deliverables.
- `GET /api/autopilot/clips/:clipId`: Retrieves existing runs associated with a specific clip.
- `POST /api/autopilot/runs/:runId/execute`: Executes or resumes the pipeline sequentially.
- `POST /api/autopilot/runs/:runId/retry`: Retries a failed step safely without duplicate upstream work.
- `POST /api/autopilot/runs/:runId/approve`: Human approval gate, marking the run approved and generating the consolidated publishing handoff.

---

### 5. Frontend Workspace & Navigation
- **Workspace**: `src/components/autopilot/AutopilotWorkspace.tsx` provides:
  - Run Status & Progress Header: Interactive status indicators, execution progress bar, and timestamp tracking.
  - Pipeline Step Tracker: 5-stage progress view showing live execution states, elapsed times, error banners, and targeted retry buttons.
  - Deliverables Review Grid: Tabbed preview for Approved Hook, Selected Thumbnail (with 6-factor score meters & visual badges), and Multi-Platform Content Pack.
  - Human Approval Card: Review confirmation button with instant handoff to the Publishing Composer.
- **Integration Points**:
  - `ClipEditorPage.tsx`: Dedicated `?tab=autopilot` studio tab.
  - `ClipWorkspace.tsx`: "Autopilot" action button with quick-launch modal.

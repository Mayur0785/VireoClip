# PHASE 27: A/B TESTING STUDIO — ARCHITECTURE & USER GUIDE

## 1. Executive Summary

Phase 27 introduces **A/B Testing Studio**, a statistically grounded decision engine designed for controlled multi-variant split-testing in Vireo. Built specifically to complement **Thumbnail Lab** (Phase 25) and **Hook Lab** (Phase 24), A/B Testing Studio provides creators with a scientifically defensible method to evaluate alternative video packaging assets (thumbnails, video titles, or opening spoken hooks) without fabricating live audience data or predicting vanity metrics.

---

## 2. Core Principles & Truth in Delivery

1. **Honest Delivery Boundary:**
   Public social APIs (YouTube, TikTok, Instagram) do not expose live viewer-level traffic splitting via external REST APIs. Rather than simulating fake viewer cohorts, Phase 27 is strictly scoped as **Experiment Planning, Structured Observation Ingestion, and Statistical Decision Analysis**.
2. **Mathematical Decision Rule:**
   Formal winner declaration uses a **Two-Proportion Z-Test** with **Bonferroni multiple-comparison correction**, enforcing mathematical sample size sufficiency, success-failure validation ($np \ge 5, n(1-p) \ge 5$), and practical (business) significance thresholds ($\ge 5.0\%$ relative lift).
3. **Descriptive Uncertainty Estimates:**
   Asymmetric **95% Wilson Score Confidence Intervals** are computed for every variant to visualize parameter uncertainty, rather than relying on Normal approximation intervals that degrade when conversion rates are small.
4. **Single-Dimension Focus:**
   The initial release strictly enforces testing **one experimental dimension at a time** (`THUMBNAIL_ONLY`, `TITLE_ONLY`, or `HOOK_LINE`) to prevent factorial attribution confounding.
5. **Safe, Human-Approved Promotion:**
   Winning assets are **never** published externally or promoted autonomously. Promotion requires explicit creator signoff (`confirm_promotion: true`), updates active clip metadata and Thumbnail Lab approved concepts, and records high-confidence learned traits in **Brand Brain** ([`BrandEvidenceService`](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20(1)/ai-video-content-generator-main/server/src/services/brand/brandEvidenceService.ts)).

---

## 3. Mathematical & Statistical Engine

### 3.1 Sample Size Planning Formula
The required sample size per variant ($n_{\text{required}}$) is derived using the standard two-proportion pooled formula (Evan Miller / Cochran standard):

$$n_{\text{required}} = \frac{\left(Z_{\alpha/2}\sqrt{2 \bar{p}(1 - \bar{p})} + Z_{\beta}\sqrt{p_1(1-p_1) + p_2(1-p_2)}\right)^2}{\delta^2}$$

*Reference Benchmark:*
For baseline conversion rate $p_1 = 5.0\%$, relative $\text{MDE} = 20.0\%$ ($p_2 = 6.0\%$, $\delta = 1.0\%$), significance $\alpha = 0.05$ ($Z_{\alpha/2} = 1.96$), and statistical power $1 - \beta = 0.80$ ($Z_\beta = 0.842$), the required sample size per variant is exactly **8,158 exposures**.

### 3.2 Two-Proportion Z-Test & Bonferroni Correction
For $k$ challengers evaluated against a single control, the engine adjusts the significance threshold:
$$\alpha_{\text{adjusted}} = \frac{\alpha}{k}$$
Two-tailed p-values are computed via complementary error function ($\text{erfc}$):
$$p = \text{erfc}\left(\frac{|Z|}{\sqrt{2}}\right)$$

### 3.3 Metric Definitions & Invariants
- **CTR (Click-Through Rate):** Numerator = `clicks`, Denominator = `impressions`. Rule: $0 \le \text{clicks} \le \text{impressions}$, $\text{impressions} > 0$.
- **Retention / Completion Rate:** Numerator = `completions`, Denominator = `views`. Rule: $0 \le \text{completions} \le \text{views}$, $\text{views} > 0$.
- **Engagement Rate:** Numerator = `engagements`, Denominator = `views`. Rule: $0 \le \text{engagements} \le \text{views}$, $\text{views} > 0$.

---

## 4. API Reference (`/api/ab-studio`)

All routes require JWT authentication (`requireAuth`) and execute within tenant context:
- `GET /api/ab-studio/capabilities` — Returns supported dimensions, metrics, and decision rules.
- `GET /api/ab-studio/clips/:clipId` — Lists all experiments for a clip.
- `POST /api/ab-studio/experiments` — Creates a new experiment draft with 2–4 variants.
- `GET /api/ab-studio/experiments/:id` — Retrieves experiment details with live statistical evaluation.
- `POST /api/ab-studio/experiments/:id/start` — Activates experiment (`DRAFT` / `PAUSED` $\to$ `ACTIVE`).
- `POST /api/ab-studio/pause` / `POST /api/ab-studio/experiments/:id/pause` — Pauses observation ingestion (`ACTIVE` $\to$ `PAUSED`).
- `POST /api/ab-studio/experiments/:id/observations` — Ingests performance batch with SHA-256 idempotency key.
- `POST /api/ab-studio/experiments/:id/declare-winner` — Formally declares winning variant with statistical defense check.
- `POST /api/ab-studio/experiments/:id/promote-winner` — Safely promotes winner to clip title, Thumbnail Lab, and Brand Brain.
- `GET /api/ab-studio/experiments` — Lists experiments for the authenticated user with search, status filtering, and pagination.
- `GET /api/ab-studio/experiments/:id/report` — Generates comprehensive statistical, provenance, and decision report.
- `GET /api/ab-studio/experiments/:id/export` — Downloads RFC 4180 compliant CSV report with formula injection defense.
- `DELETE /api/ab-studio/experiments/:id` — Deletes draft or cancelled experiment.

---

## 5. UI Integration

- **Clip Editor Studio Tab:** Access via `ClipEditorPage.tsx` tab bar or deep link `?tab=ab_studio`.
- **Component:** `ABStudioWorkspace.tsx` provides variant comparison cards, live Wilson confidence interval displays, relative lift meters, manual/CSV observation logging modals, human confirmation promotion gates, and in-workspace export/history toggling.
- **Top-Level Navigation:** Dedicated route at `/ab-testing` (`ABStudioHistoryPage.tsx`) linked from the main dashboard sidebar (`DashboardLayout.tsx`).

---

## 6. Phase 32: Experiment History & Reporting

1. **Multi-Tenant History Listing:**
   - Isolated by authenticated `user_id`.
   - Filters: `ALL`, `DRAFT`, `ACTIVE`, `PAUSED`, `CONCLUDED`, `CANCELLED`.
   - Keyword search across experiment name and hypothesis.
   - Dynamic statistical re-evaluation with linked clip metadata.

2. **Five Evidence Levels:**
   - `NO_OBSERVATIONS`: Experiment has zero exposures recorded.
   - `INSUFFICIENT_SAMPLE_SIZE`: Observations exist but maximum exposures < required per-variant minimum (e.g. 8,158).
   - `INCONCLUSIVE`: Required sample size reached, but no challenger achieved statistical significance or required practical lift ($\ge 5.0\%$).
   - `WINNER_ELIGIBLE`: Powered challenger achieves $p < \alpha_{\text{adjusted}}$ and practical lift $\ge 5.0\%$, awaiting formal declaration.
   - `WINNER_DECLARED`: Creator has formally concluded experiment and declared the winning variant.

3. **Secure RFC 4180 CSV Export:**
   - Structured headers with complete experiment metadata, parameters, and benchmark targets.
   - Per-variant performance rows with exposures, conversions, CTR, lift %, 95% Wilson CI bounds, p-value, and adjusted alpha.
   - Neutralizes Spreadsheet Formula Injection (CSV DDE) by prepending `'` to values starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.

---

## 7. Phase 33: CSV Analytics Import

1. **Architecture & Integrity:**
   - Ingests real performance observations from platform exports (YouTube Studio, TikTok Analytics, Meta Ads).
   - Strictly tags data with provenance `data_provenance: 'CSV_IMPORT'`.
   - Never creates synthetic observations, exposures, clicks, conversions, or winners.
   - Never automatically promotes a variant or triggers external publishing.
   - Preserves draft experiments in `DRAFT` status; observations can only be imported into `ACTIVE` experiments.

2. **Parsing & Security Safeguards:**
   - Compliant with RFC 4180: supports multiline cells, escaped double quotes (`""`), and comma/semicolon/tab delimiter auto-detection.
   - Limits: Enforces 2MB maximum file size and 2,000 maximum data rows to prevent resource exhaustion.
   - Formula Injection Defense: Strips spreadsheet formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) from non-numeric text cells while preserving negative/positive numeric signs (`-500`, `+25`).
   - Missing Value Rule: Missing exposures or conversions are rejected with descriptive row errors rather than being treated as zeros.

3. **Deduplication & Idempotency:**
   - Uses SHA-256 idempotency key: `sha256(userId:experimentId:variantId:periodStart:periodEnd:exposures:conversions)`.
   - In-batch deduplication skips duplicate rows within the same CSV file.
   - Database deduplication skips batches already recorded in `ab_observation_logs`.
   - Re-importing identical files is completely idempotent and does not double-count metrics.

4. **API Endpoints:**
   - `POST /api/ab-studio/experiments/:id/import-csv/preview`: Parses CSV, maps columns, dry-run validates rows, and returns sample preview with error explanations.
   - `POST /api/ab-studio/experiments/:id/import-csv/execute`: Validates experiment is active, ingests valid batches, updates cumulative observations, re-evaluates statistics, and returns updated experiment and report.

5. **Manual Acceptance Support Procedure:**
   - Step 1: Create a disposable test experiment with Variant A and Variant B on an existing clip.
   - Step 2: Start the experiment so it enters `ACTIVE` status.
   - Step 3: Open the Import CSV modal from `ABStudioWorkspace` or `/ab-testing`.
   - Step 4: Paste or upload a sample CSV:
     ```csv
     variant,impressions,clicks,date,source
     A,1000,50,2026-03-10,YouTube Analytics
     B,1000,75,2026-03-10,YouTube Analytics
     ```
   - Step 5: Verify the preview shows 2 valid rows, 0 invalid rows, and correct column mapping.
   - Step 6: Click "Confirm Import" and confirm that Variant A shows 1,000 exposures / 50 conversions (CTR 5.00%) and Variant B shows 1,000 exposures / 75 conversions (CTR 7.50%).
   - Step 7: Re-import the exact same CSV and verify that both rows are flagged as `DUPLICATE` and skipped without double-counting.
   - Step 8: Upload an invalid row (e.g. `clicks > impressions`) and verify that it is rejected with a row-level error.


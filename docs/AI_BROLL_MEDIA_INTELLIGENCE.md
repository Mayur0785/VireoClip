# Vireo AI B-Roll & Media Intelligence (Phase 19)

## 1. Overview & Architecture

Vireo Phase 19 turns Vireo from a timeline editor into a context-aware media assistant. The system inspects multimodal timeline data (transcripts, scene boundaries, OCR text, visual activity, audio dynamics) and identifies moments where B-roll visual inserts improve pacing and conceptual clarity.

```
Transcript + Multimodal Signals + Scene Context + OCR
                        ↓
             brollOpportunityService
                        ↓
            B-Roll Opportunities (slots)
                        ↓
               mediaAssetService
      (Priority: Project -> Library -> Brand -> Stock -> Gen)
                        ↓
             Relevance Scoring (0-100)
                        ↓
               B-Roll Plan (Review)
                        ↓
         Timeline Insertion (EditorProject)
                        ↓
               Render Graph V2 (FFmpeg)
```

### Core Design Principles
1. **Source Immutability**: Base video footage is never overwritten or destructively modified. B-roll items are placed on dedicated upper `VIDEO` layer tracks.
2. **Provider Neutrality & Zero Fake Media**: If a stock or AI generation provider is not configured with real API keys in the environment, the system strictly returns `NOT_CONFIGURED`. No mock assets, fake stock items, or dummy downloads are ever shown or inserted.
3. **SSRF-Hardened Ingestion**: External media imported from stock providers passes through strict IP and protocol validation before being fetched by backend background jobs and uploaded to persistent storage.
4. **Human Review Workflow**: Automatic B-roll runs through a previewable `BrollPlan` where users can review, replace, or dismiss individual suggestions before applying to their editor project.

---

## 2. Media Asset Data Model (`media_assets`)

All project and user assets are tracked in the `media_assets` MongoDB collection with schema validation, indexes, and user ownership isolation.

```typescript
export interface MediaAssetRecord {
  id: string;                         // UUID v4
  user_id: string;                    // Owner UUID (IDOR-protected)
  project_id?: string;                // Project association (optional)
  source_type: MediaSourceType;       // 'USER_UPLOAD' | 'PROJECT_SOURCE' | 'GENERATED_CLIP' | 'STOCK' | 'GENERATED_AI' | 'BRAND_ASSET'
  media_type: 'VIDEO' | 'IMAGE' | 'AUDIO';
  provider?: string;                  // 'local' | 'pexels' | 'pixabay' | 'openai' | etc.
  provider_asset_id?: string;         // Unique ID in external provider

  storage_path?: string;              // Local disk or R2 key
  external_preview_url?: string;      // CDN preview URL (never contains tokens)

  title: string;
  description?: string;
  tags: string[];
  duration?: number;                  // seconds
  width: number;
  height: number;
  fps?: number;
  aspect_ratio: '9:16' | '16:9' | '1:1' | '4:5';

  license_type?: string;              // 'Pexels License' | 'Pixabay Content License' | 'Proprietary'
  license_source?: string;
  source_page_url?: string;
  attribution?: string;

  thumbnail_path?: string;
  proxy_path?: string;

  semantic_text: string;              // Searchable fused text representation
  embedding?: number[];               // Optional semantic vector
  created_at: string;
  updated_at: string;
}
```

### Database Indexes
- `{ id: 1 }` (unique)
- `{ user_id: 1, created_at: -1 }`
- `{ project_id: 1 }`
- `{ provider: 1, provider_asset_id: 1 }`
- `{ source_type: 1 }`

---

## 3. Media Library (`MediaBin.tsx`)

The Media Bin in the Pro Editor provides six functional tabs:
1. **Project**: Source video, rendered clips, and project assets. Automatically indexed idempotently upon opening.
2. **Uploads**: User-uploaded images, videos, and custom B-roll clips.
3. **Clips**: Clips generated from the current project or other projects by the same user.
4. **Brand**: User brand assets (logos, intros, watermarks, brand b-roll).
5. **Stock**: Real provider-backed stock asset search (Pexels / Pixabay). Displays an explicit `NOT_CONFIGURED` card when provider API keys are absent.
6. **Generated**: AI text-to-image and text-to-video generation. Displays an explicit `NOT_CONFIGURED` banner when generative AI providers are absent.

---

## 4. B-Roll Opportunity Detection (`brollOpportunityService.ts`)

The opportunity detection engine analyzes conversational pauses, talking-head durations, and transcript concepts to identify optimal B-roll candidate slots.

### Multimodal Considerations
- **Avoid Over-Editing**: B-roll is skipped during moments of high facial emotion or key screen demonstrations.
- **Talking Head Detection**: B-roll is prioritized during prolonged static talking-head segments (> 5.0 seconds).
- **Candidate Snap**: Opportunity boundaries snap cleanly to natural word or sentence boundaries from Whisper transcripts.

### Density Control Rules (`BROLL_DENSITY_RULES`)
Three editing styles are supported:

| Style | Max B-roll / Min | Min Duration | Max Duration | Min Gap | Max Coverage % |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **MINIMAL** | 2 | 2.5s | 5.0s | 8.0s | 20% |
| **BALANCED** | 4 | 2.0s | 6.0s | 4.0s | 35% |
| **DYNAMIC** | 6 | 1.5s | 5.0s | 2.5s | 50% |

### Search Query Synthesis
Transforms conversational transcript fragments into concise 2–4 keyword search queries without filler words:
- Transcript: *"We grew revenue by automating our sales workflow with AI tools."*
- Generated Queries: `sales automation`, `revenue growth`, `workflow automation`

---

## 5. Relevance Scoring & Ranking (`mediaAssetService.ts`)

Candidate assets are evaluated across multiple criteria and assigned a normalized **0–100 Relevance Score** with an explainable reason breakdown:

$$\text{Relevance Score} = W_{\text{semantic}} \cdot S_{\text{semantic}} + W_{\text{aspect}} \cdot S_{\text{aspect}} + W_{\text{duration}} \cdot S_{\text{duration}} + W_{\text{source}} \cdot S_{\text{source}} - P_{\text{duplicate}}$$

### Scoring Criteria:
1. **Semantic Text Match** (40 pts): Keyword overlap and semantic similarity against asset title, tags, and OCR text.
2. **Aspect Ratio Compatibility** (25 pts): Exact match (e.g., 9:16 vertical for Shorts/TikTok) receives maximum score; adaptable ratios receive partial points.
3. **Duration Fit** (20 pts): Compares asset duration to the target opportunity slot duration to avoid excessive trimming or undersized assets.
4. **Source Priority** (15 pts):
   - Priority 1: `PROJECT_SOURCE` (+15)
   - Priority 2: `USER_UPLOAD` (+12)
   - Priority 3: `BRAND_ASSET` (+10)
   - Priority 4: `STOCK` (+5)
   - Priority 5: `GENERATED_AI` (+0)
5. **Repetition Penalty** (-30 pts): Strongly penalizes assets used within the preceding 30 seconds of the timeline.

---

## 6. Provider-Neutral Stock Interface (`stockMediaProvider.ts`)

```typescript
export interface MediaSearchProvider {
  id: string;
  name: string;
  getCapabilities(): Promise<ProviderCapabilities>;
  searchVideos(query: StockSearchQuery): Promise<StockSearchResult>;
  searchImages(query: StockSearchQuery): Promise<StockSearchResult>;
  getAsset(id: string): Promise<StockMediaItem | null>;
}
```

### Provider Capability States
Every provider returns a deterministic capability status:
- `SUPPORTED`: Valid credentials configured and API healthy.
- `NOT_CONFIGURED`: Missing environment credentials (`PEXELS_API_KEY`, `PIXABAY_API_KEY`). Returns zero results and an explicit empty state.
- `NOT_SUPPORTED`: Provider does not support requested media type.
- `TEMP_UNAVAILABLE`: Provider rate limited (429) or upstream 5xx error.
- `ERROR`: General communication failure.

---

## 7. Licensing & Attribution Preservation

All external stock results preserve explicit licensing metadata:
- **Provider Name**: e.g., `pexels` or `pixabay`.
- **Source Page URL**: Direct link to the creator's asset page.
- **License Type**: Specific license name (e.g., `Pexels License`, `Pixabay Content License`).
- **Attribution Text**: Formatted attribution string (e.g., `Photo by John Doe on Pexels`).
- Vireo **never** claims assets are "royalty-free" or "copyright-free" unless provider metadata explicitly states it.

---

## 8. Safe Media Import & SSRF Protection (`mediaImportService.ts`)

External media assets are downloaded exclusively through the backend with strict network and format validation:
1. **Protocol Check**: Only `http:` and `https:` schemes allowed.
2. **DNS Resolution & Private IP Guard**: Target host is resolved; loopback (`127.0.0.0/8`), private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and AWS/GCP metadata endpoints (`169.254.169.254`) are blocked before initiating connection.
3. **Redirect Protection**: Maximum 3 redirects allowed, with each destination IP re-validated.
4. **MIME Type Validation**: `Content-Type` header must be allowlisted video (`video/mp4`, `video/quicktime`, `video/webm`) or image (`image/jpeg`, `image/png`, `image/webp`).
5. **Size Limit**: Enforces a strict 100MB download cap.
6. **FFprobe Integrity**: Downloaded files are inspected with `ffprobe` to verify non-malicious stream headers before moving to persistent storage.

---

## 9. Editor Timeline Insertion & Compositing

When a B-roll suggestion is applied:
1. A dedicated `VIDEO` track named `B-Roll` is created (or reused) above the base footage.
2. Timeline boundaries (`timeline_start`, `timeline_end`) are set to the opportunity slot.
3. Media boundaries (`source_start`, `source_end`) are non-destructively trimmed.
4. Audio is set to **Muted** (`muted: true`) by default to prevent clashing with speaker voiceover.
5. Render Graph V2 compiles FFmpeg arguments using multi-input `filter_complex` overlay pipelines:
   `[0:v]scale=1080:1920[base]; [1:v]scale=1080:1920[broll]; [base][broll]overlay=enable='between(t,2.0,6.5)'[outv]`

---

## 10. AI-Generated Media Provider (`GeneratedMediaProvider`)

Architecture for future text-to-image and text-to-video capabilities:
- Provider exposes `NOT_CONFIGURED` when `OPENAI_API_KEY` / `RUNWAY_API_KEY` is not present.
- UI displays clear provider status rather than placeholder forms.
- Cost and quota limits are enforced prior to calling remote generation endpoints.

---

## 11. Producer <-> Editor Roundtrip Handoff

Phase 17 Producer plans with `BROLL_INSERTION` operations hand off cleanly to Phase 19:
1. Producer detects conceptual B-roll slots during plan creation.
2. Phase 19 resolves slots against real indexed project assets and configured stock providers.
3. Applied operations are converted into `EditorProject` timeline tracks with exact start/end bounds.
4. Subsequent Producer plan evaluations preserve existing user-inserted B-roll tracks.

---

## 12. Security & Resource Limits

| Resource | Boundary | Enforcement |
| :--- | :--- | :--- |
| **Max Import File Size** | 100 MB | `mediaImportService.ts` |
| **Max Import Redirects** | 3 | `UrlValidator.ts` |
| **Max Search Query Length** | 100 chars | `mediaController.ts` |
| **Search Limit** | 50 items/page | `mediaController.ts` |
| **Max B-roll Tracks** | 4 tracks | `proEditorService.ts` |
| **FFmpeg Execution** | Array arguments only | Zero shell interpolation |
| **IDOR Isolation** | `user_id` scoped queries | `dataRepository` & `ownerContext` |

---

## 13. Known Limitations & Phase 20 Roadmap
- **Semantic Embeddings**: Keyword and tag search is fully active. Vector similarity using external embedding models (e.g., text-embedding-3) is supported in schema but deferred to when embedding provider keys are configured.
- **Audio Ducking**: Phase 19 mutes B-roll audio by default. Dynamic background music ducking under speaker voiceover is scheduled for Phase 20 Audio & Voice Studio.

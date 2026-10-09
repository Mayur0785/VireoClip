# PHASE 25: THUMBNAIL LAB — ARCHITECTURE & USER GUIDE

## 1. Executive Summary

Phase 25 introduces **Thumbnail Lab**, a dedicated, brand-aware studio built specifically for high-impact YouTube and short-form video thumbnails. Rather than generating random images detached from source videos, Thumbnail Lab is built around **real video frame intelligence**, **safe non-destructive typography compositing**, **Brand Brain alignment**, and **deterministic 6-factor quality scoring**.

---

## 2. Architecture & Design Principles

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIREO THUMBNAIL LAB                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
  Source Frame Extraction     Brand Brain Context     Content Pack Sync
 (Scene Cuts, Faces, OCR)    (Colors, Fonts, Rules)  (Imported Directives)
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    │
                                    ▼
                     Concept Generation & Synthesis
                 (4-12 Diverse Creative Visual Styles)
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
Non-Destructive Canvas Editor                     Explainable 6-Factor Quality
 • Headline / Subheadline                         • Readability (25%)
 • Font Family & Weight                           • Contrast (20%)
 • Stroke & Drop Shadow                           • Composition & Safe-areas (15%)
 • Safe-Area Overlay (16:9 / 9:16)               • Subject Visibility (15%)
 • Zoom, Crop, Contrast & Gradients               • Brand Fit (15%)
                                                  • Topic Relevance (10%)
                                    │
                                    ▼
                    Version History & Lock Protection
                   (Snapshotting, Revert, Regeneration)
                                    │
                                    ▼
                     Approval & Publishing Handoff
                     • Brand Evidence Learning
                     • Composer Post Attachment
```

### Core Design Principles:
1. **Source Frame Grounding**: Thumbnails are rooted in actual video frame extractions (via FFmpeg scene cut and face analysis) rather than generic hallucinations.
2. **Typography as First-Class Citizen**: Cover headlines are non-destructive compositing layers, ensuring pixel-crisp fonts, customizable strokes, shadows, and instant copy edits without regenerating underlying image assets.
3. **Provider Honesty**: When external generative image keys (`AI_IMAGE_GEN_API_KEY`, `STABILITY_API_KEY`, `FAL_KEY`) are unconfigured, Vireo truthfully reports `NOT_CONFIGURED` instead of fabricating mock AI renders.
4. **Explainable Scoring**: Quality scores are based on deterministic visual metrics, never misleading CTR or view count claims.

---

## 3. The 6-Factor Thumbnail Quality Score

The Thumbnail Quality Score is calculated deterministically on a **0–100 scale**:

$$\text{Overall Score} = (0.25 \times \text{Readability}) + (0.20 \times \text{Contrast}) + (0.15 \times \text{Composition}) + (0.15 \times \text{Subject}) + (0.15 \times \text{Brand}) + (0.10 \times \text{Topic})$$

| Dimension | Weight | Deterministic Diagnostic Rules |
| :--- | :---: | :--- |
| **Readability** | 25% | Penalizes text > 7 words or > 40 chars; awards bonus for concise 2-4 word punchy covers and font size $\ge 48\text{px}$. |
| **Contrast** | 20% | Computes luminance contrast between text color and background; awards high contrast with stroke ($\ge 3\text{px}$) and drop shadow. |
| **Composition & Safe-Area** | 15% | Validates safe area bounds (10% padding). Flags bottom-right timecode badge collisions on YouTube 16:9 thumbnails. |
| **Subject Visibility** | 15% | Assesses face detection and focal center alignment ($x: 0.2\text{--}0.8, y: 0.2\text{--}0.8$). |
| **Brand Fit** | 15% | Validates usage of brand primary/accent colors and approved brand typography from `BrandContextService`. |
| **Topic Relevance** | 10% | Verifies semantic alignment between headline keywords and the clip transcript/title. |

> [!NOTE]
> **Scoring Limitations**: This score evaluates visual hierarchy, legibility, and brand compliance. It does **not** predict YouTube recommendation algorithms, external CTR, or total impressions.

---

## 4. Supported Style Directions

Thumbnail Lab supports 8 distinct creative directions:
- `EXPRESSIVE_CREATOR_PORTRAIT`: Creator reaction and emotional expression.
- `CINEMATIC_STORYTELLING`: Wide atmospheric framing with subtle vignette.
- `BOLD_TYPOGRAPHY`: Giant high-contrast lettering built for mobile feeds.
- `CLEAN_EDUCATIONAL`: Balanced minimalist graphics for technical breakdowns.
- `PODCAST_EDITORIAL`: Split-frame or guest highlight with subtle brand tint.
- `MINIMAL_PREMIUM`: Understated elegance with clean geometry.
- `HIGH_CONTRAST_VISUAL`: Neon or complementary complementary split-tones.
- `PRODUCT_SUBJECT_FOCUSED`: Hero focus on an item, software demo, or diagram.

---

## 5. Non-Destructive Typography & Safe Areas

### Supported Font Families:
- **Outfit** (Primary high-impact sans)
- **Montserrat** (Bold geometric cover)
- **Inter** (Clean editorial)
- **Bebas Neue** (Condensed poster headline)
- **Poppins** (Modern clean sans)
- **Playfair Display** (Editorial serif)

### Platform Safe-Area Overlays:
- **16:9 (YouTube Standard)**: Highlights bottom-right timestamp zone (bottom 15%, right 20%) to prevent title occlusion.
- **9:16 (Shorts / Reels / TikTok)**: Highlights bottom caption and profile zones (bottom 25%, top 10%).

---

## 6. End-to-End Workflow

1. **Enter Thumbnail Lab**: Click "Thumbnail" from Clip Editor workspace or "Open in Thumbnail Lab" from Content Pack.
2. **Review Source Frames**: Browse extracted keyframes across scene cuts and face captures.
3. **Generate Concepts**: Click "Generate Concepts" with optional custom guidance.
4. **Edit & Composite**: Tweak headline text, font, stroke, shadow, colors, or composition in the live canvas.
5. **Inspect Diagnostics**: Review real-time 6-factor score breakdown, warnings, and safe area compliance.
6. **Lock & Regenerate**: Lock preferred concepts while regenerating others.
7. **Approve & Publish**: Approving creates a version snapshot, trains Brand Brain (`sourceType: APPROVED_EDIT`), and attaches the asset to the Vireo Publishing Composer.

---

## 7. Verification Baseline & Test Results

- **Unit & Integration Suite**: `src/tests/phase25ThumbnailLab.test.ts` (10 suites, 16 assertions, 100% passing).
- **Zero Regressions**: Phase 23 (25/25 passing), Phase 24 (21/21 passing).
- **TypeScript**: Server `tsc` 0 errors, Client `tsc && vite build` built clean in 4.28s.

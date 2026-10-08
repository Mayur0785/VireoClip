# Vireo Multimodal Video Intelligence / ClipAnything (Phase 16)

## 1. Overview & Architecture

Vireo's Multimodal Video Intelligence engine transforms clip discovery from single-modality transcript scanning into a holistic, multimodal understanding of long-form videos. It fuses **visual pacing**, **conversational pauses**, **vocal energy**, **face framing**, and **on-screen typography** with deep transcript semantics.

All processing runs **100% locally on configured server workers** without external video streaming costs or ungrounded synthetic inferences.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Long-Form Video Input                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   Visual Processing         Audio Processing         Textual Processing
 ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 │ FFmpeg Scene    │       │ FFmpeg Silence  │       │ Whisper ASR     │
 │ Cut Detection   │       │ Detect (-30dB)  │       │ Word Alignment  │
 ├─────────────────┤       ├─────────────────┤       ├─────────────────┤
 │ Bounded JPEG    │       │ FFmpeg Volume   │       │ Local Tesseract │
 │ Keyframes       │       │ RMS Energy      │       │ Keyframe OCR    │
 ├─────────────────┤       └────────┬────────┘       └────────┬────────┘
 │ OpenCV Haar     │                │                         │
 │ Face Presence   │                │                         │
 └────────┬────────┘                │                         │
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    ▼
                 ┌──────────────────────────────────────┐
                 │     Multimodal Timeline Fusion       │
                 │      (video_analyses in Mongo)       │
                 └──────────────────┬───────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌──────────────────────────────┐            ┌──────────────────────────────────┐
│   Vireo Clip Scoring Engine  │            │  Natural Language Moment Search  │
│  - 0–100 Explainable Score   │            │  - POST /projects/:id/find-moments│
│  - Boundary Silence Snapping │            │  - Semantic & Visual Grounding   │
│  - Platform Fit (5 Channels) │            │  - Duration & Feed Filtering     │
└──────────────────────────────┘            └──────────────────────────────────┘
```

---

## 2. Multimodal Signal Components

### 2.1 Visual Scene Cuts & Visual Activity (`VideoSceneService`)
- **Engine**: FFmpeg scene detection filter (`select='gt(scene,0.25)',metadata=print`).
- **Metric**: Deterministic Visual Activity Score (0–100) combining cut frequency and transition intensity.
- **Keyframes**: Bounded to max 24 keyframes per video, scaled to 640x360 JPEG, stored in temporary directories with guaranteed cleanup.

### 2.2 Conversational Silence Detection & Audio Energy (`AudioFeatureService`)
- **Silence Pauses**: FFmpeg `silencedetect=noise=-30dB:d=0.3` captures natural pauses.
- **Boundary Refinement**: Automatically snaps clip boundaries forward (for start) or backward (for end) to conversational pauses to eliminate abrupt mid-word or mid-sentence cuts.
- **Volume Energy**: FFmpeg `volumedetect` computes RMS mean and peak volume, scoring dynamic range (0–100).

### 2.3 On-Screen Text / OCR (`OcrFeatureService`)
- **Engine**: Real local Tesseract OCR executed on extracted keyframes with canonical file path resolution.
- **Cleaning & Deduplication**: Collapses whitespace, removes noise artifacts, and correlates text with timestamps.
- **Zero-Fabrication Guard**: When Tesseract is unavailable or no text is detected, status is explicitly set to `NOT_CONFIGURED` or `empty`.

### 2.4 Face Presence & Framing (`FaceFeatureService`)
- **Engine**: Local OpenCV Haar Cascade through `SmartReframeService` sampling at 1.5–2.0 fps.
- **Strict Privacy & Biometric Constraint**: Zero facial recognition, biometric identity tokens, or profile matching. Only presence flags and bounding box centrality are measured.

### 2.5 Strict Zero-Fabrication Guarantees
- **Speaker Diarization**: Whisper providers in the pipeline do not perform diarization; speaker fields are strictly populated as `'speaker_unknown'`.
- **Object Detection**: Without a configured local object detector, status is strictly set to `'NOT_CONFIGURED'`.
- **Labels**: No hallucinated emotion, scene, or sentiment classifications.

---

## 3. Explainable Vireo Clip Scoring (0–100)

Every clip candidate is scored via a deterministic, weighted formula:

$$\text{Vireo Score} = 0.25 \times \text{Hook} + 0.20 \times \text{Standalone} + 0.15 \times \text{Insight} + 0.15 \times \text{Visual} + 0.15 \times \text{Audio} + 0.10 \times \text{Platform}$$

| Component | Weight | Multimodal Signals Considered |
| :--- | :---: | :--- |
| **Hook Score** | 25% | Opening 3.5s face presence, opening visual cut intensity, punchy transcript opening line |
| **Standalone Score** | 20% | Silence boundary alignment at conclusion, complete sentence grammar, optimal 20–60s duration |
| **Insight Score** | 15% | Semantic density, keyframe OCR reinforcing terminology, conceptual resolution |
| **Visual Activity** | 15% | Cut frequency (sweet spot: 1 cut every 2.5–4s), camera dynamics |
| **Audio Energy** | 15% | Audible vocal clarity (-24dB to -14dB), healthy dynamic headroom without clipping |
| **Platform Fit** | 10% | Duration compatibility with YouTube Shorts (<=60s), Reels (<=90s), and TikTok FYP |

### Explainability Breakdown (`why_this_moment`)
Each scored candidate includes human-readable reasons, for example:
- *"High-engagement face presence detected in the opening 3 seconds for strong viewer hook"*
- *"Clean ending on a natural conversational pause with zero mid-sentence truncation"*
- *"Dynamic visual pacing (78/100 activity) keeps short-form attention"*
- *"Optimal short-form duration (34s) within the sweet spot for maximum completion rate"*

---

## 4. Multi-Platform Suitability Matrix

Candidates evaluate suitability across 5 major distribution channels:

```json
{
  "shorts": {
    "suitable": true,
    "score": 88,
    "recommended_ratio": "9:16",
    "reason": "Fully within YouTube Shorts 60s limit with strong hook retention"
  },
  "tiktok": {
    "suitable": true,
    "score": 91,
    "recommended_ratio": "9:16",
    "reason": "Fast opening tempo and high hook strength fit TikTok FYP algorithms"
  },
  "instagram": {
    "suitable": true,
    "score": 86,
    "recommended_ratio": "9:16",
    "reason": "Optimal 9:16 vertical delivery for Instagram Reels feed discovery"
  },
  "linkedin": {
    "suitable": true,
    "score": 85,
    "recommended_ratio": "1:1",
    "reason": "Substantive professional insight suitable for feed autoplay with captions"
  },
  "x": {
    "suitable": true,
    "score": 86,
    "recommended_ratio": "16:9",
    "reason": "Punchy concise observation suitable for X timeline engagement"
  }
}
```

---

## 5. Natural-Language Moment Search API

### Endpoint: `POST /api/projects/:projectId/find-moments`

Enables creators to ask natural language queries (e.g. *"find the section explaining reframe"* or *"best hook about AI monetization"*).

#### Request
```http
POST /api/projects/73e3ddfc-739f-499a-8fca-c057424ca84f/find-moments HTTP/1.1
Content-Type: application/json
Authorization: Bearer <supabase_jwt>

{
  "query": "auto reframe vertical clips",
  "targetDuration": 30,
  "platform": "tiktok",
  "minScore": 60
}
```

#### Response
```json
{
  "status": "ok",
  "data": {
    "query": "auto reframe vertical clips",
    "count": 1,
    "moments": [
      {
        "start_seconds": 15.0,
        "end_seconds": 30.0,
        "duration_seconds": 15.0,
        "title": "Auto reframe vertical clips",
        "hook": "Generate vertical clips with AI-driven smart auto reframe.",
        "reason": "Matched \"auto reframe vertical clips\" with strong multimodal pacing and natural speech pauses.",
        "vireo_score": 88,
        "match_confidence": 100,
        "match_reasons": ["Exact match for query search terms"],
        "explanation": {
          "overall_score": 88,
          "hook_score": 85,
          "standalone_score": 90,
          "insight_score": 88,
          "visual_activity_score": 75,
          "audio_energy_score": 80,
          "platform_fit_score": 92,
          "reasons": [
            "High-engagement face presence detected in the opening 3 seconds for strong viewer hook",
            "Clean ending on a natural conversational pause with zero mid-sentence truncation"
          ],
          "platform_suitability": { ... }
        },
        "category": "insight"
      }
    ]
  }
}
```

---

## 6. Background Worker & Queue Persistence

- **Collection**: `video_analysis_jobs` in MongoDB.
- **Atomic Lease Protocol**: `findOneAndUpdate` leases jobs in `queued` status or jobs with stale `locked_at` leases older than 5 minutes.
- **Stage Progression**:
  1. `queued` (0%)
  2. `extracting_scenes` (20%)
  3. `analyzing_audio` (40%)
  4. `extracting_keyframes` (60%)
  5. `running_ocr` (75%)
  6. `detecting_faces` (90%)
  7. `fusing_timeline` (95%)
  8. `completed` (100%)
- **Lease Timeout**: 300 seconds (5 minutes) with automatic worker crash recovery.

---

## 7. Verification & Testing

- **Deterministic Unit Tests**: `server/src/tests/phase16Multimodal.test.ts` (12/12 passing).
- **Real Video E2E Verification**: `server/src/tests/phase16RealVideoVerify.test.ts` (7/7 passing on `artifacts/vireo-launch/vireo-launch-preview-1080p.mp4`).
- **Full Platform Regression**: 211/211 tests passing across Phases 8 through 16 with zero regressions.

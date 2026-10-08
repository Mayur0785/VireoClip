# Vireo Pro Video Editor — Architecture & Specifications

## 1. Overview
The **Vireo Pro Video Editor** (Phase 18) bridges AI automation with precision creator manual control. It introduces a CapCut-caliber non-destructive multi-track timeline editing system while guaranteeing complete immutability for source media assets.

The workflow integrates seamlessly with the Phase 17 AI Producer:
```
AI Producer (Plan & First Edit)
      ↓
Open in Pro Multi-Track Editor
      ↓
Manual Fine-Tuning (Trims, Keyframes, Text, Audio, Filters)
      ↓
Interactive Canvas Preview
      ↓
Deterministic FFmpeg Render Graph V2
      ↓
Publish / Download
```

---

## 2. Editor Document Model
Every edit session is represented by a persistent non-destructive `EditorProject` document stored in MongoDB / Supabase:
- **`id`**: Unique UUID for the editing project.
- **`user_id`**: Owner identifier strictly verified to prevent IDOR attacks.
- **`clip_id`**: Associated clip candidate reference.
- **`version`**: Monotonically increasing revision number.
- **`status`**: `draft` | `rendering` | `ready` | `failed`.
- **`canvas`**:
  - `width`, `height`, `aspect_ratio` (9:16, 1:1, 16:9, 4:5), `fps` (30), `duration` (seconds).
  - `background_color` (hex string), `background_mode` (`color`, `blur_source`, `transparent`).
- **`tracks`**: Ordered array of multi-track lanes.
- **`playhead`**: Current scrubbing position in seconds.
- **`settings`**:
  - `snapping`: Magnetic snapping enabled/disabled.
  - `safe_guides`: TikTok / Reels / Shorts UI overlay boundaries.
  - `snap_tolerance_sec`: Snapping threshold (default 0.15s).
- **`producer_plan_id`**: Linked AI Producer Edit Plan reference when initialized via AI automation.

---

## 3. Timeline Track Model
Tracks are typed according to their content type:
1. **`VIDEO`**: Main and secondary video layers with transforms, crops, speeds, and color adjustments.
2. **`AUDIO`**: Voice, BGM, and sound effect layers with volume, fades, and EBU R128 loudness normalization.
3. **`TEXT`**: Dynamic text titles and hook overlays with curated safe fonts and styling.
4. **`CAPTION`**: Word-level and segment-level kinetic subtitles with active word highlighting and karaoke styling.
5. **`IMAGE`**: Still image assets and freeze-frame segments.
6. **`OVERLAY`**: Brand watermarks and logo overlays.
7. **`BROLL_PLACEHOLDER`**: Visual placeholder reserved for Phase 19 AI B-Roll discovery.

### Track Item Properties
- **`id`**: Unique track item UUID.
- **`track_id`**: Parent track ID.
- **`timeline_start` / `timeline_end`**: Placement on the master timeline in seconds.
- **`source_start` / `source_end`**: Source media slice boundaries in seconds (non-destructive).
- **`transform`**: `position_x`, `position_y`, `scale`, `rotation`, `opacity`.
- **`speed`**: Playback rate (`0.25x` to `4.0x`), pitch preservation toggle, speed ramp presets (`smooth`, `punch`, `fast_in`, `fast_out`).
- **`color`**: Exposure, brightness, contrast, highlights, shadows, saturation, temperature, tint, fade, sharpen.
- **`filter`**: Presets (`clean`, `warm`, `cool`, `film`, `punch`, `soft`, `mono`, `creator`).
- **`effects`**: Array of applied visual effects (`blur`, `sharpen`, `vignette`, `grain`, `pixelate`).
- **`keyframes`**: Dynamic temporal animations for position, scale, rotation, opacity, and audio volume with deterministic easing (`linear`, `ease-in`, `ease-out`, `ease-in-out`).
- **`locked` / `muted` / `hidden`**: Per-item state flags.

---

## 4. Timeline Editing Interactions
- **Split (`S`)**: Splits the active item at the current playhead into two non-destructive items with adjusted timestamps without duplicating underlying source media.
- **Ripple Delete**: Deletes an item and closes the resulting gap across all unlocked tracks while preserving locked tracks.
- **Duplicate (`Cmd+D`)**: Creates an exact clone of a timeline item with a newly generated UUID.
- **Trim Handles**: Interactive left and right handles with source timestamp clamping preventing negative offsets.
- **Snapping**: Snapping to playhead and neighboring clip edges with a visual yellow guide line.
- **Freeze Frame**: Extracts a single frame at the current playhead using real FFmpeg frame extraction and inserts a 3.0-second still segment.
- **Snapshot**: Exports the current playhead frame directly as a PNG image.

---

## 5. Preview Canvas & Direct Manipulation
- **Multi-Format Canvas**: Interactive container supporting 9:16 vertical, 1:1 square, 16:9 widescreen, and 4:5 portrait formats.
- **Live CSS Filters & Transforms**: Real-time preview rendering transforms, color grading (`brightness`, `contrast`, `saturation`, `sepia`), and filter presets.
- **Bounding Box Gizmo**: Direct on-canvas translation dragging, corner scale handles, and top rotation handle.
- **Safe Area Guides**: Visual overlays indicating platform header zones, comment/action rails, and bottom caption boundaries for TikTok, Reels, and YouTube Shorts.
- **Proxy Preview**: Proxy resolution selector (`Auto`, `360p`, `540p`, `720p`) for smooth preview performance.

---

## 6. Typography & Text System
- **Curated Safe Font Registry**: Restricts font selections to validated fonts (`Inter`, `Roboto`, `Montserrat`, `Arial`, `Impact`, `Oswald`, `Courier New`, `Georgia`).
- **Arbitrary Paths Blocked**: Prevents filesystem font path injections or unsafe font loading.
- **Text Presets**: Original Vireo presets including `Minimal`, `Bold`, `Creator`, `Editorial`, `Punch`, `Clean`, and `Highlight`.
- **Text Animations**: CSS keyframe animations including `Fade`, `Slide Up`, `Pop`, `Typewriter`, `Scale`, and `Bounce-lite`.

---

## 7. Kinetic Captions
- **Word-Level Highlighting**: Live synchronization with playhead highlighting currently spoken words.
- **Styles**: `Word-by-word`, `Karaoke`, `Active word highlight`, `Minimal`, `Bold`, `Boxed`, and `Outline`.
- **Zero Duplication Guarantee**: Preserves exact transcript synchronization and prevents duplicate subtitle overlays.

---

## 8. Audio Architecture
- **Multi-Track Audio**: Separate audio lanes for dialogue, background score, and sound effects.
- **Speech Normalization**: Integrates Phase 17 EBU R128 (`loudnorm`) targeting -16 LUFS with -1.5 dB true peak limit.
- **Fades**: Configurable audio fade-in and fade-out durations.
- **Volume**: Clamped volume range between `0%` (silent) and `200%` (+6 dB boost).

---

## 9. Render Graph V2
The Render Graph V2 engine compiles the high-level `EditorProject` document into safe, deterministic FFmpeg arguments:
- **No Raw Shell Interpolation**: All filter arguments are passed as discrete string arrays via `execFileAsync(ffmpegBin, args)`.
- **Filter Chains**:
  - Base input video $\rightarrow$ crop filter (`buildCropFilter`) $\rightarrow$ fps normalizer.
  - Color grading $\rightarrow$ `eq`, `colorbalance`, `curves`.
  - Video effects $\rightarrow$ `vignette`, `boxblur`, `unsharp`.
  - Keyframe zoom $\rightarrow$ dynamic temporal `crop` expressions.
  - Text layers $\rightarrow$ sanitized `drawtext` filters with safe coordinate placement.
  - Audio $\rightarrow$ `loudnorm`, `afade`.
- **Post-Render Validation**: Executes `ffprobe` to verify video codec, audio stream presence, frame dimensions, and final duration before marking render jobs as complete.

---

## 10. Undo, Redo & Autosave
- **Undo / Redo History**: In-memory state stack allowing full traversal of timeline modifications (`Cmd+Z`, `Cmd+Shift+Z`).
- **Debounced Autosave**: Changes are automatically committed to the backend 1.5 seconds after user idle, presenting visual status badges (`Saved`, `Saving...`, `Save failed`).
- **Command Palette (`Cmd+K`)**: Rapid keyboard command search for timeline actions, text addition, aspect reframes, and rendering.

---

## 11. Security & Resource Limits
- **IDOR Protection**: Strictly enforces `project.user_id === user.id` on all endpoints.
- **Strict Resource Limits (`EDITOR_RESOURCE_LIMITS`)**:
  - `MAX_TRACKS`: 16 tracks.
  - `MAX_TIMELINE_ITEMS`: 120 items.
  - `MAX_TEXT_LAYERS`: 25 layers.
  - `MAX_EFFECTS_PER_ITEM`: 5 effects.
  - `MAX_KEYFRAMES_PER_ITEM`: 30 keyframes.
  - `MAX_TRANSITIONS`: 30 transitions.
  - `MAX_EDITOR_DURATION`: 300 seconds (5 minutes).
  - `MAX_IMAGE_ASSET_SIZE`: 15 MB.
- **Source Immutability**: Source files and candidate clips are read-only; all operations output to derived storage paths.

---

## 12. Optional Capabilities Status
- **Advanced HSL**: DEFERRED
- **Curves**: DEFERRED
- **Color Wheels**: DEFERRED
- **Background Removal**: NOT_CONFIGURED (local AI segmentation model not bundled; explicitly marked unavailable without fabricating output)
- **Reverse**: DEFERRED
- **Advanced Noise Reduction**: DEFERRED_TO_PHASE_20
- **AI B-Roll Discovery**: DEFERRED_TO_PHASE_19

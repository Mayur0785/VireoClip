#!/usr/bin/env python3
"""
Vireo Smart Reframe — Face Detection & Tracking Analyzer
Uses OpenCV Haar Cascade for local face detection.
No paid APIs. No biometric identification. No model downloads at runtime.

Input: JSON on stdin with { "videoPath": "...", "sampleFps": 4 }
Output: JSON on stdout with detected face samples per frame.

Invoked ONLY by Node.js backend via execFile — never by frontend.
"""

import sys
import json
import os
import cv2
import numpy as np


def load_cascade():
    """Load the bundled Haar cascade for frontal face detection."""
    cascade_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
    if not os.path.isfile(cascade_path):
        raise RuntimeError(f"Haar cascade not found at {cascade_path}")
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        raise RuntimeError("Failed to load Haar cascade classifier")
    return cascade


def analyze_video(video_path: str, sample_fps: float = 4.0, start_sec: float = 0.0, duration_sec: float = 0.0):
    """
    Sample frames from video and detect faces within [start_sec, start_sec + duration_sec].
    Returns normalized face bounding boxes per sampled frame with clip-local timestamps.
    """
    if not os.path.isfile(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_video_duration = frame_count / source_fps if source_fps > 0 else 0

    if frame_count <= 0 or source_width <= 0 or source_height <= 0:
        cap.release()
        raise RuntimeError("Invalid video dimensions or frame count")

    # Clamp start_sec and compute start_frame / end_frame
    start_sec = max(0.0, min(total_video_duration, start_sec))
    start_frame = int(round(start_sec * source_fps))

    if duration_sec > 0:
        effective_duration = min(duration_sec, total_video_duration - start_sec)
    else:
        effective_duration = total_video_duration - start_sec
    end_frame = min(frame_count, start_frame + int(round(effective_duration * source_fps)))

    # Calculate frame sampling interval
    effective_sample_fps = min(sample_fps, source_fps)
    frame_interval = max(1, int(round(source_fps / effective_sample_fps)))

    cascade = load_cascade()

    samples = []
    frame_index = start_frame
    max_samples = 600  # Safety cap

    while len(samples) < max_samples and frame_index < end_frame:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ret, frame = cap.read()
        if not ret:
            break

        # Timestamp local to the clip segment (0.0 to duration)
        time_sec = round((frame_index - start_frame) / source_fps, 3)

        # Convert to grayscale for detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        # Detect faces

        faces = cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(int(source_width * 0.04), int(source_height * 0.04)),
            flags=cv2.CASCADE_SCALE_IMAGE
        )

        face_list = []
        for (x, y, w, h) in faces:
            # Normalize coordinates to 0-1
            nx = round(x / source_width, 4)
            ny = round(y / source_height, 4)
            nw = round(w / source_width, 4)
            nh = round(h / source_height, 4)
            cx = round((x + w / 2) / source_width, 4)
            cy = round((y + h / 2) / source_height, 4)
            area = round(nw * nh, 6)
            face_list.append({
                "x": nx,
                "y": ny,
                "width": nw,
                "height": nh,
                "center_x": cx,
                "center_y": cy,
                "area": area,
                "confidence": 0.85  # Haar cascades don't return confidence; use fixed high value
            })

        samples.append({
            "time": time_sec,
            "faces": face_list
        })

        frame_index += frame_interval
        if frame_index >= frame_count:
            break

    cap.release()

    return {
        "source_width": source_width,
        "source_height": source_height,
        "source_fps": round(source_fps, 2),
        "duration": round(effective_duration, 3),
        "total_video_duration": round(total_video_duration, 3),
        "sample_fps": round(effective_sample_fps, 2),
        "sample_count": len(samples),
        "samples": samples
    }


def main():
    try:
        raw_input = sys.stdin.read()
        params = json.loads(raw_input)

        video_path = params.get("videoPath", "")
        sample_fps = float(params.get("sampleFps", 4.0))
        start_sec = float(params.get("startSec", 0.0))
        duration_sec = float(params.get("durationSec", 0.0))

        # Validate input — only accept an existing file path
        if not video_path or not isinstance(video_path, str):
            raise ValueError("Missing or invalid videoPath")
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        # Clamp sample FPS
        sample_fps = max(1.0, min(10.0, sample_fps))
        start_sec = max(0.0, start_sec)
        duration_sec = max(0.0, duration_sec)

        result = analyze_video(video_path, sample_fps, start_sec, duration_sec)

        # Output structured JSON
        print(json.dumps({"status": "ok", **result}))

    except Exception as e:
        error_result = {
            "status": "error",
            "error_code": type(e).__name__,
            "error_message": str(e)
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()


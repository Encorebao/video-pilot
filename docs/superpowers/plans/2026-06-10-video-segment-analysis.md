# Video Segment Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade analysis from single-frame visual guesses to subtitle-aware video segment analysis that can classify A-roll/B-roll and evaluate camera movement.

**Architecture:** Keep the existing FastAPI job pipeline and project manifest shape. Add video-clip direct model calls alongside current keyframe extraction, using subtitles to classify speech-bearing segments as A-roll and silent segments as B-roll. Preserve existing `legacySummary.visual_analysis.scenes` so the current frontend keeps rendering results.

**Tech Stack:** FastAPI, Python, ffmpeg/ffprobe, OpenAI-compatible chat completions, Qwen3-VL video input, pytest.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `backend/tests/test_jobs_api.py`
- Modify: `backend/tests/test_openai_compatible.py`

- [x] Add a job-worker test where two scenes overlap different subtitle ranges and become `aroll` and `broll`.
- [x] Assert the worker calls direct video clip analysis instead of per-frame-only analysis.
- [x] Assert returned `segment_analysis`, `speech`, `camera`, `quality`, and `edit_role` are persisted under each scene.
- [x] Add an OpenAI-compatible service test for video payload construction.
- [x] Run focused tests and confirm the new tests fail before implementation.

### Task 2: Implement Video Segment Model Calls

**Files:**
- Modify: `backend/app/services/openai_compatible.py`
- Modify: `backend/app/services/frame_extraction.py`
- Modify: `backend/app/services/job_worker.py`

- [x] Add `describe_video_clip()` to send `data:video/mp4;base64,...` via `video_url`.
- [x] Add `extract_video_segment_clip()` to trim bounded scene clips into the analysis job folder.
- [x] Add subtitle overlap helpers for segment speech detection.
- [x] Add segment prompt generation for A-roll/B-roll classification, movement evidence, visual content, and quality.
- [x] Store segment results without breaking existing `vl_analysis` fields.

### Task 3: Verify

**Files:**
- Test: `backend/tests/test_openai_compatible.py`
- Test: `backend/tests/test_frame_extraction.py`
- Test: `backend/tests/test_jobs_api.py`

- [x] Run focused tests for OpenAI-compatible payload construction.
- [x] Run focused tests for frame extraction and job analysis.
- [x] Run the full backend pytest suite if focused tests are clean.

Verification:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_openai_compatible.py::test_describe_video_clip_sends_data_video_payload tests/test_frame_extraction.py::test_extract_video_segment_clip_clamps_bounds_and_runs_ffmpeg tests/test_jobs_api.py::test_worker_analysis_classifies_speech_segments_and_calls_video_vl -q
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_openai_compatible.py tests/test_frame_extraction.py tests/test_jobs_api.py -q
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q
```

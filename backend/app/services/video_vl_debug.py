from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

from app.core.project_paths import ensure_project_subdirs, normalize_project_folder
from app.repositories.model_configs import ModelRuntimeConfig, get_model_runtime_config
from app.schemas.vl_debug import (
    VlFrameSamplingDebugRequest,
    VlFrameSamplingDebugResponse,
    VlFrameSamplingItem,
)
from app.services.frame_extraction import extract_keyframe, get_video_duration
from app.services.openai_compatible import ModelCallError, require_runtime_config, _endpoint, _extract_json_object


def post_chat_completion(
    config: ModelRuntimeConfig,
    messages: list[dict[str, Any]],
    *,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> str:
    headers = {"Content-Type": "application/json"}
    if config.api_key.strip():
        headers["Authorization"] = f"Bearer {config.api_key}"

    payload = {
        "model": config.model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        response = httpx.post(
            _endpoint(config.base_url, "chat/completions"),
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ModelCallError(f"Model request failed: {exc}") from exc

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ModelCallError("Model response did not include choices[0].message.content") from exc
    if not isinstance(content, str) or not content.strip():
        raise ModelCallError("Model response content is empty")
    return content


def run_frame_sampling_debug(payload: VlFrameSamplingDebugRequest) -> VlFrameSamplingDebugResponse:
    project_folder = normalize_project_folder(payload.projectFolder)
    vl_config = require_runtime_config(get_model_runtime_config("vl"), "vl")
    video_path = Path(payload.videoPath).expanduser().resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video file does not exist: {video_path}")
    if not video_path.is_file():
        raise ValueError(f"Video path is not a file: {video_path}")

    prompt_text = _build_debug_prompt(payload)
    duration = max(0.0, float(get_video_duration(video_path) or 0.0))
    sample_times = _sample_times(duration, payload.intervalSeconds, payload.maxFrames)
    run_dir = _debug_run_dir(project_folder)
    frames_dir = run_dir / "frames"
    frames: list[VlFrameSamplingItem] = []

    for index, time_sec in enumerate(sample_times):
        frame_path = frames_dir / f"frame_{index:04d}.jpg"
        extract_keyframe(video_path, time_sec, frame_path)
        raw_content = post_chat_completion(
            vl_config,
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_text},
                        _build_image_url_content(frame_path),
                    ],
                }
            ],
            temperature=payload.temperature,
            max_tokens=payload.maxTokens,
            timeout=payload.timeout,
        )
        parsed: dict[str, Any] | None = None
        parse_error: str | None = None
        try:
            parsed = _extract_json_object(raw_content)
        except ModelCallError as exc:
            parse_error = str(exc)
        frames.append(
            VlFrameSamplingItem(
                index=index,
                time=round(time_sec, 3),
                framePath=str(frame_path),
                parsed=parsed,
                rawContent=raw_content,
                parseError=parse_error,
            )
        )

    request_summary = {
        "model": vl_config.model,
        "baseUrl": vl_config.base_url,
        "temperature": payload.temperature,
        "maxTokens": payload.maxTokens,
        "timeout": payload.timeout,
        "media": {
            "kind": "sampled_frames",
            "path": str(video_path),
            "durationSeconds": duration,
        },
        "intervalSeconds": payload.intervalSeconds,
        "maxFrames": payload.maxFrames,
        "frameCount": len(frames),
        "promptText": prompt_text,
        "outputSchema": payload.outputSchema,
    }
    response = VlFrameSamplingDebugResponse(
        ok=bool(frames) and all(frame.parsed is not None for frame in frames),
        frames=frames,
        request=request_summary,
        debugPath=None,
    )
    if payload.persist:
        response.debugPath = _persist_frame_sampling_result(project_folder, run_dir, response)
    return response


def _build_debug_prompt(payload: VlFrameSamplingDebugRequest) -> str:
    parts = [payload.prompt.strip()]
    extra_instructions = payload.extraInstructions.strip()
    if extra_instructions:
        parts.append(extra_instructions)
    if payload.outputSchema:
        parts.append(
            "outputSchema:\n"
            + json.dumps(payload.outputSchema, ensure_ascii=False, indent=2)
            + "\n所有字段尽量按 outputSchema 返回；无法判断时用 null 或空数组。"
        )
    return "\n\n".join(parts)


def _build_image_url_content(image_path: Path) -> dict[str, Any]:
    image_b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    return {
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
    }


def _sample_times(duration: float, interval_seconds: float, max_frames: int) -> list[float]:
    if duration <= 0:
        return [0.0]
    times: list[float] = []
    current = 0.0
    while current < duration and len(times) < max_frames:
        times.append(round(current, 3))
        current += interval_seconds
    if not times:
        times.append(0.0)
    return times


def _debug_run_dir(project_folder: Path) -> Path:
    ensure_project_subdirs(project_folder)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return project_folder / "analysis" / "vl-debug" / f"{timestamp}-{uuid4().hex[:8]}"


def _persist_frame_sampling_result(
    project_folder: Path,
    run_dir: Path,
    response: VlFrameSamplingDebugResponse,
) -> str:
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "result.json"
    path.write_text(
        json.dumps(response.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return str(path.relative_to(project_folder))

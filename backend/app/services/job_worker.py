from __future__ import annotations

import json
import shutil
import subprocess
import time
import wave
from pathlib import Path
from typing import Any

from app.core.project_paths import ensure_project_subdirs
from app.repositories.jobs import claim_next_queued_job, update_job
from app.repositories.model_configs import get_model_runtime_config
from app.schemas.jobs import JobPublic
from app.services.analysis_merge import legacy_scene_count, merge_legacy_summaries
from app.services.analysis_taxonomy import taxonomy_prompt_lines, taxonomy_version
from app.services.frame_extraction import extract_video_keyframes, extract_video_segment_clip
from app.services.fcpxml_export import write_fcpxml
from app.services.openai_compatible import (
    describe_frame,
    describe_video_clip,
    generate_analysis_summary,
    require_runtime_config,
)
from app.services.project_manifest import open_project, save_project
from app.services.project_cache import clear_subtitle_job_cache, subtitle_job_cache_dir
from app.services import script_edit, whisper_service


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_silent_wav(path: Path, seconds: float = 1.0, sample_rate: int = 24000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = max(1, int(seconds * sample_rate))
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * frame_count)


def _media_source_path(project_folder: Path, item: dict) -> Path:
    if item.get("projectPath"):
        return (project_folder / str(item["projectPath"])).resolve()
    return Path(str(item.get("originalPath", ""))).expanduser().resolve()


ANALYSIS_STAGE_LABELS = {
    "queued": "排队",
    "extracting": "抽帧",
    "vision": "AI识别",
    "summarizing": "总结",
    "saving": "保存结果",
    "completed": "已完成",
    "failed": "失败",
}


FCPXML_EXPORT_FORMATS = {"fcpxml", "fcp", "xml", "final-cut-pro-xml", "finalcutproxml"}


def _normalize_export_format(value: object) -> str:
    raw = str(value or "mp4").strip().lower()
    filename = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if filename.endswith(".json"):
        filename = filename[: -len(".json")]

    candidates = {
        raw,
        raw.removeprefix("."),
        filename,
        filename.removeprefix("."),
    }
    if "." in filename:
        candidates.add(filename.rsplit(".", 1)[-1])
    if "/" in raw:
        candidates.add(raw.rsplit("/", 1)[-1])

    for candidate in candidates:
        cleaned = candidate.strip().removeprefix(".")
        if cleaned in FCPXML_EXPORT_FORMATS or cleaned.endswith(".fcpxml"):
            return "fcpxml"
    return raw.removeprefix(".") or "mp4"


def _stage_label(stage: str) -> str:
    return ANALYSIS_STAGE_LABELS.get(stage, stage)


def _initial_analysis_items(video_media: list[dict]) -> list[dict[str, Any]]:
    return [
        {
            "mediaId": str(item.get("id") or ""),
            "name": str(item.get("name") or item.get("originalPath") or "素材"),
            "status": "queued",
            "stage": "queued",
            "stageLabel": _stage_label("queued"),
            "progress": 0,
        }
        for item in video_media
    ]


def _set_analysis_item_state(
    items: list[dict[str, Any]],
    media_id: str,
    *,
    status: str,
    stage: str,
    progress: int,
    error: str | None = None,
) -> None:
    for item in items:
        if item.get("mediaId") != media_id:
            continue
        item.update(
            {
                "status": status,
                "stage": stage,
                "stageLabel": _stage_label(stage),
                "progress": max(0, min(100, progress)),
            }
        )
        if error:
            item["error"] = error
        elif "error" in item:
            item.pop("error")
        return


def _completed_media_ids(items: list[dict[str, Any]]) -> list[str]:
    return [
        str(item["mediaId"])
        for item in items
        if item.get("mediaId") and item.get("status") == "completed"
    ]


def _analysis_progress(item_index: int, total: int, item_fraction: float) -> int:
    if total <= 0:
        return 5
    bounded = max(0.0, min(1.0, item_fraction))
    return min(95, max(5, round(5 + ((item_index + bounded) / total) * 90)))


def _subtitle_frame_range_label(segments: list[dict]) -> str:
    starts = [
        int(segment.get("startFrame") or 0)
        for segment in segments
        if isinstance(segment, dict)
    ]
    ends = [
        int(segment.get("endFrame") or 0)
        for segment in segments
        if isinstance(segment, dict)
    ]
    if not starts or not ends:
        return "未知时间段"
    return f"{max(0, min(starts))}-{max(0, max(ends))}帧"


def _compress_subtitle_segments_for_prompt(
    segments: list[dict],
    *,
    max_chars: int = 620,
) -> str:
    cleaned = [
        {
            "text": str(segment.get("text") or "").strip(),
            "startFrame": int(segment.get("startFrame") or 0),
            "endFrame": int(segment.get("endFrame") or 0),
        }
        for segment in segments
        if isinstance(segment, dict) and str(segment.get("text") or "").strip()
    ]
    if not cleaned:
        return ""

    cleaned.sort(key=lambda item: (item["startFrame"], item["endFrame"]))
    sample_indexes = [0]
    if len(cleaned) >= 3:
        sample_indexes.append(len(cleaned) // 2)
    if len(cleaned) >= 2:
        sample_indexes.append(len(cleaned) - 1)
    sample_text = " / ".join(
        cleaned[index]["text"]
        for index in dict.fromkeys(sample_indexes)
        if cleaned[index]["text"]
    )
    all_text = " ".join(item["text"] for item in cleaned)
    preview_budget = max(80, max_chars - len(sample_text) - 80)
    preview = all_text[:preview_budget].strip()
    if len(all_text) > preview_budget:
        preview = f"{preview}…"

    summary = (
        f"字幕摘要：共{len(cleaned)}段，时间范围{_subtitle_frame_range_label(cleaned)}。"
        f"代表内容：{sample_text}。压缩文本：{preview}"
    )
    if len(summary) <= max_chars:
        return summary
    return f"{summary[: max_chars - 1].rstrip()}…"


def _update_analysis_job_progress(
    job: JobPublic,
    *,
    progress: int,
    stage: str,
    items: list[dict[str, Any]],
    current_item: dict | None = None,
) -> None:
    update_job(
        job.id,
        status="running",
        progress=progress,
        result={
            "stage": stage,
            "stageLabel": _stage_label(stage),
            "currentMediaId": str(current_item.get("id")) if current_item else None,
            "currentMediaName": str(current_item.get("name")) if current_item else None,
            "items": items,
            "completedMediaIds": _completed_media_ids(items),
        },
    )


def _summarize_video_from_scenes(video_result: dict) -> str:
    scenes = video_result.get("visual_analysis", {}).get("scenes", [])
    shot_types = []
    subjects = []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        vl = scene.get("vl_analysis", {})
        if not isinstance(vl, dict):
            continue
        if vl.get("shot_type"):
            shot_types.append(str(vl["shot_type"]))
        if vl.get("subject"):
            subjects.append(str(vl["subject"])[:40])
    parts = [f"共检测到 {len(scenes)} 个镜头。"]
    if shot_types:
        parts.append(f"主要景别: {'、'.join(dict.fromkeys(shot_types[:4]))}。")
    if subjects:
        parts.append(f"主体示例: {subjects[0]}。")
    return " ".join(parts)


def _describe_scene_probe_samples(scene: dict, vl_config) -> None:
    samples = scene.get("movement_probe", {}).get("samples", [])
    if not isinstance(samples, list) or not samples:
        keyframe = scene.get("keyframe")
        if keyframe:
            scene["vl_analysis"] = describe_frame(vl_config, Path(str(keyframe)))
        return

    middle_analysis: dict | None = None
    fallback_analysis: dict | None = None
    for sample in samples:
        if not isinstance(sample, dict) or not sample.get("frame"):
            continue
        analysis = describe_frame(vl_config, Path(str(sample["frame"])))
        sample["camera_movement"] = str(analysis.get("camera_movement") or "")
        if fallback_analysis is None:
            fallback_analysis = analysis
        if sample.get("label") == "middle":
            middle_analysis = analysis

    scene["vl_analysis"] = middle_analysis or fallback_analysis or {}


def _scene_time_bounds(scene: dict[str, Any], video_duration: float) -> tuple[float, float]:
    start = float(scene.get("start") or 0.0)
    end = float(scene.get("end") or 0.0)
    if end < start:
        start, end = end, start
    if end <= start:
        end = video_duration if video_duration > start else start + 0.5
    return max(0.0, start), max(start + 0.1, end)


def _subtitle_seconds(segment: dict[str, Any], fps: float) -> tuple[float, float]:
    safe_fps = fps if fps > 0 else 30.0
    start_frame = int(segment.get("startFrame") or 0)
    end_frame = int(segment.get("endFrame") or start_frame)
    return start_frame / safe_fps, max(end_frame, start_frame + 1) / safe_fps


def _subtitle_segments_for_scene(
    scene: dict[str, Any],
    subtitle_segments: list[dict],
    *,
    fps: float,
    video_duration: float,
) -> list[dict]:
    scene_start, scene_end = _scene_time_bounds(scene, video_duration)
    overlaps: list[dict] = []
    for segment in subtitle_segments:
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        subtitle_start, subtitle_end = _subtitle_seconds(segment, fps)
        if subtitle_start < scene_end and subtitle_end > scene_start:
            overlaps.append(segment)
    overlaps.sort(key=lambda item: (int(item.get("startFrame") or 0), int(item.get("endFrame") or 0)))
    return overlaps


def _scene_transcript(segments: list[dict], *, max_chars: int = 700) -> str:
    text = " ".join(
        str(segment.get("text") or "").strip()
        for segment in segments
        if isinstance(segment, dict) and str(segment.get("text") or "").strip()
    ).strip()
    if len(text) <= max_chars:
        return text
    return f"{text[: max_chars - 1].rstrip()}…"


def _build_video_segment_prompt(
    scene: dict[str, Any],
    *,
    segment_type: str,
    transcript: str,
) -> str:
    taxonomy_lines = "\n".join(taxonomy_prompt_lines())
    scene_start = float(scene.get("start") or 0.0)
    scene_end = float(scene.get("end") or scene_start)
    quality_metrics = scene.get("quality_metrics") if isinstance(scene.get("quality_metrics"), dict) else {}
    return (
        "你是一名专业的视频剪辑和摄影分析助手。请直接分析这段视频片段，重点判断运镜、主体、画面质量和剪辑用途。\n"
        "只输出 JSON 对象，不要 Markdown，不要解释。\n"
        f"segment_type: {segment_type}\n"
        f"scene_time_seconds: {scene_start:.2f}-{scene_end:.2f}\n"
        f"subtitle_transcript: {transcript or '无字幕/无人声'}\n"
        f"frame_quality_reference: {json.dumps(quality_metrics, ensure_ascii=False)}\n"
        "枚举字段尽量从下面字典值中选择；无法判断时写“不确定”。\n"
        f"{taxonomy_lines}\n"
        "输出 schema："
        "{"
        '"segment_type":"aroll 或 broll",'
        '"speech":{"has_speech":true,"summary":"口播内容摘要，broll 为空字符串"},'
        '"visual":{"shot_type":"景别","subject":"主体","subject_category":"主体类型枚举","action":"动作","action_type":"动作枚举","environment":"环境","environment_type":"环境枚举","lighting":"光线","lighting_type":"光线枚举","color_tone":"色调","color_tone_type":"色调枚举","emotion_atmosphere":"氛围","emotion_tags":["情绪枚举"],"search_keywords":["检索关键词"],"notable_details":"细节或 null"},'
        '"camera":{"movement":"运镜类型","movement_confidence":0.0,"evidence":"判断依据"},'
        '"quality":{"grade":"精选/可用/备选/废片","issues":["问题"]},'
        '"edit_role":"剪辑用途枚举",'
        '"edit_suggestion":"剪辑建议"'
        "}。"
    )


def _dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_segment_analysis(
    raw: dict[str, Any],
    *,
    segment_type: str,
    transcript: str,
    frame_quality: dict[str, Any],
) -> dict[str, Any]:
    visual = dict(_dict_value(raw.get("visual")))
    for key in (
        "shot_type",
        "subject",
        "subject_category",
        "action",
        "action_type",
        "environment",
        "environment_type",
        "lighting",
        "lighting_type",
        "color_tone",
        "color_tone_type",
        "emotion_atmosphere",
        "emotion_tags",
        "search_keywords",
        "notable_details",
    ):
        if not visual.get(key) and raw.get(key) is not None:
            visual[key] = raw[key]

    camera = dict(_dict_value(raw.get("camera")))
    if not camera.get("movement") and raw.get("camera_movement"):
        camera["movement"] = raw.get("camera_movement")
    camera.setdefault("movement", "不确定")
    camera.setdefault("movement_confidence", raw.get("movement_confidence"))
    camera.setdefault("evidence", raw.get("movement_evidence") or "")

    raw_speech = _dict_value(raw.get("speech"))
    speech = {
        "has_speech": bool(transcript),
        "transcript": transcript,
        "summary": str(raw_speech.get("summary") or "").strip(),
    }

    quality = dict(frame_quality)
    quality.update(_dict_value(raw.get("quality")))
    quality.setdefault("grade", frame_quality.get("grade") or "不确定")
    quality.setdefault("issues", frame_quality.get("issues") or [])

    return {
        "segment_type": segment_type,
        "speech": speech,
        "visual": visual,
        "camera": camera,
        "quality": quality,
        "edit_role": str(raw.get("edit_role") or ("主叙事" if segment_type == "aroll" else "B-roll")),
        "edit_suggestion": str(raw.get("edit_suggestion") or ""),
    }


def _segment_vl_analysis(segment_analysis: dict[str, Any]) -> dict[str, Any]:
    visual = _dict_value(segment_analysis.get("visual"))
    camera = _dict_value(segment_analysis.get("camera"))
    return {
        "segment_type": segment_analysis.get("segment_type"),
        "shot_type": visual.get("shot_type"),
        "camera_movement": camera.get("movement"),
        "movement_confidence": camera.get("movement_confidence"),
        "movement_evidence": camera.get("evidence"),
        "subject": visual.get("subject"),
        "subject_category": visual.get("subject_category"),
        "action": visual.get("action"),
        "action_type": visual.get("action_type"),
        "environment": visual.get("environment"),
        "environment_type": visual.get("environment_type"),
        "lighting": visual.get("lighting"),
        "lighting_type": visual.get("lighting_type"),
        "color_tone": visual.get("color_tone"),
        "color_tone_type": visual.get("color_tone_type"),
        "emotion_atmosphere": visual.get("emotion_atmosphere"),
        "emotion_tags": visual.get("emotion_tags") or [],
        "edit_role": segment_analysis.get("edit_role"),
        "search_keywords": visual.get("search_keywords") or [],
        "edit_suggestion": segment_analysis.get("edit_suggestion"),
        "notable_details": visual.get("notable_details"),
    }


def _apply_scene_segment_analysis(
    scene: dict[str, Any],
    segment_analysis: dict[str, Any],
) -> None:
    scene["segment_type"] = str(segment_analysis.get("segment_type") or "broll")
    scene["speech"] = _dict_value(segment_analysis.get("speech"))
    scene["segment_analysis"] = segment_analysis
    scene["vl_analysis"] = _segment_vl_analysis(segment_analysis)

    movement = str(_dict_value(segment_analysis.get("camera")).get("movement") or "")
    samples = scene.get("movement_probe", {}).get("samples", [])
    if isinstance(samples, list):
        for sample in samples:
            if isinstance(sample, dict):
                sample["camera_movement"] = movement


def _apply_frame_fallback_segment_analysis(
    scene: dict[str, Any],
    *,
    segment_type: str,
    transcript: str,
) -> None:
    raw_vl = _dict_value(scene.get("vl_analysis"))
    frame_quality = _dict_value(scene.get("quality_metrics"))
    segment_analysis = _normalize_segment_analysis(
        raw_vl,
        segment_type=segment_type,
        transcript=transcript,
        frame_quality=frame_quality,
    )
    _apply_scene_segment_analysis(scene, segment_analysis)


def _describe_scene_video_segment(
    scene: dict[str, Any],
    vl_config,
    *,
    source_path: Path,
    output_dir: Path,
    subtitle_segments: list[dict],
    fps: float,
    video_duration: float,
) -> None:
    overlapping_subtitles = _subtitle_segments_for_scene(
        scene,
        subtitle_segments,
        fps=fps,
        video_duration=video_duration,
    )
    transcript = _scene_transcript(overlapping_subtitles)
    segment_type = "aroll" if transcript else "broll"
    start, end = _scene_time_bounds(scene, video_duration)
    scene_index = int(scene.get("index") or 0)
    clip_path = output_dir / "segments" / f"scene_{scene_index:03d}.mp4"
    prompt = _build_video_segment_prompt(
        scene,
        segment_type=segment_type,
        transcript=transcript,
    )
    frame_quality = _dict_value(scene.get("quality_metrics"))

    try:
        extract_video_segment_clip(source_path, start, end, clip_path)
        raw_analysis = describe_video_clip(vl_config, clip_path, prompt)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        scene["segment_analysis_error"] = str(exc)
        _describe_scene_probe_samples(scene, vl_config)
        _apply_frame_fallback_segment_analysis(
            scene,
            segment_type=segment_type,
            transcript=transcript,
        )
        return

    segment_analysis = _normalize_segment_analysis(
        raw_analysis,
        segment_type=segment_type,
        transcript=transcript,
        frame_quality=frame_quality,
    )
    _apply_scene_segment_analysis(scene, segment_analysis)


def _analysis_summary(
    job: JobPublic,
    *,
    image_model: str,
    video_results: list[dict],
) -> dict:
    return {
        "job_id": job.id,
        "taxonomy_version": taxonomy_version(),
        "total_videos": len(video_results),
        "image_model": image_model,
        "scene_groups": [],
        "videos": video_results,
    }


def _persist_analysis_summary(
    job: JobPublic,
    summary: dict,
    *,
    overall_summary: str = "",
    model_suggestions: list[dict] | None = None,
) -> None:
    project = open_project(job.projectFolder)
    data = project.model_dump()
    existing_analysis = data.get("analysis", {})
    merged_summary = merge_legacy_summaries(existing_analysis.get("legacySummary"), summary) or summary
    merged_overall_summary = " ".join(
        str(video.get("overall_summary") or "")
        for video in merged_summary.get("videos", [])
        if isinstance(video, dict) and video.get("overall_summary")
    ).strip()
    next_edit_suggestions = [
        {
            "id": f"suggestion-{job.id}-{index}",
            "title": str(item.get("title") or "剪辑建议"),
            "source": "ai-tags",
            "action": "highlight",
            "confidence": float(item.get("confidence") or 0.75),
            "affectedClipIds": item.get("affectedClipIds") or [],
            "description": str(item.get("description") or ""),
        }
        for index, item in enumerate(model_suggestions or [])
        if isinstance(item, dict)
    ]
    data["analysis"] = {
        **existing_analysis,
        "overallSummary": overall_summary or merged_overall_summary or "模型分析已完成。",
        "sceneCount": legacy_scene_count(merged_summary),
        "editSuggestions": next_edit_suggestions or existing_analysis.get("editSuggestions", []),
        "legacySummary": merged_summary,
    }
    save_project(job.projectFolder, data)


def _complete_analysis(job: JobPublic) -> dict:
    project = open_project(job.projectFolder)
    project_folder = Path(project.folderPath)
    ensure_project_subdirs(project_folder)
    media_ids = job.payload.get("mediaIds", [])
    selected_media = [
        item for item in project.media if not media_ids or item.get("id") in media_ids
    ]
    subtitle_segments = project.subtitles.get("segments", []) if isinstance(project.subtitles, dict) else []
    subtitle_segments_by_media: dict[str, list[dict]] = {}
    for segment in subtitle_segments:
        if not isinstance(segment, dict):
            continue
        media_id = str(segment.get("mediaId") or "")
        text = str(segment.get("text") or "").strip()
        if not media_id or not text:
            continue
        subtitle_segments_by_media.setdefault(media_id, []).append(segment)
    selected_media_for_prompt = [
        {
            **item,
            "subtitleText": _compress_subtitle_segments_for_prompt(
                subtitle_segments_by_media.get(str(item.get("id") or ""), []),
            ),
        }
        for item in selected_media
    ]
    video_media = [item for item in selected_media if item.get("type") == "video"]
    vl_config = get_model_runtime_config("vl")
    llm_config = get_model_runtime_config("llm")
    runtime_config = require_runtime_config(vl_config or llm_config, "vl/llm")
    model_suggestions: list[dict] = []
    video_results: list[dict] = []
    model_overall_summary = ""
    progress_items = _initial_analysis_items(video_media)
    _update_analysis_job_progress(
        job,
        progress=5,
        stage="queued",
        items=progress_items,
    )

    if vl_config is not None and vl_config.enabled and video_media:
        vl_config = require_runtime_config(vl_config, "vl")
        for index, item in enumerate(video_media):
            media_id = str(item.get("id") or "")
            _set_analysis_item_state(
                progress_items,
                media_id,
                status="running",
                stage="extracting",
                progress=15,
            )
            _update_analysis_job_progress(
                job,
                progress=_analysis_progress(index, len(video_media), 0.1),
                stage="extracting",
                current_item=item,
                items=progress_items,
            )
            source_path = _media_source_path(project_folder, item)
            video_result = extract_video_keyframes(
                source_path,
                project_folder / "analysis" / job.id,
            )
            video_result["image_model"] = vl_config.model
            video_result["visual_analysis"]["model"] = vl_config.model
            video_meta = video_result.get("video_meta") if isinstance(video_result.get("video_meta"), dict) else {}
            video_output_dir = Path(
                str(
                    video_result.get("output_dir")
                    or (project_folder / "analysis" / job.id / source_path.stem)
                )
            )
            timeline = project.timeline if isinstance(project.timeline, dict) else {}
            fps = float(timeline.get("fps") or video_meta.get("fps") or 30.0)
            video_duration = float(video_meta.get("duration_seconds") or 0.0)
            media_subtitles = subtitle_segments_by_media.get(media_id, [])
            _set_analysis_item_state(
                progress_items,
                media_id,
                status="running",
                stage="vision",
                progress=55,
            )
            _update_analysis_job_progress(
                job,
                progress=_analysis_progress(index, len(video_media), 0.55),
                stage="vision",
                current_item=item,
                items=progress_items,
            )
            for scene in video_result.get("visual_analysis", {}).get("scenes", []):
                if isinstance(scene, dict):
                    _describe_scene_video_segment(
                        scene,
                        vl_config,
                        source_path=source_path,
                        output_dir=video_output_dir,
                        subtitle_segments=media_subtitles,
                        fps=fps,
                        video_duration=video_duration,
                    )
            _set_analysis_item_state(
                progress_items,
                media_id,
                status="running",
                stage="summarizing",
                progress=82,
            )
            _update_analysis_job_progress(
                job,
                progress=_analysis_progress(index, len(video_media), 0.82),
                stage="summarizing",
                current_item=item,
                items=progress_items,
            )
            video_result["overall_summary"] = _summarize_video_from_scenes(video_result)
            video_results.append(video_result)
            _set_analysis_item_state(
                progress_items,
                media_id,
                status="running",
                stage="saving",
                progress=92,
            )
            _update_analysis_job_progress(
                job,
                progress=_analysis_progress(index, len(video_media), 0.92),
                stage="saving",
                current_item=item,
                items=progress_items,
            )
            partial_summary = _analysis_summary(
                job,
                image_model=runtime_config.model,
                video_results=video_results,
            )
            _write_json(project_folder / "analysis" / f"{job.id}.json", partial_summary)
            partial_overall_summary = " ".join(
                result.get("overall_summary", "")
                for result in video_results
                if isinstance(result, dict) and result.get("overall_summary")
            ).strip()
            _persist_analysis_summary(
                job,
                partial_summary,
                overall_summary=partial_overall_summary,
            )
            _set_analysis_item_state(
                progress_items,
                media_id,
                status="completed",
                stage="completed",
                progress=100,
            )
            _update_analysis_job_progress(
                job,
                progress=_analysis_progress(index, len(video_media), 1.0),
                stage="completed",
                current_item=item,
                items=progress_items,
            )
    else:
        for item in video_media:
            _set_analysis_item_state(
                progress_items,
                str(item.get("id") or ""),
                status="running",
                stage="summarizing",
                progress=50,
            )
        _update_analysis_job_progress(
            job,
            progress=40,
            stage="summarizing",
            items=progress_items,
        )
        model_result = generate_analysis_summary(
            runtime_config,
            project.name,
            selected_media_for_prompt,
        )
        model_videos = model_result.get("videos")
        model_suggestions = model_result.get("edit_suggestions")
        model_overall_summary = str(model_result.get("overall_summary") or "")
        video_results = model_videos if isinstance(model_videos, list) else []
        model_suggestions = model_suggestions if isinstance(model_suggestions, list) else []
        for item in video_media:
            _set_analysis_item_state(
                progress_items,
                str(item.get("id") or ""),
                status="completed",
                stage="completed",
                progress=100,
            )

    scene_overall_summary = " ".join(
        result.get("overall_summary", "")
        for result in video_results
        if isinstance(result, dict) and result.get("overall_summary")
    ).strip()
    overall_summary = model_overall_summary or scene_overall_summary
    summary = _analysis_summary(
        job,
        image_model=runtime_config.model,
        video_results=video_results,
    )
    _write_json(project_folder / "analysis" / f"{job.id}.json", summary)
    _persist_analysis_summary(
        job,
        summary,
        overall_summary=overall_summary,
        model_suggestions=model_suggestions,
    )
    final_result = {
        "analysisPath": f"analysis/{job.id}.json",
        "stage": "completed",
        "stageLabel": _stage_label("completed"),
        "currentMediaId": None,
        "currentMediaName": None,
        "items": progress_items,
        "completedMediaIds": _completed_media_ids(progress_items),
    }
    return final_result


def _complete_tts(job: JobPublic) -> dict:
    project = open_project(job.projectFolder)
    project_folder = Path(project.folderPath)
    ensure_project_subdirs(project_folder)
    text = str(job.payload.get("text", ""))
    output_name = f"{job.id}.{job.payload.get('format', 'wav')}"
    if not output_name.endswith(".wav"):
        output_name = f"{job.id}.wav"
    output_path = project_folder / "audio" / "tts" / output_name
    speed = max(0.5, float(job.payload.get("speed") or 1))
    lead_seconds = max(0, int(job.payload.get("leadSilenceMs") or 0)) / 1000
    tail_seconds = max(0, int(job.payload.get("tailSilenceMs") or 0)) / 1000
    duration_seconds = max(1.0, min(30.0, len(text) / 8 / speed + lead_seconds + tail_seconds))
    _write_silent_wav(output_path, duration_seconds)

    duration_in_frames = round(duration_seconds * float(project.timeline.get("fps", 30) or 30))
    media_item = {
        "id": f"media-tts-{job.id}",
        "name": output_name,
        "type": "generated-audio",
        "importMode": "copied",
        "originalPath": str(output_path),
        "projectPath": f"audio/tts/{output_name}",
        "durationInFrames": duration_in_frames,
        "sourceLabel": "TTS 旁白",
    }
    data = project.model_dump()
    timeline = data.setdefault("timeline", {})
    audio_tracks = timeline.setdefault("audioTracks", [])
    insertion_track_id = str(job.payload.get("insertionTrackId") or "track-audio-voice")
    target_track = next(
        (track for track in audio_tracks if track.get("id") == insertion_track_id),
        None,
    )
    if target_track is None:
        target_track = {
            "id": insertion_track_id,
            "name": "旁白",
            "type": "audio",
            "clips": [],
        }
        audio_tracks.append(target_track)

    clips = target_track.setdefault("clips", [])
    insert_after_clip_id = job.payload.get("insertAfterClipId")
    insert_after_clip = next(
        (clip for clip in clips if insert_after_clip_id and clip.get("id") == insert_after_clip_id),
        None,
    )
    if insert_after_clip:
        start_frame = (
            int(insert_after_clip.get("startFrame", 0))
            + int(insert_after_clip.get("durationInFrames", 0))
            + 12
        )
    elif clips:
        start_frame = max(
            int(clip.get("startFrame", 0)) + int(clip.get("durationInFrames", 0))
            for clip in clips
        ) + 12
    else:
        start_frame = 0

    clip_id = f"clip-tts-{job.id}"
    clips.append(
        {
            "id": clip_id,
            "mediaId": media_item["id"],
            "title": output_name,
            "startFrame": start_frame,
            "durationInFrames": duration_in_frames,
            "sourceIn": 0,
            "color": "#b45309",
            "sourceType": "tts",
        }
    )
    clips.sort(key=lambda clip: int(clip.get("startFrame", 0)))
    timeline["durationInFrames"] = max(
        int(timeline.get("durationInFrames", 0) or 0),
        start_frame + duration_in_frames + 30,
    )

    data["media"] = [*data.get("media", []), media_item]
    data["ttsJobs"] = [
        {
            "id": job.id,
            "status": "inserted",
            "voiceId": job.payload.get("voice", "alloy"),
            "voiceName": job.payload.get("voiceName") or job.payload.get("voice", "alloy"),
            "text": text,
            "emotion": job.payload.get("emotion", "neutral"),
            "speed": speed,
            "leadSilenceMs": int(job.payload.get("leadSilenceMs") or 0),
            "tailSilenceMs": int(job.payload.get("tailSilenceMs") or 0),
            "insertionTrackId": insertion_track_id,
            "insertAfterClipId": insert_after_clip_id,
            "durationInFrames": duration_in_frames,
            "generatedMediaId": media_item["id"],
            "generatedClipId": clip_id,
            "createdAt": job.createdAt,
            "sampleSource": job.payload.get("sampleSource", "uploaded"),
            "sampleClipId": job.payload.get("sampleClipId"),
        },
        *data.get("ttsJobs", []),
    ]
    save_project(job.projectFolder, data)
    return {
        "mediaItem": media_item,
        "clipId": clip_id,
        "outputPath": f"audio/tts/{output_name}",
    }


def _complete_export(job: JobPublic) -> dict:
    project = open_project(job.projectFolder)
    project_folder = Path(project.folderPath)
    ensure_project_subdirs(project_folder)
    export_format = _normalize_export_format(job.payload.get("format", "mp4"))
    timeline_id = job.payload.get("timelineId")
    timeline = project.timeline
    if timeline_id and isinstance(project.timelines, list):
        timeline = next(
            (
                item
                for item in project.timelines
                if isinstance(item, dict) and str(item.get("id") or "") == str(timeline_id)
            ),
            project.timeline,
        )
    if export_format == "fcpxml":
        output_path = project_folder / "exports" / f"{project.name}-{job.id}.fcpxml"
        write_fcpxml(project, output_path, str(timeline_id) if timeline_id else None)
        return {
            "format": "fcpxml",
            "outputPath": output_path.relative_to(project_folder).as_posix(),
            "fileName": output_path.name,
        }

    output_path = project_folder / "exports" / f"{project.name}-{job.id}.{export_format}.json"
    _write_json(
        output_path,
        {
            "job_id": job.id,
            "project": project.name,
            "format": export_format,
            "timeline": timeline,
        },
    )
    return {
        "format": export_format,
        "outputPath": output_path.relative_to(project_folder).as_posix(),
        "fileName": output_path.name,
    }


def _run_whisper_transcription(source_path: Path, output_dir: Path, model: str, language: str) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)
    commands = [
        [
            "python",
            "-m",
            "mlx_whisper",
            str(source_path),
            "--model",
            model,
            "--language",
            language,
            "--output-dir",
            str(output_dir),
            "--output-format",
            "json",
        ],
        [
            "whisper",
            str(source_path),
            "--model",
            "large-v3",
            "--language",
            language,
            "--output_dir",
            str(output_dir),
            "--output_format",
            "json",
        ],
    ]
    last_error = ""
    for command in commands:
        try:
            result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=1800)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
            last_error = str(exc)
            continue
        if result.returncode != 0:
            last_error = result.stderr or result.stdout
            continue
        json_files = sorted(output_dir.glob("*.json"), key=lambda path: path.stat().st_mtime)
        if not json_files:
            return []
        data = json.loads(json_files[-1].read_text(encoding="utf-8"))
        segments = data.get("segments")
        return segments if isinstance(segments, list) else []
    raise RuntimeError(last_error or "Whisper transcription command unavailable")


def _extract_audio_for_subtitles(source_path: Path, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(output_path),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "ffmpeg audio extraction failed")
    return output_path


def _split_subtitle_text(text: str, max_units: int) -> list[str]:
    max_units = max(4, min(80, max_units))
    if len(text) <= max_units:
        return [text]

    if " " in text:
        units = text.split()
        separator = " "
    else:
        units = list(text)
        separator = ""

    if len(units) <= max_units:
        return [text]

    return [
        separator.join(units[index : index + max_units]).strip()
        for index in range(0, len(units), max_units)
        if separator.join(units[index : index + max_units]).strip()
    ]


def _complete_subtitles(job: JobPublic) -> dict:
    project = open_project(job.projectFolder)
    project_folder = Path(project.folderPath)
    ensure_project_subdirs(project_folder)
    fps = float(project.timeline.get("fps", 30) or 30)
    media_ids = job.payload.get("mediaIds", [])
    selected_media = [
        item
        for item in project.media
        if (not media_ids or item.get("id") in media_ids)
        and item.get("type") in {"video", "audio"}
    ]
    language = str(job.payload.get("language") or "zh")
    max_words = int(job.payload.get("maxWordsPerSegment") or 24)
    job_cache_dir = subtitle_job_cache_dir(project_folder, job.id)
    all_segments: list[dict] = []
    errors: list[dict] = []

    try:
        whisper_service.ensure_ready()
        for item in selected_media:
            media_id = str(item.get("id") or "")
            source_path = _media_source_path(project_folder, item)
            media_type = str(item.get("type") or "")
            try:
                audio_path = source_path
                if media_type == "video":
                    audio_path = _extract_audio_for_subtitles(
                        source_path,
                        job_cache_dir / media_id / "source.wav",
                    )
                raw_segments = whisper_service.transcribe_audio(audio_path, language=language)
            except RuntimeError as exc:
                raw_segments = []
                errors.append({"mediaId": media_id, "error": str(exc)})
            for index, segment in enumerate(raw_segments):
                if not isinstance(segment, dict):
                    continue
                text = str(segment.get("text") or "").strip()
                if not text:
                    continue
                start = float(segment.get("start") or 0)
                end = float(segment.get("end") or start)
                if end <= start:
                    continue
                chunks = _split_subtitle_text(text, max_words)
                duration = end - start
                for chunk_index, chunk in enumerate(chunks):
                    chunk_start = start + duration * (chunk_index / len(chunks))
                    chunk_end = start + duration * ((chunk_index + 1) / len(chunks))
                    all_segments.append(
                        {
                            "id": f"subtitle-{job.id}-{media_id}-{index}-{chunk_index}",
                            "mediaId": media_id,
                            "startFrame": max(0, round(chunk_start * fps)),
                            "endFrame": max(1, round(chunk_end * fps)),
                            "text": chunk,
                            "speaker": "",
                        }
                    )
    finally:
        clear_subtitle_job_cache(project_folder, job.id)

    data = project.model_dump()
    existing = data.get("subtitles", {})
    existing_segments = [
        segment
        for segment in existing.get("segments", [])
        if segment.get("mediaId") not in {item.get("id") for item in selected_media}
    ]
    data["subtitles"] = {
        "settings": {
            **existing.get("settings", {}),
            "model": "Whisper large v3 turbo mlx",
            "language": language,
            "maxWordsPerSegment": max_words,
        },
        "segments": [*existing_segments, *all_segments],
        "updatedAt": job.updatedAt,
    }
    summary_path = project_folder / "subtitles" / f"{job.id}.json"
    _write_json(summary_path, {"segments": all_segments, "errors": errors})
    save_project(job.projectFolder, data)
    return {
        "subtitlePath": summary_path.relative_to(project_folder).as_posix(),
        "segmentCount": len(all_segments),
        "errors": errors,
    }


def process_job(job: JobPublic) -> JobPublic:
    update_job(job.id, status="running", progress=20)
    if job.type == "analysis":
        result = _complete_analysis(job)
    elif job.type == "tts":
        result = _complete_tts(job)
    elif job.type == "export":
        result = _complete_export(job)
    elif job.type == "subtitles":
        result = _complete_subtitles(job)
    elif job.type == "script_edit":
        result = script_edit.complete_script_edit_job(job)
    else:
        raise ValueError(f"Unsupported job type: {job.type}")
    completed = update_job(job.id, status="completed", progress=100, result=result)
    if completed is None:
        raise ValueError(f"Job disappeared: {job.id}")
    return completed


def process_next_job() -> JobPublic | None:
    job = claim_next_queued_job()
    if job is None:
        return None
    try:
        return process_job(job)
    except Exception as exc:
        failed = update_job(job.id, status="failed", progress=100, error=str(exc))
        if failed is None:
            raise
        return failed


def run_worker_loop(poll_seconds: float = 1.0) -> None:
    while True:
        processed = process_next_job()
        if processed is None:
            time.sleep(poll_seconds)

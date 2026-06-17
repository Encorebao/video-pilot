from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.repositories.app_state import list_recent_projects
from app.repositories.model_configs import get_model_runtime_config
from app.schemas.project import ProjectManifest
from app.services.openai_compatible import generate_script_edit_draft, require_runtime_config
from app.services.project_manifest import open_project, save_project
from app.services.project_timelines import add_project_timeline, get_active_timeline, normalize_project_timelines


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _utf8_len(text: str) -> int:
    return len(text.encode("utf-8"))


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _prompt_section(
    *,
    section_id: str,
    label: str,
    raw: Any,
    compressed: Any,
    item_count: int,
    description: str,
) -> dict[str, Any]:
    raw_text = _json_text(raw)
    compressed_text = _json_text(compressed)
    return {
        "id": section_id,
        "label": label,
        "rawBytes": _utf8_len(raw_text),
        "compressedBytes": _utf8_len(compressed_text),
        "itemCount": item_count,
        "description": description,
    }


def _filename(path: str | None) -> str:
    if not path:
        return ""
    return Path(path).name.lower()


def _media_filenames(media: dict) -> set[str]:
    return {
        value
        for value in (
            _filename(str(media.get("name") or "")),
            _filename(str(media.get("originalPath") or "")),
            _filename(str(media.get("projectPath") or "")),
        )
        if value
    }


def _find_legacy_video(project: ProjectManifest, media: dict) -> dict | None:
    videos = project.analysis.get("legacySummary", {}).get("videos", [])
    media_names = _media_filenames(media)
    for video in videos if isinstance(videos, list) else []:
        if not isinstance(video, dict):
            continue
        video_names = {
            _filename(str(video.get("video") or "")),
            _filename(str(video.get("video_path") or "")),
        }
        video_path = str(video.get("video_path") or "").lower()
        if media_names & video_names:
            return video
        if any(name and video_path.endswith(name) for name in media_names):
            return video
    return None


def _subtitle_segments_for_media(project: ProjectManifest, media_id: str) -> list[dict]:
    segments = project.subtitles.get("segments", []) if isinstance(project.subtitles, dict) else []
    return [
        segment
        for segment in segments
        if isinstance(segment, dict)
        and str(segment.get("mediaId") or "") == media_id
        and str(segment.get("text") or "").strip()
    ]


def _compressed_subtitles(segments: list[dict], *, max_chars: int = 520) -> str:
    cleaned = [
        {
            "startFrame": int(segment.get("startFrame") or 0),
            "endFrame": int(segment.get("endFrame") or 0),
            "text": str(segment.get("text") or "").strip(),
        }
        for segment in segments
        if str(segment.get("text") or "").strip()
    ]
    if not cleaned:
        return ""
    cleaned.sort(key=lambda segment: (segment["startFrame"], segment["endFrame"]))
    all_text = " ".join(segment["text"] for segment in cleaned)
    preview = all_text[: max(80, max_chars - 80)].strip()
    if len(all_text) > len(preview):
        preview = f"{preview}…"
    return f"字幕摘要：共{len(cleaned)}段。压缩文本：{preview}"


def _scene_notes(project: ProjectManifest, media_id: str) -> list[str]:
    groups = project.sceneGroups.get("groups", []) if isinstance(project.sceneGroups, dict) else []
    notes: list[str] = []
    for group in groups if isinstance(groups, list) else []:
        if not isinstance(group, dict):
            continue
        if media_id not in [str(item) for item in group.get("mediaIds", [])]:
            continue
        title = str(group.get("title") or "").strip()
        note = str(group.get("notes") or "").strip()
        if title or note:
            notes.append(" / ".join(part for part in (title, note) if part))
    return notes


def _scene_text(scene: dict) -> str:
    vl = scene.get("vl_analysis", {}) if isinstance(scene, dict) else {}
    if not isinstance(vl, dict):
        vl = {}
    parts = [
        vl.get("subject"),
        vl.get("action"),
        vl.get("environment"),
        vl.get("edit_role"),
        vl.get("edit_suggestion"),
        " ".join(str(item) for item in vl.get("search_keywords", []) if item)
        if isinstance(vl.get("search_keywords"), list)
        else vl.get("search_keywords"),
    ]
    return "；".join(str(part).strip() for part in parts if str(part or "").strip())


def _scene_range_frames(scene: dict, media: dict, fps: int) -> tuple[int, int]:
    media_duration = int(media.get("durationInFrames") or 0)
    start_seconds = float(scene.get("start") or 0)
    if scene.get("end") is not None:
        end_seconds = float(scene.get("end") or 0)
    else:
        end_seconds = start_seconds + float(scene.get("duration") or 0)
    start_frame = max(0, int(round(start_seconds * fps)))
    end_frame = max(start_frame + 1, int(round(end_seconds * fps)))
    if media_duration > 0:
        start_frame = min(start_frame, max(0, media_duration - 1))
        end_frame = min(max(start_frame + 1, end_frame), media_duration)
    return start_frame, end_frame


def _candidate_for_role(
    *,
    role: str,
    media: dict,
    scene: dict,
    scene_index: int,
    fps: int,
    subtitles: str,
    scene_notes: list[str],
) -> dict:
    start_frame, end_frame = _scene_range_frames(scene, media, fps)
    media_id = str(media.get("id") or "")
    return {
        "id": f"{role}:{media_id}:{scene_index}",
        "role": role,
        "mediaId": media_id,
        "mediaName": str(media.get("name") or media_id),
        "sourceInFrames": start_frame,
        "durationInFrames": max(1, end_frame - start_frame),
        "sceneIndex": scene_index,
        "sceneSummary": _scene_text(scene),
        "mediaNotes": str(media.get("notes") or "").strip(),
        "sceneGroupNotes": scene_notes,
        "subtitleText": subtitles if role == "main" else "",
    }


def build_script_context_preview(
    project_folder: str,
    *,
    mode: str = "rough_cut",
    candidate_ids: list[str] | None = None,
) -> dict[str, Any]:
    project = open_project(project_folder)
    fps = int(project.timeline.get("fps") or 30)
    candidates: list[dict] = []
    excluded_media: list[dict] = []
    raw_media_context: list[dict] = []
    media_metadata_context: list[dict] = []
    media_notes_context: list[dict] = []
    scene_group_context: list[dict] = []
    subtitle_context: list[dict] = []
    visual_analysis_context: list[dict] = []
    compressed_visual_context: list[dict] = []

    for media in project.media:
        if not isinstance(media, dict) or media.get("type") != "video":
            continue
        legacy_video = _find_legacy_video(project, media)
        if not legacy_video:
            excluded_media.append(
                {
                    "mediaId": media.get("id"),
                    "name": media.get("name"),
                    "reason": "未找到视频 AI 分析结果",
                }
            )
            continue
        media_id = str(media.get("id") or "")
        subtitle_segments = _subtitle_segments_for_media(project, media_id)
        subtitle_text = _compressed_subtitles(subtitle_segments)
        notes = _scene_notes(project, media_id)
        scenes = legacy_video.get("visual_analysis", {}).get("scenes", [])
        if not isinstance(scenes, list) or not scenes:
            scenes = [{"index": 0, "start": 0, "end": (int(media.get("durationInFrames") or 0) / fps)}]
        media_metadata_context.append(
            {
                "mediaId": media_id,
                "name": media.get("name"),
                "durationInFrames": media.get("durationInFrames"),
                "capturedAt": media.get("capturedAt"),
                "sourceLabel": media.get("sourceLabel"),
            }
        )
        if str(media.get("notes") or "").strip():
            media_notes_context.append(
                {
                    "mediaId": media_id,
                    "name": media.get("name"),
                    "notes": str(media.get("notes") or "").strip(),
                }
            )
        if notes:
            scene_group_context.append(
                {
                    "mediaId": media_id,
                    "name": media.get("name"),
                    "sceneGroupNotes": notes,
                }
            )
        if subtitle_segments or subtitle_text:
            subtitle_context.append(
                {
                    "mediaId": media_id,
                    "name": media.get("name"),
                    "rawSegments": subtitle_segments,
                    "compressedSubtitle": subtitle_text,
                }
            )
        visual_analysis_context.append(
            {
                "mediaId": media_id,
                "name": media.get("name"),
                "overallSummary": legacy_video.get("overall_summary"),
                "visualAnalysis": legacy_video.get("visual_analysis"),
            }
        )
        raw_media_context.append(
            {
                "media": media,
                "legacyVideo": legacy_video,
                "sceneGroupNotes": notes,
                "subtitles": subtitle_segments,
            }
        )
        for index, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue
            start_frame, end_frame = _scene_range_frames(scene, media, fps)
            compressed_visual_context.append(
                {
                    "mediaId": media_id,
                    "mediaName": media.get("name"),
                    "sceneIndex": index,
                    "sourceInFrames": start_frame,
                    "durationInFrames": max(1, end_frame - start_frame),
                    "sceneSummary": _scene_text(scene),
                }
            )
            for role in ("main", "broll"):
                candidates.append(
                    _candidate_for_role(
                        role=role,
                        media=media,
                        scene=scene,
                        scene_index=index,
                        fps=fps,
                        subtitles=subtitle_text,
                        scene_notes=notes,
                    )
                )

    selected_candidate_ids = {str(candidate_id) for candidate_id in (candidate_ids or []) if str(candidate_id)}
    if mode == "broll_sort":
        candidates = [candidate for candidate in candidates if candidate.get("role") == "broll"]
    if selected_candidate_ids:
        candidates = [candidate for candidate in candidates if str(candidate.get("id")) in selected_candidate_ids]

    raw_prompt = json.dumps(
        {
            "projectName": project.name,
            "rawMedia": raw_media_context,
            "excludedMedia": excluded_media,
            "mode": mode,
            "candidateIds": list(selected_candidate_ids),
        },
        ensure_ascii=False,
    )
    compressed_prompt = json.dumps(
        {
            "projectName": project.name,
            "candidates": candidates,
            "excludedMedia": excluded_media,
            "mode": mode,
            "candidateIds": list(selected_candidate_ids),
            "rules": "只能使用 candidates 中的 candidateId 生成 script_cut_v1。",
        },
        ensure_ascii=False,
    )
    prompt_sections = [
        _prompt_section(
            section_id="media_metadata",
            label="素材元数据",
            raw=media_metadata_context,
            compressed=media_metadata_context,
            item_count=len(media_metadata_context),
            description="素材名称、时长、拍摄时间等基础信息。",
        ),
        _prompt_section(
            section_id="visual_analysis",
            label="片段分析",
            raw=visual_analysis_context,
            compressed=compressed_visual_context,
            item_count=len(compressed_visual_context),
            description="已分析视频的镜头摘要、画面角色和可用时间段。",
        ),
        _prompt_section(
            section_id="subtitles",
            label="字幕",
            raw=subtitle_context,
            compressed=[
                {
                    "mediaId": item["mediaId"],
                    "name": item["name"],
                    "compressedSubtitle": item["compressedSubtitle"],
                }
                for item in subtitle_context
            ],
            item_count=sum(len(item["rawSegments"]) for item in subtitle_context),
            description="转写字幕原文与压缩摘要。",
        ),
        _prompt_section(
            section_id="scene_groups",
            label="场景分组",
            raw=scene_group_context,
            compressed=scene_group_context,
            item_count=len(scene_group_context),
            description="场景组备注以及场景和素材的关系。",
        ),
        _prompt_section(
            section_id="media_notes",
            label="素材备注",
            raw=media_notes_context,
            compressed=media_notes_context,
            item_count=len(media_notes_context),
            description="片段面板里用户写给素材的备注。",
        ),
        _prompt_section(
            section_id="candidates",
            label="候选结构",
            raw={
                "candidates": candidates,
                "excludedMedia": excluded_media,
                "rules": "只能使用 candidates 中的 candidateId 生成 script_cut_v1。",
            },
            compressed={
                "candidates": candidates,
                "excludedMedia": excluded_media,
                "rules": "只能使用 candidates 中的 candidateId 生成 script_cut_v1。",
            },
            item_count=len(candidates),
            description="AI 最终可引用的 candidateId 列表和输出约束。",
        ),
    ]
    return {
        "projectName": project.name,
        "rawPrompt": raw_prompt,
        "compressedPrompt": compressed_prompt,
        "rawPromptBytes": _utf8_len(raw_prompt),
        "compressedPromptBytes": _utf8_len(compressed_prompt),
        "promptSections": prompt_sections,
        "excludedMediaCount": len(excluded_media),
        "excludedMedia": excluded_media,
        "candidates": candidates,
    }


def _ensure_script_edits(data: dict) -> dict:
    script_edits = data.setdefault("scriptEdits", {})
    script_edits.setdefault("sessions", [])
    script_edits.setdefault("drafts", [])
    return script_edits


def _sanitize_track_items(raw_items: list, candidates: dict[str, dict], track_name: str) -> tuple[list[dict], list[str]]:
    items: list[dict] = []
    warnings: list[str] = []
    for index, raw_item in enumerate(raw_items if isinstance(raw_items, list) else []):
        if not isinstance(raw_item, dict):
            warnings.append(f"{track_name}[{index}] 不是对象，已忽略")
            continue
        candidate_id = str(raw_item.get("candidateId") or "")
        candidate = candidates.get(candidate_id)
        if candidate is None:
            warnings.append(f"{track_name}[{index}] 引用了不存在的 candidateId: {candidate_id}")
            continue
        timeline_start = max(0, int(raw_item.get("timelineStartFrame") or 0))
        start_offset = max(0, int(raw_item.get("startOffsetFrames") or 0))
        candidate_duration = max(1, int(candidate.get("durationInFrames") or 1))
        if start_offset >= candidate_duration:
            warnings.append(f"{track_name}[{index}] startOffsetFrames 越界，已忽略")
            continue
        requested_duration = int(raw_item.get("durationInFrames") or 0)
        if requested_duration <= 0:
            warnings.append(f"{track_name}[{index}] durationInFrames 无效，已忽略")
            continue
        duration = min(requested_duration, candidate_duration - start_offset)
        if duration != requested_duration:
            warnings.append(f"{track_name}[{index}] durationInFrames 超出候选范围，已裁切")
        items.append(
            {
                "beatId": str(raw_item.get("beatId") or ""),
                "candidateId": candidate_id,
                "mediaId": candidate["mediaId"],
                "mediaName": candidate["mediaName"],
                "timelineStartFrame": timeline_start,
                "startOffsetFrames": start_offset,
                "sourceInFrames": int(candidate["sourceInFrames"]) + start_offset,
                "durationInFrames": max(1, duration),
                "reason": str(raw_item.get("reason") or ""),
                "title": str(raw_item.get("title") or candidate["mediaName"]),
            }
        )
    return items, warnings


def _sanitize_draft(raw_draft: dict, context: dict, *, session_id: str, mode: str) -> dict:
    candidates = {str(candidate["id"]): candidate for candidate in context["candidates"]}
    raw_tracks = raw_draft.get("tracks", {}) if isinstance(raw_draft.get("tracks"), dict) else {}
    main_items, main_warnings = _sanitize_track_items(raw_tracks.get("main", []), candidates, "main")
    broll_items, broll_warnings = _sanitize_track_items(raw_tracks.get("broll", []), candidates, "broll")
    if mode == "broll_sort":
        main_items = []
    raw_warnings = raw_draft.get("warnings", [])
    warnings = [
        *(str(item) for item in raw_warnings if isinstance(raw_warnings, list)),
        *main_warnings,
        *broll_warnings,
    ]
    now = _now_iso()
    draft_id = f"script-draft-{uuid4().hex}"
    return {
        "id": draft_id,
        "sessionId": session_id,
        "version": "script_cut_v1",
        "mode": mode,
        "title": str(raw_draft.get("title") or "AI 粗剪草稿"),
        "targetDurationSeconds": int(raw_draft.get("targetDurationSeconds") or 0),
        "summary": str(raw_draft.get("summary") or ""),
        "scriptBeats": raw_draft.get("scriptBeats") if isinstance(raw_draft.get("scriptBeats"), list) else [],
        "tracks": {"main": main_items, "broll": broll_items},
        "excludedCandidates": raw_draft.get("excludedCandidates")
        if isinstance(raw_draft.get("excludedCandidates"), list)
        else [],
        "warnings": warnings,
        "promptStats": {
            "rawPromptBytes": context["rawPromptBytes"],
            "compressedPromptBytes": context["compressedPromptBytes"],
            "excludedMediaCount": context["excludedMediaCount"],
        },
        "applied": False,
        "createdAt": now,
        "updatedAt": now,
    }


def complete_script_edit_job(job) -> dict[str, Any]:
    project = open_project(job.projectFolder)
    data = project.model_dump()
    script_edits = _ensure_script_edits(data)
    now = _now_iso()
    session_id = str(job.payload.get("sessionId") or f"script-session-{uuid4().hex}")
    session = next(
        (item for item in script_edits["sessions"] if isinstance(item, dict) and item.get("id") == session_id),
        None,
    )
    if session is None:
        session = {
            "id": session_id,
            "title": str(job.payload.get("quickStart") or "脚本剪辑"),
            "messages": [],
            "latestDraftId": None,
            "createdAt": now,
            "updatedAt": now,
        }
        script_edits["sessions"].insert(0, session)

    user_message = {
        "id": f"script-message-{uuid4().hex}",
        "role": "user",
        "content": str(job.payload.get("message") or ""),
        "quickStart": job.payload.get("quickStart"),
        "createdAt": now,
    }
    messages = [*session.get("messages", []), user_message]
    mode = str(job.payload.get("mode") or "rough_cut")
    if mode not in {"rough_cut", "broll_sort"}:
        mode = "rough_cut"
    candidate_ids = [
        str(candidate_id)
        for candidate_id in job.payload.get("candidateIds", [])
        if str(candidate_id)
    ]
    context = build_script_context_preview(
        job.projectFolder,
        mode=mode,
        candidate_ids=candidate_ids,
    )
    llm_config = require_runtime_config(get_model_runtime_config("llm"), "llm")
    raw_draft = generate_script_edit_draft(
        llm_config,
        project.name,
        context,
        messages,
        {
            "message": user_message["content"],
            "quickStart": user_message.get("quickStart"),
            "mode": mode,
            "candidateIds": candidate_ids,
        },
    )
    draft = _sanitize_draft(raw_draft, context, session_id=session_id, mode=mode)
    assistant_message = {
        "id": f"script-message-{uuid4().hex}",
        "role": "assistant",
        "content": draft["summary"] or draft["title"],
        "draftId": draft["id"],
        "createdAt": _now_iso(),
    }
    session["messages"] = [*messages, assistant_message]
    session["latestDraftId"] = draft["id"]
    session["updatedAt"] = _now_iso()
    script_edits["drafts"].insert(0, draft)
    save_project(job.projectFolder, data)
    return {
        "sessionId": session_id,
        "draftId": draft["id"],
        "promptStats": draft["promptStats"],
        "warnings": draft["warnings"],
    }


def _track_duration(timeline: dict) -> int:
    max_end = 0
    for track in [*timeline.get("videoTracks", []), *timeline.get("audioTracks", [])]:
        for clip in track.get("clips", []):
            max_end = max(max_end, int(clip.get("startFrame") or 0) + max(1, int(clip.get("durationInFrames") or 1)))
    return max_end


def _project_folder_for_draft(draft_id: str) -> str:
    for recent in list_recent_projects(100):
        folder_path = str(recent.get("folderPath") or "")
        if not folder_path:
            continue
        try:
            project = open_project(folder_path)
        except (FileNotFoundError, NotADirectoryError, ValueError):
            continue
        script_edits = project.scriptEdits if isinstance(project.scriptEdits, dict) else {}
        drafts = script_edits.get("drafts", [])
        if any(isinstance(draft, dict) and draft.get("id") == draft_id for draft in drafts):
            return folder_path
    raise FileNotFoundError(f"Script edit draft not found: {draft_id}")


def apply_script_edit_draft(project_folder: str | None, draft_id: str) -> ProjectManifest:
    resolved_project_folder = project_folder or _project_folder_for_draft(draft_id)
    project = open_project(resolved_project_folder)
    data = project.model_dump()
    script_edits = _ensure_script_edits(data)
    draft = next(
        (item for item in script_edits["drafts"] if isinstance(item, dict) and item.get("id") == draft_id),
        None,
    )
    if draft is None:
        raise FileNotFoundError(f"Script edit draft not found: {draft_id}")
    normalize_project_timelines(data)
    base_timeline = get_active_timeline(data)
    mode = str(draft.get("mode") or "rough_cut")
    track_id_suffix = uuid4().hex[:8]

    def clip_from_item(item: dict, kind: str, source_type: str) -> dict:
        return {
            "id": f"clip-script-{draft_id}-{kind}-{uuid4().hex[:8]}",
            "mediaId": item["mediaId"],
            "title": item.get("title") or item.get("mediaName") or item["mediaId"],
            "startFrame": int(item["timelineStartFrame"]),
            "durationInFrames": int(item["durationInFrames"]),
            "sourceIn": int(item["sourceInFrames"]),
            "color": "#2563eb" if kind == "main" else "#7c3aed",
            "sourceType": source_type,
        }

    main_clips = [clip_from_item(item, "main", "imported-video") for item in draft.get("tracks", {}).get("main", [])]
    broll_clips = [clip_from_item(item, "broll", "imported-video") for item in draft.get("tracks", {}).get("broll", [])]
    audio_clips = [
        {
            **clip_from_item(item, "audio", "extracted-audio"),
            "color": "#0f766e",
        }
        for item in draft.get("tracks", {}).get("main", [])
    ]
    video_tracks = []
    audio_tracks = []
    if broll_clips:
        video_tracks.append(
            {
                "id": f"track-script-{draft_id}-{track_id_suffix}-broll",
                "name": "B-roll",
                "type": "video",
                "clips": broll_clips,
            }
        )
    if mode != "broll_sort" and main_clips:
        video_tracks.append(
            {
                "id": f"track-script-{draft_id}-{track_id_suffix}-main",
                "name": "主视频",
                "type": "video",
                "clips": main_clips,
            }
        )
    if mode != "broll_sort" and audio_clips:
        audio_tracks.append(
            {
                "id": f"track-script-{draft_id}-{track_id_suffix}-audio",
                "name": "原声",
                "type": "audio",
                "clips": audio_clips,
            }
        )
    compound_timeline = {
        "id": f"timeline-compound-{uuid4().hex}",
        "name": str(draft.get("title") or ("B-roll 排序" if mode == "broll_sort" else "脚本粗剪")),
        "kind": "compound",
        "sourceDraftId": draft_id,
        "fps": base_timeline.get("fps", 30),
        "width": base_timeline.get("width", 1920),
        "height": base_timeline.get("height", 1080),
        "durationInFrames": 0,
        "videoTracks": video_tracks,
        "audioTracks": audio_tracks,
    }
    compound_timeline["durationInFrames"] = _track_duration(compound_timeline)
    add_project_timeline(data, compound_timeline, activate=True)
    draft["applied"] = True
    draft["appliedAt"] = _now_iso()
    draft["updatedAt"] = draft["appliedAt"]
    return save_project(resolved_project_folder, data)

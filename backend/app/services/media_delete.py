from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.analysis_merge import legacy_scene_count
from app.services.project_manifest import open_project, save_project
from app.services.project_timelines import normalize_project_timelines


def _filename(path: str | None) -> str:
    if not path:
        return ""
    return Path(path).name.lower()


def _safe_resolved_project_path(project_folder: Path, relative_path: str | None) -> Path | None:
    if not relative_path:
        return None
    resolved = (project_folder / relative_path).resolve()
    if resolved != project_folder and project_folder not in resolved.parents:
        raise ValueError("Invalid project media path")
    return resolved


def _media_identity(media: dict[str, Any], project_folder: Path) -> dict[str, set[str]]:
    paths: set[str] = set()
    names: set[str] = set()
    for key in ("name", "sourceLabel", "originalPath", "projectPath"):
        value = str(media.get(key) or "").strip()
        if not value:
            continue
        filename = _filename(value)
        if filename:
            names.add(filename)

    original_path = str(media.get("originalPath") or "").strip()
    if original_path:
        paths.add(str(Path(original_path).expanduser().resolve()).lower())
    project_path = _safe_resolved_project_path(project_folder, str(media.get("projectPath") or ""))
    if project_path is not None:
        paths.add(str(project_path).lower())
    return {"paths": paths, "names": names}


def _legacy_video_matches(video: dict[str, Any], identity: dict[str, set[str]]) -> bool:
    video_names = {
        _filename(str(video.get("video") or "")),
        _filename(str(video.get("video_path") or "")),
    }
    video_names.discard("")
    if video_names & identity["names"]:
        return True

    video_path = str(video.get("video_path") or "").strip()
    if not video_path:
        return False
    try:
        resolved = str(Path(video_path).expanduser().resolve()).lower()
    except OSError:
        resolved = video_path.lower()
    if resolved in identity["paths"]:
        return True
    return any(name and resolved.endswith(name) for name in identity["names"])


def _clean_legacy_scene_groups(
    groups: Any,
    identity: dict[str, set[str]],
) -> list[Any]:
    if not isinstance(groups, list):
        return []
    cleaned: list[Any] = []
    for group in groups:
        if not isinstance(group, dict):
            cleaned.append(group)
            continue
        videos = group.get("videos")
        if not isinstance(videos, list):
            cleaned.append(group)
            continue
        next_videos = [
            video
            for video in videos
            if _filename(str(video or "")) not in identity["names"]
        ]
        if next_videos:
            cleaned.append({**group, "videos": next_videos})
    return cleaned


def _sanitize_legacy_summary(summary: Any, identity: dict[str, set[str]]) -> dict[str, Any] | None:
    if not isinstance(summary, dict):
        return None
    next_summary = dict(summary)
    videos = [
        video
        for video in next_summary.get("videos") or []
        if isinstance(video, dict) and not _legacy_video_matches(video, identity)
    ]
    next_summary["videos"] = videos
    next_summary["total_videos"] = len(videos)
    next_summary["scene_groups"] = _clean_legacy_scene_groups(next_summary.get("scene_groups"), identity)
    return next_summary


def _timeline_duration(timeline: dict[str, Any]) -> int:
    ends: list[int] = []
    for track in [
        *(timeline.get("videoTracks") or []),
        *(timeline.get("audioTracks") or []),
    ]:
        if not isinstance(track, dict):
            continue
        for clip in track.get("clips") or []:
            if not isinstance(clip, dict):
                continue
            start = int(clip.get("startFrame") or 0)
            duration = int(clip.get("durationInFrames") or 0)
            ends.append(start + duration)
    return max(ends, default=0)


def _remove_media_clips(timeline: dict[str, Any], media_id: str) -> tuple[dict[str, Any], set[str]]:
    removed_clip_ids: set[str] = set()

    def clean_tracks(tracks: Any) -> list[dict[str, Any]]:
        cleaned_tracks: list[dict[str, Any]] = []
        for track in tracks if isinstance(tracks, list) else []:
            if not isinstance(track, dict):
                continue
            kept_clips = []
            for clip in track.get("clips") or []:
                if not isinstance(clip, dict):
                    continue
                if str(clip.get("mediaId") or "") == media_id:
                    clip_id = str(clip.get("id") or "")
                    if clip_id:
                        removed_clip_ids.add(clip_id)
                    continue
                kept_clips.append(clip)
            cleaned_tracks.append({**track, "clips": kept_clips})
        return cleaned_tracks

    next_timeline = {
        **timeline,
        "videoTracks": clean_tracks(timeline.get("videoTracks")),
        "audioTracks": clean_tracks(timeline.get("audioTracks")),
    }
    next_timeline["durationInFrames"] = _timeline_duration(next_timeline)
    return next_timeline, removed_clip_ids


def _clean_edit_suggestions(analysis: dict[str, Any], removed_clip_ids: set[str]) -> dict[str, Any]:
    if not removed_clip_ids:
        return analysis
    suggestions = []
    for suggestion in analysis.get("editSuggestions") or []:
        if not isinstance(suggestion, dict):
            continue
        affected = [
            clip_id
            for clip_id in suggestion.get("affectedClipIds") or []
            if str(clip_id) not in removed_clip_ids
        ]
        if not affected:
            continue
        suggestions.append({**suggestion, "affectedClipIds": affected})
    return {**analysis, "editSuggestions": suggestions}


def _clean_scene_groups(scene_groups: dict[str, Any], media_id: str) -> dict[str, Any]:
    groups = []
    for group in scene_groups.get("groups") or []:
        if not isinstance(group, dict):
            continue
        media_ids = [item for item in group.get("mediaIds") or [] if str(item) != media_id]
        if not media_ids:
            continue
        groups.append({**group, "mediaIds": media_ids})
    return {**scene_groups, "groups": groups}


def _clean_script_edits(script_edits: dict[str, Any], media_id: str) -> dict[str, Any]:
    def keep_track_items(items: Any) -> list[dict[str, Any]]:
        if not isinstance(items, list):
            return []
        return [
            item
            for item in items
            if isinstance(item, dict) and str(item.get("mediaId") or "") != media_id
        ]

    drafts = []
    for draft in script_edits.get("drafts") or []:
        if not isinstance(draft, dict):
            continue
        tracks = draft.get("tracks") if isinstance(draft.get("tracks"), dict) else {}
        next_tracks = {
            **tracks,
            "main": keep_track_items(tracks.get("main")),
            "broll": keep_track_items(tracks.get("broll")),
        }
        if not next_tracks["main"] and not next_tracks["broll"]:
            continue
        drafts.append({**draft, "tracks": next_tracks})

    valid_draft_ids = {str(draft.get("id") or "") for draft in drafts if isinstance(draft, dict)}
    sessions = []
    for session in script_edits.get("sessions") or []:
        if not isinstance(session, dict):
            continue
        latest_draft_id = str(session.get("latestDraftId") or "")
        if latest_draft_id and latest_draft_id not in valid_draft_ids:
            session = {**session}
            session.pop("latestDraftId", None)
        sessions.append(session)
    return {**script_edits, "drafts": drafts, "sessions": sessions}


def _clean_tts_jobs(tts_jobs: Any, media_id: str, removed_clip_ids: set[str]) -> list[dict[str, Any]]:
    cleaned = []
    for job in tts_jobs if isinstance(tts_jobs, list) else []:
        if not isinstance(job, dict):
            continue
        if str(job.get("generatedMediaId") or "") == media_id:
            continue
        if str(job.get("sampleClipId") or "") in removed_clip_ids:
            cleaned.append({**job, "sampleClipId": None})
        else:
            cleaned.append(job)
    return cleaned


def _write_sanitized_summary_file(path: Path, identity: dict[str, set[str]]) -> None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    cleaned = _sanitize_legacy_summary(payload, identity)
    if cleaned is None:
        return
    path.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding="utf-8")


def _clean_analysis_files(project_folder: Path, identity: dict[str, set[str]]) -> None:
    output_summary = project_folder / "output" / "summary.json"
    if output_summary.exists():
        _write_sanitized_summary_file(output_summary, identity)

    analysis_folder = project_folder / "analysis"
    if not analysis_folder.exists():
        return
    for summary_path in analysis_folder.glob("*.json"):
        _write_sanitized_summary_file(summary_path, identity)


def delete_project_media(project_folder_value: str, media_id: str) -> tuple[dict[str, Any], bool]:
    project = open_project(project_folder_value)
    project_folder = Path(project.folderPath).resolve()
    media = next((item for item in project.media if str(item.get("id") or "") == media_id), None)
    if media is None:
        raise FileNotFoundError(f"Media item not found: {media_id}")

    identity = _media_identity(media, project_folder)
    data = project.model_dump()
    data["media"] = [
        item for item in data.get("media", []) if str(item.get("id") or "") != media_id
    ]

    normalize_project_timelines(data)
    removed_clip_ids: set[str] = set()
    cleaned_timelines = []
    for timeline in data.get("timelines") or []:
        if not isinstance(timeline, dict):
            continue
        cleaned_timeline, timeline_removed_clip_ids = _remove_media_clips(timeline, media_id)
        removed_clip_ids.update(timeline_removed_clip_ids)
        cleaned_timelines.append(cleaned_timeline)
    data["timelines"] = cleaned_timelines
    normalize_project_timelines(data)

    subtitles = data.get("subtitles") if isinstance(data.get("subtitles"), dict) else {}
    data["subtitles"] = {
        **subtitles,
        "segments": [
            segment
            for segment in subtitles.get("segments") or []
            if not isinstance(segment, dict) or str(segment.get("mediaId") or "") != media_id
        ],
    }

    data["sceneGroups"] = _clean_scene_groups(
        data.get("sceneGroups") if isinstance(data.get("sceneGroups"), dict) else {},
        media_id,
    )

    analysis = data.get("analysis") if isinstance(data.get("analysis"), dict) else {}
    analysis = _clean_edit_suggestions(analysis, removed_clip_ids)
    legacy_summary = _sanitize_legacy_summary(analysis.get("legacySummary"), identity)
    analysis["legacySummary"] = legacy_summary
    analysis["sceneCount"] = legacy_scene_count(legacy_summary)
    data["analysis"] = analysis

    data["scriptEdits"] = _clean_script_edits(
        data.get("scriptEdits") if isinstance(data.get("scriptEdits"), dict) else {},
        media_id,
    )
    data["ttsJobs"] = _clean_tts_jobs(data.get("ttsJobs"), media_id, removed_clip_ids)

    removed_project_file = False
    project_file = _safe_resolved_project_path(project_folder, str(media.get("projectPath") or ""))
    if project_file is not None and project_file.exists() and project_file.is_file():
        project_file.unlink()
        removed_project_file = True

    _clean_analysis_files(project_folder, identity)
    saved = save_project(str(project_folder), data)
    return saved.model_dump(), removed_project_file

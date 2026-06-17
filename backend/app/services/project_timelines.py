from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4


DEFAULT_MAIN_TIMELINE_ID = "timeline-main"
DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080
DEFAULT_FPS = 30
MAX_TIMELINE_NESTING_DEPTH = 8


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def empty_timeline(
    *,
    timeline_id: str,
    name: str,
    kind: str,
    fps: int | float = DEFAULT_FPS,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    source_draft_id: str | None = None,
) -> dict[str, Any]:
    now = now_iso()
    timeline: dict[str, Any] = {
        "id": timeline_id,
        "name": name,
        "kind": kind,
        "fps": fps,
        "width": width,
        "height": height,
        "durationInFrames": 0,
        "videoTracks": [],
        "audioTracks": [],
        "createdAt": now,
        "updatedAt": now,
    }
    if source_draft_id:
        timeline["sourceDraftId"] = source_draft_id
    return timeline


def timeline_duration(timeline: dict[str, Any]) -> int:
    max_end = 0
    for track in [*(timeline.get("videoTracks") or []), *(timeline.get("audioTracks") or [])]:
        if not isinstance(track, dict):
            continue
        for clip in track.get("clips") or []:
            if not isinstance(clip, dict):
                continue
            start = int(clip.get("startFrame") or 0)
            duration = max(0, int(clip.get("durationInFrames") or 0))
            max_end = max(max_end, start + duration)
    return max_end


def normalize_timeline(
    raw_timeline: Any,
    *,
    fallback_id: str,
    fallback_name: str,
    fallback_kind: str,
) -> dict[str, Any]:
    timeline = dict(raw_timeline) if isinstance(raw_timeline, dict) else {}
    timeline["id"] = str(timeline.get("id") or fallback_id)
    timeline["name"] = str(timeline.get("name") or fallback_name)
    timeline["kind"] = str(timeline.get("kind") or fallback_kind)
    timeline["fps"] = timeline.get("fps") or DEFAULT_FPS
    timeline["width"] = int(timeline.get("width") or DEFAULT_WIDTH)
    timeline["height"] = int(timeline.get("height") or DEFAULT_HEIGHT)
    timeline["videoTracks"] = timeline.get("videoTracks") if isinstance(timeline.get("videoTracks"), list) else []
    timeline["audioTracks"] = timeline.get("audioTracks") if isinstance(timeline.get("audioTracks"), list) else []
    timeline["durationInFrames"] = int(timeline.get("durationInFrames") or timeline_duration(timeline))
    timeline.setdefault("createdAt", now_iso())
    timeline["updatedAt"] = str(timeline.get("updatedAt") or timeline["createdAt"])
    return timeline


def normalize_project_timelines(
    data: dict[str, Any],
    *,
    sync_legacy_mirror: bool = False,
) -> dict[str, Any]:
    timelines = data.get("timelines")
    legacy_timeline = data.get("timeline") if isinstance(data.get("timeline"), dict) else None
    if not isinstance(timelines, list) or not timelines:
        timelines = [
            normalize_timeline(
                legacy_timeline or {},
                fallback_id=DEFAULT_MAIN_TIMELINE_ID,
                fallback_name="主时间轴",
                fallback_kind="main",
            )
        ]
    else:
        normalized_timelines = []
        seen_ids: set[str] = set()
        for index, timeline in enumerate(timelines):
            if not isinstance(timeline, dict):
                continue
            kind = str(timeline.get("kind") or ("main" if index == 0 else "compound"))
            base_id = DEFAULT_MAIN_TIMELINE_ID if index == 0 and kind == "main" else f"timeline-{kind}-{uuid4().hex[:8]}"
            normalized = normalize_timeline(
                timeline,
                fallback_id=base_id,
                fallback_name="主时间轴" if kind == "main" else f"复合片段 {index}",
                fallback_kind=kind,
            )
            while normalized["id"] in seen_ids:
                normalized["id"] = f"{normalized['id']}-{uuid4().hex[:6]}"
            seen_ids.add(normalized["id"])
            normalized_timelines.append(normalized)
        timelines = normalized_timelines or [
            empty_timeline(
                timeline_id=DEFAULT_MAIN_TIMELINE_ID,
                name="主时间轴",
                kind="main",
            )
        ]

    active_timeline_id = str(data.get("activeTimelineId") or "")
    timeline_ids = {str(timeline.get("id")) for timeline in timelines if isinstance(timeline, dict)}
    if active_timeline_id not in timeline_ids:
        active_timeline_id = str(timelines[0]["id"])

    if sync_legacy_mirror and legacy_timeline is not None:
        active_index = next(
            index
            for index, timeline in enumerate(timelines)
            if str(timeline.get("id")) == active_timeline_id
        )
        active_existing = timelines[active_index]
        timelines[active_index] = normalize_timeline(
            {
                **legacy_timeline,
                "id": active_timeline_id,
                "name": legacy_timeline.get("name") or active_existing.get("name"),
                "kind": legacy_timeline.get("kind") or active_existing.get("kind"),
            },
            fallback_id=active_timeline_id,
            fallback_name=str(active_existing.get("name") or "主时间轴"),
            fallback_kind=str(active_existing.get("kind") or "main"),
        )

    active_timeline = next(
        timeline for timeline in timelines if str(timeline.get("id")) == active_timeline_id
    )
    data["timelines"] = timelines
    data["activeTimelineId"] = active_timeline_id
    data["timeline"] = active_timeline
    return data


def get_active_timeline(data: dict[str, Any]) -> dict[str, Any]:
    normalize_project_timelines(data)
    active_timeline_id = str(data.get("activeTimelineId") or "")
    return next(
        timeline
        for timeline in data["timelines"]
        if isinstance(timeline, dict) and str(timeline.get("id")) == active_timeline_id
    )


def set_active_timeline(data: dict[str, Any], timeline_id: str) -> dict[str, Any]:
    normalize_project_timelines(data)
    if not any(str(timeline.get("id")) == timeline_id for timeline in data["timelines"]):
        raise ValueError(f"Timeline not found: {timeline_id}")
    data["activeTimelineId"] = timeline_id
    data["timeline"] = get_active_timeline(data)
    return data


def add_project_timeline(
    data: dict[str, Any],
    timeline: dict[str, Any],
    *,
    activate: bool = True,
) -> dict[str, Any]:
    normalize_project_timelines(data)
    timeline_id = str(timeline.get("id") or f"timeline-compound-{uuid4().hex}")
    if any(str(item.get("id")) == timeline_id for item in data["timelines"]):
        timeline_id = f"{timeline_id}-{uuid4().hex[:8]}"
    timeline = normalize_timeline(
        {**timeline, "id": timeline_id},
        fallback_id=timeline_id,
        fallback_name=str(timeline.get("name") or "复合片段"),
        fallback_kind=str(timeline.get("kind") or "compound"),
    )
    timeline["durationInFrames"] = timeline_duration(timeline)
    data["timelines"].append(timeline)
    if activate:
        data["activeTimelineId"] = timeline["id"]
        data["timeline"] = timeline
    else:
        data["timeline"] = get_active_timeline(data)
    return data

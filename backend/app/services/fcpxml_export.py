from __future__ import annotations

from fractions import Fraction
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

from app.schemas.project import ProjectManifest
from app.services.project_timelines import MAX_TIMELINE_NESTING_DEPTH


FCPXML_VERSION = "1.10"


def _frame_time(frames: int | float, fps: int | float) -> str:
    frame_count = int(round(frames))
    if frame_count <= 0:
        return "0s"
    rate = max(1, int(round(float(fps or 30))))
    value = Fraction(frame_count, rate)
    if value.denominator == 1:
        return f"{value.numerator}s"
    return f"{value.numerator}/{value.denominator}s"


def _media_path(project_folder: Path, item: dict) -> Path:
    if item.get("projectPath"):
        return (project_folder / str(item["projectPath"])).resolve()
    return Path(str(item.get("originalPath", ""))).expanduser().resolve()


def _asset_duration_frames(item: dict, fallback: int) -> int:
    duration = int(item.get("durationInFrames") or 0)
    return max(duration, fallback, 1)


def _timeline_by_id(project: ProjectManifest) -> dict[str, dict[str, Any]]:
    timelines = project.timelines if isinstance(project.timelines, list) else []
    return {
        str(timeline.get("id")): timeline
        for timeline in timelines
        if isinstance(timeline, dict) and timeline.get("id")
    }


def _active_timeline(project: ProjectManifest, timeline_id: str | None = None) -> dict[str, Any]:
    timelines = _timeline_by_id(project)
    selected_id = timeline_id or project.activeTimelineId
    if selected_id and selected_id in timelines:
        return timelines[selected_id]
    return project.timeline or {}


def _timeline_clip_entries(
    project: ProjectManifest,
    timeline: dict,
    *,
    start_offset: int = 0,
    source_in: int = 0,
    duration_limit: int | None = None,
    depth: int = 0,
    visited: set[str] | None = None,
) -> list[tuple[dict, int]]:
    entries: list[tuple[dict, int]] = []
    if depth > MAX_TIMELINE_NESTING_DEPTH:
        return entries
    visited = set(visited or set())
    timeline_id = str(timeline.get("id") or "")
    if timeline_id:
        if timeline_id in visited:
            return entries
        visited.add(timeline_id)

    window_start = max(0, int(source_in or 0))
    window_end = window_start + duration_limit if duration_limit is not None else None

    def append_clip(clip: dict, lane: int) -> None:
        clip_start = int(clip.get("startFrame") or 0)
        clip_duration = max(1, int(clip.get("durationInFrames") or 0))
        clip_end = clip_start + clip_duration
        visible_start = max(clip_start, window_start)
        visible_end = min(clip_end, window_end) if window_end is not None else clip_end
        if visible_end <= visible_start:
            return
        trim = visible_start - clip_start
        output_start = start_offset + visible_start - window_start
        output_duration = visible_end - visible_start
        if str(clip.get("sourceType") or "") == "compound" or clip.get("timelineId"):
            nested_id = str(clip.get("timelineId") or "")
            nested = _timeline_by_id(project).get(nested_id)
            if not nested:
                return
            entries.extend(
                _timeline_clip_entries(
                    project,
                    nested,
                    start_offset=output_start,
                    source_in=int(clip.get("sourceIn") or 0) + trim,
                    duration_limit=output_duration,
                    depth=depth + 1,
                    visited=visited,
                )
            )
            return
        entries.append(
            (
                {
                    **clip,
                    "startFrame": output_start,
                    "durationInFrames": output_duration,
                    "sourceIn": int(clip.get("sourceIn") or 0) + trim,
                },
                lane,
            )
        )

    for track in timeline.get("videoTracks", []):
        for clip in track.get("clips", []):
            if isinstance(clip, dict):
                append_clip(clip, 0)
    for track_index, track in enumerate(timeline.get("audioTracks", []), start=1):
        for clip in track.get("clips", []):
            if isinstance(clip, dict):
                append_clip(clip, -track_index)
    return sorted(entries, key=lambda entry: (int(entry[0].get("startFrame", 0)), entry[1]))


def build_fcpxml(project: ProjectManifest, timeline_id: str | None = None) -> str:
    project_folder = Path(project.folderPath).resolve()
    timeline = _active_timeline(project, timeline_id)
    fps = timeline.get("fps", 30) or 30
    width = int(timeline.get("width", 1920) or 1920)
    height = int(timeline.get("height", 1080) or 1080)
    duration_frames = int(timeline.get("durationInFrames", 0) or 0)
    media_by_id = {str(item.get("id")): item for item in project.media}
    entries = _timeline_clip_entries(project, timeline)
    if entries:
        duration_frames = max(
            duration_frames,
            *[
                int(clip.get("startFrame", 0) or 0)
                + int(clip.get("durationInFrames", 0) or 0)
                for clip, _lane in entries
            ],
        )
    duration_frames = max(duration_frames, 1)

    root = ET.Element("fcpxml", {"version": FCPXML_VERSION})
    resources = ET.SubElement(root, "resources")
    format_id = "r1"
    ET.SubElement(
        resources,
        "format",
        {
            "id": format_id,
            "name": f"FFVideoFormat{height}p{int(round(float(fps)))}",
            "frameDuration": _frame_time(1, fps),
            "width": str(width),
            "height": str(height),
        },
    )

    asset_ids: dict[str, str] = {}
    for clip, _lane in entries:
        media_id = str(clip.get("mediaId") or "")
        if media_id in asset_ids:
            continue
        item = media_by_id.get(media_id)
        if not item:
            continue
        asset_id = f"r{len(asset_ids) + 2}"
        asset_ids[media_id] = asset_id
        source_path = _media_path(project_folder, item)
        source_uri = source_path.as_uri()
        fallback_duration = (
            int(clip.get("sourceIn", 0) or 0)
            + int(clip.get("durationInFrames", 0) or 0)
        )
        attributes = {
            "id": asset_id,
            "name": str(item.get("name") or clip.get("title") or media_id),
            "uid": source_uri,
            "start": "0s",
            "duration": _frame_time(_asset_duration_frames(item, fallback_duration), fps),
            "format": format_id,
        }
        media_type = str(item.get("type") or "")
        if media_type == "audio" or media_type == "generated-audio":
            attributes["hasAudio"] = "1"
            attributes["audioSources"] = "1"
            attributes["audioChannels"] = "2"
            attributes["audioRate"] = "48000"
        else:
            attributes["hasVideo"] = "1"
            attributes["hasAudio"] = "1"
            attributes["audioSources"] = "1"
            attributes["audioChannels"] = "2"
            attributes["audioRate"] = "48000"
        asset = ET.SubElement(resources, "asset", attributes)
        ET.SubElement(
            asset,
            "media-rep",
            {
                "kind": "original-media",
                "src": source_uri,
            },
        )

    library = ET.SubElement(root, "library")
    event = ET.SubElement(library, "event", {"name": project.name})
    project_node = ET.SubElement(event, "project", {"name": project.name})
    sequence = ET.SubElement(
        project_node,
        "sequence",
        {
            "format": format_id,
            "duration": _frame_time(duration_frames, fps),
            "tcStart": "0s",
            "tcFormat": "NDF",
            "audioLayout": "stereo",
            "audioRate": "48k",
        },
    )
    spine = ET.SubElement(sequence, "spine")

    cursor = 0
    for clip, lane in entries:
        media_id = str(clip.get("mediaId") or "")
        asset_id = asset_ids.get(media_id)
        if not asset_id:
            continue
        start_frame = int(clip.get("startFrame", 0) or 0)
        duration = max(1, int(clip.get("durationInFrames", 0) or 0))
        if lane == 0 and start_frame > cursor:
            ET.SubElement(
                spine,
                "gap",
                {
                    "name": "Gap",
                    "offset": _frame_time(cursor, fps),
                    "duration": _frame_time(start_frame - cursor, fps),
                },
            )
            cursor = start_frame
        attributes = {
            "name": str(clip.get("title") or media_by_id.get(media_id, {}).get("name") or media_id),
            "ref": asset_id,
            "offset": _frame_time(start_frame, fps),
            "start": _frame_time(int(clip.get("sourceIn", 0) or 0), fps),
            "duration": _frame_time(duration, fps),
        }
        if lane != 0:
            attributes["lane"] = str(lane)
        ET.SubElement(spine, "asset-clip", attributes)
        if lane == 0:
            cursor = max(cursor, start_frame + duration)

    if cursor < duration_frames:
        ET.SubElement(
            spine,
            "gap",
            {
                "name": "Gap",
                "offset": _frame_time(cursor, fps),
                "duration": _frame_time(duration_frames - cursor, fps),
            },
        )

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode", short_empty_elements=True)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n{body}\n'


def write_fcpxml(project: ProjectManifest, output_path: Path, timeline_id: str | None = None) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(build_fcpxml(project, timeline_id), encoding="utf-8")

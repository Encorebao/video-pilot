from __future__ import annotations

from pathlib import Path
from typing import Any


def _video_key(video: dict[str, Any]) -> str:
    path = str(video.get("video_path") or "").strip()
    name = str(video.get("video") or "").strip()
    if path:
        return Path(path).name.lower()
    return name.lower()


def merge_legacy_summaries(*summaries: dict[str, Any] | None) -> dict[str, Any] | None:
    merged: dict[str, Any] = {}
    videos: list[dict[str, Any]] = []
    video_index: dict[str, int] = {}
    scene_groups: list[Any] | None = None

    for summary in summaries:
        if not isinstance(summary, dict):
            continue

        merged.update(
            {
                key: value
                for key, value in summary.items()
                if key not in {"videos", "total_videos", "scene_groups"}
            }
        )

        groups = summary.get("scene_groups")
        if isinstance(groups, list) and groups:
            scene_groups = groups

        for video in summary.get("videos") or []:
            if not isinstance(video, dict):
                continue
            key = _video_key(video)
            if key and key in video_index:
                videos[video_index[key]] = video
            else:
                if key:
                    video_index[key] = len(videos)
                videos.append(video)

    if not merged and not videos and scene_groups is None:
        return None

    merged["videos"] = videos
    merged["total_videos"] = len(videos)
    merged["scene_groups"] = scene_groups or []
    return merged


def legacy_scene_count(summary: dict[str, Any] | None) -> int:
    if not isinstance(summary, dict):
        return 0
    total = 0
    for video in summary.get("videos") or []:
        if not isinstance(video, dict):
            continue
        total += int(video.get("visual_analysis", {}).get("total_scenes", 0) or 0)
    return total

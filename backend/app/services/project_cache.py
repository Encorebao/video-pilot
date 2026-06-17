from __future__ import annotations

import shutil
import time
from pathlib import Path


def project_cache_dir(project_folder: Path) -> Path:
    return project_folder / "cache"


def subtitle_job_cache_dir(project_folder: Path, job_id: str) -> Path:
    return project_cache_dir(project_folder) / "subtitles" / job_id


def directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def clear_path(path: Path) -> int:
    size = directory_size(path)
    if path.exists():
        shutil.rmtree(path)
    return size


def clear_subtitle_job_cache(project_folder: Path, job_id: str) -> int:
    return clear_path(subtitle_job_cache_dir(project_folder, job_id))


def clear_project_cache(project_folder: Path) -> dict:
    cache_dir = project_cache_dir(project_folder)
    removed_bytes = clear_path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return {"removedBytes": removed_bytes, "cachePath": str(cache_dir)}


def clear_expired_cache(project_folder: Path, max_age_seconds: int) -> int:
    cache_dir = project_cache_dir(project_folder)
    if not cache_dir.exists():
        return 0
    cutoff = time.time() - max_age_seconds
    removed = 0
    for child in cache_dir.iterdir():
        if child.stat().st_mtime < cutoff:
            removed += clear_path(child)
    return removed

import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from app.core.project_paths import ensure_project_subdirs, normalize_project_folder
from app.schemas.project import ProjectManifest
from app.services.frame_extraction import get_video_shooting_meta
from app.services.project_manifest import open_project, save_project

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _from_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts).astimezone().isoformat(timespec="seconds")


def _media_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in AUDIO_EXTENSIONS:
        return "audio"
    return "video"


def _relative_project_path(project_folder: Path, path: Path) -> str:
    relative = path.relative_to(project_folder)
    return relative.as_posix()


def _safe_destination(project_folder: Path, source: Path) -> Path:
    media_dir = project_folder / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex[:8]}-{source.name}"
    destination = (media_dir / filename).resolve()
    if media_dir.resolve() not in destination.parents:
        raise ValueError("Invalid media destination")
    return destination


def _probe_duration_frames(source: Path, fps: float) -> int:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(source),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return 0

    try:
        duration = float(json.loads(result.stdout)["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return 0

    return max(0, round(duration * fps))


def _file_birthtime(source: Path) -> Optional[float]:
    stat = source.stat()
    birthtime = getattr(stat, "st_birthtime", None)
    return float(birthtime) if birthtime else None


def _probe_media_creation_time(source: Path) -> Optional[str]:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(source),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        data = json.loads(result.stdout or "{}")
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None

    tags: dict[str, str] = {}
    fmt = data.get("format", {})
    if isinstance(fmt, dict):
        tags.update({key.lower(): value for key, value in fmt.get("tags", {}).items()})
    for stream in data.get("streams", []):
        if isinstance(stream, dict):
            tags.update({key.lower(): value for key, value in stream.get("tags", {}).items()})

    raw_time = (
        tags.get("creation_time")
        or tags.get("date")
        or tags.get("com.apple.quicktime.creationdate")
    )
    if not raw_time:
        return None
    try:
        return datetime.fromisoformat(raw_time.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return raw_time


def _capture_metadata(source: Path, media_type: str, imported_at: str) -> tuple[str, str]:
    if media_type == "video":
        shooting_meta = get_video_shooting_meta(source)
        creation_time = shooting_meta.get("creation_time")
        time_source = shooting_meta.get("time_source")
        if isinstance(creation_time, str) and creation_time:
            if time_source in {"xml_sidecar", "metadata"}:
                return creation_time, str(time_source)

    metadata_time = _probe_media_creation_time(source)
    if metadata_time:
        return metadata_time, "metadata"

    birthtime = _file_birthtime(source)
    if birthtime is not None:
        return _from_timestamp(birthtime), "file_birthtime"

    try:
        return _from_timestamp(source.stat().st_mtime), "file_mtime"
    except OSError:
        return imported_at, "import_time"


def import_media(folder_path: str, file_paths: list[str], mode: str) -> tuple[list[dict], ProjectManifest]:
    project_folder = normalize_project_folder(folder_path)
    ensure_project_subdirs(project_folder)
    project = open_project(str(project_folder))
    fps = float(project.timeline.get("fps", 30) or 30)
    now = _now_iso()
    new_items: list[dict] = []

    for raw_path in file_paths:
        source = Path(raw_path).expanduser().resolve()
        if not source.exists() or not source.is_file():
            raise ValueError(f"Media source does not exist: {source}")

        media_type = _media_type(source)
        captured_at, captured_at_source = _capture_metadata(source, media_type, now)
        updated_at = _from_timestamp(source.stat().st_mtime)
        target = source
        project_path = None
        if mode == "copied":
            target = _safe_destination(project_folder, source)
            shutil.copy2(source, target)
            project_path = _relative_project_path(project_folder, target)

        item = {
            "id": f"media-{uuid4().hex}",
            "name": source.name,
            "type": media_type,
            "importMode": mode,
            "originalPath": str(source),
            "durationInFrames": _probe_duration_frames(target, fps),
            "sourceLabel": source.name,
            "createdAt": now,
            "updatedAt": updated_at,
            "capturedAt": captured_at,
            "capturedAtSource": captured_at_source,
            "fileSize": source.stat().st_size,
        }
        if project_path:
            item["projectPath"] = project_path
        new_items.append(item)

    data = project.model_dump()
    data["media"] = [*data.get("media", []), *new_items]
    saved = save_project(str(project_folder), data)
    return new_items, saved

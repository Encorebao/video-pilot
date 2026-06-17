from datetime import datetime
from pathlib import Path
from uuid import uuid4
import json

from app.core.project_paths import (
    ensure_project_subdirs,
    existing_manifest_path,
    manifest_path,
    normalize_project_folder,
)
from app.schemas.project import ProjectManifest
from app.services.project_timelines import DEFAULT_MAIN_TIMELINE_ID, empty_timeline, normalize_project_timelines


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def init_project(folder_path: str, name: str) -> ProjectManifest:
    project_name = name.strip()
    if not project_name:
        raise ValueError("Project name cannot be empty")

    folder = normalize_project_folder(folder_path)
    ensure_project_subdirs(folder)
    path = existing_manifest_path(folder)
    if path.exists():
        return open_project(str(folder))
    path = manifest_path(folder)

    now = _now_iso()
    main_timeline = empty_timeline(
        timeline_id=DEFAULT_MAIN_TIMELINE_ID,
        name="主时间轴",
        kind="main",
    )
    manifest = ProjectManifest(
        id=str(uuid4()),
        name=project_name,
        folderPath=str(folder),
        createdAt=now,
        updatedAt=now,
        timeline=main_timeline,
        timelines=[main_timeline],
        activeTimelineId=DEFAULT_MAIN_TIMELINE_ID,
        analysis={
            "overallSummary": "",
            "sceneCount": 0,
            "transcriptCount": 0,
            "detectedFillerWordCount": 0,
            "keyframes": [],
            "transcriptSegments": [],
            "editSuggestions": [],
        },
        sceneGroups={
            "settings": {"gapMinutes": 10},
            "groups": [],
        },
        subtitles={
            "settings": {
                "model": "mlx-community/whisper-large-v3-turbo",
                "language": "zh",
                "maxWordsPerSegment": 24,
            },
            "segments": [],
        },
        scriptEdits={
            "sessions": [],
            "drafts": [],
        },
    )
    temp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(
        json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_path.replace(path)
    return manifest


def open_project(folder_path: str) -> ProjectManifest:
    folder = normalize_project_folder(folder_path)
    path = existing_manifest_path(folder)
    if not path.exists():
        raise FileNotFoundError(f"Project manifest not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    data["folderPath"] = str(folder)
    data.setdefault("scriptEdits", {"sessions": [], "drafts": []})
    normalize_project_timelines(data)
    return ProjectManifest.model_validate(data)


def save_project(folder_path: str, project_data: dict) -> ProjectManifest:
    folder = normalize_project_folder(folder_path)
    data = dict(project_data)
    data["folderPath"] = str(Path(data.get("folderPath", "")).expanduser().resolve())
    if data["folderPath"] != str(folder):
        raise ValueError("Project folder does not match save target")

    data.setdefault("createdAt", _now_iso())
    data["updatedAt"] = _now_iso()
    normalize_project_timelines(data, sync_legacy_mirror=True)
    project = ProjectManifest.model_validate(data)
    path = manifest_path(folder)
    temp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(
        json.dumps(project.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_path.replace(path)
    return project

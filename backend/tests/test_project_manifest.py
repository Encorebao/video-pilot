import json
from pathlib import Path

import pytest

from app.core.config import LEGACY_PROJECT_MANIFEST_NAME, PROJECT_MANIFEST_NAME
from app.services.project_manifest import init_project, open_project


def test_init_project_creates_manifest_and_subdirs(tmp_path: Path):
    project = init_project(str(tmp_path), "Demo Project")

    assert project.name == "Demo Project"
    assert project.folderPath == str(tmp_path.resolve())
    assert (tmp_path / PROJECT_MANIFEST_NAME).exists()
    for name in ("media", "frames", "audio", "captions", "analysis", "exports", "cache"):
        assert (tmp_path / name).is_dir()


def test_open_project_reads_existing_manifest(tmp_path: Path):
    created = init_project(str(tmp_path), "Existing Project")
    opened = open_project(str(tmp_path))

    assert opened.id == created.id
    assert opened.name == "Existing Project"
    assert opened.activeTimelineId == "timeline-main"
    assert opened.timelines[0]["id"] == "timeline-main"
    assert opened.timelines[0]["kind"] == "main"


def test_open_project_reads_legacy_video_studio_manifest(tmp_path: Path):
    created = init_project(str(tmp_path), "Legacy Project")
    current_path = tmp_path / PROJECT_MANIFEST_NAME
    legacy_path = tmp_path / LEGACY_PROJECT_MANIFEST_NAME
    current_path.replace(legacy_path)

    opened = open_project(str(tmp_path))

    assert opened.id == created.id
    assert opened.name == "Legacy Project"


def test_init_project_rejects_whitespace_only_name(tmp_path: Path):
    with pytest.raises(ValueError, match="Project name cannot be empty"):
        init_project(str(tmp_path), "   ")

    assert not (tmp_path / PROJECT_MANIFEST_NAME).exists()


def test_init_project_does_not_overwrite_existing_manifest_name(tmp_path: Path):
    created = init_project(str(tmp_path), "Original Project")
    reopened = init_project(str(tmp_path), "Replacement Project")

    assert reopened.id == created.id
    assert reopened.name == "Original Project"


def test_open_project_migrates_single_timeline_manifest(tmp_path: Path):
    manifest = {
        "id": "project-old",
        "name": "Old Project",
        "version": "0.1.0",
        "folderPath": str(tmp_path),
        "createdAt": "2026-05-01T10:00:00+08:00",
        "updatedAt": "2026-05-01T10:00:00+08:00",
        "media": [],
        "timeline": {
            "fps": 24,
            "width": 1280,
            "height": 720,
            "durationInFrames": 120,
            "videoTracks": [
                {
                    "id": "track-video-1",
                    "name": "视频 1",
                    "type": "video",
                    "clips": [],
                }
            ],
            "audioTracks": [],
        },
        "analysis": {},
        "sceneGroups": {},
        "subtitles": {},
        "scriptEdits": {"sessions": [], "drafts": []},
        "notes": "",
        "importTasks": [],
        "voiceProfiles": [],
        "ttsJobs": [],
    }
    (tmp_path / PROJECT_MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False),
        encoding="utf-8",
    )

    opened = open_project(str(tmp_path))

    assert opened.activeTimelineId == "timeline-main"
    assert len(opened.timelines) == 1
    migrated = opened.timelines[0]
    assert migrated["id"] == "timeline-main"
    assert migrated["name"] == "主时间轴"
    assert migrated["kind"] == "main"
    assert migrated["fps"] == 24
    assert migrated["videoTracks"][0]["id"] == "track-video-1"
    assert opened.timeline == migrated


def test_open_project_missing_manifest_raises_file_not_found(tmp_path: Path):
    with pytest.raises(FileNotFoundError, match="Project manifest not found"):
        open_project(str(tmp_path))


def test_init_project_file_path_raises_not_a_directory(tmp_path: Path):
    file_path = tmp_path / "project.txt"
    file_path.write_text("not a folder", encoding="utf-8")

    with pytest.raises(NotADirectoryError, match="Project path is not a folder"):
        init_project(str(file_path), "File Project")

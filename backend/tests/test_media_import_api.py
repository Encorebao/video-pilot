from pathlib import Path
import json
from datetime import datetime, timezone
import os

from fastapi.testclient import TestClient

from app.core.config import PROJECT_MANIFEST_NAME
from app.main import create_app


def _client_with_temp_state(monkeypatch, tmp_path: Path) -> TestClient:
    import app.main as main
    from app.core import config
    from app.repositories import app_state

    db_path = tmp_path / "app.db"
    monkeypatch.setattr(config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(app_state, "APP_DB_PATH", db_path)
    monkeypatch.setattr(main, "ensure_storage_dirs", lambda: None)
    return TestClient(create_app())


def test_import_media_copied_copies_file_and_updates_manifest(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source_folder = tmp_path / "source"
    project_folder.mkdir()
    source_folder.mkdir()
    source = source_folder / "clip.mp4"
    source.write_bytes(b"fake-video")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "copied",
        },
    )

    assert response.status_code == 200
    media = response.json()["mediaItems"][0]
    assert media["name"] == "clip.mp4"
    assert media["type"] == "video"
    assert media["importMode"] == "copied"
    assert media["projectPath"].startswith("media/")
    assert (project_folder / media["projectPath"]).read_bytes() == b"fake-video"
    manifest = json.loads((project_folder / PROJECT_MANIFEST_NAME).read_text(encoding="utf-8"))
    assert manifest["media"][0]["id"] == media["id"]


def test_import_media_referenced_keeps_original_path(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source = tmp_path / "voice.wav"
    project_folder.mkdir()
    source.write_bytes(b"fake-audio")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "referenced",
        },
    )

    assert response.status_code == 200
    media = response.json()["mediaItems"][0]
    assert media["type"] == "audio"
    assert media["importMode"] == "referenced"
    assert media["originalPath"] == str(source.resolve())
    assert "projectPath" not in media


def test_import_video_uses_xml_sidecar_capture_time(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source = tmp_path / "C0001.MP4"
    project_folder.mkdir()
    source.write_bytes(b"fake-video")
    mtime = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc).timestamp()
    os.utime(source, (mtime, mtime))
    (tmp_path / "C0001M01.XML").write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.20">
  <CreationDate value="2025-11-12T17:53:49+08:00"/>
</NonRealTimeMeta>
""",
        encoding="utf-8",
    )
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "referenced",
        },
    )

    assert response.status_code == 200
    media = response.json()["mediaItems"][0]
    assert media["capturedAt"] == "2025-11-12T17:53:49+08:00"
    assert media["capturedAtSource"] == "xml_sidecar"
    assert media["updatedAt"] == datetime.fromtimestamp(mtime).astimezone().isoformat(timespec="seconds")


def test_import_audio_uses_ffprobe_metadata_capture_time(monkeypatch, tmp_path: Path):
    from app.services import media_import

    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source = tmp_path / "voice.wav"
    project_folder.mkdir()
    source.write_bytes(b"fake-audio")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    class Result:
        stdout = '{"format":{"duration":"2.0","tags":{"creation_time":"2026-01-02T03:04:05Z"}},"streams":[]}'

    monkeypatch.setattr(media_import.subprocess, "run", lambda *_args, **_kwargs: Result())

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "referenced",
        },
    )

    assert response.status_code == 200
    media = response.json()["mediaItems"][0]
    assert media["capturedAt"] == "2026-01-02T03:04:05+00:00"
    assert media["capturedAtSource"] == "metadata"
    assert media["durationInFrames"] == 60


def test_import_media_falls_back_to_file_mtime_when_metadata_missing(monkeypatch, tmp_path: Path):
    from app.services import media_import

    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source.write_bytes(b"fake-video")
    mtime = datetime(2024, 3, 4, 5, 6, 7, tzinfo=timezone.utc).timestamp()
    source.touch()
    monkeypatch.setattr(media_import, "_probe_duration_frames", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(media_import, "get_video_shooting_meta", lambda _path: {})
    monkeypatch.setattr(media_import, "_file_birthtime", lambda _path: None)
    source.touch()
    os.utime(source, (mtime, mtime))
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "referenced",
        },
    )

    assert response.status_code == 200
    media = response.json()["mediaItems"][0]
    expected_time = datetime.fromtimestamp(mtime).astimezone().isoformat(timespec="seconds")
    assert media["capturedAt"] == expected_time
    assert media["capturedAtSource"] == "file_mtime"
    assert media["updatedAt"] == expected_time


def test_import_media_preserves_merged_analysis(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    analyzed_source = tmp_path / "analyzed.mp4"
    new_source = tmp_path / "new.mp4"
    analyzed_source.write_bytes(b"old-video")
    new_source.write_bytes(b"new-video")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})
    client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(analyzed_source)],
            "mode": "referenced",
        },
    )
    analysis_folder = project_folder / "analysis"
    analysis_folder.mkdir(exist_ok=True)
    (analysis_folder / "job-old.json").write_text(
        json.dumps(
            {
                "taxonomy_version": "v1",
                "total_videos": 1,
                "scene_groups": [],
                "videos": [
                    {
                        "video": "analyzed.mp4",
                        "video_path": str(analyzed_source.resolve()),
                        "visual_analysis": {
                            "total_scenes": 1,
                            "scenes": [{"index": 1, "vl_analysis": {"subject": "旧视频"}}],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(new_source)],
            "mode": "referenced",
        },
    )

    assert response.status_code == 200
    assert response.json()["project"]["analysis"]["legacySummary"]["total_videos"] == 1
    assert response.json()["project"]["analysis"]["legacySummary"]["videos"][0]["video"] == "analyzed.mp4"


def test_delete_media_cleans_project_references_analysis_files_and_copied_file(
    monkeypatch,
    tmp_path: Path,
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source_folder = tmp_path / "source"
    project_folder.mkdir()
    source_folder.mkdir()
    remove_source = source_folder / "remove.mp4"
    keep_source = source_folder / "keep.mp4"
    remove_source.write_bytes(b"remove-video")
    keep_source.write_bytes(b"keep-video")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Delete Demo"})
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(remove_source), str(keep_source)],
            "mode": "copied",
        },
    ).json()["mediaItems"]
    remove_media, keep_media = imported
    remove_media_id = remove_media["id"]
    keep_media_id = keep_media["id"]
    removed_project_file = project_folder / remove_media["projectPath"]
    assert removed_project_file.exists()

    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]
    project["timeline"]["videoTracks"] = [
        {
            "id": "track-video-1",
            "name": "视频 1",
            "type": "video",
            "clips": [
                {
                    "id": "clip-remove",
                    "mediaId": remove_media_id,
                    "title": "remove.mp4",
                    "startFrame": 0,
                    "durationInFrames": 30,
                    "sourceIn": 0,
                    "color": "#2563eb",
                    "sourceType": "imported-video",
                },
                {
                    "id": "clip-keep",
                    "mediaId": keep_media_id,
                    "title": "keep.mp4",
                    "startFrame": 60,
                    "durationInFrames": 30,
                    "sourceIn": 0,
                    "color": "#2563eb",
                    "sourceType": "imported-video",
                },
            ],
        }
    ]
    project["timeline"]["durationInFrames"] = 90
    project["subtitles"]["segments"] = [
        {
            "id": "subtitle-remove",
            "mediaId": remove_media_id,
            "startFrame": 0,
            "endFrame": 30,
            "text": "删除素材字幕",
        },
        {
            "id": "subtitle-keep",
            "mediaId": keep_media_id,
            "startFrame": 0,
            "endFrame": 30,
            "text": "保留素材字幕",
        },
    ]
    project["sceneGroups"] = {
        "settings": {"gapMinutes": 10},
        "groups": [
            {
                "id": "group-mixed",
                "title": "混合场景",
                "notes": "",
                "mediaIds": [remove_media_id, keep_media_id],
                "source": "auto",
                "createdAt": "2026-01-01T00:00:00+08:00",
                "updatedAt": "2026-01-01T00:00:00+08:00",
            },
            {
                "id": "group-remove-only",
                "title": "只包含删除素材",
                "notes": "",
                "mediaIds": [remove_media_id],
                "source": "auto",
                "createdAt": "2026-01-01T00:00:00+08:00",
                "updatedAt": "2026-01-01T00:00:00+08:00",
            },
        ],
    }
    project["analysis"] = {
        "overallSummary": "已有分析",
        "sceneCount": 2,
        "transcriptCount": 0,
        "detectedFillerWordCount": 0,
        "keyframes": [],
        "transcriptSegments": [],
        "editSuggestions": [
            {
                "id": "suggestion-remove",
                "title": "删除素材建议",
                "source": "ai-tags",
                "action": "highlight",
                "confidence": 0.9,
                "affectedClipIds": ["clip-remove"],
                "description": "只关联删除素材",
            },
            {
                "id": "suggestion-mixed",
                "title": "混合建议",
                "source": "ai-tags",
                "action": "highlight",
                "confidence": 0.8,
                "affectedClipIds": ["clip-remove", "clip-keep"],
                "description": "混合关联",
            },
        ],
        "legacySummary": {
            "taxonomy_version": "v1",
            "total_videos": 2,
            "scene_groups": [],
            "videos": [
                {
                    "video": "remove.mp4",
                    "video_path": str(removed_project_file),
                    "visual_analysis": {"total_scenes": 1, "scenes": [{"index": 0}]},
                },
                {
                    "video": "keep.mp4",
                    "video_path": str(project_folder / keep_media["projectPath"]),
                    "visual_analysis": {"total_scenes": 1, "scenes": [{"index": 0}]},
                },
            ],
        },
    }
    client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )
    analysis_file = project_folder / "analysis" / "job-old.json"
    analysis_file.parent.mkdir(exist_ok=True)
    analysis_file.write_text(
        json.dumps(project["analysis"]["legacySummary"]),
        encoding="utf-8",
    )

    response = client.delete(
        f"/api/media/{remove_media_id}",
        params={"folderPath": str(project_folder)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["deletedMediaId"] == remove_media_id
    assert payload["removedProjectFile"] is True
    deleted_project = payload["project"]
    assert [item["id"] for item in deleted_project["media"]] == [keep_media_id]
    assert [
        clip["mediaId"]
        for track in deleted_project["timeline"]["videoTracks"]
        for clip in track["clips"]
    ] == [keep_media_id]
    assert deleted_project["timeline"]["durationInFrames"] == 90
    assert [segment["mediaId"] for segment in deleted_project["subtitles"]["segments"]] == [keep_media_id]
    assert deleted_project["sceneGroups"]["groups"] == [
        {
            "id": "group-mixed",
            "title": "混合场景",
            "notes": "",
            "mediaIds": [keep_media_id],
            "source": "auto",
            "createdAt": "2026-01-01T00:00:00+08:00",
            "updatedAt": "2026-01-01T00:00:00+08:00",
        }
    ]
    assert deleted_project["analysis"]["sceneCount"] == 1
    assert deleted_project["analysis"]["legacySummary"]["total_videos"] == 1
    assert deleted_project["analysis"]["legacySummary"]["videos"][0]["video"] == "keep.mp4"
    assert deleted_project["analysis"]["editSuggestions"] == [
        {
            "id": "suggestion-mixed",
            "title": "混合建议",
            "source": "ai-tags",
            "action": "highlight",
            "confidence": 0.8,
            "affectedClipIds": ["clip-keep"],
            "description": "混合关联",
        }
    ]
    assert not removed_project_file.exists()
    persisted_analysis = json.loads(analysis_file.read_text(encoding="utf-8"))
    assert persisted_analysis["total_videos"] == 1
    assert persisted_analysis["videos"][0]["video"] == "keep.mp4"


def test_stream_media_returns_referenced_file_with_range(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source.write_bytes(b"0123456789")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Stream Demo"})
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "referenced",
        },
    ).json()["mediaItems"][0]

    response = client.get(
        "/api/media/stream",
        params={"folderPath": str(project_folder), "mediaId": imported["id"]},
        headers={"Range": "bytes=2-5"},
    )

    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["accept-ranges"] == "bytes"


def test_media_status_reports_missing_referenced_file_without_streaming(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    source = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source.write_bytes(b"fake-video")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Status Demo"})
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source)],
            "mode": "referenced",
        },
    ).json()["mediaItems"][0]
    source.unlink()

    response = client.get(
        "/api/media/status",
        params={"folderPath": str(project_folder), "mediaId": imported["id"]},
    )

    assert response.status_code == 200
    assert response.json() == {"mediaId": imported["id"], "exists": False}


def test_stream_project_frame_returns_analysis_image(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    frame_path = project_folder / "analysis" / "job-1" / "frames" / "frame_000.jpg"
    project_folder.mkdir()
    frame_path.parent.mkdir(parents=True)
    frame_path.write_bytes(b"jpeg-bytes")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Frame Demo"})

    response = client.get(
        "/api/media/frame",
        params={"folderPath": str(project_folder), "framePath": str(frame_path)},
    )

    assert response.status_code == 200
    assert response.content == b"jpeg-bytes"
    assert response.headers["content-type"] == "image/jpeg"


def test_stream_project_frame_rejects_path_outside_project(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    outside_frame = tmp_path / "outside.jpg"
    project_folder.mkdir()
    outside_frame.write_bytes(b"jpeg-bytes")
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Frame Demo"})

    response = client.get(
        "/api/media/frame",
        params={"folderPath": str(project_folder), "framePath": str(outside_frame)},
    )

    assert response.status_code == 400


def test_import_media_rejects_missing_source(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(tmp_path / "missing.mp4")],
            "mode": "copied",
        },
    )

    assert response.status_code == 400


def test_import_media_rejects_project_subdir_traversal(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Import Demo"})

    response = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(project_folder / "media" / ".." / "outside.mp4")],
            "mode": "copied",
        },
    )

    assert response.status_code == 400

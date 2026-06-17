from pathlib import Path
import json

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


def test_save_project_updates_manifest_timeline_media_and_analysis(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    init_response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Save Demo"},
    )
    project = init_response.json()["project"]

    project["media"] = [
        {
            "id": "media-1",
            "name": "clip.mp4",
            "type": "video",
            "importMode": "copied",
            "originalPath": str(project_folder / "media" / "clip.mp4"),
            "projectPath": "media/clip.mp4",
            "durationInFrames": 90,
            "sourceLabel": "clip.mp4",
        }
    ]
    project["timeline"]["videoTracks"] = [
        {
            "id": "track-video-1",
            "name": "V1",
            "type": "video",
            "clips": [
                {
                    "id": "clip-1",
                    "mediaId": "media-1",
                    "title": "clip.mp4",
                    "startFrame": 0,
                    "durationInFrames": 90,
                    "sourceIn": 0,
                    "color": "#2563eb",
                    "sourceType": "imported-video",
                }
            ],
        }
    ]
    project["analysis"]["overallSummary"] = "saved"

    response = client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )

    assert response.status_code == 200
    saved = json.loads((project_folder / PROJECT_MANIFEST_NAME).read_text(encoding="utf-8"))
    assert saved["media"][0]["id"] == "media-1"
    assert saved["timeline"]["videoTracks"][0]["clips"][0]["id"] == "clip-1"
    assert saved["analysis"]["overallSummary"] == "saved"
    assert response.json()["project"]["media"][0]["name"] == "clip.mp4"


def test_save_project_rejects_mismatched_folder(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    other_folder = tmp_path / "other"
    project_folder.mkdir()
    other_folder.mkdir()
    init_response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Save Demo"},
    )
    project = init_response.json()["project"]
    project["folderPath"] = str(other_folder)

    response = client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )

    assert response.status_code == 400

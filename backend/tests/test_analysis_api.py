from pathlib import Path
import json

from fastapi.testclient import TestClient

from app.core.config import PROJECT_MANIFEST_NAME
from app.main import create_app
from app.services.project_manifest import init_project


def _client_with_temp_state(monkeypatch, tmp_path: Path) -> TestClient:
    import app.main as main
    from app.repositories import app_state

    monkeypatch.setattr(app_state, "APP_DB_PATH", tmp_path / "app.db")
    monkeypatch.setattr(main, "ensure_storage_dirs", lambda: None)
    return TestClient(create_app())


def test_analysis_endpoint_returns_default_project_analysis(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    init_project(str(project_folder), "Analysis Demo")

    response = client.get("/api/analysis", params={"folderPath": str(project_folder)})

    assert response.status_code == 200
    assert response.json() == {
        "overallSummary": "",
        "sceneCount": 0,
        "transcriptCount": 0,
        "detectedFillerWordCount": 0,
        "keyframes": [],
        "transcriptSegments": [],
        "editSuggestions": [],
        "legacySummary": None,
    }


def test_analysis_taxonomy_endpoint_returns_filter_dictionary(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.get("/api/analysis/taxonomy")

    assert response.status_code == 200
    taxonomy = response.json()
    assert taxonomy["version"] == "v1"
    field_ids = [field["id"] for field in taxonomy["fields"]]
    assert field_ids == [
        "shot_type",
        "camera_movement",
        "subject_category",
        "action_type",
        "environment_type",
        "lighting_type",
        "color_tone_type",
        "emotion_tags",
        "edit_role",
    ]
    values_by_field = {
        field["id"]: [value["value"] for value in field["values"]]
        for field in taxonomy["fields"]
    }
    assert "中景" in values_by_field["shot_type"]
    assert "固定镜头" in values_by_field["camera_movement"]
    assert "B-roll" in values_by_field["edit_role"]
    assert taxonomy["displayOrder"][:3] == ["shot_type", "camera_movement", "environment_type"]


def test_analysis_endpoint_includes_legacy_summary_json(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    init_project(str(project_folder), "Legacy Analysis Demo")
    output_folder = project_folder / "output"
    output_folder.mkdir()
    (output_folder / "summary.json").write_text(
        json.dumps(
            {
                "total_videos": 1,
                "image_model": "gpt-4o-mini",
                "scene_groups": [
                    {
                        "scene_group": 1,
                        "video_count": 1,
                        "videos": ["sample.mov"],
                        "time_range": {"start": "2026-05-01", "end": "2026-05-01"},
                    }
                ],
                "videos": [
                    {
                        "video": "sample.mov",
                        "video_meta": {
                            "duration_seconds": 2.5,
                            "resolution": "1920x1080",
                            "fps": 30,
                        },
                        "visual_analysis": {
                            "total_scenes": 1,
                            "scenes": [
                                {
                                    "index": 1,
                                    "start": 0,
                                    "end": 2.5,
                                    "duration": 2.5,
                                    "vl_analysis": {"shot_type": "close-up"},
                                    "quality_metrics": {"grade": "A"},
                                }
                            ],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    response = client.get("/api/analysis", params={"folderPath": str(project_folder)})

    assert response.status_code == 200
    assert response.json()["legacySummary"]["total_videos"] == 1
    assert response.json()["legacySummary"]["videos"][0]["video"] == "sample.mov"


def test_analysis_endpoint_merges_completed_job_summaries(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    init_project(str(project_folder), "Merged Analysis Demo")
    analysis_folder = project_folder / "analysis"
    analysis_folder.mkdir(exist_ok=True)
    for index, video_name in enumerate(["clip-a.mp4", "clip-b.mp4"], start=1):
        (analysis_folder / f"job-{index}.json").write_text(
            json.dumps(
                {
                    "job_id": f"job-{index}",
                    "taxonomy_version": "v1",
                    "total_videos": 1,
                    "image_model": "local-vl",
                    "scene_groups": [],
                    "videos": [
                        {
                            "video": video_name,
                            "visual_analysis": {
                                "total_scenes": 1,
                                "scenes": [
                                    {
                                        "index": 1,
                                        "vl_analysis": {"subject": video_name},
                                    }
                                ],
                            },
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

    response = client.get("/api/analysis", params={"folderPath": str(project_folder)})

    assert response.status_code == 200
    body = response.json()
    assert body["sceneCount"] == 2
    assert body["legacySummary"]["total_videos"] == 2
    assert [video["video"] for video in body["legacySummary"]["videos"]] == [
        "clip-a.mp4",
        "clip-b.mp4",
    ]


def test_analysis_endpoint_missing_manifest_returns_404(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.get("/api/analysis", params={"folderPath": str(tmp_path)})

    assert response.status_code == 404
    assert "Project manifest not found" in response.json()["detail"]


def test_analysis_endpoint_invalid_manifest_json_returns_400(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    (tmp_path / PROJECT_MANIFEST_NAME).write_text("{invalid json", encoding="utf-8")

    response = client.get("/api/analysis", params={"folderPath": str(tmp_path)})

    assert response.status_code == 400


def test_analysis_endpoint_invalid_analysis_shape_returns_400(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    init_project(str(tmp_path), "Invalid Analysis Demo")
    manifest_path = tmp_path / PROJECT_MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["analysis"] = {"sceneCount": "not-an-int"}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    response = client.get("/api/analysis", params={"folderPath": str(tmp_path)})

    assert response.status_code == 400


def test_analysis_endpoint_empty_folder_path_returns_422(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.get("/api/analysis", params={"folderPath": ""})

    assert response.status_code == 422

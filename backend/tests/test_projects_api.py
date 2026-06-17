from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import PROJECT_MANIFEST_NAME
from app.main import create_app


def _client_with_temp_state(monkeypatch, tmp_path: Path) -> TestClient:
    import app.main as main
    from app.repositories import app_state

    monkeypatch.setattr(app_state, "APP_DB_PATH", tmp_path / "app.db")
    monkeypatch.setattr(main, "ensure_storage_dirs", lambda: None)
    return TestClient(create_app())


def test_init_project_endpoint_creates_folder_manifest(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "API Demo"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["project"]["name"] == "API Demo"
    assert body["project"]["folderPath"] == str(project_folder.resolve())
    assert (project_folder / PROJECT_MANIFEST_NAME).exists()


def test_open_project_without_manifest_returns_404(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.post("/api/projects/open", json={"folderPath": str(tmp_path)})

    assert response.status_code == 404
    assert "Project manifest not found" in response.json()["detail"]


def test_open_project_invalid_manifest_returns_400(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    (tmp_path / PROJECT_MANIFEST_NAME).write_text("{invalid json", encoding="utf-8")

    response = client.post("/api/projects/open", json={"folderPath": str(tmp_path)})

    assert response.status_code == 400


def test_init_project_whitespace_name_does_not_create_manifest(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "   "},
    )

    assert response.status_code in (400, 422)
    assert not (project_folder / PROJECT_MANIFEST_NAME).exists()


def test_recent_projects_includes_initialized_project(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    init_response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Recent Demo"},
    )
    response = client.get("/api/projects/recent")

    assert init_response.status_code == 200
    assert response.status_code == 200
    projects = response.json()["projects"]
    assert len(projects) == 1
    assert projects[0]["id"] == init_response.json()["project"]["id"]
    assert projects[0]["name"] == "Recent Demo"
    assert projects[0]["folderPath"] == str(project_folder.resolve())
    assert projects[0]["openedAt"]


def test_recent_projects_allows_same_manifest_id_in_different_folders(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_a = tmp_path / "project-a"
    project_b = tmp_path / "project-b"
    project_a.mkdir()
    project_b.mkdir()

    init_response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_a), "name": "Copied Demo"},
    )
    (project_b / PROJECT_MANIFEST_NAME).write_text(
        (project_a / PROJECT_MANIFEST_NAME).read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    open_a_response = client.post("/api/projects/open", json={"folderPath": str(project_a)})
    open_b_response = client.post("/api/projects/open", json={"folderPath": str(project_b)})
    recent_response = client.get("/api/projects/recent")

    assert init_response.status_code == 200
    assert open_a_response.status_code == 200
    assert open_b_response.status_code == 200
    assert recent_response.status_code == 200
    folder_paths = {project["folderPath"] for project in recent_response.json()["projects"]}
    assert str(project_a.resolve()) in folder_paths
    assert str(project_b.resolve()) in folder_paths


def test_init_project_with_subdir_file_returns_400_without_manifest(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    (tmp_path / "media").write_text("not a directory", encoding="utf-8")

    response = client.post(
        "/api/projects/init",
        json={"folderPath": str(tmp_path), "name": "Blocked Demo"},
    )

    assert response.status_code == 400
    assert not (tmp_path / PROJECT_MANIFEST_NAME).exists()

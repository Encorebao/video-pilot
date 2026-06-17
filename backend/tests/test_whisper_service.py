from pathlib import Path
import sys
import time
import types

from fastapi.testclient import TestClient

from app.main import create_app


def _client_with_temp_state(monkeypatch, tmp_path: Path) -> TestClient:
    import app.main as main
    from app.core import config
    from app.repositories import app_state
    from app.services import whisper_service

    db_path = tmp_path / "app.db"
    models_dir = tmp_path / "models"
    monkeypatch.setattr(config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(config, "WHISPER_MODELS_DIR", models_dir, raising=False)
    monkeypatch.setattr(app_state, "APP_DB_PATH", db_path)
    monkeypatch.setattr(whisper_service, "WHISPER_MODELS_DIR", models_dir)
    monkeypatch.setattr(whisper_service, "MIN_MODEL_WEIGHT_BYTES", 1)
    monkeypatch.setattr(main, "ensure_storage_dirs", lambda: None)
    whisper_service.reset_service_state_for_tests()
    return TestClient(create_app())


def _make_model(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "config.json").write_text("{}", encoding="utf-8")
    (path / "weights.safetensors").write_bytes(b"weights")


def test_whisper_status_scans_managed_model_directory(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    _make_model(tmp_path / "models" / "mlx-community__whisper-large-v3-turbo")

    response = client.get("/api/whisper/status")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "stopped"
    assert body["models"][0]["id"] == "mlx-community__whisper-large-v3-turbo"
    assert body["models"][0]["repo"] == "mlx-community/whisper-large-v3-turbo"
    assert body["models"][0]["installed"] is True


def test_whisper_manual_install_rejects_incomplete_model(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    incomplete = tmp_path / "bad-model"
    incomplete.mkdir()
    (incomplete / "config.json").write_text("{}", encoding="utf-8")

    response = client.post(
        "/api/whisper/models/install",
        json={"path": str(incomplete), "repo": "mlx-community/whisper-large-v3-turbo"},
    )

    assert response.status_code == 400
    assert "safetensors" in response.json()["detail"]


def test_whisper_download_uses_hf_mirror(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import whisper_service

    captured = []

    def fake_repo_files(repo):
        assert repo == "mlx-community/whisper-large-v3-turbo"
        return ["config.json", "weights.safetensors"]

    def fake_run(command, check):
        assert check is True
        captured.append(command)
        output_path = Path(command[command.index("-o") + 1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"weights")

    monkeypatch.setattr(whisper_service, "_repo_files", fake_repo_files)
    monkeypatch.setattr(whisper_service.subprocess, "run", fake_run)

    response = client.post("/api/whisper/models/download", json={})

    assert response.status_code == 200
    for _ in range(20):
        status = client.get("/api/whisper/status").json()
        if status["models"]:
            break
        time.sleep(0.05)
    assert any("https://hf-mirror.com/mlx-community/whisper-large-v3-turbo/resolve/main/weights.safetensors" in command for command in captured)
    assert any("-C" in command for command in captured)
    assert status["models"][0]["installed"] is True


def test_delete_rejects_unmanaged_model_path(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import whisper_service

    outside = tmp_path / "outside"
    _make_model(outside)
    whisper_service.register_manual_model(str(outside), "mlx-community/whisper-large-v3-turbo")

    response = client.delete("/api/whisper/models/manual-mlx-community__whisper-large-v3-turbo")

    assert response.status_code == 400
    assert "managed" in response.json()["detail"]


def test_subtitle_job_requires_ready_whisper_service(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/subtitles/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": ["media-1"]},
    )

    assert response.status_code == 409
    assert "Whisper 服务未启动" in response.json()["detail"]


def test_whisper_ready_state_is_shared_across_process_memory(monkeypatch, tmp_path: Path):
    _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import whisper_service

    _make_model(tmp_path / "models" / "mlx-community__whisper-large-v3-turbo")
    monkeypatch.setitem(sys.modules, "mlx_whisper", types.ModuleType("mlx_whisper"))

    whisper_service.start_service("mlx-community__whisper-large-v3-turbo")
    with whisper_service._state_lock:
        whisper_service._service_state.update({
            "status": "stopped",
            "currentModelId": None,
            "error": None,
        })

    model = whisper_service.ensure_ready()

    assert model["id"] == "mlx-community__whisper-large-v3-turbo"

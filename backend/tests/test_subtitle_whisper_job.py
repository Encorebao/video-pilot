from pathlib import Path

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


def test_worker_transcribes_audio_without_ffmpeg(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker, whisper_service
    from app.services.job_worker import process_next_job

    model_dir = tmp_path / "models" / "mlx-community__whisper-large-v3-turbo"
    _make_model(model_dir)
    whisper_service.mark_service_ready_for_tests("mlx-community__whisper-large-v3-turbo")
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Subs"})
    source = tmp_path / "voice.wav"
    source.write_bytes(b"fake audio")
    client.post(
        "/api/media/import",
        json={"folderPath": str(project_folder), "filePaths": [str(source)], "mode": "referenced"},
    )

    def fail_extract(*_args, **_kwargs):
        raise AssertionError("ffmpeg should not run for audio input")

    monkeypatch.setattr(job_worker, "_extract_audio_for_subtitles", fail_extract)
    monkeypatch.setattr(
        whisper_service,
        "transcribe_audio",
        lambda *_args, **_kwargs: [{"start": 0, "end": 1.0, "text": "你好"}],
    )

    create_response = client.post("/api/subtitles/jobs", json={"projectFolder": str(project_folder)})
    process_next_job()
    job_response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project = client.post("/api/projects/open", json={"folderPath": str(project_folder)}).json()["project"]

    assert job_response.json()["job"]["status"] == "completed"
    assert project["subtitles"]["segments"][0]["text"] == "你好"


def test_worker_extracts_video_audio_and_cleans_job_cache(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker, whisper_service
    from app.services.job_worker import process_next_job

    model_dir = tmp_path / "models" / "mlx-community__whisper-large-v3-turbo"
    _make_model(model_dir)
    whisper_service.mark_service_ready_for_tests("mlx-community__whisper-large-v3-turbo")
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Video Subs"})
    source = tmp_path / "clip.mp4"
    source.write_bytes(b"fake video")
    client.post(
        "/api/media/import",
        json={"folderPath": str(project_folder), "filePaths": [str(source)], "mode": "referenced"},
    )
    extracted = []

    def fake_extract(_source_path, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake wav")
        extracted.append(output_path)
        return output_path

    monkeypatch.setattr(job_worker, "_extract_audio_for_subtitles", fake_extract)
    monkeypatch.setattr(
        whisper_service,
        "transcribe_audio",
        lambda audio_path, **_kwargs: [
            {"start": 0, "end": 2.0, "text": f"来自 {Path(audio_path).suffix}"}
        ],
    )

    create_response = client.post("/api/subtitles/jobs", json={"projectFolder": str(project_folder)})
    process_next_job()
    job_response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")

    assert job_response.json()["job"]["status"] == "completed"
    assert extracted
    assert extracted[0].name == "source.wav"
    assert not (project_folder / "cache" / "subtitles" / create_response.json()["job"]["id"]).exists()

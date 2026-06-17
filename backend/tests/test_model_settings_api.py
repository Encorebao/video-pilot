from pathlib import Path

from fastapi.testclient import TestClient

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


def test_model_settings_returns_four_default_capabilities(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.get("/api/settings/models")

    assert response.status_code == 200
    configs = response.json()["configs"]
    assert [config["capability"] for config in configs] == ["vl", "llm", "stt", "tts"]
    assert configs[0]["baseUrl"] == "https://api.openai.com/v1"
    assert configs[0]["apiKeyConfigured"] is False
    assert "apiKey" not in configs[0]


def test_model_settings_save_masks_api_key_on_read(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "https://api.example.com/v1",
                    "model": "vision-model",
                    "apiKey": "secret-key",
                    "enabled": True,
                }
            ]
        },
    )

    assert response.status_code == 200
    config = response.json()["configs"][0]
    assert config["capability"] == "vl"
    assert config["baseUrl"] == "https://api.example.com/v1"
    assert config["model"] == "vision-model"
    assert config["enabled"] is True
    assert config["status"] == "configured"
    assert config["apiKeyConfigured"] is True
    assert "apiKey" not in config

    read_response = client.get("/api/settings/models")
    read_config = read_response.json()["configs"][0]
    assert read_config["apiKeyConfigured"] is True
    assert "apiKey" not in read_config


def test_model_settings_rejects_unknown_capability(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "unknown",
                    "baseUrl": "https://api.example.com/v1",
                    "model": "model",
                    "apiKey": "secret-key",
                    "enabled": True,
                }
            ]
        },
    )

    assert response.status_code == 422


def test_model_settings_check_reports_missing_api_key(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.post("/api/settings/models/vl/check")

    assert response.status_code == 200
    body = response.json()
    assert body["config"]["capability"] == "vl"
    assert body["config"]["status"] == "unconfigured"
    assert body["ok"] is False


def test_local_model_config_can_be_ready_without_api_key(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    save_response = client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "llm",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-model",
                    "enabled": True,
                }
            ]
        },
    )

    assert save_response.status_code == 200
    config = next(
        item for item in save_response.json()["configs"] if item["capability"] == "llm"
    )
    assert config["status"] == "configured"
    assert config["apiKeyConfigured"] is False


def test_model_settings_check_calls_models_endpoint(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.repositories import model_configs

    called = {}

    def fake_check_models_endpoint(runtime_config):
        called["base_url"] = runtime_config.base_url
        called["model"] = runtime_config.model

    monkeypatch.setattr(model_configs, "_check_models_endpoint", fake_check_models_endpoint)
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "llm",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-model",
                    "enabled": True,
                }
            ]
        },
    )

    response = client.post("/api/settings/models/llm/check")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["config"]["status"] == "ready"
    assert called == {
        "base_url": "http://127.0.0.1:8000/v1",
        "model": "local-model",
    }

from pathlib import Path


def test_bootstrap_local_profile_initializes_database_without_api_key(monkeypatch, tmp_path: Path):
    from app.core import config
    from app.repositories import app_state, model_configs
    from app.bootstrap import bootstrap_environment

    db_path = tmp_path / "app.db"
    monkeypatch.setattr(config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(app_state, "APP_DB_PATH", db_path)
    monkeypatch.setattr(model_configs.config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(config, "WHISPER_MODELS_DIR", tmp_path / "models")

    result = bootstrap_environment(profile="local")

    assert result["profile"] == "local"
    assert db_path.exists()
    configs = model_configs.list_model_configs()
    assert [item.capability for item in configs] == ["vl", "llm", "stt", "tts"]
    assert all(item.baseUrl == "http://127.0.0.1:8000/v1" for item in configs)
    assert all(item.apiKeyConfigured is False for item in configs)
    assert all(item.status == "configured" for item in configs)


def test_bootstrap_remote_profile_masks_api_key_on_read(monkeypatch, tmp_path: Path):
    from app.core import config
    from app.repositories import app_state, model_configs
    from app.bootstrap import bootstrap_environment

    db_path = tmp_path / "app.db"
    monkeypatch.setattr(config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(app_state, "APP_DB_PATH", db_path)
    monkeypatch.setattr(model_configs.config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(config, "WHISPER_MODELS_DIR", tmp_path / "models")

    bootstrap_environment(profile="remote", api_key="secret-key")

    configs = model_configs.list_model_configs()
    assert all(item.baseUrl == "https://api.openai.com/v1" for item in configs)
    assert all(item.apiKeyConfigured is True for item in configs)
    assert all("secret-key" not in item.model_dump_json() for item in configs)


def test_bootstrap_does_not_overwrite_existing_model_settings(monkeypatch, tmp_path: Path):
    from app.core import config
    from app.repositories import app_state, model_configs
    from app.schemas.settings import ModelConfigInput
    from app.bootstrap import bootstrap_environment

    db_path = tmp_path / "app.db"
    monkeypatch.setattr(config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(app_state, "APP_DB_PATH", db_path)
    monkeypatch.setattr(model_configs.config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(config, "WHISPER_MODELS_DIR", tmp_path / "models")

    model_configs.upsert_model_configs(
        [
            ModelConfigInput(
                capability="llm",
                baseUrl="http://127.0.0.1:9000/v1",
                model="existing-local-model",
                enabled=True,
            )
        ]
    )

    result = bootstrap_environment(profile="remote", api_key="secret-key")

    assert result["modelConfig"] == "kept"
    configs = model_configs.list_model_configs()
    llm_config = next(item for item in configs if item.capability == "llm")
    assert llm_config.baseUrl == "http://127.0.0.1:9000/v1"
    assert llm_config.model == "existing-local-model"

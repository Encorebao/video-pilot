from __future__ import annotations

import os
import json
import shutil
import sqlite3
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core import config
from app.core.config import WHISPER_MODELS_DIR

DEFAULT_WHISPER_REPO = "mlx-community/whisper-large-v3-turbo"
HF_MIRROR_ENDPOINT = "https://hf-mirror.com"
MIN_MODEL_WEIGHT_BYTES = 1024 * 1024 * 1024

try:
    from huggingface_hub import HfApi
except Exception:  # pragma: no cover - dependency may be installed later by user
    HfApi = None  # type: ignore[assignment]


_state_lock = threading.Lock()
_service_state: dict[str, Any] = {
    "status": "stopped",
    "currentModelId": None,
    "error": None,
    "logs": [],
    "downloadRunning": False,
    "downloadRepo": None,
}
_manual_models: dict[str, dict[str, Any]] = {}
_RUNTIME_STATE_KEY = "whisper_service"


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def repo_to_model_id(repo: str) -> str:
    return str(repo or DEFAULT_WHISPER_REPO).strip().replace("/", "__")


def model_id_to_repo(model_id: str) -> str:
    return model_id.replace("__", "/", 1)


def managed_model_path(repo: str = DEFAULT_WHISPER_REPO) -> Path:
    return WHISPER_MODELS_DIR / repo_to_model_id(repo)


def _append_log(message: str) -> None:
    logs = _service_state.setdefault("logs", [])
    logs.append(f"{_now_iso()} {message}")
    del logs[:-80]


def _model_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def _connect_state_db() -> sqlite3.Connection:
    config.APP_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(config.APP_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_state (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    return conn


def _read_persisted_runtime_state() -> dict[str, Any]:
    try:
        with _connect_state_db() as conn:
            row = conn.execute(
                "SELECT value_json FROM runtime_state WHERE key = ?",
                (_RUNTIME_STATE_KEY,),
            ).fetchone()
    except sqlite3.Error:
        return {}
    if row is None:
        return {}
    try:
        value = json.loads(row["value_json"])
    except (TypeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _write_persisted_runtime_state(value: dict[str, Any]) -> None:
    payload = json.dumps(value, ensure_ascii=False)
    with _connect_state_db() as conn:
        conn.execute(
            """
            INSERT INTO runtime_state(key, value_json, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value_json=excluded.value_json,
              updated_at=excluded.updated_at
            """,
            (_RUNTIME_STATE_KEY, payload, _now_iso()),
        )


def _apply_persisted_runtime_state() -> None:
    persisted = _read_persisted_runtime_state()
    if persisted.get("status") not in {"ready", "stopped"}:
        return
    with _state_lock:
        if _service_state.get("status") in {"starting", "ready"}:
            return
        _service_state.update({
            "status": persisted.get("status"),
            "currentModelId": persisted.get("currentModelId"),
            "error": persisted.get("error"),
        })


def validate_model_dir(path: Path) -> None:
    if not path.exists() or not path.is_dir():
        raise ValueError(f"Model directory does not exist: {path}")
    if not (path / "config.json").exists():
        raise ValueError("Model directory must contain config.json")
    weights = list(path.glob("*.safetensors"))
    if not weights:
        raise ValueError("Model directory must contain safetensors weights")
    if not any(item.stat().st_size >= MIN_MODEL_WEIGHT_BYTES for item in weights):
        raise ValueError("Model safetensors weights look incomplete")


def _model_record(model_id: str, repo: str, path: Path, source: str) -> dict[str, Any]:
    installed = path.exists()
    created_at = None
    if installed:
        created_at = datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(timespec="seconds")
    return {
        "id": model_id,
        "repo": repo,
        "name": repo.rsplit("/", 1)[-1],
        "path": str(path),
        "source": source,
        "installed": installed,
        "sizeBytes": _model_size(path),
        "createdAt": created_at,
    }


def list_models() -> list[dict[str, Any]]:
    WHISPER_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    models: list[dict[str, Any]] = []
    for path in sorted(WHISPER_MODELS_DIR.iterdir()):
        if not path.is_dir():
            continue
        try:
            validate_model_dir(path)
        except ValueError:
            continue
        repo = model_id_to_repo(path.name)
        models.append(_model_record(path.name, repo, path, "managed"))
    models.extend(_manual_models.values())
    return models


def get_model(model_id: str | None = None) -> dict[str, Any] | None:
    models = list_models()
    if model_id:
        return next((model for model in models if model["id"] == model_id), None)
    return next((model for model in models if model["id"] == repo_to_model_id(DEFAULT_WHISPER_REPO)), None) or (models[0] if models else None)


def get_status() -> dict[str, Any]:
    _apply_persisted_runtime_state()
    with _state_lock:
        state = dict(_service_state)
        state["logs"] = list(_service_state.get("logs", []))
    state["models"] = list_models()
    return state


def _repo_files(repo: str) -> list[str]:
    if HfApi is None:
        if repo == DEFAULT_WHISPER_REPO:
            return [".gitattributes", "README.md", "config.json", "weights.safetensors"]
        raise RuntimeError("huggingface_hub is not installed")
    return list(HfApi(endpoint=HF_MIRROR_ENDPOINT).list_repo_files(repo))


def _download_repo_file(repo: str, filename: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f"{HF_MIRROR_ENDPOINT}/{repo}/resolve/main/{filename}"
    output = target
    if filename.endswith(".safetensors"):
        if target.exists() and target.stat().st_size < MIN_MODEL_WEIGHT_BYTES:
            partial = target.with_suffix(target.suffix + ".part")
            if not partial.exists():
                target.rename(partial)
        output = target.with_suffix(target.suffix + ".part")
    if target.exists() and not filename.endswith(".safetensors"):
        return
    if filename.endswith(".safetensors") and target.exists() and target.stat().st_size >= MIN_MODEL_WEIGHT_BYTES:
        return
    command = [
        "curl",
        "-L",
        "--fail",
        "--connect-timeout",
        "20",
        "--retry",
        "3",
        "-C",
        "-",
        "-o",
        str(output),
        url,
    ]
    subprocess.run(command, check=True)
    if output != target:
        output.replace(target)


def _download_model_sync(repo: str) -> None:
    repo = str(repo or DEFAULT_WHISPER_REPO).strip()
    target = managed_model_path(repo)
    target.mkdir(parents=True, exist_ok=True)
    os.environ["HF_ENDPOINT"] = HF_MIRROR_ENDPOINT
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    with _state_lock:
        _append_log(f"download start {repo}")
    for filename in _repo_files(repo):
        if filename.endswith("/"):
            continue
        with _state_lock:
            _append_log(f"download file {filename}")
        _download_repo_file(repo, filename, target / filename)
    validate_model_dir(target)
    with _state_lock:
        _append_log(f"download completed {repo}")


def download_model(repo: str = DEFAULT_WHISPER_REPO) -> dict[str, Any]:
    repo = str(repo or DEFAULT_WHISPER_REPO).strip()
    with _state_lock:
        already_running = bool(_service_state.get("downloadRunning"))
        if not already_running:
            _service_state.update({"downloadRunning": True, "downloadRepo": repo, "error": None})
    if already_running:
        return get_status()

    def worker() -> None:
        try:
            _download_model_sync(repo)
        except Exception as exc:
            with _state_lock:
                _service_state["error"] = str(exc)
                _append_log(f"download failed {repo}: {exc}")
        finally:
            with _state_lock:
                _service_state.update({"downloadRunning": False, "downloadRepo": None})

    threading.Thread(target=worker, daemon=True).start()
    return get_status()


def register_manual_model(path: str, repo: str = DEFAULT_WHISPER_REPO) -> dict[str, Any]:
    model_path = Path(path).expanduser().resolve()
    validate_model_dir(model_path)
    model_id = f"manual-{repo_to_model_id(repo)}"
    record = _model_record(model_id, repo, model_path, "manual")
    _manual_models[model_id] = record
    with _state_lock:
        _append_log(f"manual model registered {model_path}")
    return get_status()


def delete_model(model_id: str) -> dict[str, Any]:
    model = get_model(model_id)
    if model is None:
        raise FileNotFoundError(f"Whisper model not found: {model_id}")
    path = Path(model["path"]).resolve()
    managed_root = WHISPER_MODELS_DIR.resolve()
    if model.get("source") != "managed" or not path.is_relative_to(managed_root):
        raise ValueError("Only managed Whisper models can be deleted")
    if _service_state.get("currentModelId") == model_id:
        stop_service()
    shutil.rmtree(path)
    with _state_lock:
        _append_log(f"model deleted {model_id}")
    return get_status()


def start_service(model_id: str | None = None) -> dict[str, Any]:
    model = get_model(model_id)
    if model is None:
        raise ValueError("No installed Whisper model is available")
    model_path = Path(model["path"]).resolve()
    validate_model_dir(model_path)
    with _state_lock:
        _service_state.update({"status": "starting", "currentModelId": model["id"], "error": None})
        _append_log(f"service starting {model['id']}")
    try:
        import mlx_whisper  # noqa: F401
    except Exception as exc:
        with _state_lock:
            _service_state.update({"status": "error", "error": str(exc)})
            _append_log(f"service failed {exc}")
        raise RuntimeError(f"mlx-whisper unavailable: {exc}") from exc
    with _state_lock:
        _service_state.update({"status": "ready", "currentModelId": model["id"], "error": None})
        _append_log(f"service ready {model['id']}")
    _write_persisted_runtime_state({
        "status": "ready",
        "currentModelId": model["id"],
        "error": None,
    })
    return get_status()


def stop_service() -> dict[str, Any]:
    with _state_lock:
        _service_state.update({
            "status": "stopped",
            "currentModelId": None,
            "error": "模型已卸载；若需要彻底释放显存，请重启后端。",
        })
        _append_log("service stopped")
    _write_persisted_runtime_state({
        "status": "stopped",
        "currentModelId": None,
        "error": "模型已卸载；若需要彻底释放显存，请重启后端。",
    })
    return get_status()


def ensure_ready() -> dict[str, Any]:
    _apply_persisted_runtime_state()
    status = get_status()
    if status.get("status") != "ready" or not status.get("currentModelId"):
        raise RuntimeError("Whisper 服务未启动")
    model = get_model(str(status["currentModelId"]))
    if model is None:
        raise RuntimeError("Whisper 当前模型不可用")
    return model


def transcribe_audio(audio_path: Path, *, language: str) -> list[dict[str, Any]]:
    model = ensure_ready()
    import mlx_whisper

    result = mlx_whisper.transcribe(
        str(audio_path),
        path_or_hf_repo=str(model["path"]),
        language=language,
        word_timestamps=True,
        verbose=False,
    )
    segments = result.get("segments") if isinstance(result, dict) else None
    return segments if isinstance(segments, list) else []


def reset_service_state_for_tests() -> None:
    with _state_lock:
        _service_state.update({
            "status": "stopped",
            "currentModelId": None,
            "error": None,
            "logs": [],
            "downloadRunning": False,
            "downloadRepo": None,
        })
        _manual_models.clear()
    try:
        with _connect_state_db() as conn:
            conn.execute("DELETE FROM runtime_state WHERE key = ?", (_RUNTIME_STATE_KEY,))
    except sqlite3.Error:
        pass


def mark_service_ready_for_tests(model_id: str) -> None:
    with _state_lock:
        _service_state.update({"status": "ready", "currentModelId": model_id, "error": None})

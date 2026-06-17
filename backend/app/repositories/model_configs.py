from __future__ import annotations

import sqlite3
from datetime import datetime
from dataclasses import dataclass
from urllib.parse import urlparse
from typing import Any, Dict

import httpx

from app.core import config
from app.schemas.settings import ModelConfigInput, ModelConfigPublic

CAPABILITY_DEFAULTS: list[dict[str, Any]] = [
    {
        "capability": "vl",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4.1-mini",
        "enabled": True,
    },
    {
        "capability": "llm",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4.1-mini",
        "enabled": True,
    },
    {
        "capability": "stt",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini-transcribe",
        "enabled": True,
    },
    {
        "capability": "tts",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini-tts",
        "enabled": True,
    },
]


@dataclass(frozen=True)
class ModelRuntimeConfig:
    capability: str
    base_url: str
    model: str
    api_key: str
    enabled: bool


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    config.APP_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(config.APP_DB_PATH))
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS model_configs (
            capability TEXT PRIMARY KEY,
            base_url TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            enabled INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'unconfigured',
            last_checked_at TEXT,
            error TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
        """
    )


def _is_local_base_url(base_url: str) -> bool:
    parsed = urlparse(base_url)
    return parsed.hostname in {"127.0.0.1", "localhost", "::1", "0.0.0.0"}


def _status_for(base_url: str, model: str, api_key: str, enabled: bool) -> str:
    if not enabled:
        return "unconfigured"
    if base_url.strip() and model.strip() and (api_key.strip() or _is_local_base_url(base_url)):
        return "configured"
    return "unconfigured"


def _check_models_endpoint(runtime_config: ModelRuntimeConfig) -> None:
    headers: dict[str, str] = {}
    if runtime_config.api_key.strip():
        headers["Authorization"] = f"Bearer {runtime_config.api_key}"
    response = httpx.get(
        f"{runtime_config.base_url.rstrip('/')}/models",
        headers=headers,
        timeout=5,
    )
    response.raise_for_status()


def _row_to_public(row: sqlite3.Row | Dict[str, Any]) -> ModelConfigPublic:
    api_key = row["api_key"] if "api_key" in row.keys() else ""
    return ModelConfigPublic(
        capability=row["capability"],
        baseUrl=row["base_url"],
        model=row["model"],
        enabled=bool(row["enabled"]),
        status=row["status"],
        apiKeyConfigured=bool(api_key),
        lastCheckedAt=row["last_checked_at"],
        error=row["error"],
    )


def list_model_configs() -> list[ModelConfigPublic]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM model_configs").fetchall()
        by_capability = {row["capability"]: row for row in rows}
        configs: list[ModelConfigPublic] = []
        for default in CAPABILITY_DEFAULTS:
            row = by_capability.get(default["capability"])
            if row is None:
                configs.append(
                    ModelConfigPublic(
                        capability=default["capability"],
                        baseUrl=default["baseUrl"],
                        model=default["model"],
                        enabled=default["enabled"],
                        status="unconfigured",
                        apiKeyConfigured=False,
                    )
                )
            else:
                configs.append(_row_to_public(row))
    return configs


def get_model_runtime_config(capability: str) -> ModelRuntimeConfig | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM model_configs WHERE capability = ?",
            (capability,),
        ).fetchone()
        if row is None:
            return None
        return ModelRuntimeConfig(
            capability=row["capability"],
            base_url=row["base_url"],
            model=row["model"],
            api_key=row["api_key"],
            enabled=bool(row["enabled"]),
        )


def upsert_model_configs(inputs: list[ModelConfigInput]) -> list[ModelConfigPublic]:
    now = _now_iso()
    with _connect() as conn:
        for item in inputs:
            existing = conn.execute(
                "SELECT api_key FROM model_configs WHERE capability = ?",
                (item.capability,),
            ).fetchone()
            api_key = item.apiKey if item.apiKey is not None else (existing["api_key"] if existing else "")
            status = _status_for(str(item.baseUrl), item.model, api_key, item.enabled)
            conn.execute(
                """
                INSERT INTO model_configs(
                    capability, base_url, model, api_key, enabled, status, error, updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, NULL, ?)
                ON CONFLICT(capability) DO UPDATE SET
                    base_url=excluded.base_url,
                    model=excluded.model,
                    api_key=excluded.api_key,
                    enabled=excluded.enabled,
                    status=excluded.status,
                    error=NULL,
                    updated_at=excluded.updated_at
                """,
                (
                    item.capability,
                    str(item.baseUrl),
                    item.model,
                    api_key,
                    1 if item.enabled else 0,
                    status,
                    now,
                ),
            )
    return list_model_configs()


def check_model_config(capability: str) -> tuple[bool, ModelConfigPublic]:
    now = _now_iso()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM model_configs WHERE capability = ?",
            (capability,),
        ).fetchone()
        if row is None:
            default = next(item for item in CAPABILITY_DEFAULTS if item["capability"] == capability)
            status = "unconfigured"
            error = "API key is not configured"
            conn.execute(
                """
                INSERT INTO model_configs(
                    capability, base_url, model, enabled, status, last_checked_at, error, updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    capability,
                    default["baseUrl"],
                    default["model"],
                    1 if default["enabled"] else 0,
                    status,
                    now,
                    error,
                    now,
                ),
            )
        else:
            status = _status_for(row["base_url"], row["model"], row["api_key"], bool(row["enabled"]))
            if status == "configured":
                try:
                    _check_models_endpoint(
                        ModelRuntimeConfig(
                            capability=row["capability"],
                            base_url=row["base_url"],
                            model=row["model"],
                            api_key=row["api_key"],
                            enabled=bool(row["enabled"]),
                        )
                    )
                    status = "ready"
                    error = None
                except httpx.HTTPError as exc:
                    status = "error"
                    error = f"Model endpoint check failed: {exc}"
            else:
                error = "API key is not configured"
            conn.execute(
                """
                UPDATE model_configs
                SET status = ?, last_checked_at = ?, error = ?, updated_at = ?
                WHERE capability = ?
                """,
                (status, now, error, now, capability),
            )

    config_public = next(config for config in list_model_configs() if config.capability == capability)
    return config_public.status == "ready", config_public

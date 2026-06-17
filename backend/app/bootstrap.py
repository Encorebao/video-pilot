from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from typing import Literal

from app.core import config
from app.repositories import app_state, model_configs
from app.schemas.settings import ModelConfigInput

BootstrapProfile = Literal["local", "remote"]

LOCAL_BASE_URL = "http://127.0.0.1:8000/v1"
REMOTE_BASE_URL = "https://api.openai.com/v1"

LOCAL_MODELS = {
    "vl": "local-vl",
    "llm": "local-llm",
    "stt": "local-stt",
    "tts": "local-tts",
}

REMOTE_MODELS = {
    "vl": "gpt-4.1-mini",
    "llm": "gpt-4.1-mini",
    "stt": "gpt-4o-mini-transcribe",
    "tts": "gpt-4o-mini-tts",
}


def _model_config_row_count() -> int:
    if not config.APP_DB_PATH.exists():
        return 0
    with sqlite3.connect(str(config.APP_DB_PATH)) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'model_configs'"
        ).fetchone()
        if row is None:
            return 0
        count = conn.execute("SELECT COUNT(*) FROM model_configs").fetchone()
    return int(count[0] if count else 0)


def _build_profile_inputs(profile: BootstrapProfile, api_key: str = "") -> list[ModelConfigInput]:
    if profile == "local":
        return [
            ModelConfigInput(
                capability=capability,
                baseUrl=LOCAL_BASE_URL,
                model=model,
                enabled=True,
            )
            for capability, model in LOCAL_MODELS.items()
        ]

    return [
        ModelConfigInput(
            capability=capability,
            baseUrl=REMOTE_BASE_URL,
            model=model,
            apiKey=api_key,
            enabled=True,
        )
        for capability, model in REMOTE_MODELS.items()
    ]


def bootstrap_environment(
    *,
    profile: BootstrapProfile = "local",
    api_key: str = "",
    force: bool = False,
) -> dict[str, object]:
    config.ensure_storage_dirs()
    app_state.list_recent_projects(limit=1)

    existing_rows = _model_config_row_count()
    model_config_status = "kept"
    if force or existing_rows == 0:
        model_configs.upsert_model_configs(_build_profile_inputs(profile, api_key=api_key))
        model_config_status = "written"

    configs = model_configs.list_model_configs()
    return {
        "database": str(config.APP_DB_PATH),
        "modelConfig": model_config_status,
        "profile": profile,
        "configuredCapabilities": [item.capability for item in configs],
    }


def check_environment() -> dict[str, object]:
    config.ensure_storage_dirs()
    configs = model_configs.list_model_configs()
    return {
        "database": str(config.APP_DB_PATH),
        "databaseExists": config.APP_DB_PATH.exists(),
        "configuredCapabilities": [
            item.capability for item in configs if item.status in {"configured", "ready"}
        ],
        "missingCapabilities": [
            item.capability for item in configs if item.status == "unconfigured"
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the Video Pilot backend environment.")
    parser.add_argument("--profile", choices=["local", "remote"], default="local")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)

    if args.check:
        print(json.dumps(check_environment(), ensure_ascii=False, indent=2))
        return 0

    if args.profile == "remote" and not args.api_key.strip():
        print("Remote profile requires --api-key.", file=sys.stderr)
        return 2

    result = bootstrap_environment(
        profile=args.profile,
        api_key=args.api_key,
        force=args.force,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

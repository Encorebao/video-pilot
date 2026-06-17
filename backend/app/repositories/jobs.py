from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any
from uuid import uuid4

from app.core import config
from app.schemas.jobs import JobPublic, JobStatus, JobType


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
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL,
            project_folder TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            result_json TEXT NOT NULL,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT
        )
        """
    )


def _row_to_job(row: sqlite3.Row) -> JobPublic:
    return JobPublic(
        id=row["job_id"],
        type=row["type"],
        status=row["status"],
        progress=row["progress"],
        projectFolder=row["project_folder"],
        payload=json.loads(row["payload_json"]),
        result=json.loads(row["result_json"]),
        error=row["error"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        startedAt=row["started_at"],
        finishedAt=row["finished_at"],
    )


def create_job(
    job_type: JobType,
    project_folder: str,
    payload: dict[str, Any],
) -> JobPublic:
    now = _now_iso()
    job_id = str(uuid4())
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO jobs(
                job_id, type, status, progress, project_folder, payload_json,
                result_json, created_at, updated_at
            )
            VALUES(?, ?, 'queued', 0, ?, ?, '{}', ?, ?)
            """,
            (
                job_id,
                job_type,
                project_folder,
                json.dumps(payload, ensure_ascii=False),
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    return _row_to_job(row)


def get_job(job_id: str) -> JobPublic | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    return _row_to_job(row) if row else None


def update_job(
    job_id: str,
    *,
    status: JobStatus | None = None,
    progress: int | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> JobPublic | None:
    existing = get_job(job_id)
    if not existing:
        return None

    next_status = status or existing.status
    next_progress = progress if progress is not None else existing.progress
    next_result = result if result is not None else existing.result
    now = _now_iso()
    started_at = existing.startedAt
    finished_at = existing.finishedAt
    if next_status == "running" and started_at is None:
        started_at = now
    if next_status in ("completed", "failed") and finished_at is None:
        finished_at = now

    with _connect() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = ?, progress = ?, result_json = ?, error = ?,
                updated_at = ?, started_at = ?, finished_at = ?
            WHERE job_id = ?
            """,
            (
                next_status,
                next_progress,
                json.dumps(next_result, ensure_ascii=False),
                error,
                now,
                started_at,
                finished_at,
                job_id,
            ),
        )
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    return _row_to_job(row)


def claim_next_queued_job() -> JobPublic | None:
    now = _now_iso()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            return None

        conn.execute(
            """
            UPDATE jobs
            SET status = 'running', progress = 5, started_at = ?, updated_at = ?
            WHERE job_id = ?
            """,
            (now, now, row["job_id"]),
        )
        claimed = conn.execute(
            "SELECT * FROM jobs WHERE job_id = ?",
            (row["job_id"],),
        ).fetchone()
    return _row_to_job(claimed)

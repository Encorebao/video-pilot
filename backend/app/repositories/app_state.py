import json
import sqlite3

from app.core.config import APP_DB_PATH
from app.schemas.project import ProjectManifest


def _connect() -> sqlite3.Connection:
    APP_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(APP_DB_PATH))
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS recent_projects (
            folder_path TEXT PRIMARY KEY,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
        """
    )
    columns = conn.execute("PRAGMA table_info(recent_projects)").fetchall()
    id_column = next((column for column in columns if column["name"] == "id"), None)
    if id_column is None or id_column["pk"] == 0:
        return

    conn.execute("ALTER TABLE recent_projects RENAME TO recent_projects_old")
    conn.execute(
        """
        CREATE TABLE recent_projects (
            folder_path TEXT PRIMARY KEY,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
        """
    )
    conn.execute(
        """
        INSERT OR REPLACE INTO recent_projects(folder_path, id, name, manifest_json, opened_at)
        SELECT folder_path, id, name, manifest_json, opened_at
        FROM recent_projects_old
        WHERE folder_path IS NOT NULL
        """
    )
    conn.execute("DROP TABLE recent_projects_old")


def remember_project(project: ProjectManifest) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO recent_projects(id, name, folder_path, manifest_json)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(folder_path) DO UPDATE SET
              id=excluded.id,
              name=excluded.name,
              manifest_json=excluded.manifest_json,
              opened_at=datetime('now','localtime')
            """,
            (
                project.id,
                project.name,
                project.folderPath,
                json.dumps(project.model_dump(), ensure_ascii=False),
            ),
        )


def list_recent_projects(limit: int = 20) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, folder_path, opened_at
            FROM recent_projects
            ORDER BY opened_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "folderPath": row["folder_path"],
            "openedAt": row["opened_at"],
        }
        for row in rows
    ]

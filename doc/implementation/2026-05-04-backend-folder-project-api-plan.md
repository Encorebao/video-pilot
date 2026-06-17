# Backend Folder Project API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent Python backend inside `video-studio/backend` that treats a user-selected folder as the project root and exposes the first APIs needed by the existing Next.js frontend.

**Architecture:** The backend is a standalone FastAPI service under `video-studio/backend`; it must not import files, use the venv, or rely on runtime paths from the legacy analyzer project. A project is a folder selected by the user, with `video-studio.project.json` as its portable project manifest and derived assets stored inside that folder.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Pydantic, SQLite for app-level recents/settings, Next.js 16 frontend service adapters, Zustand stores.

---

## Constraints

- Do not import from the legacy analyzer project.
- Do not use the old analyzer virtual environment.
- Do not store project-owned data under `backend/storage/projects/{id}`.
- A project is opened by folder path.
- The project manifest is `video-studio.project.json` inside the selected folder.
- `backend/storage` is only for app-level data such as recents, settings, temp files, logs, and job cache.
- First implementation should connect real project data and basic analysis placeholders before migrating the full video analysis pipeline.

## Target Project Folder Shape

```text
UserSelectedFolder/
  video-studio.project.json
  media/
  frames/
  audio/
  captions/
  analysis/
  exports/
  cache/
```

## Files To Create Or Modify

- Create: `backend/requirements.txt`  
  Backend Python dependencies.
- Create: `backend/app/main.py`  
  FastAPI app factory and router registration.
- Create: `backend/app/core/config.py`  
  Backend constants and storage path resolution.
- Create: `backend/app/core/project_paths.py`  
  Project folder validation and standard subdirectory creation.
- Create: `backend/app/schemas/project.py`  
  Pydantic request/response models for project folder operations.
- Create: `backend/app/services/project_manifest.py`  
  Read/write `video-studio.project.json`.
- Create: `backend/app/repositories/app_state.py`  
  App-level recent project storage in `backend/storage/app.db`.
- Create: `backend/app/api/health.py`  
  Health endpoint.
- Create: `backend/app/api/projects.py`  
  Open/init/recent/current project endpoints.
- Create: `backend/tests/test_project_manifest.py`  
  Unit tests for manifest initialization/opening.
- Create: `backend/tests/test_projects_api.py`  
  API tests for folder project endpoints.
- Modify: `frontend/src/services/api-client.ts`  
  Shared frontend API client.
- Create: `frontend/src/services/project-api.ts`  
  Frontend project API adapter.
- Modify: `frontend/src/stores/project-store.ts`  
  Add API-backed project open/init actions while keeping current mock fallback.

---

### Task 1: Backend Skeleton

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/main.py`
- Create: `backend/app/api/health.py`
- Create: `backend/app/core/config.py`

- [ ] **Step 1: Add backend dependencies**

Create `backend/requirements.txt`:

```text
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: Add backend config**

Create `backend/app/core/config.py`:

```python
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
STORAGE_DIR = BACKEND_ROOT / "storage"
APP_DB_PATH = STORAGE_DIR / "app.db"
PROJECT_MANIFEST_NAME = "video-studio.project.json"


def ensure_storage_dirs() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "temp").mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "logs").mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 3: Add health router**

Create `backend/app/api/health.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Add FastAPI app entry**

Create `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.core.config import ensure_storage_dirs


def create_app() -> FastAPI:
    ensure_storage_dirs()
    app = FastAPI(title="Video Studio Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    return app


app = create_app()
```

- [ ] **Step 5: Verify health endpoint**

Run:

```bash
cd <repo>/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8765
```

Expected: server starts and `GET http://127.0.0.1:8765/api/health` returns `{"status":"ok"}`.

---

### Task 2: Folder Project Manifest

**Files:**
- Create: `backend/app/core/project_paths.py`
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/services/project_manifest.py`
- Create: `backend/tests/test_project_manifest.py`

- [ ] **Step 1: Add path helpers**

Create `backend/app/core/project_paths.py`:

```python
from pathlib import Path

from app.core.config import PROJECT_MANIFEST_NAME

PROJECT_SUBDIRS = ("media", "frames", "audio", "captions", "analysis", "exports", "cache")


def normalize_project_folder(folder_path: str) -> Path:
    folder = Path(folder_path).expanduser().resolve()
    if not folder.exists():
        raise FileNotFoundError(f"Project folder does not exist: {folder}")
    if not folder.is_dir():
        raise NotADirectoryError(f"Project path is not a folder: {folder}")
    return folder


def manifest_path(project_folder: Path) -> Path:
    return project_folder / PROJECT_MANIFEST_NAME


def ensure_project_subdirs(project_folder: Path) -> None:
    for name in PROJECT_SUBDIRS:
        (project_folder / name).mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 2: Add project schemas**

Create `backend/app/schemas/project.py`:

```python
from pydantic import BaseModel, Field


class InitProjectRequest(BaseModel):
    folderPath: str = Field(min_length=1)
    name: str = Field(min_length=1)


class OpenProjectRequest(BaseModel):
    folderPath: str = Field(min_length=1)


class ProjectManifest(BaseModel):
    id: str
    name: str
    version: str = "0.1.0"
    folderPath: str
    createdAt: str
    updatedAt: str
    media: list[dict] = Field(default_factory=list)
    timeline: dict = Field(default_factory=dict)
    analysis: dict = Field(default_factory=dict)


class ProjectResponse(BaseModel):
    project: ProjectManifest
```

- [ ] **Step 3: Add manifest service**

Create `backend/app/services/project_manifest.py`:

```python
from datetime import datetime
from pathlib import Path
from uuid import uuid4
import json

from app.core.project_paths import ensure_project_subdirs, manifest_path, normalize_project_folder
from app.schemas.project import ProjectManifest


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def init_project(folder_path: str, name: str) -> ProjectManifest:
    folder = normalize_project_folder(folder_path)
    ensure_project_subdirs(folder)
    path = manifest_path(folder)
    if path.exists():
        return open_project(str(folder))

    now = _now_iso()
    manifest = ProjectManifest(
        id=str(uuid4()),
        name=name.strip(),
        folderPath=str(folder),
        createdAt=now,
        updatedAt=now,
        timeline={
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "durationInFrames": 0,
            "videoTracks": [],
            "audioTracks": [],
        },
        analysis={
            "overallSummary": "",
            "sceneCount": 0,
            "transcriptCount": 0,
            "detectedFillerWordCount": 0,
            "keyframes": [],
            "transcriptSegments": [],
            "editSuggestions": [],
        },
    )
    path.write_text(
        json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def open_project(folder_path: str) -> ProjectManifest:
    folder = normalize_project_folder(folder_path)
    path = manifest_path(folder)
    if not path.exists():
        raise FileNotFoundError(f"Project manifest not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    data["folderPath"] = str(folder)
    return ProjectManifest.model_validate(data)
```

- [ ] **Step 4: Add manifest tests**

Create `backend/tests/test_project_manifest.py`:

```python
from pathlib import Path

from app.core.config import PROJECT_MANIFEST_NAME
from app.services.project_manifest import init_project, open_project


def test_init_project_creates_manifest_and_subdirs(tmp_path: Path):
    project = init_project(str(tmp_path), "Demo Project")

    assert project.name == "Demo Project"
    assert project.folderPath == str(tmp_path.resolve())
    assert (tmp_path / PROJECT_MANIFEST_NAME).exists()
    for name in ("media", "frames", "audio", "captions", "analysis", "exports", "cache"):
        assert (tmp_path / name).is_dir()


def test_open_project_reads_existing_manifest(tmp_path: Path):
    created = init_project(str(tmp_path), "Existing Project")
    opened = open_project(str(tmp_path))

    assert opened.id == created.id
    assert opened.name == "Existing Project"
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd <repo>/backend
. .venv/bin/activate
PYTHONPATH=. pytest tests/test_project_manifest.py -v
```

Expected: both tests pass.

---

### Task 3: Project Open/Init API

**Files:**
- Create: `backend/app/repositories/app_state.py`
- Create: `backend/app/api/projects.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_projects_api.py`

- [ ] **Step 1: Add recent project repository**

Create `backend/app/repositories/app_state.py`:

```python
import json
import sqlite3
from pathlib import Path

from app.core.config import APP_DB_PATH
from app.schemas.project import ProjectManifest


def _connect() -> sqlite3.Connection:
    APP_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(APP_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS recent_projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            folder_path TEXT NOT NULL UNIQUE,
            manifest_json TEXT NOT NULL,
            opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
        """
    )
    return conn


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
```

- [ ] **Step 2: Add projects router**

Create `backend/app/api/projects.py`:

```python
from fastapi import APIRouter, HTTPException

from app.repositories.app_state import list_recent_projects, remember_project
from app.schemas.project import InitProjectRequest, OpenProjectRequest, ProjectResponse
from app.services.project_manifest import init_project, open_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("/init", response_model=ProjectResponse)
def init_project_endpoint(payload: InitProjectRequest) -> ProjectResponse:
    try:
        project = init_project(payload.folderPath, payload.name)
    except (FileNotFoundError, NotADirectoryError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remember_project(project)
    return ProjectResponse(project=project)


@router.post("/open", response_model=ProjectResponse)
def open_project_endpoint(payload: OpenProjectRequest) -> ProjectResponse:
    try:
        project = open_project(payload.folderPath)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotADirectoryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remember_project(project)
    return ProjectResponse(project=project)


@router.get("/recent")
def recent_projects() -> dict[str, list[dict]]:
    return {"projects": list_recent_projects()}
```

- [ ] **Step 3: Register router**

Modify `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, projects
from app.core.config import ensure_storage_dirs


def create_app() -> FastAPI:
    ensure_storage_dirs()
    app = FastAPI(title="Video Studio Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(projects.router)
    return app


app = create_app()
```

- [ ] **Step 4: Add API tests**

Create `backend/tests/test_projects_api.py`:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_init_project_endpoint_creates_folder_manifest(tmp_path: Path):
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/init",
        json={"folderPath": str(tmp_path), "name": "API Demo"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["project"]["name"] == "API Demo"
    assert body["project"]["folderPath"] == str(tmp_path.resolve())
    assert (tmp_path / "video-studio.project.json").exists()


def test_open_project_without_manifest_returns_404(tmp_path: Path):
    client = TestClient(create_app())

    response = client.post("/api/projects/open", json={"folderPath": str(tmp_path)})

    assert response.status_code == 404
    assert "Project manifest not found" in response.json()["detail"]
```

- [ ] **Step 5: Run API tests**

Run:

```bash
cd <repo>/backend
. .venv/bin/activate
PYTHONPATH=. pytest tests/test_projects_api.py -v
```

Expected: both tests pass.

---

### Task 4: Frontend API Adapter

**Files:**
- Create: `frontend/src/services/api-client.ts`
- Create: `frontend/src/services/project-api.ts`
- Modify: `frontend/src/stores/project-store.ts`

- [ ] **Step 1: Add shared API client**

Create `frontend/src/services/api-client.ts`:

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8765";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail ?? `${response.status} ${response.statusText}`;
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Add project API adapter**

Create `frontend/src/services/project-api.ts`:

```typescript
import { apiRequest } from "@/services/api-client";
import type { ProjectRecord } from "@/types/project";

interface ProjectResponse {
  project: ProjectRecord;
}

interface RecentProjectsResponse {
  projects: Array<{
    id: string;
    name: string;
    folderPath: string;
    openedAt: string;
  }>;
}

export function initFolderProject(folderPath: string, name: string) {
  return apiRequest<ProjectResponse>("/api/projects/init", {
    method: "POST",
    body: JSON.stringify({ folderPath, name }),
  });
}

export function openFolderProject(folderPath: string) {
  return apiRequest<ProjectResponse>("/api/projects/open", {
    method: "POST",
    body: JSON.stringify({ folderPath }),
  });
}

export function listRecentFolderProjects() {
  return apiRequest<RecentProjectsResponse>("/api/projects/recent");
}
```

- [ ] **Step 3: Extend project store with API actions**

Modify `frontend/src/stores/project-store.ts` by importing the adapter:

```typescript
import { initFolderProject, openFolderProject } from "@/services/project-api";
```

Add state fields to `ProjectStoreState`:

```typescript
  isLoadingProject: boolean;
  projectError: string | null;
  initFolderProject: (folderPath: string, name: string) => Promise<void>;
  openFolderProject: (folderPath: string) => Promise<void>;
```

Add implementation inside the store object:

```typescript
  isLoadingProject: false,
  projectError: null,
  initFolderProject: async (folderPath, name) => {
    set({ isLoadingProject: true, projectError: null });
    try {
      const response = await initFolderProject(folderPath, name);
      set({ currentProject: response.project, isLoadingProject: false });
    } catch (error) {
      set({
        isLoadingProject: false,
        projectError: error instanceof Error ? error.message : "初始化项目失败",
      });
    }
  },
  openFolderProject: async (folderPath) => {
    set({ isLoadingProject: true, projectError: null });
    try {
      const response = await openFolderProject(folderPath);
      set({ currentProject: response.project, isLoadingProject: false });
    } catch (error) {
      set({
        isLoadingProject: false,
        projectError: error instanceof Error ? error.message : "打开项目失败",
      });
    }
  },
```

- [ ] **Step 4: Run frontend checks**

Run:

```bash
cd <repo>/frontend
npm run typecheck
npm run lint
```

Expected: both commands complete without errors.

---

### Task 5: Analysis Migration Boundary

**Files:**
- Create: `backend/app/schemas/analysis.py`
- Create: `backend/app/services/analysis_adapter.py`
- Create: `backend/app/api/analysis.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add analysis schema**

Create `backend/app/schemas/analysis.py`:

```python
from pydantic import BaseModel, Field


class AnalysisResults(BaseModel):
    overallSummary: str = ""
    sceneCount: int = 0
    transcriptCount: int = 0
    detectedFillerWordCount: int = 0
    keyframes: list[dict] = Field(default_factory=list)
    transcriptSegments: list[dict] = Field(default_factory=list)
    editSuggestions: list[dict] = Field(default_factory=list)
```

- [ ] **Step 2: Add manifest analysis reader**

Create `backend/app/services/analysis_adapter.py`:

```python
from app.schemas.analysis import AnalysisResults
from app.services.project_manifest import open_project


def load_project_analysis(folder_path: str) -> AnalysisResults:
    project = open_project(folder_path)
    return AnalysisResults.model_validate(project.analysis)
```

- [ ] **Step 3: Add analysis endpoint**

Create `backend/app/api/analysis.py`:

```python
from fastapi import APIRouter, HTTPException, Query

from app.schemas.analysis import AnalysisResults
from app.services.analysis_adapter import load_project_analysis

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("", response_model=AnalysisResults)
def get_analysis(folderPath: str = Query(min_length=1)) -> AnalysisResults:
    try:
        return load_project_analysis(folderPath)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
```

- [ ] **Step 4: Register analysis router**

Modify `backend/app/main.py`:

```python
from app.api import analysis, health, projects
```

and include:

```python
    app.include_router(analysis.router)
```

- [ ] **Step 5: Verify analysis endpoint manually**

Run:

```bash
curl "http://127.0.0.1:8765/api/analysis?folderPath=/absolute/path/to/project"
```

Expected: returns an `AnalysisResults` object with empty arrays for a newly initialized project.

---

### Task 6: Next Implementation Plan

After Tasks 1-5 pass, write a second plan for the actual migrated analysis pipeline. That plan should migrate functionality from the legacy analyzer project by copying and refactoring logic into these backend-owned modules:

```text
backend/app/services/media_probe.py
backend/app/services/scene_detection.py
backend/app/services/frame_extraction.py
backend/app/services/vision_analysis.py
backend/app/services/quality_analysis.py
backend/app/services/edit_advisor.py
backend/app/services/analyzer_pipeline.py
backend/app/api/jobs.py
backend/app/api/media.py
```

The second plan should make `POST /api/analysis/jobs` execute real analysis and write outputs into:

```text
UserSelectedFolder/
  analysis/{media_id}.json
  frames/{media_id}/frame_001.jpg
```

---

## Verification Checklist

- [ ] Backend starts from `video-studio/backend` without the legacy analyzer project.
- [ ] `GET /api/health` works.
- [ ] `POST /api/projects/init` creates `video-studio.project.json` in the selected folder.
- [ ] `POST /api/projects/open` reads a folder project.
- [ ] `GET /api/projects/recent` reads app-level recent projects from `backend/storage/app.db`.
- [ ] `GET /api/analysis?folderPath=...` returns frontend-compatible analysis shape.
- [ ] Frontend typecheck passes after adding service adapters.
- [ ] No runtime imports point to the legacy analyzer project.

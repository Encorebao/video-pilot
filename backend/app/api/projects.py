from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.repositories.app_state import list_recent_projects, remember_project
from app.schemas.project import InitProjectRequest, OpenProjectRequest, ProjectResponse, SaveProjectRequest
from app.services.analysis_adapter import load_project_analysis
from app.services.project_cache import clear_project_cache
from app.services.project_manifest import init_project, open_project, save_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("/init", response_model=ProjectResponse)
def init_project_endpoint(payload: InitProjectRequest) -> ProjectResponse:
    try:
        project = init_project(payload.folderPath, payload.name)
    except (FileNotFoundError, NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remember_project(project)
    return ProjectResponse(project=project)


@router.post("/open", response_model=ProjectResponse)
def open_project_endpoint(payload: OpenProjectRequest) -> ProjectResponse:
    try:
        project = open_project(payload.folderPath)
        project = project.model_copy(
            update={"analysis": load_project_analysis(payload.folderPath).model_dump()}
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remember_project(project)
    return ProjectResponse(project=project)


@router.put("/save", response_model=ProjectResponse)
def save_project_endpoint(payload: SaveProjectRequest) -> ProjectResponse:
    try:
        project = save_project(payload.folderPath, payload.project)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remember_project(project)
    return ProjectResponse(project=project)


@router.get("/recent")
def recent_projects() -> dict[str, list[dict]]:
    return {"projects": list_recent_projects()}


@router.post("/cache/clear")
def clear_cache(payload: OpenProjectRequest) -> dict:
    try:
        project = open_project(payload.folderPath)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return clear_project_cache(Path(project.folderPath))

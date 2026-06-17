from typing import Literal, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel

from app.core.project_paths import normalize_project_folder
from app.repositories.jobs import create_job
from app.schemas.jobs import JobResponse, ScriptEditJobRequest
from app.schemas.project import ProjectResponse
from app.services.script_edit import apply_script_edit_draft, build_script_context_preview

router = APIRouter(prefix="/api/script-edit", tags=["script-edit"])


class ApplyScriptDraftRequest(BaseModel):
    projectFolder: Optional[str] = None


@router.get("/context-preview")
def get_script_edit_context_preview(
    folderPath: str = Query(min_length=1),
    mode: Literal["rough_cut", "broll_sort"] = "rough_cut",
    candidateIds: list[str] = Query(default_factory=list),
) -> dict:
    try:
        project_folder = normalize_project_folder(folderPath)
        return build_script_context_preview(
            str(project_folder),
            mode=mode,
            candidate_ids=candidateIds,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/jobs", response_model=JobResponse)
def create_script_edit_job(payload: ScriptEditJobRequest) -> JobResponse:
    try:
        project_folder = normalize_project_folder(payload.projectFolder)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = create_job(
        "script_edit",
        str(project_folder),
        {
            "message": payload.message,
            "quickStart": payload.quickStart,
            "sessionId": payload.sessionId,
            "mode": payload.mode,
            "candidateIds": payload.candidateIds,
        },
    )
    return JobResponse(job=job)


@router.post("/drafts/{draft_id}/apply", response_model=ProjectResponse)
def apply_script_edit_draft_endpoint(
    draft_id: str,
    payload: Optional[ApplyScriptDraftRequest] = Body(default=None),
) -> ProjectResponse:
    try:
        project = apply_script_edit_draft(payload.projectFolder if payload else None, draft_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ProjectResponse(project=project)

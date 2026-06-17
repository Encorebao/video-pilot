from fastapi import APIRouter, HTTPException

from app.core.project_paths import normalize_project_folder
from app.repositories.jobs import create_job
from app.schemas.jobs import ExportJobRequest, JobResponse

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/jobs", response_model=JobResponse)
def create_export_job(payload: ExportJobRequest) -> JobResponse:
    try:
        project_folder = normalize_project_folder(payload.projectFolder)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = create_job(
        "export",
        str(project_folder),
        {"format": payload.format, "timelineId": payload.timelineId},
    )
    return JobResponse(job=job)

import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from app.core.project_paths import normalize_project_folder
from app.repositories.jobs import create_job
from app.schemas.analysis import AnalysisResults
from app.schemas.jobs import AnalysisJobRequest, JobResponse
from app.services.analysis_adapter import load_project_analysis
from app.services.analysis_taxonomy import load_analysis_taxonomy

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/taxonomy")
def get_analysis_taxonomy() -> dict:
    return load_analysis_taxonomy()


@router.get("", response_model=AnalysisResults)
def get_analysis(folderPath: str = Query(min_length=1)) -> AnalysisResults:
    try:
        return load_project_analysis(folderPath)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (json.JSONDecodeError, ValueError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/jobs", response_model=JobResponse)
def create_analysis_job(payload: AnalysisJobRequest) -> JobResponse:
    try:
        project_folder = normalize_project_folder(payload.projectFolder)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = create_job(
        "analysis",
        str(project_folder),
        {"mediaIds": payload.mediaIds},
    )
    return JobResponse(job=job)

from fastapi import APIRouter, HTTPException

from app.core.project_paths import normalize_project_folder
from app.repositories.jobs import create_job
from app.schemas.jobs import JobResponse, SubtitleJobRequest
from app.services import whisper_service

router = APIRouter(prefix="/api/subtitles", tags=["subtitles"])


@router.post("/jobs", response_model=JobResponse)
def create_subtitle_job(payload: SubtitleJobRequest) -> JobResponse:
    try:
        project_folder = normalize_project_folder(payload.projectFolder)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        whisper_service.ensure_ready()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    job = create_job(
        "subtitles",
        str(project_folder),
        {
            "mediaIds": payload.mediaIds,
            "language": payload.language,
            "maxWordsPerSegment": payload.maxWordsPerSegment,
        },
    )
    return JobResponse(job=job)

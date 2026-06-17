from fastapi import APIRouter, HTTPException

from app.core.project_paths import normalize_project_folder
from app.repositories.jobs import create_job
from app.schemas.jobs import JobResponse, TtsJobRequest

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/tts/jobs", response_model=JobResponse)
def create_tts_job(payload: TtsJobRequest) -> JobResponse:
    try:
        project_folder = normalize_project_folder(payload.projectFolder)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = create_job(
        "tts",
        str(project_folder),
        {
            "text": payload.text,
            "voice": payload.voice,
            "voiceName": payload.voiceName or payload.voice,
            "emotion": payload.emotion,
            "speed": payload.speed,
            "leadSilenceMs": payload.leadSilenceMs,
            "tailSilenceMs": payload.tailSilenceMs,
            "insertionTrackId": payload.insertionTrackId,
            "insertAfterClipId": payload.insertAfterClipId,
            "sampleSource": payload.sampleSource,
            "sampleClipId": payload.sampleClipId,
            "format": payload.format,
        },
    )
    return JobResponse(job=job)

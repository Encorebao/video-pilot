from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import whisper_service

router = APIRouter(prefix="/api/whisper", tags=["whisper"])


class WhisperDownloadRequest(BaseModel):
    repo: str = whisper_service.DEFAULT_WHISPER_REPO


class WhisperManualInstallRequest(BaseModel):
    path: str = Field(min_length=1)
    repo: str = whisper_service.DEFAULT_WHISPER_REPO


class WhisperStartRequest(BaseModel):
    modelId: Optional[str] = None


@router.get("/status")
def whisper_status() -> dict:
    return whisper_service.get_status()


@router.post("/models/download")
def download_whisper_model(payload: WhisperDownloadRequest) -> dict:
    try:
        return whisper_service.download_model(payload.repo)
    except (RuntimeError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/models/install")
def install_whisper_model(payload: WhisperManualInstallRequest) -> dict:
    try:
        return whisper_service.register_manual_model(payload.path, payload.repo)
    except (RuntimeError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/models/{model_id}")
def delete_whisper_model(model_id: str) -> dict:
    try:
        return whisper_service.delete_model(model_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RuntimeError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/service/start")
def start_whisper_service(payload: WhisperStartRequest) -> dict:
    try:
        return whisper_service.start_service(payload.modelId)
    except (RuntimeError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/service/stop")
def stop_whisper_service() -> dict:
    return whisper_service.stop_service()

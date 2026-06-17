from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

JobType = Literal["analysis", "tts", "export", "subtitles", "script_edit"]
JobStatus = Literal["queued", "running", "completed", "failed"]


class JobPublic(BaseModel):
    id: str
    type: JobType
    status: JobStatus
    progress: int
    projectFolder: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    result: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    createdAt: str
    updatedAt: str
    startedAt: Optional[str] = None
    finishedAt: Optional[str] = None


class JobResponse(BaseModel):
    job: JobPublic


class AnalysisJobRequest(BaseModel):
    projectFolder: str = Field(min_length=1)
    mediaIds: list[str] = Field(default_factory=list)


class TtsJobRequest(BaseModel):
    projectFolder: str = Field(min_length=1)
    text: str = Field(min_length=1)
    voice: str = "alloy"
    voiceName: Optional[str] = None
    emotion: str = "neutral"
    speed: float = 1
    leadSilenceMs: int = 0
    tailSilenceMs: int = 0
    insertionTrackId: Optional[str] = None
    insertAfterClipId: Optional[str] = None
    sampleSource: str = "uploaded"
    sampleClipId: Optional[str] = None
    format: str = "mp3"


class ExportJobRequest(BaseModel):
    projectFolder: str = Field(min_length=1)
    format: str = "mp4"
    timelineId: Optional[str] = None


class SubtitleJobRequest(BaseModel):
    projectFolder: str = Field(min_length=1)
    mediaIds: list[str] = Field(default_factory=list)
    language: str = "zh"
    maxWordsPerSegment: int = Field(default=24, ge=4, le=80)


class ScriptEditJobRequest(BaseModel):
    projectFolder: str = Field(min_length=1)
    message: str = Field(min_length=1)
    quickStart: Optional[str] = None
    sessionId: Optional[str] = None
    mode: Literal["rough_cut", "broll_sort"] = "rough_cut"
    candidateIds: list[str] = Field(default_factory=list)

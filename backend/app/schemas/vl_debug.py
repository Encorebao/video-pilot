from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class VlFrameSamplingDebugRequest(BaseModel):
    projectFolder: str = Field(min_length=1)
    videoPath: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    extraInstructions: str = ""
    outputSchema: dict[str, Any] = Field(default_factory=dict)
    intervalSeconds: float = Field(default=0.5, ge=0.1, le=10)
    maxFrames: int = Field(default=120, ge=1, le=600)
    temperature: float = Field(default=0.2, ge=0, le=2)
    maxTokens: int = Field(default=1200, ge=1, le=8192)
    timeout: float = Field(default=180, ge=1, le=900)
    persist: bool = True


class VlFrameSamplingItem(BaseModel):
    index: int
    time: float
    framePath: str
    parsed: Optional[dict[str, Any]] = None
    rawContent: str = ""
    parseError: Optional[str] = None


class VlFrameSamplingDebugResponse(BaseModel):
    ok: bool
    frames: list[VlFrameSamplingItem] = Field(default_factory=list)
    request: dict[str, Any]
    debugPath: Optional[str] = None

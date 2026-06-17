from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl

ModelCapability = Literal["vl", "llm", "stt", "tts"]
ModelStatus = Literal["unconfigured", "configured", "ready", "error"]


class ModelConfigInput(BaseModel):
    capability: ModelCapability
    baseUrl: HttpUrl = Field(default="https://api.openai.com/v1")
    model: str = Field(min_length=1)
    apiKey: Optional[str] = None
    enabled: bool = True


class ModelConfigPublic(BaseModel):
    capability: ModelCapability
    baseUrl: str
    model: str
    enabled: bool
    status: ModelStatus
    apiKeyConfigured: bool
    lastCheckedAt: Optional[str] = None
    error: Optional[str] = None


class ModelConfigsRequest(BaseModel):
    configs: list[ModelConfigInput]


class ModelConfigsResponse(BaseModel):
    configs: list[ModelConfigPublic]


class ModelCheckResponse(BaseModel):
    ok: bool
    config: ModelConfigPublic

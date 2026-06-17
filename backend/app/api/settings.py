from fastapi import APIRouter

from app.repositories.model_configs import (
    check_model_config,
    list_model_configs,
    upsert_model_configs,
)
from app.schemas.settings import (
    ModelCapability,
    ModelCheckResponse,
    ModelConfigsRequest,
    ModelConfigsResponse,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/models", response_model=ModelConfigsResponse)
def get_model_settings() -> ModelConfigsResponse:
    return ModelConfigsResponse(configs=list_model_configs())


@router.put("/models", response_model=ModelConfigsResponse)
def save_model_settings(payload: ModelConfigsRequest) -> ModelConfigsResponse:
    return ModelConfigsResponse(configs=upsert_model_configs(payload.configs))


@router.post("/models/{capability}/check", response_model=ModelCheckResponse)
def check_model_settings(capability: ModelCapability) -> ModelCheckResponse:
    ok, config = check_model_config(capability)
    return ModelCheckResponse(ok=ok, config=config)

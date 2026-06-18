from fastapi import APIRouter, HTTPException

from app.schemas.vl_debug import VlFrameSamplingDebugRequest, VlFrameSamplingDebugResponse
from app.services.openai_compatible import ModelCallError, ModelConfigError
from app.services.video_vl_debug import run_frame_sampling_debug

router = APIRouter(prefix="/api/vl-debug", tags=["vl-debug"])


@router.post("/frame-sampling", response_model=VlFrameSamplingDebugResponse)
def debug_frame_sampling(payload: VlFrameSamplingDebugRequest) -> VlFrameSamplingDebugResponse:
    try:
        return run_frame_sampling_debug(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ModelConfigError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ModelCallError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_settings_dep
from app.config import Settings
from app.schemas.extraction import AudioExtractionRequest, AudioExtractionResponse
from app.services.pipeline import PipelineClientError, PipelineError, run_full_extraction_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/audio",
    response_model=AudioExtractionResponse,
    summary="Full pipeline: extract audio → transcribe (Groq) → knowledge (Gemini) → save (Supabase)",
    status_code=status.HTTP_200_OK,
)
async def extract_audio(
    body: AudioExtractionRequest,
    _settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AudioExtractionResponse:
    url = str(body.url)
    try:
        return await run_full_extraction_pipeline(url)
    except PipelineClientError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except PipelineError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e

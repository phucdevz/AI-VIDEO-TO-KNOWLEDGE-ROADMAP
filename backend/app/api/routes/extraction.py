import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_audio_extraction_service
from app.schemas.extraction import AudioExtractionRequest, AudioExtractionResponse
from app.services.audio_extraction import AudioExtractionError, AudioExtractionService

router = APIRouter()


@router.post(
    "/audio",
    response_model=AudioExtractionResponse,
    summary="Download best audio for a YouTube URL (yt-dlp)",
    status_code=status.HTTP_200_OK,
)
async def extract_audio(
    body: AudioExtractionRequest,
    service: Annotated[AudioExtractionService, Depends(get_audio_extraction_service)],
) -> AudioExtractionResponse:
    url = str(body.url)
    try:
        result = await asyncio.to_thread(service.extract, url)
    except AudioExtractionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return AudioExtractionResponse(
        video_id=result.video_id,
        title=result.title,
        duration_seconds=result.duration_seconds,
        audio_filename=result.audio_path.name,
        audio_path=str(result.audio_path),
    )

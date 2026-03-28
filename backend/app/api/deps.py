from typing import Annotated

from fastapi import Depends

from app.config import Settings, get_settings
from app.services.audio_extraction import AudioExtractionService


def get_settings_dep() -> Settings:
    return get_settings()


def get_audio_extraction_service(
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AudioExtractionService:
    # Paths are relative to the process working directory (run uvicorn from `backend/`)
    return AudioExtractionService(settings.temp_audio_dir)

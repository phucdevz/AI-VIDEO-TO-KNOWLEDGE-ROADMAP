from typing import Annotated

from fastapi import Depends

from app.config import Settings, get_settings
from app.services.ai_service import AIService
from app.services.audio_extraction import AudioExtractionService
from app.services.database_service import DatabaseService
from app.services.transcription_service import TranscriptionService


def get_settings_dep() -> Settings:
    return get_settings()


def get_audio_extraction_service(
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AudioExtractionService:
    # Paths are relative to the process working directory (run uvicorn from `backend/`)
    return AudioExtractionService(settings.temp_audio_dir)


def get_transcription_service(
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> TranscriptionService:
    key = settings.groq_api_key or ""
    return TranscriptionService(api_key=key)


def get_ai_service(
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AIService:
    key = settings.google_api_key or ""
    return AIService(api_key=key)


def get_database_service(
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> DatabaseService:
    return DatabaseService(settings.supabase_url, settings.supabase_key)

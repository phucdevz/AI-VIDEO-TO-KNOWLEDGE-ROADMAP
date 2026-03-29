"""Full extraction pipeline — shared by API route and Admin UI."""

from __future__ import annotations

import asyncio
import logging

from app.config import get_settings
from app.schemas.extraction import AudioExtractionResponse, KnowledgeChunkSchema
from app.services.ai_service import AIService, KnowledgeGenerationError
from app.services.audio_extraction import AudioExtractionError, AudioExtractionService
from app.services.database_service import DatabaseService
from app.services.semantic_chunker import semantic_chunk_transcript
from app.services.transcription_service import TranscriptionError, TranscriptionService

logger = logging.getLogger(__name__)


class PipelineError(Exception):
    """User-facing pipeline failure with message."""


class PipelineClientError(PipelineError):
    """Invalid URL / extraction failure (HTTP 400 class)."""


async def run_full_extraction_pipeline(url: str) -> AudioExtractionResponse:
    """Extract → transcribe → chunk → Gemini → optional Supabase save."""
    settings = get_settings()
    audio_svc = AudioExtractionService(settings.temp_audio_dir)
    transcribe_svc = TranscriptionService(settings.groq_api_key or "")
    ai_svc = AIService(settings.google_api_key or "")
    db_svc = DatabaseService(settings.supabase_url, settings.supabase_key)

    try:
        extract_result = await asyncio.to_thread(audio_svc.extract, url)
    except AudioExtractionError as e:
        raise PipelineClientError(str(e)) from e

    try:
        tr = await asyncio.to_thread(transcribe_svc.transcribe_file, extract_result.audio_path)
    except TranscriptionError as e:
        raise PipelineError(str(e)) from e

    chunks = semantic_chunk_transcript(tr.segments)
    chunk_schemas = [
        KnowledgeChunkSchema(
            text=c.text,
            start_seconds=c.start_seconds,
            end_seconds=c.end_seconds,
            segment_indices=c.segment_indices,
        )
        for c in chunks
    ]

    try:
        knowledge = await asyncio.to_thread(
            ai_svc.generate_from_transcript,
            tr,
            extract_result.title,
        )
    except KnowledgeGenerationError as e:
        raise PipelineError(str(e)) from e

    transcription_payload = {
        "text": tr.text,
        "language": tr.language,
        "duration": tr.duration,
        "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in tr.segments],
        "verbose": tr.raw_verbose,
    }

    transcript_for_db = {k: v for k, v in transcription_payload.items() if k != "verbose"}

    persist = await asyncio.to_thread(
        db_svc.save_lecture_pipeline,
        video_id=extract_result.video_id,
        title=extract_result.title,
        source_url=url,
        transcript_payload=transcript_for_db,
        flow_data=knowledge.react_flow,
        quiz_data=knowledge.quiz,
        tutor_data=knowledge.tutor,
        knowledge_chunks=[c.model_dump() for c in chunk_schemas],
    )

    if not persist.ok:
        logger.warning("Lecture not persisted: %s", persist.message)

    return AudioExtractionResponse(
        video_id=extract_result.video_id,
        title=extract_result.title,
        duration_seconds=extract_result.duration_seconds,
        source_url=url,
        audio_filename=extract_result.audio_path.name,
        audio_path=str(extract_result.audio_path),
        transcription=transcription_payload,
        knowledge_chunks=chunk_schemas,
        react_flow=knowledge.react_flow,
        quiz=knowledge.quiz,
        tutor=knowledge.tutor,
        persisted=persist.ok,
        lecture_id=persist.lecture_id,
        persist_message=persist.message if not persist.ok else None,
    )

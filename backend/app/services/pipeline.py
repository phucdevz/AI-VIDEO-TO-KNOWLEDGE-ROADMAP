"""Full extraction pipeline — shared by API route and Admin UI."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable

from app.config import get_settings
from app.schemas.extraction import AudioExtractionResponse, KnowledgeChunkSchema, PipelineMetricsSchema
from app.services.ai_service import AIService, KnowledgeGenerationError
from app.services.audio_extraction import AudioExtractionError, AudioExtractionService
from app.services.database_service import DatabaseService
from app.services.mindmap_timeline_guard import ensure_react_flow_timeline_coverage
from app.services.semantic_chunker import semantic_chunk_transcript
from app.services.transcription_service import TranscriptionError, TranscriptionService

logger = logging.getLogger(__name__)


class PipelineError(Exception):
    """User-facing pipeline failure with message."""


class PipelineClientError(PipelineError):
    """Invalid URL / extraction failure (HTTP 400 class)."""


async def run_full_extraction_pipeline(
    url: str,
    *,
    user_id: str | None = None,
    target_lang: str | None = "vi",
    quiz_difficulty: str | None = "medium",
    force: bool = False,
) -> AudioExtractionResponse:
    """Extract → transcribe → chunk → Gemini → optional Supabase save."""
    return await run_full_extraction_pipeline_with_progress(
        url,
        user_id=user_id,
        target_lang=target_lang,
        quiz_difficulty=quiz_difficulty,
        force=force,
    )


def _emit(on_stage: Callable[[str], None] | None, message: str) -> None:
    if on_stage:
        on_stage(message)


def _emit_metrics(on_metrics: Callable[[dict[str, object]], None] | None, payload: dict[str, object]) -> None:
    if on_metrics:
        on_metrics(payload)


def _response_from_cached_row(url: str, row: dict) -> AudioExtractionResponse:
    transcript = row.get("transcript") if isinstance(row.get("transcript"), dict) else {}
    flow_data = row.get("flow_data") if isinstance(row.get("flow_data"), dict) else {"nodes": [], "edges": []}
    quiz_data = row.get("quiz") if isinstance(row.get("quiz"), dict) else {"questions": []}
    tutor_data = row.get("tutor_data") if isinstance(row.get("tutor_data"), dict) else None
    if not isinstance(tutor_data, dict):
        summary = str(row.get("summary") or "")
        tutor_data = {"summary": summary, "key_points": []}
    chunk_schemas: list[KnowledgeChunkSchema] = []

    return AudioExtractionResponse(
        video_id=str(row.get("video_url") or "cached"),
        title=str(row.get("title")) if row.get("title") is not None else None,
        duration_seconds=transcript.get("duration") if isinstance(transcript, dict) else None,
        source_url=str(row.get("video_url") or url),
        audio_filename="",
        audio_path="",
        transcription=transcript,
        knowledge_chunks=chunk_schemas,
        react_flow=flow_data,
        quiz=quiz_data,
        tutor=tutor_data,
        persisted=True,
        lecture_id=str(row.get("id")) if row.get("id") is not None else None,
        persist_message="Loaded from Supabase cache",
    )


def _ensure_key_points_cover_full_video(tutor: dict, *, segments: list[dict], duration: float | None) -> dict:
    """
    Guardrail for long videos: if AI key_points cluster at the beginning,
    inject/replace the last points with transcript-backed late-video anchors.
    """
    if not isinstance(tutor, dict):
        return {"summary": "", "key_points": []}
    kp = tutor.get("key_points")
    if not isinstance(kp, list):
        kp = []

    # Normalize duration from segments if missing.
    dur = None
    try:
        dur = float(duration) if duration is not None else None
    except (TypeError, ValueError):
        dur = None
    if dur is None and segments:
        try:
            dur = max(float(s.get("end", 0) or 0) for s in segments if isinstance(s, dict))
        except Exception:
            dur = None

    if not dur or dur <= 0 or not segments:
        tutor["key_points"] = kp
        return tutor

    # If we already have a late key point, keep as-is.
    latest = -1.0
    for item in kp:
        if not isinstance(item, dict):
            continue
        try:
            ts = float(item.get("timestamp_seconds"))
        except (TypeError, ValueError):
            continue
        latest = max(latest, ts)

    need_late = latest < dur * 0.75
    if not need_late:
        tutor["key_points"] = kp
        return tutor

    # Pick 2 anchors near the end from transcript segments.
    want = [dur * 0.85, dur * 0.95]
    chosen: list[dict] = []
    for target in want:
        best = None
        best_dist = 1e18
        for s in segments:
            if not isinstance(s, dict):
                continue
            try:
                st = float(s.get("start", 0) or 0)
                en = float(s.get("end", 0) or 0)
            except (TypeError, ValueError):
                continue
            mid = (st + en) / 2.0
            d = abs(mid - target)
            if d < best_dist and str(s.get("text", "")).strip():
                best_dist = d
                best = s
        if best:
            chosen.append(
                {
                    "text": str(best.get("text") or "").strip()[:220],
                    "timestamp_seconds": float(best.get("start", 0) or 0),
                }
            )

    if not chosen:
        tutor["key_points"] = kp
        return tutor

    # Replace last items or append if short.
    kp2 = [x for x in kp if isinstance(x, dict)]
    while len(kp2) < 2:
        kp2.append({})
    kp2 = kp2[:-len(chosen)] + chosen if len(kp2) >= len(chosen) else chosen

    tutor["key_points"] = kp2
    return tutor


async def run_full_extraction_pipeline_with_progress(
    url: str,
    *,
    user_id: str | None = None,
    target_lang: str | None = "vi",
    quiz_difficulty: str | None = "medium",
    force: bool = False,
    on_stage: Callable[[str], None] | None = None,
    on_metrics: Callable[[dict[str, object]], None] | None = None,
) -> AudioExtractionResponse:
    """Extract → transcribe → chunk → Gemini → optional Supabase save with stage callback."""
    settings = get_settings()
    db_svc = DatabaseService(settings.supabase_url, settings.supabase_key)
    t_pipeline0 = time.perf_counter()

    # Cache-first: avoid touching AI providers if we already have data.
    if not force:
        _emit(on_stage, "Checking cache...")
        lookup = await asyncio.to_thread(db_svc.find_lecture_by_source_url, url)
        if lookup.found and lookup.row:
            _emit(on_stage, "Cache hit. Returning stored result.")
            return _response_from_cached_row(url, lookup.row)
    else:
        _emit(on_stage, "Force regenerate (bypass cache)...")

    # Per-user API keys override (loaded from Supabase) when `user_id` provided.
    groq_key = settings.groq_api_key or ""
    google_key = settings.google_api_key or ""
    if db_svc.is_configured and user_id:
        u_groq, u_google = await asyncio.to_thread(db_svc.get_user_api_keys, user_id)
        if u_groq:
            groq_key = u_groq
        if u_google:
            google_key = u_google

    audio_svc = AudioExtractionService(settings.temp_audio_dir)
    transcribe_svc = TranscriptionService(groq_key or "")
    ai_svc = AIService(
        google_key,
        groq_api_key=groq_key,
        provider=settings.ai_provider,
    )

    _emit(on_stage, "Downloading...")
    try:
        extract_result = await asyncio.to_thread(audio_svc.extract, url)
    except AudioExtractionError as e:
        raise PipelineClientError(str(e)) from e

    placeholder_id: str | None = None
    if db_svc.is_configured:
        _emit(on_stage, "Registering lecture (processing)…")
        ph = await asyncio.to_thread(
            db_svc.upsert_processing_placeholder,
            video_id=extract_result.video_id,
            title=extract_result.title,
            source_url=url,
            user_id=user_id,
        )
        if ph.ok and ph.lecture_id:
            placeholder_id = ph.lecture_id
            _emit(on_stage, f"Realtime: lecture id {placeholder_id} (processing)")
        elif ph.message:
            logger.warning("Processing placeholder not saved: %s", ph.message)

    _emit(on_stage, "Transcribing...")
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

    _emit(on_stage, "Generating Map...")
    try:
        knowledge = await asyncio.to_thread(
            ai_svc.generate_from_transcript,
            tr,
            video_title=extract_result.title,
            target_lang=target_lang,
            quiz_difficulty=quiz_difficulty,
        )
    except KnowledgeGenerationError as e:
        raise PipelineError(str(e)) from e

    seg_dicts = [{"start": s.start, "end": s.end, "text": s.text} for s in tr.segments]
    try:
        knowledge.react_flow = ensure_react_flow_timeline_coverage(
            knowledge.react_flow,
            segments=seg_dicts,
            duration=tr.duration,
        )
    except Exception:
        logger.exception("Mindmap timeline coverage guard failed; using model react_flow as-is")

    # Guardrail: ensure tutor key points cover full video, especially for long lectures.
    try:
        knowledge.tutor = _ensure_key_points_cover_full_video(
            knowledge.tutor,
            segments=seg_dicts,
            duration=tr.duration,
        )
    except Exception:
        logger.exception("Failed to normalize tutor key points; continuing with original payload")

    transcription_payload = {
        "text": tr.text,
        "language": tr.language,
        "duration": tr.duration,
        "segments": seg_dicts,
        "verbose": tr.raw_verbose,
    }

    transcript_for_db = {k: v for k, v in transcription_payload.items() if k != "verbose"}

    _emit(on_stage, "Saving to Cloud...")
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
        user_id=user_id,
    )

    if not persist.ok:
        logger.warning("Lecture not persisted: %s", persist.message)
    _emit(on_stage, "Completed")

    resolved_lecture_id = persist.lecture_id or placeholder_id

    latency_ms = round((time.perf_counter() - t_pipeline0) * 1000.0, 2)
    am2 = knowledge.accuracy_metrics or {}
    pipeline_metrics = PipelineMetricsSchema(
        latency_ms=latency_ms,
        provider=knowledge.provider_used,
        confidence=knowledge.confidence,
        accuracy_score=am2.get("accuracy_score"),
        similarity_s=am2.get("similarity_s"),
        timestamp_t=am2.get("timestamp_t"),
        keyword_f1_k=am2.get("keyword_f1_k"),
        refined=bool(knowledge.refined),
    )
    _emit_metrics(
        on_metrics,
        {
            "event": "pipeline_complete",
            **pipeline_metrics.model_dump(),
            "lecture_id": resolved_lecture_id,
            "persisted": persist.ok,
        },
    )

    log_row: dict[str, object] = {
        "event_type": "pipeline_run",
        "source_url": url,
        "video_id": extract_result.video_id,
        "lecture_id": resolved_lecture_id,
        "provider": knowledge.provider_used,
        "latency_ms": int(latency_ms),
        "confidence": knowledge.confidence,
        "accuracy_score": am2.get("accuracy_score"),
        "accuracy_s": am2.get("similarity_s"),
        "accuracy_t": am2.get("timestamp_t"),
        "accuracy_k": am2.get("keyword_f1_k"),
        "refined": knowledge.refined,
        "detail": {
            "persisted": persist.ok,
            "persist_message": persist.message,
            "user_id": user_id,
        },
    }
    await asyncio.to_thread(db_svc.insert_system_log, log_row)

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
        lecture_id=resolved_lecture_id,
        persist_message=persist.message if not persist.ok else None,
        pipeline_metrics=pipeline_metrics,
    )

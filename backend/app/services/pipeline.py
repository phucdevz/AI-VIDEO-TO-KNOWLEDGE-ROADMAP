"""Full extraction pipeline — shared by API route and Admin UI."""

from __future__ import annotations

import asyncio
import copy
import logging
import time
import uuid
from collections.abc import Callable

from app.config import get_settings
from app.schemas.extraction import AudioExtractionResponse, KnowledgeChunkSchema, PipelineMetricsSchema
from app.services.ai_service import AIService, KnowledgeGenerationError
from app.services.audio_extraction import AudioExtractionError, AudioExtractionService
from app.services.database_service import DatabaseService
from app.services.mindmap_timeline_guard import ensure_react_flow_timeline_coverage, normalize_react_flow_labels
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


def _log_stage_start(request_id: str, stage: str, **extra: object) -> float:
    t0 = time.perf_counter()
    logger.info(
        "pipeline_stage_start request_id=%s stage=%s detail=%s",
        request_id,
        stage,
        extra if extra else {},
    )
    return t0


def _log_stage_end(request_id: str, stage: str, t0: float, *, status: str = "ok", **extra: object) -> None:
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    logger.info(
        "pipeline_stage_end request_id=%s stage=%s status=%s latency_ms=%.2f detail=%s",
        request_id,
        stage,
        status,
        elapsed_ms,
        extra if extra else {},
    )


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


def _assert_react_flow_contract(flow: dict) -> None:
    """Shape-level contract check (must not change mindmap structure contract)."""
    if not isinstance(flow, dict):
        raise PipelineError("react_flow must be an object")
    nodes = flow.get("nodes")
    edges = flow.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise PipelineError("react_flow.nodes and react_flow.edges must be arrays")
    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            raise PipelineError(f"react_flow.nodes[{i}] must be an object")
        if not isinstance(n.get("id"), str) or not n.get("id"):
            raise PipelineError(f"react_flow.nodes[{i}].id must be a non-empty string")
        if n.get("type") != "neural":
            raise PipelineError(f'react_flow.nodes[{i}].type must be "neural"')
        pos = n.get("position")
        if not isinstance(pos, dict) or "x" not in pos or "y" not in pos:
            raise PipelineError(f"react_flow.nodes[{i}].position must include x/y")
        data = n.get("data")
        if not isinstance(data, dict):
            raise PipelineError(f"react_flow.nodes[{i}].data must be an object")
        if "timestamp" not in data:
            raise PipelineError(f"react_flow.nodes[{i}].data.timestamp is required")
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            raise PipelineError(f"react_flow.edges[{i}] must be an object")
        if not isinstance(e.get("id"), str) or not e.get("id"):
            raise PipelineError(f"react_flow.edges[{i}].id must be a non-empty string")
        if not isinstance(e.get("source"), str) or not e.get("source"):
            raise PipelineError(f"react_flow.edges[{i}].source must be a non-empty string")
        if not isinstance(e.get("target"), str) or not e.get("target"):
            raise PipelineError(f"react_flow.edges[{i}].target must be a non-empty string")
        if e.get("type") != "neuralFlow":
            raise PipelineError(f'react_flow.edges[{i}].type must be "neuralFlow"')


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
    request_id = str(uuid.uuid4())
    settings = get_settings()
    db_svc = DatabaseService(settings.supabase_url, settings.supabase_key)
    t_pipeline0 = time.perf_counter()
    logger.info(
        "pipeline_request_start request_id=%s source_url=%s user_id=%s force=%s target_lang=%s quiz_difficulty=%s",
        request_id,
        url,
        user_id,
        force,
        target_lang,
        quiz_difficulty,
    )

    # Cache-first: avoid touching AI providers if we already have data.
    if not force:
        _emit(on_stage, "Checking cache...")
        t_cache = _log_stage_start(request_id, "cache_lookup")
        lookup = await asyncio.to_thread(db_svc.find_lecture_by_source_url, url)
        _log_stage_end(request_id, "cache_lookup", t_cache, found=lookup.found)
        if lookup.found and lookup.row:
            _emit(on_stage, "Cache hit. Returning stored result.")
            logger.info("pipeline_cache_hit request_id=%s", request_id)
            return _response_from_cached_row(url, lookup.row)
    else:
        _emit(on_stage, "Force regenerate (bypass cache)...")
        logger.info("pipeline_force_bypass_cache request_id=%s", request_id)

    # Per-user API keys override (loaded from Supabase) when `user_id` provided.
    groq_chat_key = settings.effective_groq_chat_key or ""
    groq_whisper_key = settings.effective_groq_whisper_key or ""
    google_key = settings.google_api_key or ""
    if db_svc.is_configured and user_id:
        u_groq, u_google = await asyncio.to_thread(db_svc.get_user_api_keys, user_id)
        if u_groq:
            # User-level Groq key overrides both chat+whisper for this request.
            groq_chat_key = u_groq
            groq_whisper_key = u_groq
        if u_google:
            google_key = u_google

    audio_svc = AudioExtractionService(settings.temp_audio_dir)
    transcribe_svc = TranscriptionService(groq_whisper_key or "")
    ai_svc = AIService(
        google_key,
        groq_api_key=groq_chat_key,
        provider=settings.ai_provider,
    )

    _emit(on_stage, "Downloading...")
    t_extract = _log_stage_start(request_id, "audio_extract")
    try:
        extract_result = await asyncio.to_thread(audio_svc.extract, url)
        _log_stage_end(
            request_id,
            "audio_extract",
            t_extract,
            video_id=extract_result.video_id,
            title=extract_result.title,
        )
    except AudioExtractionError as e:
        _log_stage_end(request_id, "audio_extract", t_extract, status="error", error_type=type(e).__name__)
        raise PipelineClientError(str(e)) from e

    placeholder_id: str | None = None
    if db_svc.is_configured:
        _emit(on_stage, "Registering lecture (processing)…")
        t_placeholder = _log_stage_start(request_id, "persist_placeholder")
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
        _log_stage_end(
            request_id,
            "persist_placeholder",
            t_placeholder,
            status="ok" if ph.ok else "warning",
            lecture_id=ph.lecture_id,
            message=ph.message,
        )

    _emit(on_stage, "Transcribing...")
    t_transcribe = _log_stage_start(request_id, "transcribe")
    try:
        tr = await asyncio.to_thread(transcribe_svc.transcribe_file, extract_result.audio_path)
        _log_stage_end(
            request_id,
            "transcribe",
            t_transcribe,
            language=tr.language,
            duration=tr.duration,
            segments=len(tr.segments),
        )
    except TranscriptionError as e:
        _log_stage_end(request_id, "transcribe", t_transcribe, status="error", error_type=type(e).__name__)
        raise PipelineError(str(e)) from e

    t_chunk = _log_stage_start(request_id, "semantic_chunk")
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
    _log_stage_end(request_id, "semantic_chunk", t_chunk, chunk_count=len(chunk_schemas))

    _emit(on_stage, "Generating Map...")
    t_ai = _log_stage_start(request_id, "ai_generate")
    try:
        knowledge = await asyncio.to_thread(
            ai_svc.generate_from_transcript,
            tr,
            video_title=extract_result.title,
            target_lang=target_lang,
            quiz_difficulty=quiz_difficulty,
        )
        _log_stage_end(
            request_id,
            "ai_generate",
            t_ai,
            provider=knowledge.provider_used,
            confidence=knowledge.confidence,
            refined=knowledge.refined,
        )
    except KnowledgeGenerationError as e:
        _log_stage_end(request_id, "ai_generate", t_ai, status="error", error_type=type(e).__name__)
        raise PipelineError(str(e)) from e

    seg_dicts = [{"start": s.start, "end": s.end, "text": s.text} for s in tr.segments]
    react_flow_before_guards = copy.deepcopy(knowledge.react_flow)
    try:
        knowledge.react_flow = ensure_react_flow_timeline_coverage(
            knowledge.react_flow,
            segments=seg_dicts,
            duration=tr.duration,
        )
    except Exception:
        logger.exception("Mindmap timeline coverage guard failed; using model react_flow as-is")

    try:
        knowledge.react_flow = normalize_react_flow_labels(knowledge.react_flow)
    except Exception:
        logger.exception("normalize_react_flow_labels failed; using react_flow as-is")

    try:
        _assert_react_flow_contract(knowledge.react_flow)
    except Exception as e:
        logger.warning(
            "react_flow_contract_regression request_id=%s error=%s; restoring pre-guard flow",
            request_id,
            e,
        )
        knowledge.react_flow = react_flow_before_guards
        _assert_react_flow_contract(knowledge.react_flow)

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
    t_persist = _log_stage_start(request_id, "persist_pipeline")
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
    _log_stage_end(
        request_id,
        "persist_pipeline",
        t_persist,
        status="ok" if persist.ok else "warning",
        lecture_id=persist.lecture_id,
        message=persist.message,
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
            "request_id": request_id,
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
            "request_id": request_id,
            "persisted": persist.ok,
            "persist_message": persist.message,
            "user_id": user_id,
        },
    }
    await asyncio.to_thread(db_svc.insert_system_log, log_row)

    logger.info(
        "pipeline_request_end request_id=%s status=ok latency_ms=%.2f provider=%s lecture_id=%s",
        request_id,
        latency_ms,
        knowledge.provider_used,
        resolved_lecture_id,
    )
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

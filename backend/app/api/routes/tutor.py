import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_database_service, get_settings_dep
from app.config import Settings
from app.schemas.tutor import TutorAskRequest, TutorAskResponse
from app.services.ai_service import AIService, KnowledgeGenerationError
from app.services.database_service import DatabaseService

logger = logging.getLogger(__name__)

router = APIRouter()


def _segments_from_lecture_row(row: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(row, dict):
        return []
    tr = row.get("transcript")
    if not isinstance(tr, dict):
        return []
    segs = tr.get("segments")
    if not isinstance(segs, list):
        return []
    out: list[dict[str, Any]] = []
    for s in segs:
        if not isinstance(s, dict):
            continue
        out.append(
            {
                "start": float(s.get("start", 0) or 0),
                "end": float(s.get("end", 0) or 0),
                "text": str(s.get("text", "") or "").strip(),
            }
        )
    return out


@router.post(
    "/ask",
    response_model=TutorAskResponse,
    summary="Tutor Q&A grounded in lecture transcript",
    status_code=status.HTTP_200_OK,
)
async def ask_tutor(
    body: TutorAskRequest,
    settings: Annotated[Settings, Depends(get_settings_dep)],
    db: Annotated[DatabaseService, Depends(get_database_service)],
) -> TutorAskResponse:
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing question")

    segs = [s.model_dump() for s in body.segments] if body.segments else []
    video_title: str | None = None

    # If segments not provided, try to load from Supabase.
    if not segs and db.is_configured:
        row: dict[str, Any] | None = None
        if body.lecture_id:
            lookup = db.find_lecture_by_id(body.lecture_id)
            row = lookup.row if lookup.found else None
        elif body.video_url:
            lookup = db.find_lecture_by_source_url(body.video_url)
            row = lookup.row if lookup.found else None
        segs = _segments_from_lecture_row(row)
        if isinstance(row, dict):
            t = row.get("title")
            video_title = t if isinstance(t, str) else None

    if not segs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing transcript segments. Provide segments or lecture_id/video_url.",
        )

    groq_key = settings.groq_api_key
    google_key = settings.google_api_key
    if body.user_id and db.is_configured:
        u_groq, u_google = db.get_user_api_keys(body.user_id)
        groq_key = u_groq or groq_key
        google_key = u_google or google_key

    try:
        svc = AIService(api_key=google_key, groq_api_key=groq_key, provider=settings.ai_provider)
        payload = svc.answer_from_segments(
            question=question,
            segments=segs,
            video_title=video_title,
            max_citations=body.max_citations,
        )
        return TutorAskResponse.model_validate(payload)
    except KnowledgeGenerationError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e
    except Exception as e:
        logger.exception("Tutor ask failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e


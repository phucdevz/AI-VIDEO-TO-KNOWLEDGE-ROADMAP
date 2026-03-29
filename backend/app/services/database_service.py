from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from supabase import Client, create_client

logger = logging.getLogger(__name__)


@dataclass
class LecturePersistResult:
    ok: bool
    lecture_id: str | None
    message: str | None = None


class DatabaseService:
    """
    Persist pipeline output to Supabase `lectures` table.

    Expected columns (adjust in Supabase to match):
    - video_id: text (unique)
    - title: text (nullable)
    - source_url: text (nullable)
    - transcript: jsonb
    - flow_data: jsonb
    - quiz_data: jsonb
    - tutor_data: jsonb
    - knowledge_chunks: jsonb
    """

    def __init__(self, supabase_url: str | None, supabase_key: str | None) -> None:
        self._url = (supabase_url or "").strip()
        self._key = (supabase_key or "").strip()
        self._client: Client | None = None
        if self._url and self._key:
            self._client = create_client(self._url, self._key)

    @property
    def is_configured(self) -> bool:
        return self._client is not None

    def save_lecture_pipeline(
        self,
        *,
        video_id: str,
        title: str | None,
        source_url: str,
        transcript_payload: dict[str, Any],
        flow_data: dict[str, Any],
        quiz_data: dict[str, Any],
        tutor_data: dict[str, Any],
        knowledge_chunks: list[dict[str, Any]],
    ) -> LecturePersistResult:
        if not self._client:
            return LecturePersistResult(
                ok=False,
                lecture_id=None,
                message="Supabase not configured (SUPABASE_URL / SUPABASE_KEY)",
            )

        row = {
            "video_id": video_id,
            "title": title,
            "source_url": source_url,
            "transcript": transcript_payload,
            "flow_data": flow_data,
            "quiz_data": quiz_data,
            "tutor_data": tutor_data,
            "knowledge_chunks": knowledge_chunks,
        }

        try:
            # Upsert on video_id — requires UNIQUE(video_id) in Supabase
            res = self._client.table("lectures").upsert(
                row,
                on_conflict="video_id",
            ).execute()
            data = getattr(res, "data", None) or []
            lecture_id = None
            if isinstance(data, list) and data:
                first = data[0]
                if isinstance(first, dict):
                    lecture_id = first.get("id")
                    lecture_id = str(lecture_id) if lecture_id is not None else None
            return LecturePersistResult(ok=True, lecture_id=lecture_id, message=None)
        except Exception as e:
            logger.exception("Supabase upsert failed")
            return LecturePersistResult(ok=False, lecture_id=None, message=str(e))

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


@dataclass
class LectureLookupResult:
    found: bool
    row: dict[str, Any] | None = None
    message: str | None = None


def _row_lecture_complete(row: dict[str, Any]) -> bool:
    """Treat cache as usable only when not mid-pipeline and graph has nodes."""
    if row.get("status") == "processing":
        return False
    flow = row.get("flow_data")
    if not isinstance(flow, dict):
        return False
    nodes = flow.get("nodes")
    return isinstance(nodes, list) and len(nodes) > 0


class DatabaseService:
    """
    Persist pipeline output to Supabase `lectures` table.

    Expected columns (match current Supabase schema):
    - id: text/uuid
    - video_url: text (unique) — YouTube URL
    - title: text (nullable)
    - transcript: jsonb
    - flow_data: jsonb
    - quiz: jsonb
    - summary: text
    - created_at: timestamptz
    - status: text (optional) — 'processing' | 'ready'
    - user_id: uuid (optional) — links to auth.users for RLS
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

    def get_user_api_keys(self, user_id: str) -> tuple[str | None, str | None]:
        """
        Load per-user API keys from Supabase `user_preferences.prefs`.

        Expected JSON keys (frontend Settings):
        - groq_api_key
        - google_api_key

        Returns (groq_api_key, google_api_key). Any missing/invalid entries return None.
        """
        if not self._client:
            return (None, None)
        uid = (user_id or "").strip()
        if not uid:
            return (None, None)
        try:
            res = (
                self._client.table("user_preferences")
                .select("prefs")
                .eq("user_id", uid)
                .limit(1)
                .execute()
            )
            data = getattr(res, "data", None) or []
            if not isinstance(data, list) or not data or not isinstance(data[0], dict):
                return (None, None)
            prefs = data[0].get("prefs")
            if not isinstance(prefs, dict):
                return (None, None)
            groq = prefs.get("groq_api_key")
            google = prefs.get("google_api_key")
            groq_key = groq.strip() if isinstance(groq, str) and groq.strip() else None
            google_key = google.strip() if isinstance(google, str) and google.strip() else None
            return (groq_key, google_key)
        except Exception:
            # Don't hard-fail pipeline if prefs table / row is missing.
            logger.exception("Supabase user_preferences lookup failed (user_id=%s)", uid)
            return (None, None)

    def find_lecture_by_source_url(self, source_url: str) -> LectureLookupResult:
        """Return stored lecture only when pipeline finished (ready graph)."""
        if not self._client:
            return LectureLookupResult(found=False, row=None, message="Supabase not configured")
        try:
            res = (
                self._client.table("lectures")
                .select(
                    "id, video_url, title, transcript, flow_data, quiz, summary, tutor_data, created_at",
                )
                # Schema uses `video_url` (not `source_url`).
                .eq("video_url", source_url)
                .limit(1)
                .execute()
            )
            data = getattr(res, "data", None) or []
            if isinstance(data, list) and data and isinstance(data[0], dict):
                row = data[0]
                if _row_lecture_complete(row):
                    return LectureLookupResult(found=True, row=row, message=None)
            return LectureLookupResult(found=False, row=None, message=None)
        except Exception:
            logger.exception("Supabase lookup by source_url failed")
            return LectureLookupResult(found=False, row=None, message="lookup failed")

    def find_lecture_by_id(self, lecture_id: str) -> LectureLookupResult:
        """Lookup lecture by id. Returns raw row (may be processing)."""
        if not self._client:
            return LectureLookupResult(found=False, row=None, message="Supabase not configured")
        lid = (lecture_id or "").strip()
        if not lid:
            return LectureLookupResult(found=False, row=None, message="missing lecture_id")
        try:
            res = (
                self._client.table("lectures")
                .select("id, video_url, title, transcript, quiz, quiz_data, created_at")
                .eq("id", lid)
                .limit(1)
                .execute()
            )
            data = getattr(res, "data", None) or []
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return LectureLookupResult(found=True, row=data[0], message=None)
            return LectureLookupResult(found=False, row=None, message=None)
        except Exception:
            logger.exception("Supabase lookup by id failed (id=%s)", lid)
            return LectureLookupResult(found=False, row=None, message="lookup failed")

    def _upsert_row(self, row: dict[str, Any], *, strip_knowledge_chunks: bool = False) -> LecturePersistResult:
        if not self._client:
            return LecturePersistResult(
                ok=False,
                lecture_id=None,
                message="Supabase not configured (SUPABASE_URL / SUPABASE_KEY)",
            )
        payload = dict(row)
        if strip_knowledge_chunks:
            payload.pop("knowledge_chunks", None)
        try:
            res = self._client.table("lectures").upsert(
                payload,
                on_conflict="video_url",
            ).execute()
            data = getattr(res, "data", None) or []
            lecture_id = None
            if isinstance(data, list) and data:
                first = data[0]
                if isinstance(first, dict):
                    lid = first.get("id")
                    lecture_id = str(lid) if lid is not None else None
            return LecturePersistResult(ok=True, lecture_id=lecture_id, message=None)
        except Exception as e:
            msg = str(e)

            # Postgres 42P10: ON CONFLICT requires a UNIQUE/EXCLUDE constraint.
            # If schema doesn't enforce uniqueness on video_url yet, fallback to:
            # - SELECT id by video_url
            # - UPDATE by id if found, else INSERT.
            if "42P10" in msg or "no unique or exclusion constraint" in msg.lower():
                try:
                    video_url = payload.get("video_url")
                    if not isinstance(video_url, str) or not video_url.strip():
                        return LecturePersistResult(ok=False, lecture_id=None, message="missing video_url for persist")

                    lookup = (
                        self._client.table("lectures")
                        .select("id")
                        .eq("video_url", video_url)
                        .limit(1)
                        .execute()
                    )
                    rows = getattr(lookup, "data", None) or []
                    existing_id = None
                    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
                        existing_id = rows[0].get("id")

                    if existing_id is not None:
                        res2 = (
                            self._client.table("lectures")
                            .update(payload)
                            .eq("id", existing_id)
                            .execute()
                        )
                    else:
                        res2 = self._client.table("lectures").insert(payload).execute()

                    data2 = getattr(res2, "data", None) or []
                    lecture_id = None
                    if isinstance(data2, list) and data2 and isinstance(data2[0], dict):
                        lid = data2[0].get("id")
                        lecture_id = str(lid) if lid is not None else None
                    return LecturePersistResult(ok=True, lecture_id=lecture_id, message=None)
                except Exception:
                    logger.exception("Supabase fallback insert/update failed")
                    return LecturePersistResult(ok=False, lecture_id=None, message=msg)

            if not strip_knowledge_chunks and "knowledge_chunks" in msg and "PGRST" in msg:
                logger.warning("Retrying Supabase upsert without knowledge_chunks")
                return self._upsert_row(row, strip_knowledge_chunks=True)
            logger.exception("Supabase upsert failed")
            return LecturePersistResult(ok=False, lecture_id=None, message=msg)

    def upsert_processing_placeholder(
        self,
        *,
        video_id: str,
        title: str | None,
        source_url: str,
        user_id: str | None = None,
    ) -> LecturePersistResult:
        """
        Upsert a minimal row with status=processing so Supabase Realtime clients
        can show a library card before transcription/AI finish.
        Falls back without optional columns if schema differs.
        """
        if not self._client:
            return LecturePersistResult(ok=False, lecture_id=None, message="Supabase not configured")

        # Supabase schema uses `video_url` as the unique key.
        base: dict[str, Any] = {
            "video_url": source_url,
            "title": title,
            "transcript": {},
            "flow_data": {"nodes": [], "edges": []},
            "quiz": {"questions": []},
            "summary": "",
        }
        candidates = []
        with_status_user = {**base, "status": "processing"}
        if user_id:
            with_status_user = {**with_status_user, "user_id": user_id}
        candidates.append(with_status_user)
        candidates.append({**base, "status": "processing"})
        candidates.append(base)

        last_err: str | None = None
        for cand in candidates:
            res = self._upsert_row(cand)
            if res.ok:
                return res
            last_err = res.message
            err = (last_err or "").lower()
            if "user_id" in err or "status" in err:
                continue
            break
        return LecturePersistResult(ok=False, lecture_id=None, message=last_err)

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
        status: str = "ready",
        user_id: str | None = None,
    ) -> LecturePersistResult:
        if not self._client:
            return LecturePersistResult(
                ok=False,
                lecture_id=None,
                message="Supabase not configured (SUPABASE_URL / SUPABASE_KEY)",
            )

        # Match current schema: `video_url`, `quiz`, `summary`.
        row: dict[str, Any] = {
            "video_url": source_url,
            "title": title,
            "transcript": transcript_payload,
            "flow_data": flow_data,
            "quiz": quiz_data,
            "summary": str(tutor_data.get("summary") or "") if isinstance(tutor_data, dict) else "",
        }
        # Optional/legacy columns (present in some Supabase schemas).
        if isinstance(tutor_data, dict):
            row["tutor_data"] = tutor_data
        row["quiz_data"] = quiz_data
        row["status"] = status
        if user_id:
            row["user_id"] = user_id

        res = self._upsert_row(row)
        if res.ok:
            return res

        err = (res.message or "").lower()
        # If schema doesn't have these optional columns, retry without them.
        if "tutor_data" in err:
            row.pop("tutor_data", None)
            res2 = self._upsert_row(row)
            if res2.ok:
                return res2
            err = (res2.message or "").lower()
        if "quiz_data" in err:
            row.pop("quiz_data", None)
            res3 = self._upsert_row(row)
            if res3.ok:
                return res3
            err = (res3.message or "").lower()
        if user_id and ("user_id" in err or "foreign" in err):
            return self._upsert_row({k: v for k, v in row.items() if k != "user_id"})
        if "status" in err:
            row_no_status = {k: v for k, v in row.items() if k != "status"}
            return self._upsert_row(row_no_status)
        return res

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_WHISPER_MODEL = "whisper-large-v3"


class TranscriptionError(Exception):
    """Raised when Groq Whisper fails or returns an unusable payload."""


@dataclass
class TranscriptSegment:
    """Single timed segment from Whisper verbose_json."""

    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    """Full transcription with segment-level timestamps for pipeline / RAG."""

    text: str
    language: str | None
    duration: float | None
    segments: list[TranscriptSegment] = field(default_factory=list)
    raw_verbose: dict = field(default_factory=dict)


class TranscriptionService:
    """Send audio to Groq Cloud (Whisper large v3) with verbose_json + segment timestamps."""

    def __init__(self, api_key: str) -> None:
        if not api_key or not api_key.strip():
            raise TranscriptionError("GROQ_API_KEY is not set")
        self._client = Groq(api_key=api_key.strip())

    def transcribe_file(self, audio_path: Path) -> TranscriptionResult:
        path = audio_path.resolve()
        if not path.is_file():
            raise TranscriptionError(f"Audio file not found: {path}")

        try:
            with path.open("rb") as audio_file:
                completion = self._client.audio.transcriptions.create(
                    file=(path.name, audio_file.read()),
                    model=GROQ_WHISPER_MODEL,
                    response_format="verbose_json",
                    temperature=0.0,
                    timestamp_granularities=["segment"],
                )
        except Exception as e:
            logger.exception("Groq transcription request failed")
            raise TranscriptionError(f"Groq transcription failed: {e}") from e

        payload = self._completion_to_dict(completion)
        segments_raw = payload.get("segments") or []
        segments: list[TranscriptSegment] = []
        for seg in segments_raw:
            if not isinstance(seg, dict):
                continue
            try:
                start = float(seg.get("start", 0))
                end = float(seg.get("end", 0))
                text = str(seg.get("text", "")).strip()
            except (TypeError, ValueError):
                continue
            if text:
                segments.append(TranscriptSegment(start=start, end=end, text=text))

        full_text = str(payload.get("text") or "").strip()
        if not full_text and segments:
            full_text = " ".join(s.text for s in segments)

        language = payload.get("language")
        language_str = str(language) if language is not None else None

        duration = payload.get("duration")
        try:
            duration_f = float(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration_f = None
        if duration_f is None and segments:
            duration_f = max(s.end for s in segments)

        return TranscriptionResult(
            text=full_text,
            language=language_str,
            duration=duration_f,
            segments=segments,
            raw_verbose=payload,
        )

    @staticmethod
    def _completion_to_dict(completion: object) -> dict:
        if isinstance(completion, dict):
            return completion
        if hasattr(completion, "model_dump"):
            return completion.model_dump()  # type: ignore[no-any-return]
        if hasattr(completion, "model_dump_json"):
            return json.loads(completion.model_dump_json())  # type: ignore[no-any-return]
        if hasattr(completion, "dict"):
            return completion.dict()  # type: ignore[no-any-return]
        if hasattr(completion, "json"):
            raw = completion.json()
            if isinstance(raw, str):
                return json.loads(raw)
        raise TranscriptionError("Unexpected Groq transcription response type")

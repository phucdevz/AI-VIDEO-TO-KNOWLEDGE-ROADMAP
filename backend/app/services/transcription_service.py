from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
import subprocess
import tempfile

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_WHISPER_MODEL = "whisper-large-v3"
_MAX_GROQ_AUDIO_BYTES = 24 * 1024 * 1024  # keep under typical 25MB limits
_CHUNK_SECONDS = 10 * 60  # 10 minutes


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

        # If file is too large for Groq Whisper, transcode and/or chunk automatically.
        try:
            size = path.stat().st_size
        except OSError:
            size = 0

        if size > _MAX_GROQ_AUDIO_BYTES:
            try:
                return self._transcribe_large_file(path)
            except Exception as e:
                logger.exception("Large-audio transcription fallback failed")
                raise TranscriptionError(f"Groq transcription failed (large audio): {e}") from e

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

    def _transcribe_large_file(self, path: Path) -> TranscriptionResult:
        """
        413 Request Entity Too Large workaround:
        - Transcode to a small mono mp3 (16kHz, low bitrate)
        - If still too large, split into chunks and merge (timestamps offset).
        """
        tmp_root = Path(tempfile.mkdtemp(prefix="etherai-transcribe-"))
        mp3_path = tmp_root / f"{path.stem}.mono16k.48k.mp3"

        # Transcode to reduce size drastically.
        self._run_ffmpeg(
            [
                "-y",
                "-i",
                str(path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "48k",
                str(mp3_path),
            ]
        )

        try:
            if mp3_path.is_file() and mp3_path.stat().st_size <= _MAX_GROQ_AUDIO_BYTES:
                return self.transcribe_file(mp3_path)
        except OSError:
            pass

        # Still too large → split into chunks.
        chunk_pattern = str(tmp_root / "chunk-%03d.mp3")
        self._run_ffmpeg(
            [
                "-y",
                "-i",
                str(mp3_path if mp3_path.is_file() else path),
                "-f",
                "segment",
                "-segment_time",
                str(_CHUNK_SECONDS),
                "-reset_timestamps",
                "1",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "48k",
                chunk_pattern,
            ]
        )

        chunks = sorted(tmp_root.glob("chunk-*.mp3"))
        if not chunks:
            raise TranscriptionError("Failed to split audio into chunks (ffmpeg produced no outputs)")

        merged_segments: list[TranscriptSegment] = []
        merged_text_parts: list[str] = []
        merged_lang: str | None = None
        merged_duration = 0.0
        raw_chunks: list[dict] = []

        offset = 0.0
        for i, ch in enumerate(chunks):
            # If any chunk still breaches limits, fail fast with a clear message.
            try:
                if ch.stat().st_size > _MAX_GROQ_AUDIO_BYTES:
                    raise TranscriptionError(
                        f"Audio chunk too large for Groq ({ch.stat().st_size} bytes). "
                        f"Try lowering bitrate or smaller chunk size."
                    )
            except OSError:
                pass

            r = self.transcribe_file(ch)
            if merged_lang is None and r.language:
                merged_lang = r.language

            for seg in r.segments:
                merged_segments.append(
                    TranscriptSegment(
                        start=seg.start + offset,
                        end=seg.end + offset,
                        text=seg.text,
                    )
                )

            if r.text.strip():
                merged_text_parts.append(r.text.strip())

            # Prefer model duration if present; else infer from segments.
            chunk_dur = 0.0
            if isinstance(r.duration, (int, float)) and r.duration:
                chunk_dur = float(r.duration)
            elif r.segments:
                chunk_dur = max(s.end for s in r.segments)
            offset += max(0.0, chunk_dur)
            merged_duration = offset
            raw_chunks.append(
                {
                    "chunk_index": i,
                    "chunk_file": ch.name,
                    "offset_seconds": offset - chunk_dur,
                    "payload": r.raw_verbose,
                }
            )

        merged_text = "\n\n".join(merged_text_parts).strip()
        if not merged_text and merged_segments:
            merged_text = " ".join(s.text for s in merged_segments).strip()

        return TranscriptionResult(
            text=merged_text,
            language=merged_lang,
            duration=merged_duration if merged_duration > 0 else None,
            segments=merged_segments,
            raw_verbose={"chunks": raw_chunks},
        )

    @staticmethod
    def _run_ffmpeg(args: list[str]) -> None:
        """
        Runs ffmpeg. Tries PATH first, then falls back to a bundled ffmpeg via imageio-ffmpeg.
        """
        ffmpeg_exe = "ffmpeg"
        try:
            # imageio-ffmpeg provides a portable binary on Windows/macOS/Linux.
            import imageio_ffmpeg  # type: ignore

            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            # Keep PATH fallback.
            ffmpeg_exe = "ffmpeg"

        cmd = [ffmpeg_exe, *args]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError as e:
            raise TranscriptionError(
                "ffmpeg not found. Install ffmpeg or run: pip install imageio-ffmpeg "
                "(recommended for Windows)."
            ) from e
        except subprocess.CalledProcessError as e:
            raise TranscriptionError("ffmpeg failed to process audio for transcription.") from e

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

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import yt_dlp

logger = logging.getLogger(__name__)


class AudioExtractionError(Exception):
    """Raised when yt-dlp cannot download or resolve audio for the URL."""


@dataclass(frozen=True)
class AudioExtractionResult:
    video_id: str
    title: str | None
    duration_seconds: float | None
    audio_path: Path


class AudioExtractionService:
    """Download best-quality audio-only stream via yt-dlp (YouTube and other supported sites)."""

    def __init__(self, output_dir: Path) -> None:
        self._output_dir = output_dir

    def extract(self, url: str) -> AudioExtractionResult:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        outtmpl = str(self._output_dir / "%(id)s.%(ext)s")

        ydl_opts: dict = {
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            # Prefer a single file without merging when possible (merging requires FFmpeg).
            "prefer_free_formats": False,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if not isinstance(info, dict):
                    raise AudioExtractionError("Could not resolve video metadata")

                video_id = str(info.get("id") or "")
                if not video_id:
                    raise AudioExtractionError("Missing video id in yt-dlp response")

                audio_path = Path(ydl.prepare_filename(info))
                if not audio_path.is_file():
                    raise AudioExtractionError(f"Expected audio file not found: {audio_path}")

                title = info.get("title")
                title_str = str(title) if title is not None else None

                duration = info.get("duration")
                duration_seconds = float(duration) if duration is not None else None

                return AudioExtractionResult(
                    video_id=video_id,
                    title=title_str,
                    duration_seconds=duration_seconds,
                    audio_path=audio_path.resolve(),
                )
        except AudioExtractionError:
            raise
        except yt_dlp.utils.DownloadError as e:
            logger.warning("yt-dlp download failed: %s", e)
            raise AudioExtractionError(str(e)) from e
        except Exception as e:  # pragma: no cover - defensive
            logger.exception("Unexpected error during audio extraction")
            raise AudioExtractionError(f"Audio extraction failed: {e}") from e

"""
Local `backend/storage/` maintenance for the Admin panel.

Never deletes `admin_prompt_overrides.json` from bulk actions (prompt overrides live there).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

def storage_root() -> Path:
    return Path(__file__).resolve().parent.parent / "storage"


def _human_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    for unit, div in (("KB", 1024), ("MB", 1024**2), ("GB", 1024**3)):
        if n < div * 1024:
            return f"{n / div:.1f} {unit}"
    return f"{n / (1024**3):.2f} GB"


def dir_size(path: Path) -> int:
    total = 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    if not path.is_dir():
        return 0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def storage_stats_markdown() -> str:
    """Summary of disk use under `storage/` for Admin UI."""
    root = storage_root()
    temp = root / "temp"
    audio = temp / "audio"
    overrides = root / "admin_prompt_overrides.json"

    lines = [
        "### Local storage (`backend/storage/`)",
        "",
        f"| Path | Size |",
        f"|------|------|",
        f"| **Total** `{root.name}/` | {_human_bytes(dir_size(root))} |",
        f"| `temp/` | {_human_bytes(dir_size(temp))} |",
        f"| `temp/audio/` | {_human_bytes(dir_size(audio))} |",
    ]
    if overrides.is_file():
        try:
            lines.append(f"| `admin_prompt_overrides.json` | {_human_bytes(overrides.stat().st_size)} |")
        except OSError:
            lines.append("| `admin_prompt_overrides.json` | — |")
    else:
        lines.append("| `admin_prompt_overrides.json` | _(chưa có)_ |")

    lines.extend(
        [
            "",
            "_Bulk clear chỉ xóa nội dung trong `temp/` — **không** xóa file prompt overrides._",
        ],
    )
    return "\n".join(lines)


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _empty_directory(path: Path) -> tuple[int, int]:
    """
    Remove all children of `path` (files and subdirs). Keeps `path` itself.
    Returns (entry_count_removed, bytes_freed).
    """
    if not path.exists():
        _ensure_dir(path)
        return 0, 0
    freed = dir_size(path)
    count = 0
    for child in list(path.iterdir()):
        try:
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)
            count += 1
        except Exception as e:
            logger.warning("Could not remove %s: %s", child, e)
    _ensure_dir(path)
    return count, freed


def clear_temp_audio() -> str:
    """Empty `storage/temp/audio` (pipeline temp audio)."""
    audio = storage_root() / "temp" / "audio"
    n, freed = _empty_directory(audio)
    return (
        f"Đã xóa nội dung **`temp/audio/`** — {n} mục, giải phóng ~{_human_bytes(freed)}. "
        "Thư mục đã được tạo lại (rỗng)."
    )


def clear_all_temp() -> str:
    """
    Empty everything under `storage/temp/` (exports CSV/PDF, audio, any cache).
    Does not touch `admin_prompt_overrides.json` at storage root.
    """
    temp = storage_root() / "temp"
    n, freed = _empty_directory(temp)
    # Restore expected subdirs for pipeline
    _ensure_dir(temp / "audio")
    return (
        f"Đã xóa toàn bộ nội dung **`temp/`** — {n} mục cấp trên (gồm cả thư mục con), "
        f"~{_human_bytes(freed)}. Đã tạo lại `temp/audio/` rỗng. "
        "**`admin_prompt_overrides.json`** không bị đụng tới."
    )

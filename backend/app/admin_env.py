"""Read/write backend `.env` and reload pydantic Settings."""

from __future__ import annotations

import re
from pathlib import Path

from app.config import get_settings

_ENV_KEYS = (
    "GROQ_API_KEY",
    "GOOGLE_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "AI_PROVIDER",
)


def backend_root() -> Path:
    return Path(__file__).resolve().parent.parent


def env_file_path() -> Path:
    return backend_root() / ".env"


def read_env_values() -> dict[str, str]:
    path = env_file_path()
    out = {k: "" for k in _ENV_KEYS}
    if not path.is_file():
        return out
    text = path.read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1).upper(), m.group(2).strip()
        # Strip optional quotes
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        if key in out:
            out[key] = val
    return out


def write_env_updates(updates: dict[str, str]) -> None:
    """Merge updates into `.env`, preserving unrelated lines and comments."""
    path = env_file_path()
    keys_upper = {k.upper(): v for k, v in updates.items()}

    existing_lines: list[str] = []
    if path.is_file():
        existing_lines = path.read_text(encoding="utf-8").splitlines()

    seen: set[str] = set()
    new_lines: list[str] = []

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
        if not m:
            new_lines.append(line)
            continue
        k = m.group(1).upper()
        if k in keys_upper:
            val = keys_upper[k]
            new_lines.append(f"{k}={val}")
            seen.add(k)
        else:
            new_lines.append(line)

    for k, v in keys_upper.items():
        if k not in seen:
            new_lines.append(f"{k}={v}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def reload_app_settings() -> None:
    get_settings.cache_clear()

"""Persist optional AI prompt overrides for admin (JSON file, no restart required per read)."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

_lock = threading.Lock()

_DEFAULT: dict[str, str] = {
    "risen_knowledge_append": "",
    "refinement_append": "",
    "timeline_rules_override": "",
    "tutor_qa_append": "",
}


def _store_path() -> Path:
    return Path(__file__).resolve().parent.parent / "storage" / "admin_prompt_overrides.json"


def default_prompt_overrides() -> dict[str, str]:
    return dict(_DEFAULT)


def load_prompt_overrides() -> dict[str, str]:
    """Merge file content with defaults; invalid keys ignored."""
    path = _store_path()
    out = dict(_DEFAULT)
    if not path.is_file():
        return out
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return out
    if not isinstance(raw, dict):
        return out
    for k in _DEFAULT:
        v = raw.get(k)
        if isinstance(v, str):
            out[k] = v
    return out


def save_prompt_overrides(updates: dict[str, Any]) -> None:
    """Write merged overrides (only known string keys)."""
    current = load_prompt_overrides()
    for k in _DEFAULT:
        if k in updates and isinstance(updates[k], str):
            current[k] = updates[k]
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(current, ensure_ascii=False, indent=2) + "\n"
    with _lock:
        path.write_text(text, encoding="utf-8")

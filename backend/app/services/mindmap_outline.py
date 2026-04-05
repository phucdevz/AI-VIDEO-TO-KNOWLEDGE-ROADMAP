"""
Phase-1 video outline: split timeline into main content blocks before mindmap node extraction.

Used only for longer recordings to guide react_flow; short clips skip this call.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

logger = logging.getLogger(__name__)

# Second LLM call only when video is long enough to benefit (saves latency/cost).
MIN_DURATION_SECONDS = 180.0
# Cap segments sent into outline prompt (first N lines are usually enough for structure).
MAX_OUTLINE_SEGMENT_LINES = 88


def _target_lang_name(code: str) -> str:
    c = (code or "vi").strip().lower()
    return "Vietnamese" if c == "vi" else "English"


def build_video_outline_prompt(
    *,
    video_title: str | None,
    duration_s: float,
    target_lang_code: str,
    segment_lines: list[str],
) -> str:
    """Compact prompt — JSON only."""
    lang = _target_lang_name(target_lang_code)
    lines = segment_lines[:MAX_OUTLINE_SEGMENT_LINES]
    if len(segment_lines) > len(lines):
        lines = list(lines) + [f"... ({len(segment_lines) - len(lines)} more segment lines omitted)"]

    return f"""=== ROLE ===
You segment a **recorded lecture video** into **main content blocks** on the timeline (like chapters). This is **phase 1**; a later step will build a mindmap **inside** each block.

=== TASK ===
Return **exactly one** JSON object, no markdown or code fences:

{{
  "blocks": [
    {{ "id": "b1", "title": "short chapter title in {lang}", "start_seconds": 0, "end_seconds": 120 }},
    ...
  ]
}}

=== RULES ===
- Total video length: **{duration_s:.1f} seconds** (~{duration_s / 60.0:.1f} minutes). Block ranges must lie in **[0, {duration_s:.1f}]**.
- **3–14 blocks** depending on length: short videos → fewer blocks; long dense lectures → more distinct sections.
- Blocks should be **contiguous in time** (cover the arc); small gaps (<15s) are OK. **Do not** assign overlapping ranges; if unsure, use adjacent ranges.
- **title**: specific theme for that segment (not generic "Phần 1" unless unavoidable).
- **id**: stable strings `b1`, `b2`, ... (unique).
- Use the segment lines below only to infer **where** topics shift — titles must reflect **real** content.

=== VIDEO ===
Title: {video_title or "unknown"}

**Segment timeline (evidence):**
{chr(10).join(lines)}

=== OUTPUT ===
JSON only.
"""


def normalize_outline_blocks(raw: Any, *, duration_s: float) -> list[dict[str, Any]] | None:
    """Validate and fix ordering; returns None if unusable."""
    if not isinstance(raw, list) or len(raw) == 0:
        return None
    if not math.isfinite(duration_s) or duration_s <= 0:
        return None

    out: list[dict[str, Any]] = []
    for i, b in enumerate(raw):
        if not isinstance(b, dict):
            continue
        bid = str(b.get("id") or "").strip() or f"b{i + 1}"
        title = str(b.get("title") or "").strip() or f"Block {i + 1}"
        try:
            st = float(b.get("start_seconds", 0))
            en = float(b.get("end_seconds", 0))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(st) or not math.isfinite(en):
            continue
        st = max(0.0, min(st, duration_s))
        en = max(st, min(en, duration_s))
        if en - st < 3.0 and duration_s > 120:
            # skip ultra-tiny slivers unless whole video is short
            continue
        out.append({"id": bid, "title": title, "start_seconds": st, "end_seconds": en})

    if not out:
        return None

    out.sort(key=lambda x: float(x["start_seconds"]))

    # De-overlap: later block starts at least previous end (small epsilon)
    eps = 0.5
    for i in range(1, len(out)):
        prev = out[i - 1]
        cur = out[i]
        if float(cur["start_seconds"]) < float(prev["end_seconds"]) - eps:
            # push current start to previous end
            cur["start_seconds"] = min(float(prev["end_seconds"]), duration_s)
        if float(cur["end_seconds"]) <= float(cur["start_seconds"]):
            cur["end_seconds"] = min(duration_s, float(cur["start_seconds"]) + 30.0)

    # Ensure last block reaches near end
    out[-1]["end_seconds"] = min(duration_s, max(float(out[-1]["end_seconds"]), float(out[-1]["start_seconds"]) + 5.0))

    return out


def outline_to_prompt_section(blocks: list[dict[str, Any]], *, duration_s: float) -> str:
    """Markdown section injected into the main RISEN knowledge prompt."""
    lines: list[str] = [
        "=== VIDEO STRUCTURE (phase 1 — **follow this plan** for the mindmap) ===",
        "",
        "The lecture was split into **main content blocks** on the timeline. You must:",
        "- Place neural nodes so each important idea’s `data.timestamp` falls in the correct block’s **[start_seconds, end_seconds]**.",
        "- Include **optional** `data.block_id` on each node (string, same as the block `id`) so the UI can group by section.",
        "- Aim for **several nodes per block** when that block contains multiple distinct ideas (not one node per block only, unless the block is trivial).",
        "- Use edges to connect ideas **within** a block and **between** blocks when there is a real dependency.",
        "",
        f"**Total duration:** {duration_s:.1f}s. **Blocks:**",
        "",
    ]
    for b in blocks:
        st = float(b["start_seconds"])
        en = float(b["end_seconds"])
        m0, s0 = divmod(int(st), 60)
        m1, s1 = divmod(int(en), 60)
        lines.append(
            f"- **`{b['id']}`** [{m0:02d}:{s0:02d} – {m1:02d}:{s1:02d}] — {b['title']}",
        )
    lines.append("")
    lines.append("_If a node’s topic clearly belongs to a block, set `data.block_id` and keep `timestamp` inside that block’s range._")
    return "\n".join(lines)


def parse_outline_payload(payload: dict[str, Any], *, duration_s: float) -> list[dict[str, Any]] | None:
    blocks = payload.get("blocks")
    return normalize_outline_blocks(blocks, duration_s=duration_s)

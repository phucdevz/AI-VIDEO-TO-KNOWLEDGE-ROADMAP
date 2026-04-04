"""
Post-process AI mindmaps so nodes are not clustered in the first ~10 minutes with a jump to "conclusion".

Fills empty **middle timeline quartiles** using transcript segments (same schema as AIService validation).
"""

from __future__ import annotations

import copy
import logging
import math
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_MIN_DURATION_S = 600.0  # 10 min — below this, skip (short clips)
# Middle two quartiles (25–50%, 50–75%) are where models often leave gaps.
_MIDDLE_QUARTILES = (1, 2)


def _infer_duration(duration: float | None, segments: list[dict[str, Any]]) -> float | None:
    if duration is not None and isinstance(duration, (int, float)) and float(duration) > 0:
        return float(duration)
    if not segments:
        return None
    try:
        return max(float(s.get("end", 0) or 0) for s in segments if isinstance(s, dict))
    except (TypeError, ValueError):
        return None


def _node_timestamp(n: dict[str, Any]) -> float | None:
    if not isinstance(n, dict) or n.get("type") != "neural":
        return None
    data = n.get("data")
    if not isinstance(data, dict):
        return None
    try:
        ts = float(data.get("timestamp", 0))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(ts):
        return None
    return ts


def _quartile_counts(nodes: list[dict[str, Any]], dur: float) -> list[int]:
    counts = [0, 0, 0, 0]
    for n in nodes:
        ts = _node_timestamp(n)
        if ts is None or ts < 0:
            continue
        # Map [0, dur) into 4 bins; cap edge at 3
        if dur <= 0:
            continue
        r = min(0.999999, max(0.0, ts / dur))
        q = min(3, int(r * 4))
        counts[q] += 1
    return counts


def _pick_segment_in_range(
    segments: list[dict[str, Any]],
    lo: float,
    hi: float,
) -> tuple[str, float, float] | None:
    """Returns (label, start, end) from best overlapping segment, preferring longer text."""
    best: tuple[float, str, float, float] | None = None
    for s in segments:
        if not isinstance(s, dict):
            continue
        try:
            st = float(s.get("start", 0))
            en = float(s.get("end", 0))
        except (TypeError, ValueError):
            continue
        tx = str(s.get("text", "") or "").strip()
        if not tx or en <= st:
            continue
        mid = (st + en) / 2.0
        overlaps = st < hi and en > lo
        in_mid = lo <= mid < hi
        if not (overlaps or in_mid):
            continue
        span = en - st
        cand = (span, tx[:140], st, en)
        if best is None or span > best[0]:
            best = cand
    if best is None:
        return None
    _, label, st, en = best
    return (label, st, en)


def _max_xy(nodes: list[dict[str, Any]]) -> tuple[float, float]:
    mx = 0.0
    my = 0.0
    for n in nodes:
        if not isinstance(n, dict):
            continue
        pos = n.get("position")
        if not isinstance(pos, dict):
            continue
        try:
            mx = max(mx, float(pos.get("x", 0)))
            my = max(my, float(pos.get("y", 0)))
        except (TypeError, ValueError):
            pass
    return mx, my


def ensure_react_flow_timeline_coverage(
    react_flow: dict[str, Any],
    *,
    segments: list[dict[str, Any]],
    duration: float | None,
) -> dict[str, Any]:
    """
    If the model left middle quartiles (25–75% of duration) empty, inject neural nodes from transcript.

    Does not remove or rewrite AI nodes — only appends nodes/edges so Deep Time-linking reaches mid-lecture content.
    """
    if not isinstance(react_flow, dict):
        return react_flow
    out = copy.deepcopy(react_flow)
    nodes = out.get("nodes")
    edges = out.get("edges")
    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []

    dur = _infer_duration(duration, segments)
    if dur is None or dur < _MIN_DURATION_S:
        out["nodes"] = nodes
        out["edges"] = edges
        return out

    counts = _quartile_counts(nodes, dur)
    needed: list[tuple[int, float, float]] = []  # (quartile_index, lo, hi)
    for q in _MIDDLE_QUARTILES:
        lo = (q / 4.0) * dur
        hi = ((q + 1) / 4.0) * dur if q < 3 else dur
        if counts[q] == 0:
            needed.append((q, lo, hi))
            logger.info(
                "Mindmap timeline guard: quartile %s (%.1fs–%.1fs) has 0 nodes; will inject anchor from transcript",
                q,
                lo,
                hi,
            )

    if not needed:
        out["nodes"] = nodes
        out["edges"] = edges
        return out

    existing_ids = {
        str(n.get("id"))
        for n in nodes
        if isinstance(n, dict) and isinstance(n.get("id"), str) and n.get("id")
    }
    max_x, max_y = _max_xy([n for n in nodes if isinstance(n, dict)])

    new_nodes: list[dict[str, Any]] = []
    new_edges: list[dict[str, Any]] = []

    for idx, (q, lo, hi) in enumerate(needed):
        picked = _pick_segment_in_range(segments, lo, hi)
        if picked is None:
            logger.warning("Mindmap timeline guard: no transcript segment for quartile %s — skip", q)
            continue
        label, st, _en = picked
        nid = f"tl-anchor-{uuid.uuid4().hex[:12]}"
        while nid in existing_ids:
            nid = f"tl-anchor-{uuid.uuid4().hex[:12]}"
        existing_ids.add(nid)

        x = max_x + 260.0 + float(idx) * 40.0
        y = 120.0 + float(q) * 95.0
        max_x = max(max_x, x)
        max_y = max(max_y, y)

        new_nodes.append(
            {
                "id": nid,
                "type": "neural",
                "position": {"x": x, "y": y},
                "data": {
                    "label": label,
                    "timestamp": float(st),
                },
            },
        )

        eid = f"e-tl-{uuid.uuid4().hex[:10]}"
        # Prefer linking to the chronologically previous neural node if any exists
        timed: list[tuple[float, str]] = []
        for n in nodes + new_nodes[:-1]:
            if not isinstance(n, dict):
                continue
            ts = _node_timestamp(n)
            iid = n.get("id")
            if ts is not None and isinstance(iid, str) and iid.strip():
                timed.append((ts, iid))
        timed.sort(key=lambda t: t[0])
        src_id: str | None = None
        for ts, iid in reversed(timed):
            if ts < st:
                src_id = iid
                break
        if src_id is None and timed:
            src_id = timed[0][1]

        if src_id:
            new_edges.append(
                {
                    "id": eid,
                    "source": src_id,
                    "target": nid,
                    "type": "neuralFlow",
                },
            )

    if not new_nodes:
        out["nodes"] = nodes
        out["edges"] = edges
        return out

    out["nodes"] = nodes + new_nodes
    out["edges"] = edges + new_edges
    logger.info("Mindmap timeline guard: added %s anchor node(s) for empty middle quartiles", len(new_nodes))
    return out

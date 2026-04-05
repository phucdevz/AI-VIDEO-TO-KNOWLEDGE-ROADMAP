"""
Post-process AI mindmap/tutor output so timestamps align with real ASR segments
and redundant nodes are merged — improves accuracy without a second LLM call.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

logger = logging.getLogger(__name__)

_TOLERANCE_S = 2.0
# If model's timestamp misses segments, snap to nearest segment interior when this close.
_SNAP_NEAR_S = 18.0
# Beyond this distance to any segment span, drop the node (hallucinated time).
_MAX_ORPHAN_DIST_S = 45.0


def _norm_label(s: str) -> str:
    """Normalize for duplicate detection (case + whitespace only; keep Vietnamese)."""
    return " ".join((s or "").lower().strip().split())


def _label_token_set(s: str) -> set[str]:
    t = _norm_label(s)
    return {x for x in re.split(r"[^\w]+", t, flags=re.UNICODE) if len(x) >= 2}


def _label_jaccard(a: str, b: str) -> float:
    sa, sb = _label_token_set(a), _label_token_set(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return float(inter) / float(union) if union else 0.0


def _segment_intervals(segments: list[dict[str, Any]]) -> list[tuple[float, float, dict[str, Any]]]:
    out: list[tuple[float, float, dict[str, Any]]] = []
    for s in segments:
        if not isinstance(s, dict):
            continue
        try:
            st = float(s.get("start", 0))
            en = float(s.get("end", 0))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(st) or not math.isfinite(en) or en <= st:
            continue
        out.append((st, en, s))
    out.sort(key=lambda x: x[0])
    return out


def _dist_to_span(ts: float, st: float, en: float) -> float:
    if st <= ts <= en:
        return 0.0
    if ts < st:
        return st - ts
    return ts - en


def _snap_timestamp(
    ts: float,
    intervals: list[tuple[float, float, dict[str, Any]]],
) -> float | None:
    """Return grounded timestamp in seconds, or None if should drop."""
    if not math.isfinite(ts):
        return None
    if not intervals:
        return ts

    # Inside or touching a segment (± tolerance)
    for st, en, _ in intervals:
        lo, hi = st - _TOLERANCE_S, en + _TOLERANCE_S
        if lo <= ts <= hi:
            return float(min(max(ts, st), en))

    # Nearest segment by distance to [st, en]
    best_d = float("inf")
    best_st, best_en = intervals[0][0], intervals[0][1]
    for st, en, _ in intervals:
        d = _dist_to_span(ts, st, en)
        if d < best_d:
            best_d = d
            best_st, best_en = st, en

    mid = (best_st + best_en) / 2.0
    if best_d <= _SNAP_NEAR_S:
        return float(mid)
    if best_d <= _MAX_ORPHAN_DIST_S:
        logger.debug(
            "Coarse snap timestamp %.2fs → %.2fs (dist %.2fs to nearest segment)",
            ts,
            mid,
            best_d,
        )
        return float(mid)
    logger.debug("Dropping ungrounded timestamp %.2fs (min dist %.2fs)", ts, best_d)
    return None


def _snap_timestamp_force(
    ts: float,
    intervals: list[tuple[float, float, dict[str, Any]]],
) -> float:
    """Snap like _snap_timestamp, but never drop — use nearest segment mid as fallback (for tutor key points)."""
    t = _snap_timestamp(ts, intervals)
    if t is not None:
        return t
    if not intervals:
        return ts
    best_d = float("inf")
    best_st, best_en = intervals[0][0], intervals[0][1]
    for st, en, _ in intervals:
        d = _dist_to_span(ts, st, en)
        if d < best_d:
            best_d = d
            best_st, best_en = st, en
    return float((best_st + best_en) / 2.0)


def enforce_react_flow_grounding(
    react_flow: dict[str, Any],
    segments: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Snap node timestamps into transcript spans; drop orphans; dedupe labels; prune edges.
    Mutates a deep copy only — returns new dict.
    """
    if not isinstance(react_flow, dict):
        return react_flow
    import copy

    original = copy.deepcopy(react_flow)
    out = copy.deepcopy(react_flow)
    nodes = out.get("nodes")
    edges = out.get("edges")
    if not isinstance(nodes, list):
        return out
    if not isinstance(edges, list):
        edges = []

    intervals = _segment_intervals(segments)
    if not intervals:
        return out

    seen_labels: set[str] = set()
    kept: list[dict[str, Any]] = []
    dropped = 0
    deduped = 0
    # (timestamp, node, label) then sort for stable near-duplicate detection
    candidates: list[tuple[float, dict[str, Any], str]] = []

    for n in nodes:
        if not isinstance(n, dict) or n.get("type") != "neural":
            continue
        data = n.get("data")
        if not isinstance(data, dict):
            continue
        lab = str(data.get("label") or "").strip()
        if not lab:
            continue
        try:
            ts = float(data["timestamp"])
        except (KeyError, TypeError, ValueError):
            dropped += 1
            continue
        if not math.isfinite(ts):
            dropped += 1
            continue

        new_ts = _snap_timestamp(ts, intervals)
        if new_ts is None:
            dropped += 1
            continue

        candidates.append((new_ts, n, lab))

    candidates.sort(key=lambda x: x[0])

    kept_labels_for_jaccard: list[tuple[str, float]] = []

    for new_ts, n, lab in candidates:
        data = n.get("data")
        if not isinstance(data, dict):
            continue
        nk = _norm_label(lab)
        if nk and nk in seen_labels:
            deduped += 1
            continue

        sim_dup = False
        for prev_lab, prev_ts in kept_labels_for_jaccard:
            j = _label_jaccard(lab, prev_lab)
            if j >= 0.82:
                sim_dup = True
                break
            if j >= 0.55 and abs(new_ts - prev_ts) < 95.0:
                sim_dup = True
                break
        if sim_dup:
            deduped += 1
            continue

        if nk:
            seen_labels.add(nk)
        kept_labels_for_jaccard.append((lab, new_ts))
        data["timestamp"] = new_ts
        kept.append(n)

    out["nodes"] = kept

    kept_ids = {str(n.get("id")) for n in kept if isinstance(n, dict) and isinstance(n.get("id"), str)}
    pruned_edges: list[dict[str, Any]] = []
    for e in edges:
        if not isinstance(e, dict):
            continue
        src, tgt = e.get("source"), e.get("target")
        if isinstance(src, str) and isinstance(tgt, str) and src in kept_ids and tgt in kept_ids:
            pruned_edges.append(e)
    out["edges"] = pruned_edges

    if dropped or deduped:
        logger.info(
            "Mindmap grounding: kept %s nodes, dropped %s, deduped %s by label",
            len(kept),
            dropped,
            deduped,
        )

    if len(kept) == 0:
        orig_nodes = original.get("nodes")
        if isinstance(orig_nodes, list) and len(orig_nodes) > 0:
            logger.warning("Mindmap grounding: would empty graph; keeping original react_flow")
            return original

    return out


def enforce_tutor_keypoint_timestamps(
    tutor: dict[str, Any],
    segments: list[dict[str, Any]],
) -> dict[str, Any]:
    """Snap tutor.key_points[*].timestamp_seconds to valid transcript windows."""
    if not isinstance(tutor, dict):
        return tutor
    import copy

    out = copy.deepcopy(tutor)
    kps = out.get("key_points")
    if not isinstance(kps, list):
        return out

    intervals = _segment_intervals(segments)
    if not intervals:
        return out

    fixed: list[dict[str, Any]] = []
    for kp in kps:
        if not isinstance(kp, dict):
            continue
        try:
            ts = float(kp.get("timestamp_seconds", 0))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(ts):
            continue
        kp["timestamp_seconds"] = _snap_timestamp_force(ts, intervals)
        fixed.append(kp)

    out["key_points"] = fixed
    return out

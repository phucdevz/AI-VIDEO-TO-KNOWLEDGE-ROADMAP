"""
Accuracy metrics for pipeline evaluation: S (similarity), T (timestamp alignment), K (keyword F1).

Composite: Score = (S * 0.4) + (T * 0.4) + (K * 0.2), each in [0, 1].
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

# Minimal EN/VI stopwords for keyword extraction
_STOP = frozenset(
    """
    a an the and or but if in on at to for of with by from as is was are were be been being
    this that these those it its they them their we you he she his her not no yes so than then
    có là và hoặc của trong cho với đã được các một những khi nếu như làm có thể về ra
    """.split(),
)


def _tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[^\w]+", text.lower()) if len(t) >= 3]


def _tfidf_cosine(a: str, b: str) -> float:
    """Cosine similarity between two documents using simple TF-IDF (character n-grams + word bags)."""
    if not (a or "").strip() or not (b or "").strip():
        return 0.0
    ta = _tokens(a)
    tb = _tokens(b)
    if not ta or not tb:
        # Fallback: character bigram cosine
        def bigrams(s: str) -> Counter[str]:
            s = re.sub(r"\s+", " ", (s or "").lower().strip())
            return Counter(s[i : i + 2] for i in range(max(0, len(s) - 1)))

        ca, cb = bigrams(a), bigrams(b)
        keys = set(ca) | set(cb)
        if not keys:
            return 0.0
        dot = sum(ca.get(k, 0) * cb.get(k, 0) for k in keys)
        na = math.sqrt(sum(v * v for v in ca.values()))
        nb = math.sqrt(sum(v * v for v in cb.values()))
        if na <= 0 or nb <= 0:
            return 0.0
        return max(0.0, min(1.0, dot / (na * nb)))

    # Document frequency across both
    all_docs = [ta, tb]
    df: Counter[str] = Counter()
    for doc in all_docs:
        df.update(set(doc))

    def vec(doc: list[str]) -> dict[str, float]:
        tf = Counter(doc)
        n = len(doc) or 1
        out: dict[str, float] = {}
        for t, c in tf.items():
            idf = math.log(2.0 / (1 + df[t])) + 1.0  # 2 docs
            out[t] = (c / n) * idf
        return out

    va, vb = vec(ta), vec(tb)
    keys = set(va) | set(vb)
    dot = sum(va.get(k, 0) * vb.get(k, 0) for k in keys)
    na = math.sqrt(sum(v * v for v in va.values()))
    nb = math.sqrt(sum(v * v for v in vb.values()))
    if na <= 0 or nb <= 0:
        return 0.0
    return max(0.0, min(1.0, dot / (na * nb)))


def _top_keyword_set(text: str, *, max_terms: int = 40) -> set[str]:
    toks = [t for t in _tokens(text) if t not in _STOP and len(t) >= 4]
    if not toks:
        return set()
    freq = Counter(toks)
    return {w for w, _ in freq.most_common(max_terms)}


def keyword_f1(transcript: str, ai_extracted_text: str) -> float:
    """
    F1 between keywords from AI outputs vs reference keywords from transcript.
    ai_extracted_text: summary + node labels + key point texts concatenated.
    """
    ref = _top_keyword_set(transcript, max_terms=60)
    pred = _top_keyword_set(ai_extracted_text, max_terms=30)
    if not pred or not ref:
        return 0.0
    inter = pred & ref
    p = len(inter) / len(pred)
    r = len(inter) / len(ref)
    if p + r <= 0:
        return 0.0
    return max(0.0, min(1.0, 2 * p * r / (p + r)))


def timestamp_alignment_rate(
    react_flow: dict[str, Any],
    segments: list[dict[str, Any]],
    *,
    tolerance: float = 2.0,
) -> float:
    """
    T: fraction of nodes with data.timestamp within ±tolerance seconds of some transcript segment span.
    """
    nodes = react_flow.get("nodes") if isinstance(react_flow, dict) else None
    if not isinstance(nodes, list) or not nodes:
        return 0.0

    def seg_covers(ts: float, s: dict) -> bool:
        try:
            st = float(s.get("start", 0))
            en = float(s.get("end", 0))
        except (TypeError, ValueError):
            return False
        lo = min(st, en) - tolerance
        hi = max(st, en) + tolerance
        return lo <= ts <= hi

    ok = 0
    total = 0
    for n in nodes:
        if not isinstance(n, dict):
            continue
        data = n.get("data")
        if not isinstance(data, dict) or "timestamp" not in data:
            continue
        try:
            ts = float(data["timestamp"])
        except (TypeError, ValueError):
            total += 1
            continue
        if not math.isfinite(ts):
            total += 1
            continue
        total += 1
        if any(seg_covers(ts, s) for s in segments if isinstance(s, dict)):
            ok += 1

    if total <= 0:
        return 0.0
    return max(0.0, min(1.0, ok / total))


def similarity_summary_vs_transcript(transcript: str, tutor: dict[str, Any]) -> float:
    """S: cosine similarity between full transcript and AI summary (plus key point texts)."""
    if not isinstance(tutor, dict):
        return 0.0
    summary = str(tutor.get("summary") or "")
    kps = tutor.get("key_points")
    parts = [summary]
    if isinstance(kps, list):
        for kp in kps:
            if isinstance(kp, dict) and isinstance(kp.get("text"), str):
                parts.append(kp["text"])
    ai_side = "\n".join(p for p in parts if p.strip())
    return _tfidf_cosine(transcript, ai_side)


def build_ai_keyword_corpus(
    tutor: dict[str, Any],
    react_flow: dict[str, Any],
) -> str:
    """Concatenate AI-side text used for keyword F1."""
    parts: list[str] = []
    if isinstance(tutor, dict):
        parts.append(str(tutor.get("summary") or ""))
        kps = tutor.get("key_points")
        if isinstance(kps, list):
            for kp in kps:
                if isinstance(kp, dict) and isinstance(kp.get("text"), str):
                    parts.append(kp["text"])
    rf = react_flow if isinstance(react_flow, dict) else {}
    nodes = rf.get("nodes")
    if isinstance(nodes, list):
        for n in nodes:
            if not isinstance(n, dict):
                continue
            d = n.get("data")
            if isinstance(d, dict) and isinstance(d.get("label"), str):
                parts.append(d["label"])
    return "\n".join(parts)


def compute_accuracy_components(
    *,
    transcript_text: str,
    tutor: dict[str, Any],
    react_flow: dict[str, Any],
    segments: list[dict[str, Any]],
) -> dict[str, float]:
    s = similarity_summary_vs_transcript(transcript_text, tutor)
    t = timestamp_alignment_rate(react_flow, segments)
    k_corpus = build_ai_keyword_corpus(tutor, react_flow)
    k = keyword_f1(transcript_text, k_corpus)
    score = (s * 0.4) + (t * 0.4) + (k * 0.2)
    return {
        "similarity_s": max(0.0, min(1.0, s)),
        "timestamp_t": max(0.0, min(1.0, t)),
        "keyword_f1_k": max(0.0, min(1.0, k)),
        "accuracy_score": max(0.0, min(1.0, score)),
    }


ACCURACY_REFINEMENT_THRESHOLD = 0.60

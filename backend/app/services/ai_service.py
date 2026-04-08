from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any
import math

import google.generativeai as genai
from groq import Groq

from app.admin_prompt_store import load_prompt_overrides
from app.services.accuracy_metrics import ACCURACY_REFINEMENT_THRESHOLD, compute_accuracy_components
from app.services.knowledge_grounding import enforce_react_flow_grounding, enforce_tutor_keypoint_timestamps
from app.services.mindmap_outline import (
    MIN_DURATION_SECONDS,
    build_video_outline_prompt,
    outline_to_prompt_section,
    parse_outline_payload,
)
from app.services.transcription_service import TranscriptionResult

logger = logging.getLogger(__name__)

# Tried in order. `llama-3.1-70b-versatile` is decommissioned; extra IDs give separate paths when 70B hits TPD 429.
# See https://console.groq.com/docs/deprecations
_GROQ_CHAT_MODEL_CANDIDATES: tuple[str, ...] = (
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
)

# Some Groq chat models reject `logprobs` for chat.completions, causing avoidable 400s.
_GROQ_NO_LOGPROBS_DEFAULT: set[str] = {
    "llama-3.3-70b-versatile",
}

_REFINEMENT_PROMPT_SUFFIX = """

=== REFINEMENT PASS (same RISEN task, stricter alignment) ===
Regenerate the ENTIRE JSON with keys "react_flow", "quiz", "tutor" only.

**Non-negotiable (grounding):**
- Every `react_flow.nodes[*].data.timestamp` MUST fall inside a real transcript segment window **[start, end]** (allow ±2s slack only). If unsure, pick the segment that **actually** contains that idea and set the timestamp to the **middle** of that segment.
- Every node `data.label` and **`data.highlight`** must be **directly supportable** by words spoken in that segment (same topic; no invented facts).
- **Remove** any node whose label cannot be tied to evidence in the transcript at that time. **Merge** duplicate or near-duplicate labels.
- **Quiz:** every `correct_index` and `explanation` must match transcript evidence; fix any mismatch.
- **Tutor:** `summary` and each `key_points[].text` must not contradict the transcript.

**Mindmap:** Each **main** node has a **`data.highlight`**; each **major branch** under the root has at least one **`data.role: "detail"`** child (short focal node). **Long videos** must not be reduced to a tiny node count — add nodes for every **grounded** major idea; merge only true duplicates. If a **VIDEO STRUCTURE** outline was given above, keep `data.block_id` and timestamps **inside** each block’s time range. Mid-timeline must not be empty of substance.

Output: exactly one valid JSON object, no markdown or code fences.

QUALITY:
- Think step-by-step. If a requirement conflicts with evidence, **the transcript wins**.
"""


def _risen_tutor_summary_bounds(
    *,
    duration_s: float | None,
    transcript_char_len: int,
    target_lang_code: str,
) -> str:
    """
    Scale tutor.summary richness by lecture length — avoid one-size-fits-all word counts.
    Vietnamese typically uses more characters per 'word' than English; give both hints when vi.
    """
    # Infer bucket from duration first, then from transcript size if duration missing.
    if duration_s and duration_s > 0:
        if duration_s < 600:
            bucket = "short"
        elif duration_s < 1800:
            bucket = "medium"
        elif duration_s < 3600:
            bucket = "long"
        else:
            bucket = "very_long"
    else:
        if transcript_char_len < 2500:
            bucket = "short"
        elif transcript_char_len < 12000:
            bucket = "medium"
        elif transcript_char_len < 35000:
            bucket = "long"
        else:
            bucket = "very_long"

    vi = target_lang_code.strip().lower() == "vi"
    if bucket == "short":
        return (
            "tutor.summary length: concise synthesis — roughly **80–180 English words**, or **350–900 Vietnamese characters**. Do not pad."
            if vi
            else "tutor.summary length: concise — roughly **80–180 words**."
        )
    if bucket == "medium":
        return (
            "tutor.summary length: **150–320 English words** or **700–1600 Vietnamese characters**; cover early+mid+late."
            if vi
            else "tutor.summary length: **150–320 words**; cover early, middle, and late parts of the lecture."
        )
    if bucket == "long":
        return (
            "tutor.summary length: **260–520 English words** or **1100–2400 Vietnamese characters**; must reflect the full arc."
            if vi
            else "tutor.summary length: **260–520 words**; must reflect the full lecture arc."
        )
    return (
        "tutor.summary length: **350–700 English words** or **1500–3200 Vietnamese characters** for very long recordings; stay structured (short paragraphs or bullets)."
        if vi
        else "tutor.summary length: **350–700 words** for very long recordings; use short paragraphs or bullets."
    )


def _mindmap_density_band(duration_s: float) -> tuple[int, int]:
    """Soft lower/upper hints for neural node count by duration (minutes) — not hard quotas."""
    m = duration_s / 60.0
    if m < 8:
        return 4, 12
    if m < 18:
        return 8, 22
    if m < 35:
        return 12, 30
    if m < 60:
        return 16, 40
    return 20, 55


def _timeline_prompt_rules(duration_s: float | None) -> str:
    """Timeline coverage + density hints — each node must still be one grounded main idea."""
    if duration_s is None or (isinstance(duration_s, (int, float)) and float(duration_s) <= 0):
        return (
            "**Timeline (mindmap):** Spread `data.timestamp` across the **entire** recording. "
            "**Forbidden:** only dense nodes at the start, then a jump to “Kết luận/Conclusion” with nothing substantive in between — "
            "the **middle** must include nodes that each state a **precise** main point from the transcript at that time. "
            "Long recordings with rich content need **enough** nodes to reflect major themes — not a skeleton of 4–6 vague chips."
        )
    d = float(duration_s)
    mins = d / 60.0
    lo, hi = _mindmap_density_band(d)
    return (
        f"**Timeline coverage** (≈ {mins:.0f} min / {d:.0f}s): "
        f"(1) Split [0, {d:.0f}s] into four quarters. **Each quarter must contain at least one node** whose `data.timestamp` falls in that quarter, "
        f"and that node's label must be a **real main idea** from that segment (not padding). "
        f"(2) Add a node for **each distinct** important concept, section shift, definition, example block, or result the speaker develops — "
        f"**especially in long videos**: under-mapping (e.g. only ~6 nodes for a **~30-minute** dense lecture) is usually **wrong** unless the talk is genuinely repetitive. "
        f"(3) **Typical range for this length:** about **{lo}–{hi}** neural nodes when the content is rich — this is guidance, not a quota; use more if the structure demands, fewer only if the video is sparse. "
        f"(4) **FORBIDDEN:** shallow filler nodes; **FORBIDDEN:** a nearly empty map for a long, content-heavy recording. "
        f"(5) Prefer **distinct, grounded** labels over vague duplicates — merge only true duplicates."
    )


def _resolve_output_lang_code(target_lang: str | None, transcript_lang: str | None) -> str:
    """
    Always prefer user-selected target language for learner-facing outputs.
    Fallback to detected transcript language only when target_lang is missing/invalid.
    """
    tl = (target_lang or "").strip().lower()
    if tl in ("vi", "en"):
        return tl

    raw = (transcript_lang or "").strip().lower()
    # Whisper/Groq may return codes like "en", "en-US", "vi", "vi-VN".
    if raw.startswith("vi"):
        return "vi"
    if raw.startswith("en"):
        return "en"
    return "vi"


def _build_risen_knowledge_prompt(
    *,
    target_name: str,
    target_lang_code: str,
    difficulty_hint: str,
    question_count: int,
    video_title: str | None,
    duration_s: float | None,
    segment_lines: list[str],
    multi_span_excerpt: str,
    transcript_char_len: int,
    kp_count: int,
    extra_append: str = "",
    timeline_rules_override: str | None = None,
    outline_section: str | None = None,
) -> str:
    summary_bounds = _risen_tutor_summary_bounds(
        duration_s=duration_s,
        transcript_char_len=transcript_char_len,
        target_lang_code=target_lang_code,
    )
    if duration_s is not None and float(duration_s) > 0:
        ds = float(duration_s)
        dur_line = f"{ds:.0f} seconds (~{ds / 60:.1f} min)"
    else:
        dur_line = "unknown (infer duration from segment timestamps and transcript length)"
    scale_line = (
        f"Transcript scale: ~{transcript_char_len} characters — **long / dense lectures should produce a mindmap with many nodes** "
        f"(one idea each), not a minimal set. Never invent content; always ground nodes in segments."
    )
    custom_tl = (timeline_rules_override or "").strip()
    timeline_rules = custom_tl if custom_tl else _timeline_prompt_rules(duration_s)

    body = f"""=== ROLE (Vai trò) ===
You are a **senior instructional designer and learning engineer** specializing in extracting structured knowledge from **recorded video lectures** (YouTube / educational talks). You ground every claim in the provided transcript evidence.

=== INSTRUCTION (Nhiệm vụ) ===
Produce **exactly ONE** valid JSON object with **only** these top-level keys: `"react_flow"`, `"quiz"`, `"tutor"`.
No markdown, no explanations, no code fences, no text before or after the JSON.

=== CONTEXT (Bối cảnh / dữ liệu) ===
- **Output language for learner-facing strings**: {target_name} (all node labels, quiz text, tutor.summary, key point texts in this language; if the spoken lecture differs, translate faithfully).
- **Video title**: {video_title or "unknown"}
- **Video duration**: {dur_line}
- **Quiz difficulty**: {difficulty_hint}
- **Number of quiz questions required**: {question_count}
- {scale_line}

**Transcript with segment timestamps (primary evidence):**
{chr(10).join(segment_lines)}

**Full-lecture text excerpts (BEGIN / MIDDLE / END — use together with segments; never summarize only the opening):**
{multi_span_excerpt}

{outline_section if outline_section else ""}

=== EXECUTE (Định dạng & quy tắc thực thi) ===

**JSON shape (strict):**
- `"react_flow"`: React Flow graph `{{"nodes": [...], "edges": [...]}}`
- `"quiz"`: object with `"title"`, optional `"description"`, `"questions"` array
- `"tutor"`: object with `"summary"` (string) and `"key_points"` (array)

**react_flow rules (precision over count):**
- Each node: `"id"` (string), `"type": "neural"`, `"position": {{"x": number, "y": number}}`, `"data": {{"label": string, "timestamp": number, "highlight": string, optional `"role": "main"` or `"detail"`, optional "block_id": string}}` — use `block_id` when a **VIDEO STRUCTURE** outline was provided (must match that block’s `id`).
- **timestamp** (seconds, float) is mandatory — choose a value **inside** one of the transcript segment intervals **[start, end]** (±2s). The label must match what is **actually said** in that segment (no hallucinated topics).
- **Node count:** No hard quota — add **as many nodes as needed** so the map reflects **all major threads** of the talk (sections, definitions, examples, conclusions). Short videos may need few nodes; **long videos (e.g. 25–40+ min) with substantial teaching almost always need many more than six** — if you output only a tiny set, you probably skipped important ideas. Do **not** pad with fluff; **do** add a node for each **non-redundant** main point you can anchor in the transcript. If two labels say the same thing, merge into one node.
- **Grounding:** If you cannot point to transcript words supporting a node at its timestamp, **omit** that node. **Under-mapping** a long dense lecture is as bad as hallucination — cover the real structure.
- **Labels (`data.label`):** **≤ 52 characters each** — one **title-style** chip (short noun phrase), **not** a sentence or paragraph. Must still be **specific** — technical terms, names, criteria, or the core idea. **Forbidden:** empty buzzwords ("Tổng quan", "Giới thiệu", "Kết luận", "Phần 1") **unless** the transcript at that timestamp cannot be named more precisely; prefer the **actual subject** (e.g. "Định nghĩa X", "So sánh A và B").
- **`data.role`:** Omit or **`"main"`** for normal topic chips (children of the root or deeper “main” ideas). Use **`"detail"`** for **small focal nodes**: one **short** on-point line (see label limit below), visually subordinate to a parent **main** node. **Every direct child of the root** (major branch) **must** have **at least one** outgoing edge to a **`role: "detail"`** child — those are the compact focal points so the map is not only broad labels + long highlights.
- **`data.highlight`:** Required for **`main`** nodes (including the root): **1–2 short sentences**, **≤ 220 characters**, grounded at `timestamp`, not a duplicate of `label`. For **`detail`** nodes, `highlight` is **optional**; if present, **≤ 120 characters** (may restate the focal point in slightly fuller words). Root uses the same rules as `main`.
- **Labels for `detail` nodes:** **≤ 44 characters** — a single **tight** focal phrase or short clause (the “nội dung không quá dài đúng trọng tâm”). **Labels for `main` / default:** **≤ 52 characters** as before.
- Build a clear hierarchy: **root → main branches → at least one `detail` node per main branch** (plus deeper `main` nodes if the lecture warrants).
- **Ether mind map (client):** Prefer **exactly one root** and a **directed tree** (`n` nodes, `n-1` edges). The root **must** connect to **3–4 distinct major-category child nodes** (not a single chain: root→A→B→C) whenever the lecture has enough structure — those become the main left/right branches in the UI. Every node **must** include `data.timestamp` (seconds) for deep time-linking.
- {timeline_rules}
- **Edges:** Use `"type": "neuralFlow"` with `"id"`, `"source"`, `"target"` only. **Direction matters:** every edge must go **from parent → child** (the root has only outgoing edges to its themes; deeper edges continue away from the root). Never point an edge **toward** the root (that breaks the mind map). Prefer a **single connected** directed tree plus optional extra cross-links — do **not** output isolated clusters of nodes with no path from the root.

**quiz rules:**
- Exactly **{question_count}** questions.
- Each question: `"id"`, `"question"`, `"choices"` (4 strings), `"correct_index"` (0–3), `"explanation"`, `"evidence"` (1–2 items with transcript `start`, `end`, `text`), optional `"timestamp_seconds"`.
- All questions must be answerable from the transcript.

**tutor rules:**
- {summary_bounds}
- `"key_points"`: **{kp_count}** items: `{{"text": string, "timestamp_seconds": float}}`, spread across **early / mid / late**; at least one point with timestamp **≥85%** of duration when duration is known.

=== NEXT GOAL (Mục tiêu đầu ra) ===
The learner gets: (1) a mindmap where **each major branch** has **small detail nodes** (short, on-point) and **main** nodes have **highlights**, with **each click** seeking to a **meaningful** moment, (2) a fair quiz, (3) tutor text that reflects the **whole** lecture.

=== QUALITY (Tư duy bổ trợ — áp dụng khi sinh JSON) ===
- Plan first: skim the **whole** transcript and list **major ideas and section turns** along the timeline, then create one node per **non-redundant** main point — not one node per sentence, but also **not** skipping whole blocks of content in long videos.
- **Precision > vague duplication:** remove or merge nodes that are fuzzy duplicates or not grounded at their timestamp — but do **not** confuse this with “use few nodes”; long lectures need **breadth** when the material supports it.
- Do not invent facts; wording must be traceable to what was said.
- Return **only** the JSON object.
"""
    extra = (extra_append or "").strip()
    if extra:
        return body + "\n\n=== ADMIN — Additional instructions (append) ===\n" + extra + "\n"
    return body


def _build_risen_tutor_qa_prompt(
    *,
    video_title: str | None,
    seg_lines: list[str],
    question: str,
    max_citations: int,
) -> str:
    return f"""=== ROLE (Vai trò) ===
You are an **expert AI tutor** for video-based courses. You infer answers **only** from the timed excerpts below (same content as what appears in the video). Internally they are segment lines; when speaking to the learner, treat them as **what was said in the video**.

=== INSTRUCTION (Nhiệm vụ) ===
Return **exactly ONE** JSON object, nothing else — no markdown, no code fences.

Schema:
{{
  "answer": string,
  "citations": [{{"start": number, "end": number, "text": string}}]
}}

=== CONTEXT (Bối cảnh) ===
Video title (may be empty): {video_title or "unknown"}

**Timed excerpts from the lecture video (numbered; sole source for facts and citations):**
{chr(10).join(seg_lines)}

**Learner question:**
{question}

=== EXECUTE (Thực thi) ===
- "answer": clear, helpful, **strictly grounded** in the excerpts above; language should match the learner's question style when reasonable.
- **Learner-facing wording (important):** In the `answer` text, refer to evidence as **the video / the lecture** — e.g. Vietnamese: "trong video", "trong bài", "các đoạn video", "theo nội dung bài" — **do not** say "trong transcript", "bản ghi lời", "các đoạn transcript" unless the user explicitly asks about subtitles or transcription. English: say "in the video", "in this lecture", "as explained in the video" — **not** "in the transcript".
- "citations": at most **{max_citations}** items; each citation text must match a provided excerpt (or its substring). If evidence is insufficient, state that briefly and use an empty citations array.

=== NEXT GOAL (Mục tiêu) ===
The learner gets a correct, traceable explanation tied to the **video** — no hallucinated content.

=== QUALITY ===
- Think step-by-step: which excerpts answer the question? Then compose the answer.
- If critical information is missing from the excerpts, say so explicitly instead of guessing; do not fabricate.
- If the question cannot be answered well without more context, state what is missing and keep citations empty or partial.
- After drafting, briefly verify citations against excerpt text (play devil's advocate: would a skeptic accept each claim?).
"""

# Keep a preferred model first, then fallback candidates for API/version drift.
GEMINI_MODELS = (
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
)
_BACKOFF_SECONDS = (2, 4, 8)
_MAX_JSON_REPAIR_ATTEMPTS = 1
_MAX_SCHEMA_REPAIR_ATTEMPTS = 1
_MAX_REPAIR_PAYLOAD_CHARS = 32000
_MIN_DETAIL_CHILDREN_PER_MAIN = 2
_MAX_PROVIDER_ATTEMPT_SECONDS = 75.0
_GROQ_RATE_LIMIT_STREAK_FOR_COOLDOWN = 3
_GROQ_COOLDOWN_SECONDS = 90.0


def _groq_completion_confidence(completion: object) -> float | None:
    """Map token log-probabilities to a single [0,1] score when the API returns logprobs."""
    try:
        choices = getattr(completion, "choices", None) or []
        if not choices:
            return None
        lp = getattr(choices[0], "logprobs", None)
        if lp is None:
            return None
        content = getattr(lp, "content", None)
        if not isinstance(content, list) or not content:
            return None
        vals: list[float] = []
        for tok in content:
            v = getattr(tok, "logprob", None)
            if isinstance(v, (int, float)):
                vals.append(float(v))
        if not vals:
            return None
        probs = [max(1e-12, math.exp(v)) for v in vals]
        return max(0.0, min(1.0, sum(probs) / len(probs)))
    except Exception:
        return None


def _gemini_response_confidence(response: object) -> float | None:
    """Gemini SDK usually omits per-token logprobs; extend when available."""
    try:
        cands = getattr(response, "candidates", None)
        if not isinstance(cands, list) or not cands:
            return None
        return None
    except Exception:
        return None


class KnowledgeGenerationError(Exception):
    """Gemini returned invalid JSON or violated pipeline constraints."""


def _validate_main_branches_have_detail_children(nodes: list[Any], edges: list[Any]) -> None:
    """Each direct child of the graph root must have ≥1 child with data.role == 'detail'."""
    from collections import defaultdict

    node_by_id: dict[str, dict[str, Any]] = {}
    for n in nodes:
        if not isinstance(n, dict):
            continue
        nid = n.get("id")
        if isinstance(nid, str) and nid.strip():
            node_by_id[nid.strip()] = n

    all_ids = set(node_by_id.keys())
    if not all_ids:
        return

    in_deg: dict[str, int] = {i: 0 for i in all_ids}
    out_adj: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        if not isinstance(e, dict):
            continue
        s, t = e.get("source"), e.get("target")
        if not isinstance(s, str) or not isinstance(t, str):
            continue
        if s not in all_ids or t not in all_ids:
            continue
        out_adj[s].append(t)
        in_deg[t] = in_deg.get(t, 0) + 1

    roots = [nid for nid in all_ids if in_deg.get(nid, 0) == 0]
    if len(roots) != 1:
        return
    root_id = roots[0]
    mains = out_adj.get(root_id, [])
    if not mains:
        return

    for mid in mains:
        kids = out_adj.get(mid, [])
        if not kids:
            raise KnowledgeGenerationError(
                f'Mindmap: main branch "{mid}" must have at least one child node (focal detail under each major branch).',
            )
        has_detail = False
        for kid in kids:
            kn = node_by_id.get(kid)
            if not isinstance(kn, dict):
                continue
            d = kn.get("data")
            if isinstance(d, dict) and d.get("role") == "detail":
                has_detail = True
                break
        if not has_detail:
            raise KnowledgeGenerationError(
                f'Mindmap: main branch "{mid}" must include at least one child with data.role "detail" (short focal node).',
            )


def _ensure_main_branch_detail_children(react_flow: dict[str, Any]) -> dict[str, Any]:
    """
    Soft-fix for strict mindmap rule:
    each direct child of root should have >=1 child with role='detail'.
    """
    if not isinstance(react_flow, dict):
        return react_flow
    nodes = react_flow.get("nodes")
    edges = react_flow.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return react_flow

    node_by_id: dict[str, dict[str, Any]] = {}
    for n in nodes:
        if not isinstance(n, dict):
            continue
        nid = n.get("id")
        if isinstance(nid, str) and nid.strip():
            node_by_id[nid.strip()] = n
    all_ids = set(node_by_id.keys())
    if not all_ids:
        return react_flow

    in_deg: dict[str, int] = {nid: 0 for nid in all_ids}
    out_adj: dict[str, list[str]] = {nid: [] for nid in all_ids}
    for e in edges:
        if not isinstance(e, dict):
            continue
        s, t = e.get("source"), e.get("target")
        if not isinstance(s, str) or not isinstance(t, str):
            continue
        if s not in all_ids or t not in all_ids:
            continue
        out_adj[s].append(t)
        in_deg[t] = in_deg.get(t, 0) + 1

    roots = [nid for nid in all_ids if in_deg.get(nid, 0) == 0]
    if len(roots) != 1:
        return react_flow
    root_id = roots[0]
    mains = out_adj.get(root_id, [])
    if not mains:
        return react_flow

    existing_edge_ids: set[str] = set()
    for e in edges:
        if isinstance(e, dict):
            eid = e.get("id")
            if isinstance(eid, str) and eid.strip():
                existing_edge_ids.add(eid.strip())

    def _mk_unique_edge_id(base: str) -> str:
        cand = base
        i = 2
        while cand in existing_edge_ids:
            cand = f"{base}_{i}"
            i += 1
        existing_edge_ids.add(cand)
        return cand

    for mid in mains:
        kids = out_adj.get(mid, [])
        detail_count = 0
        for kid in kids:
            kn = node_by_id.get(kid)
            if not isinstance(kn, dict):
                continue
            data = kn.get("data")
            if isinstance(data, dict) and data.get("role") == "detail":
                detail_count += 1
        if detail_count >= _MIN_DETAIL_CHILDREN_PER_MAIN:
            continue

        # Append synthetic detail children until each main has enough supporting details.
        # Do not convert existing children: that can collapse the map into a single-looking chain.
        parent = node_by_id.get(mid) or {}
        parent_data = parent.get("data") if isinstance(parent.get("data"), dict) else {}
        parent_pos = parent.get("position") if isinstance(parent.get("position"), dict) else {}
        try:
            px = float(parent_pos.get("x", 0.0))
            py = float(parent_pos.get("y", 0.0))
        except Exception:
            px, py = 0.0, 0.0
        try:
            pts = float(parent_data.get("timestamp", 0.0))
        except Exception:
            pts = 0.0
        parent_label = str(parent_data.get("label", "") or "").strip()
        base_label = f"{parent_label} chi tiet".strip() if parent_label else "Chi tiet"
        base_label = base_label[:44] or "Chi tiet"

        need = max(0, _MIN_DETAIL_CHILDREN_PER_MAIN - detail_count)
        for i in range(need):
            detail_id_base = f"{mid}_detail"
            detail_id = detail_id_base
            c = 2
            while detail_id in all_ids:
                detail_id = f"{detail_id_base}_{c}"
                c += 1
            all_ids.add(detail_id)
            y_off = 80.0 + (i * 70.0)
            detail_label = base_label if i == 0 else f"{base_label[:36]} {i+1}".strip()[:44]
            detail_node = {
                "id": detail_id,
                "type": "neural",
                "position": {"x": px + 180.0, "y": py + y_off},
                "data": {"label": detail_label, "timestamp": pts, "role": "detail", "highlight": ""},
            }
            nodes.append(detail_node)
            node_by_id[detail_id] = detail_node
            out_adj.setdefault(mid, []).append(detail_id)
            in_deg[detail_id] = 1

            edge_id = _mk_unique_edge_id(f"e_{mid}_{detail_id}")
            edges.append(
                {
                    "id": edge_id,
                    "source": mid,
                    "target": detail_id,
                    "type": "neuralFlow",
                }
            )

    return react_flow


def _minimal_quiz_from_tutor(tutor: dict[str, Any] | None) -> dict[str, Any]:
    kp: list[str] = []
    if isinstance(tutor, dict):
        arr = tutor.get("key_points")
        if isinstance(arr, list):
            for item in arr:
                if not isinstance(item, dict):
                    continue
                t = str(item.get("text") or "").strip()
                if t:
                    kp.append(t)
    while len(kp) < 3:
        kp.append(f"Nội dung trọng tâm {len(kp) + 1}")
    questions: list[dict[str, Any]] = []
    for i, text in enumerate(kp[:3]):
        questions.append(
            {
                "question": f"Ý nào đúng với trọng tâm sau: {text[:120]}?",
                "choices": [
                    text[:140],
                    f"Phủ định của: {text[:80]}",
                    "Không liên quan nội dung bài",
                    "Thông tin chưa được nhắc tới",
                ],
                "correct_index": 0,
                "explanation": "Đáp án đúng bám theo key point trong bài giảng.",
            }
        )
    return {"title": "Quick Check", "questions": questions}


def _minimal_tutor_from_flow(flow: dict[str, Any] | None) -> dict[str, Any]:
    labels: list[tuple[float, str]] = []
    if isinstance(flow, dict):
        nodes = flow.get("nodes")
        if isinstance(nodes, list):
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                data = n.get("data")
                if not isinstance(data, dict):
                    continue
                label = str(data.get("label") or "").strip()
                if not label:
                    continue
                try:
                    ts = float(data.get("timestamp", 0) or 0)
                except Exception:
                    ts = 0.0
                labels.append((ts, label))
    labels.sort(key=lambda x: x[0])
    points = [{"text": t, "timestamp_seconds": ts} for ts, t in labels[:8]]
    if len(points) < 3:
        points.extend(
            [
                {"text": "Tổng quan nội dung chính", "timestamp_seconds": 0.0},
                {"text": "Các ý cốt lõi trong bài", "timestamp_seconds": 30.0},
                {"text": "Kết luận và lưu ý", "timestamp_seconds": 60.0},
            ][: 3 - len(points)]
        )
    return {
        "summary": "Tóm tắt tự động từ cấu trúc mindmap khi đầu ra AI thiếu trường tutor.",
        "key_points": points[:20],
    }


def _coerce_payload_minimal(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Local fail-safe normalization to avoid hard failures when model omits top-level keys.
    No extra LLM call.
    """
    out = dict(payload)
    rf = out.get("react_flow")
    quiz = out.get("quiz")
    tutor = out.get("tutor")

    if not isinstance(rf, dict):
        # Build a tiny valid graph if missing (keeps contract; downstream guards may enrich).
        out["react_flow"] = {
            "nodes": [
                {
                    "id": "root",
                    "type": "neural",
                    "position": {"x": 0, "y": 0},
                    "data": {"label": "Tổng quan", "timestamp": 0.0, "highlight": "Nội dung chính của bài."},
                },
                {
                    "id": "root_detail_1",
                    "type": "neural",
                    "position": {"x": 180, "y": 100},
                    "data": {"label": "Chi tiết 1", "timestamp": 20.0, "role": "detail", "highlight": ""},
                },
            ],
            "edges": [{"id": "e_root_d1", "source": "root", "target": "root_detail_1", "type": "neuralFlow"}],
        }
        rf = out["react_flow"]

    if not isinstance(tutor, dict):
        out["tutor"] = _minimal_tutor_from_flow(rf if isinstance(rf, dict) else None)
        tutor = out["tutor"]

    if not isinstance(quiz, dict):
        out["quiz"] = _minimal_quiz_from_tutor(tutor if isinstance(tutor, dict) else None)
        quiz = out["quiz"]

    # If quiz exists but invalid/too short, top-up to minimum 3 questions.
    if isinstance(quiz, dict):
        qs = quiz.get("questions")
        if not isinstance(qs, list):
            quiz["questions"] = _minimal_quiz_from_tutor(tutor if isinstance(tutor, dict) else None)["questions"]
        elif len(qs) < 3:
            extra = _minimal_quiz_from_tutor(tutor if isinstance(tutor, dict) else None)["questions"]
            quiz["questions"] = (qs + extra)[:3]
    return out


def _nearest_segment_text(segments: list[dict[str, Any]], ts: float) -> str:
    best = ""
    best_dist = 1e18
    for s in segments:
        if not isinstance(s, dict):
            continue
        try:
            st = float(s.get("start", 0) or 0)
            en = float(s.get("end", 0) or 0)
        except Exception:
            continue
        txt = str(s.get("text") or "").strip()
        if not txt:
            continue
        if st <= ts <= en:
            return txt
        mid = (st + en) / 2.0
        d = abs(mid - ts)
        if d < best_dist:
            best_dist = d
            best = txt
    return best


def _enrich_react_flow_readability(react_flow: dict[str, Any], segments: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Improve "read map without video" quality without extra LLM calls:
    - ensure minimum detail children per main branch
    - fill weak main highlights from nearest transcript segment
    """
    out = _ensure_main_branch_detail_children(react_flow)
    if not isinstance(out, dict):
        return out
    nodes = out.get("nodes")
    if not isinstance(nodes, list):
        return out
    for n in nodes:
        if not isinstance(n, dict):
            continue
        data = n.get("data")
        if not isinstance(data, dict):
            continue
        role = data.get("role")
        if role == "detail":
            continue
        label = str(data.get("label") or "").strip()
        highlight = str(data.get("highlight") or "").strip()
        weak = (not highlight) or len(highlight) < 20 or highlight.lower() == label.lower()
        if not weak:
            continue
        try:
            ts = float(data.get("timestamp", 0) or 0)
        except Exception:
            ts = 0.0
        seg_txt = _nearest_segment_text(segments, ts)
        if not seg_txt:
            continue
        data["highlight"] = seg_txt[:220].strip()
    return out


@dataclass
class KnowledgeGenerationResult:
    react_flow: dict[str, Any]
    quiz: dict[str, Any]
    tutor: dict[str, Any]
    raw_text: str | None = None
    accuracy_metrics: dict[str, float] | None = None
    provider_used: str | None = None
    confidence: float | None = None
    refined: bool = False


class AIService:
    """Gemini 1.5 Flash: React Flow graph + quiz/tutor JSON from transcript."""

    def __init__(
        self,
        api_key: str | None,
        *,
        groq_api_key: str | None = None,
        provider: str = "auto",
    ) -> None:
        self._google_api_key = (api_key or "").strip()
        self._groq_api_key = (groq_api_key or "").strip()
        if not self._google_api_key and not self._groq_api_key:
            raise KnowledgeGenerationError("At least one provider key is required (GOOGLE_API_KEY or GROQ_API_KEY)")

        p = (provider or "auto").strip().lower()
        if p not in ("auto", "groq", "google"):
            p = "auto"
        self._provider = p

        self._model_name = GEMINI_MODELS[0]
        self._model: genai.GenerativeModel | None = None
        if self._google_api_key:
            genai.configure(api_key=self._google_api_key)
            self._model = self._build_model(self._model_name)

        self._groq_client: Groq | None = Groq(api_key=self._groq_api_key) if self._groq_api_key else None
        self._last_token_confidence: float | None = None
        self._groq_rate_limited_recently: bool = False
        self._groq_no_logprobs_models: set[str] = set(_GROQ_NO_LOGPROBS_DEFAULT)
        self._groq_rate_limit_streak: int = 0
        self._groq_cooldown_until: float = 0.0

    def _is_groq_in_cooldown(self) -> bool:
        return time.time() < self._groq_cooldown_until

    def _mark_groq_rate_limit(self) -> None:
        self._groq_rate_limited_recently = True
        self._groq_rate_limit_streak += 1
        if self._groq_rate_limit_streak >= _GROQ_RATE_LIMIT_STREAK_FOR_COOLDOWN:
            self._groq_cooldown_until = time.time() + _GROQ_COOLDOWN_SECONDS
            logger.warning(
                "groq_circuit_open streak=%s cooldown_s=%s",
                self._groq_rate_limit_streak,
                _GROQ_COOLDOWN_SECONDS,
            )

    def _mark_groq_success(self) -> None:
        self._groq_rate_limit_streak = 0
        self._groq_cooldown_until = 0.0

    @staticmethod
    def _select_key_segments(tr: TranscriptionResult, max_segments: int = 96) -> list[str]:
        """
        Keep payload small: pick representative timestamped segments across the lecture.
        """
        segs = tr.segments
        if not segs:
            text = tr.text.strip()
            if not text:
                return []
            # Avoid only-first-800-chars bias when Whisper omits segments.
            ex = AIService._multi_span_transcript_excerpt(tr, max_chars=2400)
            return [ex] if ex else [text[:1200]]

        if len(segs) <= max_segments:
            return [f"[{s.start:.2f}s–{s.end:.2f}s] {s.text}" for s in segs]

        # Evenly sample segments to preserve lecture coverage.
        lines: list[str] = []
        n = len(segs)
        for i in range(max_segments):
            idx = round(i * (n - 1) / (max_segments - 1))
            s = segs[idx]
            lines.append(f"[{s.start:.2f}s–{s.end:.2f}s] {s.text}")
        return lines

    @staticmethod
    def _multi_span_transcript_excerpt(tr: TranscriptionResult, *, max_chars: int = 4200) -> str:
        """
        Avoid biasing the LLM to only the first minutes: include start, middle, and end of `tr.text`.

        A single `tr.text[:1200]` prefix made tutor summary / key points skew to the opening ~5 minutes.
        """
        text = (tr.text or "").strip()
        if not text:
            return ""
        n = len(text)
        if n <= max_chars:
            return text
        third = max(800, max_chars // 3)
        head = text[:third]
        mid0 = max(0, n // 2 - third // 2)
        mid = text[mid0 : mid0 + third]
        tail = text[max(0, n - third) :]
        return (
            "[BEGIN]\n"
            f"{head}\n\n"
            "[MIDDLE — ~mid lecture]\n"
            f"{mid}\n\n"
            "[END]\n"
            f"{tail}"
        )

    @staticmethod
    def _build_model(model_name: str) -> genai.GenerativeModel:
        return genai.GenerativeModel(
            model_name,
            generation_config={
                "temperature": 0.25,
                "response_mime_type": "application/json",
            },
        )

    def _generate_video_outline(
        self,
        tr: TranscriptionResult,
        *,
        video_title: str | None,
        target_lang: str,
        duration_s: float,
        segment_lines: list[str],
    ) -> list[dict[str, Any]] | None:
        """
        Phase 1: split timeline into main content blocks (second LLM call, long videos only).
        """
        if duration_s < MIN_DURATION_SECONDS:
            return None
        prompt = build_video_outline_prompt(
            video_title=video_title,
            duration_s=duration_s,
            target_lang_code=target_lang,
            segment_lines=segment_lines,
        )
        order: list[str]
        if self._provider == "groq":
            order = ["groq", "google"]
        elif self._provider == "google":
            order = ["google", "groq"]
        else:
            order = ["google", "groq"]

        last_err: Exception | None = None
        for prov in order:
            if prov == "google" and self._model is None:
                continue
            if prov == "groq" and self._groq_client is None:
                continue
            try:
                raw = self._generate_json_text(prompt, provider=prov)
                payload = self._load_json_payload(raw, provider=prov, task="outline")
                if not isinstance(payload, dict):
                    raise KnowledgeGenerationError("outline: JSON root must be an object")
                blocks = parse_outline_payload(payload, duration_s=duration_s)
                if blocks:
                    logger.info("Video outline: %s blocks (provider=%s)", len(blocks), prov)
                    return blocks
            except Exception as e:
                last_err = e
                logger.warning("Video outline via %s failed: %s", prov, e)
                continue

        if last_err:
            logger.warning("Video outline skipped after errors: %s", last_err)
        return None

    def generate_from_transcript(
        self,
        tr: TranscriptionResult,
        *,
        video_title: str | None,
        target_lang: str | None = "vi",
        quiz_difficulty: str | None = "medium",
    ) -> KnowledgeGenerationResult:
        # Reset per-request rate-limit signal used by refinement gating.
        self._groq_rate_limited_recently = False

        # Longer videos need more coverage signals; keep within a safe payload size.
        duration_s = float(tr.duration) if isinstance(tr.duration, (int, float)) and tr.duration else None
        seg_cap = 96
        if duration_s:
            # Scale up sampling for long-form videos.
            # 30min → ~120, 60min → ~160, 120min → ~220 (clamped).
            seg_cap = int(max(96, min(220, round(96 + (duration_s / 1800.0) * 32))))
            if duration_s >= 45 * 60:
                seg_cap = max(seg_cap, 140)
        segment_lines = self._select_key_segments(tr, max_segments=seg_cap)
        if len(tr.segments) > seg_cap:
            segment_lines.append(f"... ({len(tr.segments) - seg_cap} more segments omitted)")

        tl = _resolve_output_lang_code(target_lang, tr.language)
        target_name = "Vietnamese" if tl == "vi" else "English"

        qd = (quiz_difficulty or "medium").strip().lower()
        if qd not in ("easy", "medium", "hard"):
            qd = "medium"
        question_count = 5 if qd == "easy" else 8 if qd == "medium" else 12
        difficulty_hint = (
            "Easy (basic recall, clear wording)"
            if qd == "easy"
            else "Medium (concept understanding + light application)"
            if qd == "medium"
            else "Hard (deeper reasoning, nuance, tricky distractors)"
        )

        # Notes density: spread points across full lecture.
        kp_count = 8
        if duration_s and duration_s > 0:
            kp_count = int(max(6, min(16, round(duration_s / 240.0))))  # ~1 key point / 4 minutes

        transcript_char_len = len((tr.text or "").strip())
        multi_excerpt = self._multi_span_transcript_excerpt(tr)
        ov = load_prompt_overrides()
        tlr = (ov.get("timeline_rules_override") or "").strip()

        outline_section: str | None = None
        if duration_s is not None and float(duration_s) >= MIN_DURATION_SECONDS:
            try:
                blocks = self._generate_video_outline(
                    tr,
                    video_title=video_title,
                    target_lang=tl,
                    duration_s=float(duration_s),
                    segment_lines=segment_lines,
                )
                if blocks:
                    outline_section = outline_to_prompt_section(blocks, duration_s=float(duration_s))
            except Exception:
                logger.exception("Video outline phase failed; continuing without outline")

        prompt = _build_risen_knowledge_prompt(
            target_name=target_name,
            target_lang_code=tl,
            difficulty_hint=difficulty_hint,
            question_count=question_count,
            video_title=video_title,
            duration_s=duration_s,
            segment_lines=segment_lines,
            multi_span_excerpt=multi_excerpt,
            transcript_char_len=transcript_char_len,
            kp_count=kp_count,
            extra_append=ov.get("risen_knowledge_append") or "",
            timeline_rules_override=tlr if tlr else None,
            outline_section=outline_section,
        )

        base = self._execute_knowledge_prompt(prompt)
        segs = [{"start": s.start, "end": s.end, "text": s.text} for s in tr.segments]
        metrics = compute_accuracy_components(
            transcript_text=tr.text,
            tutor=base.tutor,
            react_flow=base.react_flow,
            segments=segs,
        )
        base.accuracy_metrics = metrics

        out = base
        score = metrics.get("accuracy_score", 0.0)
        if self._should_run_refinement(score=score, provider_used=base.provider_used):
            logger.info(
                "Accuracy score %.3f below threshold %.2f; running refinement pass",
                score,
                ACCURACY_REFINEMENT_THRESHOLD,
            )
            try:
                ref_extra = (ov.get("refinement_append") or "").strip()
                ref_suffix = _REFINEMENT_PROMPT_SUFFIX + (
                    "\n\n=== ADMIN — Refinement append ===\n" + ref_extra + "\n" if ref_extra else ""
                )
                refined = self._execute_knowledge_prompt(prompt + ref_suffix)
                m2 = compute_accuracy_components(
                    transcript_text=tr.text,
                    tutor=refined.tutor,
                    react_flow=refined.react_flow,
                    segments=segs,
                )
                refined.accuracy_metrics = m2
                refined.refined = True
                if m2.get("accuracy_score", 0.0) >= score:
                    refined.provider_used = refined.provider_used or base.provider_used
                    out = refined
                else:
                    base.refined = True
            except Exception:
                logger.exception("Refinement pass failed; keeping initial generation")
                base.refined = True
        elif score < ACCURACY_REFINEMENT_THRESHOLD:
            logger.info(
                "Skipping refinement pass to reduce latency (provider=%s, groq_rate_limited=%s)",
                base.provider_used or "unknown",
                self._groq_rate_limited_recently,
            )

        self._finalize_with_grounding(out, transcript_text=tr.text or "", segments=segs)
        return out

    def _finalize_with_grounding(
        self,
        result: KnowledgeGenerationResult,
        *,
        transcript_text: str,
        segments: list[dict[str, Any]],
    ) -> None:
        """Snap mindmap/tutor timestamps to ASR segments and recompute accuracy metrics."""
        try:
            result.react_flow = enforce_react_flow_grounding(result.react_flow, segments)
            result.react_flow = _enrich_react_flow_readability(result.react_flow, segments)
            result.tutor = enforce_tutor_keypoint_timestamps(result.tutor, segments)
            result.accuracy_metrics = compute_accuracy_components(
                transcript_text=transcript_text,
                tutor=result.tutor,
                react_flow=result.react_flow,
                segments=segments,
            )
        except Exception:
            logger.exception("Segment grounding failed; keeping model output")

    def _should_run_refinement(self, *, score: float, provider_used: str | None) -> bool:
        """Gate expensive refinement pass when provider is under quota pressure."""
        if score >= ACCURACY_REFINEMENT_THRESHOLD:
            return False
        # If Groq is getting 429 and there is no Google fallback key, refinement often adds
        # heavy delay with little reliability gain. Keep base result for faster completion.
        if (
            (provider_used or "").strip().lower() == "groq"
            and self._groq_rate_limited_recently
            and self._model is None
        ):
            return False
        return True

    def _execute_knowledge_prompt(self, prompt: str) -> KnowledgeGenerationResult:
        """Try providers in order until JSON validates; attaches provider_used and confidence."""
        self._last_token_confidence = None
        order: list[str] = []
        if self._provider == "groq":
            order = ["groq", "google"]
        elif self._provider == "google":
            order = ["google", "groq"]
        else:
            order = ["google", "groq"]

        last_err: Exception | None = None
        for prov in order:
            if prov == "google" and self._model is None:
                continue
            if prov == "groq" and self._groq_client is None:
                continue
            if prov == "groq" and self._is_groq_in_cooldown():
                last_err = KnowledgeGenerationError("Groq is in temporary cooldown after repeated rate limits")
                logger.warning("knowledge_prompt_skip provider=groq reason=cooldown")
                continue
            t0 = time.perf_counter()
            try:
                raw = self._generate_json_text(prompt, provider=prov)
                if not raw.strip():
                    raise KnowledgeGenerationError("Empty AI response")

                payload = self._load_json_payload(raw, provider=prov, task="knowledge")
                if isinstance(payload, dict):
                    payload = _coerce_payload_minimal(payload)
                    rf = payload.get("react_flow")
                    if isinstance(rf, dict):
                        payload["react_flow"] = _ensure_main_branch_detail_children(rf)
                try:
                    self._validate_payload(payload)
                except Exception:
                    repaired_payload = self._repair_knowledge_schema_once(payload, provider=prov)
                    if repaired_payload is None:
                        raise
                    payload = repaired_payload

                conf = self._last_token_confidence
                if prov == "groq":
                    self._mark_groq_success()
                logger.info(
                    "knowledge_prompt_ok provider=%s latency_ms=%.2f confidence=%s",
                    prov,
                    (time.perf_counter() - t0) * 1000.0,
                    conf,
                )
                return KnowledgeGenerationResult(
                    react_flow=payload["react_flow"],
                    quiz=payload["quiz"],
                    tutor=payload["tutor"],
                    raw_text=raw,
                    provider_used=prov,
                    confidence=conf,
                )
            except Exception as e:
                last_err = e
                elapsed_s = time.perf_counter() - t0
                if elapsed_s > _MAX_PROVIDER_ATTEMPT_SECONDS:
                    logger.warning(
                        "knowledge_prompt_slow provider=%s elapsed_s=%.2f threshold_s=%.2f",
                        prov,
                        elapsed_s,
                        _MAX_PROVIDER_ATTEMPT_SECONDS,
                    )
                logger.warning(
                    "knowledge_prompt_fail provider=%s latency_ms=%.2f error_type=%s error=%s",
                    prov,
                    elapsed_s * 1000.0,
                    type(e).__name__,
                    e,
                )
                continue

        raise KnowledgeGenerationError(str(last_err or "AI generation failed"))

    def answer_from_segments(
        self,
        *,
        question: str,
        segments: list[dict[str, Any]],
        video_title: str | None = None,
        max_citations: int = 3,
    ) -> dict[str, Any]:
        """
        Lightweight Tutor Q&A grounded in transcript segments.

        Returns: {"answer": str, "citations": [{"start": float, "end": float, "text": str}, ...]}
        """
        q = (question or "").strip()
        if not q:
            raise KnowledgeGenerationError("Empty question")
        if not isinstance(segments, list) or len(segments) == 0:
            raise KnowledgeGenerationError("Missing transcript segments")

        # Keep payload small and consistent.
        max_seg = 80
        seg_lines: list[str] = []
        for i, s in enumerate(segments[:max_seg]):
            try:
                st = float(s.get("start", 0))
                en = float(s.get("end", 0))
            except Exception:
                st = 0.0
                en = 0.0
            text = str(s.get("text", "") or "").strip().replace("\n", " ")
            if not text:
                continue
            seg_lines.append(f"#{i} [{st:.2f}s–{en:.2f}s] {text}")
        if not seg_lines:
            raise KnowledgeGenerationError("Transcript segments were empty")

        mc = int(max_citations) if isinstance(max_citations, int) else 3
        mc = max(0, min(8, mc))

        ov = load_prompt_overrides()
        qa_extra = (ov.get("tutor_qa_append") or "").strip()
        prompt = _build_risen_tutor_qa_prompt(
            video_title=video_title,
            seg_lines=seg_lines,
            question=q,
            max_citations=mc,
        )
        if qa_extra:
            prompt += "\n\n=== ADMIN — Additional instructions (append) ===\n" + qa_extra + "\n"

        order: list[str]
        if self._provider == "groq":
            order = ["groq", "google"]
        elif self._provider == "google":
            order = ["google", "groq"]
        else:
            order = ["google", "groq"]

        last_err: Exception | None = None
        for prov in order:
            if prov == "google" and self._model is None:
                continue
            if prov == "groq" and self._groq_client is None:
                continue
            if prov == "groq" and self._is_groq_in_cooldown():
                last_err = KnowledgeGenerationError("Groq is in temporary cooldown after repeated rate limits")
                logger.warning("tutor_prompt_skip provider=groq reason=cooldown")
                continue
            t0 = time.perf_counter()
            try:
                raw = self._generate_json_text(prompt, provider=prov)
                payload = self._load_json_payload(raw, provider=prov, task="tutor_qa")

                ans = payload.get("answer")
                if not isinstance(ans, str) or not ans.strip():
                    raise KnowledgeGenerationError("answer must be a non-empty string")
                citations = payload.get("citations")
                if citations is None:
                    citations = []
                if not isinstance(citations, list):
                    raise KnowledgeGenerationError("citations must be an array")
                if len(citations) > mc:
                    citations = citations[:mc]
                norm_cits: list[dict[str, Any]] = []
                for c in citations:
                    if not isinstance(c, dict):
                        continue
                    try:
                        st = float(c.get("start"))
                        en = float(c.get("end"))
                    except Exception:
                        continue
                    text = c.get("text")
                    if not isinstance(text, str) or not text.strip():
                        continue
                    norm_cits.append({"start": st, "end": en, "text": text.strip()})

                if prov == "groq":
                    self._mark_groq_success()
                return {"answer": ans.strip(), "citations": norm_cits}
            except Exception as e:
                last_err = e
                elapsed_s = time.perf_counter() - t0
                logger.warning(
                    "Tutor provider %s failed, trying next if available: %s (latency_ms=%.2f)",
                    prov,
                    e,
                    elapsed_s * 1000.0,
                )
                continue

        raise KnowledgeGenerationError(str(last_err or "Tutor generation failed"))

    def _generate_json_text(self, prompt: str, *, provider: str) -> str:
        self._last_token_confidence = None
        if provider == "groq":
            if self._groq_client is None:
                raise KnowledgeGenerationError("GROQ_API_KEY is not set")
            return self._generate_with_groq(prompt)
        if provider == "google":
            if self._model is None:
                raise KnowledgeGenerationError("GOOGLE_API_KEY is not set")
            try:
                return self._generate_with_google(prompt)
            except Exception as e:
                # Bubble up so generate_from_transcript can fallback to Groq in auto mode.
                raise KnowledgeGenerationError(f"Gemini request failed: {e}") from e
        raise KnowledgeGenerationError(f"Unknown provider: {provider}")

    def _load_json_payload(self, raw: str, *, provider: str, task: str) -> Any:
        """Parse provider output as JSON with small syntax-repair fallbacks."""
        candidates = _json_parse_candidates(raw)
        last_decode_err: Exception | None = None
        parse_attempts = 0
        for txt in candidates:
            parse_attempts += 1
            try:
                return json.loads(txt)
            except json.JSONDecodeError as e:
                last_decode_err = e

        repaired = None
        for _ in range(_MAX_JSON_REPAIR_ATTEMPTS):
            repaired = self._repair_json_once(raw, provider=provider, task=task)
            if repaired is not None:
                break
        if repaired is not None:
            for txt in _json_parse_candidates(repaired):
                parse_attempts += 1
                try:
                    return json.loads(txt)
                except json.JSONDecodeError as e:
                    last_decode_err = e

        if last_decode_err is not None:
            logger.warning(
                "json_payload_parse_failed provider=%s task=%s parse_attempts=%s error=%s",
                provider,
                task,
                parse_attempts,
                last_decode_err,
            )
            raise KnowledgeGenerationError(f"{provider} returned invalid JSON: {last_decode_err}") from last_decode_err
        raise KnowledgeGenerationError(f"{provider} returned invalid JSON")

    def _repair_json_once(self, raw: str, *, provider: str, task: str) -> str | None:
        """
        Ask the same provider to repair malformed JSON without changing semantics.
        Keeps this to one attempt to avoid retry loops and extra latency.
        """
        if provider == "groq" and self._groq_rate_limited_recently:
            logger.info("Skip JSON repair via groq (%s): recent rate limit", task)
            return None
        broken = _extract_json_object(raw) or raw
        broken = (broken or "").strip()
        if not broken:
            return None

        # Keep prompt size bounded for provider reliability/cost.
        if len(broken) > _MAX_REPAIR_PAYLOAD_CHARS:
            broken = broken[:_MAX_REPAIR_PAYLOAD_CHARS]

        repair_prompt = (
            "You are a strict JSON repair tool.\n"
            f"Task: repair malformed JSON for '{task}'.\n"
            "Rules:\n"
            "1) Output exactly ONE valid JSON object.\n"
            "2) Keep keys/values as close as possible to the original.\n"
            "3) Do not add markdown, comments, or explanations.\n"
            "4) If the input is already valid, return it unchanged.\n\n"
            "Broken JSON:\n"
            f"{broken}"
        )
        try:
            return self._generate_json_text(repair_prompt, provider=provider)
        except Exception as e:
            logger.warning("JSON repair via %s failed (%s): %s", provider, task, e)
            return None

    def _repair_knowledge_schema_once(self, payload: Any, *, provider: str) -> dict[str, Any] | None:
        """
        Convert a parsed-but-invalid payload into the strict knowledge schema with one retry.
        """
        if provider == "groq" and self._groq_rate_limited_recently:
            logger.info("Skip knowledge schema repair via groq: recent rate limit")
            return None
        try:
            payload_text = json.dumps(payload, ensure_ascii=False)
        except Exception:
            payload_text = str(payload)
        if len(payload_text) > _MAX_REPAIR_PAYLOAD_CHARS:
            payload_text = payload_text[:_MAX_REPAIR_PAYLOAD_CHARS]

        repair_prompt = (
            "You are a strict JSON normalizer.\n"
            "Rewrite the following parsed JSON into EXACTLY this root shape:\n"
            "{\"react_flow\":{\"nodes\":[],\"edges\":[]},\"quiz\":{\"title\":\"\",\"questions\":[]},\"tutor\":{\"summary\":\"\",\"key_points\":[]}}\n"
            "Rules:\n"
            "1) Keep meaning/content from input as much as possible.\n"
            "2) Ensure react_flow.nodes and react_flow.edges are arrays.\n"
            "3) Ensure quiz.questions is an array and tutor.key_points is an array.\n"
            "4) Output ONE valid JSON object only. No markdown/explanations.\n\n"
            "Input JSON:\n"
            f"{payload_text}"
        )
        last_err: Exception | None = None
        for _ in range(_MAX_SCHEMA_REPAIR_ATTEMPTS):
            try:
                fixed_raw = self._generate_json_text(repair_prompt, provider=provider)
                fixed = self._load_json_payload(fixed_raw, provider=provider, task="knowledge_schema_repair")
                if isinstance(fixed, dict):
                    rf = fixed.get("react_flow")
                    if isinstance(rf, dict):
                        fixed["react_flow"] = _ensure_main_branch_detail_children(rf)
                self._validate_payload(fixed)
                logger.info("Knowledge schema repaired successfully via provider=%s", provider)
                return fixed
            except Exception as e:
                last_err = e
        logger.warning("Knowledge schema repair via %s failed: %s", provider, last_err)
        return None

    def _generate_with_google(self, prompt: str) -> str:
        if self._model is None:
            raise KnowledgeGenerationError("GOOGLE_API_KEY is not set")

        response = None
        last_error: Exception | None = None
        for model_name in GEMINI_MODELS:
            try:
                if model_name != self._model_name:
                    self._model = self._build_model(model_name)
                    self._model_name = model_name
                response = self._generate_with_google_backoff(prompt)
                break
            except Exception as e:
                last_error = e
                msg = str(e)
                if "is not found" in msg or "not supported for generateContent" in msg or "404" in msg:
                    logger.warning("Gemini model unavailable (%s): %s", model_name, msg)
                    continue
                raise

        if response is None:
            raise KnowledgeGenerationError(f"Gemini request failed on all candidate models: {last_error}")

        raw = getattr(response, "text", None) or ""
        self._last_token_confidence = _gemini_response_confidence(response)
        return str(raw)

    def _generate_with_google_backoff(self, prompt: str) -> object:
        assert self._model is not None
        attempts = len(_BACKOFF_SECONDS) + 1
        last_error: Exception | None = None
        for i in range(attempts):
            try:
                return self._model.generate_content(prompt)
            except Exception as e:
                last_error = e
                if not _is_rate_limit_error(e):
                    raise
                if i >= len(_BACKOFF_SECONDS):
                    break
                wait_s = _BACKOFF_SECONDS[i]
                logger.warning("Gemini 429 rate-limit, retrying in %ss...", wait_s)
                time.sleep(wait_s)
        assert last_error is not None
        raise last_error

    def _generate_with_groq(self, prompt: str) -> str:
        assert self._groq_client is not None
        if self._is_groq_in_cooldown():
            raise KnowledgeGenerationError("Groq is in temporary cooldown after repeated rate limits")
        last_error: Exception | None = None
        sys_msg = (
            "Follow the user's RISEN prompt: single JSON only, keys react_flow, quiz, tutor. "
            "Honor ROLE/INSTRUCTION/EXECUTE; output must match the schema in the user message. "
            "No markdown, code fences, or extra text."
        )
        messages = [
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": prompt},
        ]
        for model_name in _GROQ_CHAT_MODEL_CANDIDATES:
            t0 = time.perf_counter()
            try:
                completion = None
                used_logprobs = model_name not in self._groq_no_logprobs_models
                if used_logprobs:
                    try:
                        completion = self._groq_client.chat.completions.create(
                            model=model_name,
                            temperature=0.15,
                            logprobs=True,
                            top_logprobs=1,
                            messages=messages,
                        )
                    except Exception as e_try_logprobs:
                        if _is_rate_limit_error(e_try_logprobs):
                            self._mark_groq_rate_limit()
                            raise
                        if _is_bad_request_error(e_try_logprobs):
                            self._groq_no_logprobs_models.add(model_name)
                            logger.info(
                                "Groq model %s does not support logprobs; retrying without logprobs",
                                model_name,
                            )
                        else:
                            raise
                if completion is None:
                    completion = self._groq_client.chat.completions.create(
                        model=model_name,
                        temperature=0.15,
                        messages=messages,
                    )

                self._last_token_confidence = _groq_completion_confidence(completion)
                text = completion.choices[0].message.content if completion.choices else ""
                logger.info(
                    "groq_completion_ok model=%s used_logprobs=%s latency_ms=%.2f",
                    model_name,
                    used_logprobs and model_name not in self._groq_no_logprobs_models,
                    (time.perf_counter() - t0) * 1000.0,
                )
                return str(text or "")
            except Exception as e:
                last_error = e
                if _is_rate_limit_error(e):
                    self._mark_groq_rate_limit()
                logger.warning(
                    "groq_completion_fail model=%s latency_ms=%.2f error_type=%s error=%s",
                    model_name,
                    (time.perf_counter() - t0) * 1000.0,
                    type(e).__name__,
                    e,
                )
                continue
        logger.exception("Groq fallback failed")
        raise KnowledgeGenerationError(f"Groq fallback failed: {last_error or 'all models failed'}")

    @staticmethod
    def _validate_payload(payload: dict[str, Any]) -> None:
        if not isinstance(payload, dict):
            raise KnowledgeGenerationError("Root JSON must be an object")
        for key in ("react_flow", "quiz", "tutor"):
            if key not in payload:
                raise KnowledgeGenerationError(f'Missing key "{key}" in model output')

        rf = payload["react_flow"]
        if not isinstance(rf, dict):
            raise KnowledgeGenerationError("react_flow must be an object")
        nodes = rf.get("nodes")
        edges = rf.get("edges")
        if not isinstance(nodes, list) or not isinstance(edges, list):
            raise KnowledgeGenerationError("react_flow.nodes and react_flow.edges must be arrays")

        for i, n in enumerate(nodes):
            if not isinstance(n, dict):
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}] must be an object")
            node_id = n.get("id")
            if not isinstance(node_id, str) or not node_id.strip():
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].id must be a non-empty string")
            node_type = n.get("type")
            if node_type != "neural":
                raise KnowledgeGenerationError(f'react_flow.nodes[{i}].type must be "neural"')
            pos = n.get("position")
            if not isinstance(pos, dict):
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].position must be an object")
            if "x" not in pos or "y" not in pos:
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].position must include x and y")
            try:
                x = float(pos["x"])
                y = float(pos["y"])
            except (TypeError, ValueError):
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].position x/y must be numbers")
            if not math.isfinite(x) or not math.isfinite(y):
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].position x/y must be finite numbers")
            data = n.get("data")
            if not isinstance(data, dict):
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].data must be an object")
            label = data.get("label")
            if not isinstance(label, str) or not label.strip():
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].data.label must be a non-empty string")
            role = data.get("role")
            if role is not None and role not in ("main", "detail"):
                raise KnowledgeGenerationError(
                    f'react_flow.nodes[{i}].data.role must be "main", "detail", or omitted',
                )
            is_detail = role == "detail"
            label_st = label.strip()
            if is_detail and len(label_st) > 44:
                raise KnowledgeGenerationError(
                    f"react_flow.nodes[{i}].data.label for detail nodes must be at most 44 characters",
                )
            if not is_detail and len(label_st) > 52:
                raise KnowledgeGenerationError(
                    f"react_flow.nodes[{i}].data.label must be at most 52 characters for main/root nodes",
                )
            highlight = data.get("highlight")
            if is_detail:
                if highlight is not None and highlight != "":
                    if not isinstance(highlight, str):
                        raise KnowledgeGenerationError(
                            f"react_flow.nodes[{i}].data.highlight must be a string when provided",
                        )
                    if len(highlight.strip()) > 120:
                        raise KnowledgeGenerationError(
                            f"react_flow.nodes[{i}].data.highlight for detail nodes must be at most 120 characters",
                        )
            else:
                if not isinstance(highlight, str) or not highlight.strip():
                    raise KnowledgeGenerationError(
                        f'react_flow.nodes[{i}].data.highlight must be a non-empty string for main/root nodes',
                    )
                if len(highlight.strip()) > 220:
                    raise KnowledgeGenerationError(
                        f"react_flow.nodes[{i}].data.highlight must be at most 220 characters for main/root nodes",
                    )
            if "timestamp" not in data:
                raise KnowledgeGenerationError(
                    f'react_flow.nodes[{i}] missing required data.timestamp for Deep Time-Linking',
                )
            try:
                ts = float(data["timestamp"])
            except (TypeError, ValueError):
                raise KnowledgeGenerationError(f'react_flow.nodes[{i}].data.timestamp must be a number')
            if not math.isfinite(ts):
                raise KnowledgeGenerationError(f'react_flow.nodes[{i}].data.timestamp must be finite')
            if "block_id" in data:
                bid = data.get("block_id")
                if bid is not None and (not isinstance(bid, str) or not bid.strip()):
                    raise KnowledgeGenerationError(
                        f'react_flow.nodes[{i}].data.block_id must be a non-empty string when provided',
                    )

        for i, e in enumerate(edges):
            if not isinstance(e, dict):
                raise KnowledgeGenerationError(f"react_flow.edges[{i}] must be an object")
            edge_id = e.get("id")
            if not isinstance(edge_id, str) or not edge_id.strip():
                raise KnowledgeGenerationError(f"react_flow.edges[{i}].id must be a non-empty string")
            source = e.get("source")
            target = e.get("target")
            if not isinstance(source, str) or not source.strip():
                raise KnowledgeGenerationError(f"react_flow.edges[{i}].source must be a non-empty string")
            if not isinstance(target, str) or not target.strip():
                raise KnowledgeGenerationError(f"react_flow.edges[{i}].target must be a non-empty string")
            if e.get("type") != "neuralFlow":
                raise KnowledgeGenerationError(f'react_flow.edges[{i}].type must be "neuralFlow"')

        _validate_main_branches_have_detail_children(nodes, edges)

        quiz = payload.get("quiz")
        if not isinstance(quiz, dict):
            raise KnowledgeGenerationError("quiz must be an object")
        questions = quiz.get("questions")
        if not isinstance(questions, list):
            raise KnowledgeGenerationError("quiz.questions must be an array")
        # Difficulty can change question count (easy/medium/hard).
        if len(questions) < 3 or len(questions) > 20:
            raise KnowledgeGenerationError("quiz.questions must contain 3–20 questions")
        for i, q in enumerate(questions):
            if not isinstance(q, dict):
                raise KnowledgeGenerationError(f"quiz.questions[{i}] must be an object")
            if not isinstance(q.get("question"), str) or not q["question"].strip():
                raise KnowledgeGenerationError(f"quiz.questions[{i}].question must be a non-empty string")
            choices = q.get("choices")
            if not isinstance(choices, list) or len(choices) != 4:
                raise KnowledgeGenerationError(f"quiz.questions[{i}].choices must contain exactly 4 items")
            if any(not isinstance(c, str) or not c.strip() for c in choices):
                raise KnowledgeGenerationError(f"quiz.questions[{i}].choices must be non-empty strings")
            ci = q.get("correct_index")
            if not isinstance(ci, int) or ci < 0 or ci > 3:
                raise KnowledgeGenerationError(f"quiz.questions[{i}].correct_index must be an integer in [0, 3]")
            exp = q.get("explanation")
            if exp is not None and (not isinstance(exp, str) or not exp.strip()):
                raise KnowledgeGenerationError(f"quiz.questions[{i}].explanation must be a non-empty string when provided")
            ev = q.get("evidence")
            if ev is not None:
                if not isinstance(ev, list) or len(ev) == 0 or len(ev) > 2:
                    raise KnowledgeGenerationError(f"quiz.questions[{i}].evidence must be an array of 1–2 items")
                for j, c in enumerate(ev):
                    if not isinstance(c, dict):
                        raise KnowledgeGenerationError(f"quiz.questions[{i}].evidence[{j}] must be an object")
                    try:
                        float(c.get("start"))
                        float(c.get("end"))
                    except (TypeError, ValueError):
                        raise KnowledgeGenerationError(f"quiz.questions[{i}].evidence[{j}].start/end must be numbers")
                    if not isinstance(c.get("text"), str) or not c["text"].strip():
                        raise KnowledgeGenerationError(f"quiz.questions[{i}].evidence[{j}].text must be a non-empty string")

        tutor = payload.get("tutor")
        if not isinstance(tutor, dict):
            raise KnowledgeGenerationError("tutor must be an object")
        if not isinstance(tutor.get("summary"), str) or not tutor["summary"].strip():
            raise KnowledgeGenerationError("tutor.summary must be a non-empty string")
        key_points = tutor.get("key_points")
        if not isinstance(key_points, list) or len(key_points) < 3 or len(key_points) > 20:
            raise KnowledgeGenerationError("tutor.key_points must contain 3–20 items")
        for i, kp in enumerate(key_points):
            if not isinstance(kp, dict):
                raise KnowledgeGenerationError(f"tutor.key_points[{i}] must be an object")
            if not isinstance(kp.get("text"), str) or not kp["text"].strip():
                raise KnowledgeGenerationError(f"tutor.key_points[{i}].text must be a non-empty string")
            ts = kp.get("timestamp_seconds")
            try:
                float(ts)
            except (TypeError, ValueError):
                raise KnowledgeGenerationError(
                    f"tutor.key_points[{i}].timestamp_seconds must be a number",
                )


def _extract_json_object(text: str) -> str | None:
    """
    Extract the first complete JSON object from a model response.

    Models sometimes prepend/append text or even output multiple JSON objects,
    which triggers json.loads(...): "Extra data".
    This function returns the first balanced {...} object, respecting strings/escapes.
    """
    text = (text or "").strip()
    if not text:
        return None

    # Strip fenced blocks first when present.
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if m:
            text = m.group(1).strip()

    start = text.find("{")
    if start < 0:
        return None

    in_str = False
    esc = False
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
                continue
            if ch == "\\":
                esc = True
                continue
            if ch == '"':
                in_str = False
            continue

        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            depth += 1
            continue
        if ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None


def _json_parse_candidates(text: str) -> list[str]:
    """
    Candidate strings to parse in order:
    1) raw text
    2) first extracted JSON object
    3) trailing-comma-normalized variants of (1) and (2)
    """
    raw = (text or "").strip()
    if not raw:
        return []

    out: list[str] = []

    def _push(val: str) -> None:
        v = (val or "").strip()
        if v and v not in out:
            out.append(v)

    _push(raw)
    extracted = _extract_json_object(raw)
    if extracted is not None:
        _push(extracted)

    def _strip_trailing_commas(v: str) -> str:
        return re.sub(r",(\s*[}\]])", r"\1", v)

    for v in list(out):
        _push(_strip_trailing_commas(v))
    return out


def _is_rate_limit_error(err: Exception) -> bool:
    msg = str(err).lower()
    return "429" in msg or "rate limit" in msg or "resource exhausted" in msg


def _is_bad_request_error(err: Exception) -> bool:
    msg = str(err).lower()
    return "400" in msg or "bad request" in msg or "invalid_request_error" in msg

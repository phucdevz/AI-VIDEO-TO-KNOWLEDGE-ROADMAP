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

from app.services.transcription_service import TranscriptionResult

logger = logging.getLogger(__name__)

# Keep a preferred model first, then fallback candidates for API/version drift.
GEMINI_MODELS = (
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
)
_BACKOFF_SECONDS = (2, 4, 8)


class KnowledgeGenerationError(Exception):
    """Gemini returned invalid JSON or violated pipeline constraints."""


@dataclass
class KnowledgeGenerationResult:
    react_flow: dict[str, Any]
    quiz: dict[str, Any]
    tutor: dict[str, Any]
    raw_text: str | None = None


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

    @staticmethod
    def _select_key_segments(tr: TranscriptionResult, max_segments: int = 96) -> list[str]:
        """
        Keep payload small: pick representative timestamped segments across the lecture.
        """
        segs = tr.segments
        if not segs:
            text = tr.text.strip()
            return [text[:800]] if text else []

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
    def _build_model(model_name: str) -> genai.GenerativeModel:
        return genai.GenerativeModel(
            model_name,
            generation_config={
                "temperature": 0.25,
                "response_mime_type": "application/json",
            },
        )

    def generate_from_transcript(
        self,
        tr: TranscriptionResult,
        *,
        video_title: str | None,
        target_lang: str | None = "vi",
        quiz_difficulty: str | None = "medium",
    ) -> KnowledgeGenerationResult:
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

        tl = (target_lang or "vi").strip().lower()
        if tl not in ("vi", "en"):
            tl = "vi"
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

        # Mindmap density: scale with duration (no fixed hard limit in prompt).
        # We still compute a guideline number to help the model size the outline.
        node_target = 28
        if duration_s and duration_s > 0:
            # ~1 node / 90 seconds baseline; long-form gets more nodes.
            node_target = int(max(28, round(duration_s / 90.0)))
        edge_target = int(max(node_target - 1, round(node_target * 1.6)))

        # Notes density: spread points across full lecture.
        kp_count = 8
        if duration_s and duration_s > 0:
            kp_count = int(max(6, min(16, round(duration_s / 240.0))))  # ~1 key point / 4 minutes

        prompt = f"""You are an instructional design assistant.
You MUST output exactly ONE valid JSON object and nothing else.
No markdown. No explanations. No code fences.
The JSON object MUST have exactly these top-level keys: "react_flow", "quiz", "tutor".

Target language: {target_name}.
Generate the React Flow nodes and edges in the target language.
If the video is in English but target language is Vietnamese, translate all labels and summaries accurately.

Quiz difficulty: {difficulty_hint}.

Video title (may be empty): {video_title or "unknown"}

Video duration seconds (may be empty): {duration_s if duration_s else "unknown"}

Transcript with segment times:
{chr(10).join(segment_lines)}

Compact context summary (truncated):
{tr.text[:1200]}{"..." if len(tr.text) > 1200 else ""}

Rules for "react_flow":
- Must be a React Flow compatible graph: {{"nodes": [...], "edges": [...]}}
- Each node MUST include: "id" (string), "type": "neural", "position": {{"x": number, "y": number}}, "data": {{"label": string, "timestamp": number}}
- "timestamp" is REQUIRED on every node: start time in seconds (float) for Deep Time-Linking to the video; pick the best matching second from the transcript for that concept.
- Create a COMPLETE outline, not a uniform sampling. Prioritize important concepts over filler.
- Use as many nodes as needed to capture the key ideas thoroughly (typically {node_target}+ for this duration), in a clear hierarchy: core → chapters → key ideas → details. Avoid filler; every node should add a distinct idea.
- Core coverage requirement:
  - Include 4–7 core concepts representing the main ideas of the whole lecture (not generic labels).
  - For each chapter/section, include 2–4 concrete key ideas with specific terminology from the transcript.
- Timeline coverage requirement:
  - Do NOT only sample evenly. Still ensure the mindmap spans the full lecture end-to-end.
  - When duration is known, include nodes near ~0%, ~25%, ~50%, ~75% and near the end (>= 85% of duration).
  - Avoid putting many nodes at the same early timestamp; spread timestamps across the timeline while keeping importance.
- Label quality:
  - Labels must be specific (names, mechanisms, steps, criteria). Avoid vague labels like "Giới thiệu", "Kết luận" unless accompanied by concrete content.
- Keep edges reasonable (aim around {edge_target}) and avoid disconnected islands unless necessary.
- Each edge: "id", "source", "target", "type": "neuralFlow"

Rules for "quiz":
- Structured quiz for a quiz center UI: include "title", "description" (optional), "questions" as array.
- Return exactly {question_count} questions.
- Each question: "id", "question", "choices" (array of exactly 4 strings), "correct_index" (0–3),
  "explanation" (1–2 sentences, grounded in transcript),
  "evidence" (array of 1–2 items: {{"start": number, "end": number, "text": string}} copied from transcript),
  optional "timestamp_seconds" (float).
- Questions must be grounded in transcript segments.

Rules for "tutor":
- "summary": short markdown or plain summary string
- "key_points": array of {kp_count} items: {{"text": string, "timestamp_seconds": float}}
- Key points must cover the full lecture end-to-end (early/mid/late), not just the introduction.
- When duration is known, at least 1 key point must be near the end (>= 85% of duration).

Return ONLY valid JSON, no markdown fences.
"""

        # Provider order:
        # - groq: try Groq first, then Google if available
        # - google: try Google first, then Groq if available
        # - auto: prefer Google if set, but fallback to Groq on ANY failure (quota/full/invalid JSON/etc.)
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
            try:
                raw = self._generate_json_text(prompt, provider=prov)
                if not raw.strip():
                    raise KnowledgeGenerationError("Empty AI response")

                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    cleaned = _extract_json_object(raw)
                    if cleaned is None:
                        raise KnowledgeGenerationError(f"{prov} returned invalid JSON")
                    payload = json.loads(cleaned)

                self._validate_payload(payload)
                return KnowledgeGenerationResult(
                    react_flow=payload["react_flow"],
                    quiz=payload["quiz"],
                    tutor=payload["tutor"],
                    raw_text=raw,
                )
            except Exception as e:
                last_err = e
                logger.warning("AI provider %s failed, trying next if available: %s", prov, e)
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

        prompt = f"""You are a helpful AI tutor. Answer the user's question using ONLY the transcript segments.

You MUST return exactly ONE valid JSON object and nothing else.
No markdown. No code fences.

Schema:
{{
  "answer": string,
  "citations": [{{"start": number, "end": number, "text": string}}]
}}

Rules:
- "answer" must be concise, helpful, and grounded in the provided segments.
- "citations" must contain at most {mc} items.
- Each citation MUST be copied from one of the provided segments (same idea, use the segment text).
- If the transcript doesn't contain enough info, say you don't have that info yet and keep citations empty.

Video title (may be empty): {video_title or "unknown"}

Transcript segments:
{chr(10).join(seg_lines)}

User question:
{q}
"""

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
                cleaned = None
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    cleaned = _extract_json_object(raw)
                    if cleaned is None:
                        raise KnowledgeGenerationError(f"{prov} returned invalid JSON")
                    payload = json.loads(cleaned)

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

                return {"answer": ans.strip(), "citations": norm_cits}
            except Exception as e:
                last_err = e
                logger.warning("Tutor provider %s failed, trying next if available: %s", prov, e)
                continue

        raise KnowledgeGenerationError(str(last_err or "Tutor generation failed"))

    def _generate_json_text(self, prompt: str, *, provider: str) -> str:
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
        try:
            groq_models = ("llama-3.3-70b-versatile", "llama-3.1-70b-versatile")
            last_error: Exception | None = None
            for model_name in groq_models:
                try:
                    completion = self._groq_client.chat.completions.create(
                        model=model_name,
                        temperature=0.2,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "You must return exactly one valid JSON object with keys react_flow, quiz, tutor. "
                                    "The JSON must follow the schema described by the user message. "
                                    "Do NOT include markdown, code fences, comments, or any extra text."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                    )
                    text = completion.choices[0].message.content if completion.choices else ""
                    logger.info("Groq completion succeeded with model %s", model_name)
                    return str(text or "")
                except Exception as e:  # capture quota/model specific info
                    last_error = e
                    msg = str(e)
                    logger.warning("Groq model %s failed: %s", model_name, msg)
                    # Try next candidate if available.
                    continue
            raise last_error or RuntimeError("Groq completion failed for all candidate models")
        except Exception as e:
            logger.exception("Groq fallback failed")
            raise KnowledgeGenerationError(f"Groq fallback failed: {e}") from e

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

    # Fast-path: pure object.
    if text.startswith("{") and text.endswith("}"):
        return text

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


def _is_rate_limit_error(err: Exception) -> bool:
    msg = str(err).lower()
    return "429" in msg or "rate limit" in msg or "resource exhausted" in msg

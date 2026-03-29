from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import google.generativeai as genai

from app.services.transcription_service import TranscriptionResult

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-1.5-flash"


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

    def __init__(self, api_key: str) -> None:
        if not api_key or not api_key.strip():
            raise KnowledgeGenerationError("GOOGLE_API_KEY is not set")
        genai.configure(api_key=api_key.strip())
        self._model = genai.GenerativeModel(
            GEMINI_MODEL,
            generation_config={
                "temperature": 0.25,
                "response_mime_type": "application/json",
            },
        )

    def generate_from_transcript(self, tr: TranscriptionResult, *, video_title: str | None) -> KnowledgeGenerationResult:
        segment_lines = [f"[{s.start:.2f}s–{s.end:.2f}s] {s.text}" for s in tr.segments[:400]]
        if len(tr.segments) > 400:
            segment_lines.append(f"... ({len(tr.segments) - 400} more segments omitted)")

        prompt = f"""You are an instructional design assistant. From the lecture transcript (with timestamps), produce ONE JSON object with exactly these top-level keys: "react_flow", "quiz", "tutor".

Video title (may be empty): {video_title or "unknown"}

Transcript with segment times:
{chr(10).join(segment_lines)}

Full plain text (reference):
{tr.text[:12000]}{"..." if len(tr.text) > 12000 else ""}

Rules for "react_flow":
- Must be a React Flow compatible graph: {{"nodes": [...], "edges": [...]}}
- Each node MUST include: "id" (string), "type": "neural", "position": {{"x": number, "y": number}}, "data": {{"label": string, "timestamp": number}}
- "timestamp" is REQUIRED on every node: start time in seconds (float) for Deep Time-Linking to the video; pick the best matching second from the transcript for that concept.
- Use 8–20 nodes in a tree or DAG reflecting the lecture outline (e.g. lecture core → sections → key ideas). Position x/y as a rough tree layout (root top center, children below, spread horizontally).
- Each edge: "id", "source", "target", "type": "neuralFlow"

Rules for "quiz":
- Structured quiz for a quiz center UI: include "title", "description" (optional), "questions" as array.
- Each question: "id", "question", "choices" (array of 4 strings), "correct_index" (0–3), optional "timestamp_seconds" (float) linking to the part of the video the question is about.
- 5–12 questions, grounded in the transcript.

Rules for "tutor":
- "summary": short markdown or plain summary string
- "key_points": array of {{"text": string, "timestamp_seconds": float}} with 4–10 items tied to transcript times

Return ONLY valid JSON, no markdown fences.
"""

        try:
            response = self._model.generate_content(prompt)
        except Exception as e:
            logger.exception("Gemini generate_content failed")
            raise KnowledgeGenerationError(f"Gemini request failed: {e}") from e

        raw = getattr(response, "text", None) or ""
        if not raw.strip():
            raise KnowledgeGenerationError("Empty Gemini response")

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as e:
            cleaned = _extract_json_object(raw)
            if cleaned is None:
                raise KnowledgeGenerationError(f"Gemini returned invalid JSON: {e}") from e
            try:
                payload = json.loads(cleaned)
            except json.JSONDecodeError as e2:
                raise KnowledgeGenerationError(f"Gemini returned invalid JSON: {e2}") from e2

        try:
            self._validate_payload(payload)
        except KnowledgeGenerationError:
            raise
        except Exception as e:
            raise KnowledgeGenerationError(str(e)) from e

        return KnowledgeGenerationResult(
            react_flow=payload["react_flow"],
            quiz=payload["quiz"],
            tutor=payload["tutor"],
            raw_text=raw,
        )

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
            data = n.get("data")
            if not isinstance(data, dict):
                raise KnowledgeGenerationError(f"react_flow.nodes[{i}].data must be an object")
            if "timestamp" not in data:
                raise KnowledgeGenerationError(
                    f'react_flow.nodes[{i}] missing required data.timestamp for Deep Time-Linking',
                )
            try:
                float(data["timestamp"])
            except (TypeError, ValueError):
                raise KnowledgeGenerationError(f'react_flow.nodes[{i}].data.timestamp must be a number')


def _extract_json_object(text: str) -> str | None:
    text = text.strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if m:
            text = m.group(1).strip()
    if text.startswith("{") and text.endswith("}"):
        return text
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return None

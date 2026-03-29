from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.transcription_service import TranscriptSegment


@dataclass
class KnowledgeChunk:
    """Semantic-ish slice of the lecture for future tutor RAG retrieval."""

    text: str
    start_seconds: float
    end_seconds: float
    segment_indices: list[int]


def semantic_chunk_transcript(
    segments: list[TranscriptSegment],
    *,
    max_chars: int = 720,
    min_chars: int = 120,
    sentence_break_preference: bool = True,
) -> list[KnowledgeChunk]:
    """
    Group ASR segments into medium-sized chunks with coarse topic boundaries.

    Strategy: accumulate segments until max_chars, preferring breaks after sentence
    punctuation when `sentence_break_preference` is True.
    """
    if not segments:
        return []

    chunks: list[KnowledgeChunk] = []
    buf_text: list[str] = []
    buf_starts: list[float] = []
    idx_buf: list[int] = []
    char_count = 0

    def flush(end_seg: TranscriptSegment) -> None:
        nonlocal buf_text, buf_starts, idx_buf, char_count
        if not buf_text:
            return
        body = " ".join(t.strip() for t in buf_text if t.strip())
        if len(body) < min_chars and chunks:
            prev = chunks.pop()
            body = f"{prev.text} {body}".strip()
            start_sec = prev.start_seconds
            merged_idx = prev.segment_indices + idx_buf
        elif buf_starts:
            start_sec = buf_starts[0]
            merged_idx = list(idx_buf)
        else:
            start_sec = end_seg.start
            merged_idx = list(idx_buf)
        chunks.append(
            KnowledgeChunk(
                text=body.strip(),
                start_seconds=start_sec,
                end_seconds=end_seg.end,
                segment_indices=merged_idx,
            ),
        )
        buf_text = []
        buf_starts = []
        idx_buf = []
        char_count = 0

    for i, seg in enumerate(segments):
        t = seg.text.strip()
        if not t:
            continue
        if not buf_starts:
            buf_starts.append(seg.start)
        buf_text.append(t)
        idx_buf.append(i)
        char_count += len(t) + 1

        is_sentence_end = bool(re.search(r"[.!?]\s*$", t))
        hard_cap = char_count >= int(max_chars * 1.35)
        over_max = char_count >= max_chars

        if hard_cap:
            flush(seg)
        elif over_max and (not sentence_break_preference or is_sentence_end):
            flush(seg)

    if buf_text:
        last_idx = idx_buf[-1] if idx_buf else len(segments) - 1
        flush(segments[last_idx])

    return chunks

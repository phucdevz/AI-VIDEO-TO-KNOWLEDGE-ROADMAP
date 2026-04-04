from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class PipelineMetricsSchema(BaseModel):
    """Latency, provider, confidence, and accuracy components for observability."""

    latency_ms: float = Field(..., description="End-to-end pipeline latency (ms) for this run")
    provider: str | None = Field(None, description="AI provider used for knowledge generation (google/groq)")
    confidence: float | None = Field(None, description="LLM confidence when available (e.g. Groq logprobs)")
    accuracy_score: float | None = Field(None, description="Weighted composite S/T/K score in [0,1]")
    similarity_s: float | None = None
    timestamp_t: float | None = None
    keyword_f1_k: float | None = None
    refined: bool = Field(False, description="Whether a refinement pass ran after low accuracy")


class AudioExtractionRequest(BaseModel):
    url: HttpUrl = Field(..., description="YouTube (or yt-dlp supported) URL")
    user_id: str | None = Field(
        default=None,
        description="Optional Supabase auth user id; stored on lecture row for RLS / library scope",
    )
    target_lang: str | None = Field(
        default="vi",
        description="Target language for AI outputs: 'vi' or 'en'. Defaults to 'vi'.",
    )
    quiz_difficulty: str | None = Field(
        default="medium",
        description="Quiz difficulty: 'easy' | 'medium' | 'hard'. Controls quiz complexity and question count.",
    )
    force: bool = Field(
        default=False,
        description="When true, bypass Supabase cache and regenerate pipeline outputs.",
    )


class TranscriptSegmentSchema(BaseModel):
    start: float
    end: float
    text: str


class KnowledgeChunkSchema(BaseModel):
    text: str
    start_seconds: float
    end_seconds: float
    segment_indices: list[int] = Field(default_factory=list)


class AudioExtractionResponse(BaseModel):
    """Full Video → Knowledge pipeline result."""

    video_id: str
    title: str | None
    duration_seconds: float | None
    source_url: str
    audio_filename: str
    audio_path: str = Field(..., description="Absolute path to downloaded audio on the API server")
    extractor: str = "yt-dlp"

    transcription: dict[str, Any] = Field(
        ...,
        description="verbose_json-style payload: text, language, duration, segments[]",
    )
    knowledge_chunks: list[KnowledgeChunkSchema] = Field(
        default_factory=list,
        description="Semantic chunks for tutor RAG",
    )
    react_flow: dict[str, Any] = Field(
        ...,
        description="React Flow graph (nodes with data.timestamp, edges)",
    )
    quiz: dict[str, Any] = Field(..., description="Structured quiz for QuizCenter")
    tutor: dict[str, Any] = Field(..., description="Summary + key points for Tutor sidebar")

    persisted: bool = Field(False, description="Saved to Supabase lectures table")
    lecture_id: str | None = Field(
        None,
        description="Supabase lectures.id: set when placeholder upsert succeeds (Realtime) and/or final save",
    )
    persist_message: str | None = Field(None, description="Error message when persist skipped/failed")

    pipeline_metrics: PipelineMetricsSchema | None = Field(
        None,
        description="Timing, provider, and accuracy metrics for this extraction run",
    )

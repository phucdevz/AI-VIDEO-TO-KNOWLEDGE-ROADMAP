from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AdminKpiResponse(BaseModel):
    requests_per_min: float = 0.0
    success_rate: float = 0.0
    error_400_count: int = 0
    error_429_count: int = 0
    error_502_count: int = 0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    avg_accuracy_score: float = 0.0
    avg_accuracy_ratio_pct: float = 0.0


class AdminPipelineRunItem(BaseModel):
    request_id: str | None = None
    created_at: datetime | None = None
    event_type: str | None = None
    provider: str | None = None
    model: str | None = None
    latency_ms: float | None = None
    error_type: str | None = None
    status: Literal["success", "error", "unknown"] = "unknown"
    accuracy_score: float | None = None
    accuracy_ratio_pct: float | None = None
    similarity_s: float | None = None
    timestamp_t: float | None = None
    keyword_f1_k: float | None = None
    refined: bool | None = None


class AdminPipelineRunsResponse(BaseModel):
    items: list[AdminPipelineRunItem] = Field(default_factory=list)


class AdminLogExplorerResponse(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class AdminQualitySummaryResponse(BaseModel):
    reviewed_runs: int = 0
    pass_count: int = 0
    fail_count: int = 0
    pass_rate: float = 0.0
    average_accuracy_score: float = 0.0
    average_accuracy_ratio_pct: float = 0.0


class AdminFeatureFlagsPayload(BaseModel):
    ai_provider: str
    ai_refine_enabled: bool
    groq_cooldown_seconds: int
    retry_budget: int
    split_key_routing_enabled: bool


class AdminFeatureFlagsUpdate(BaseModel):
    ai_provider: str | None = None
    ai_refine_enabled: bool | None = None
    groq_cooldown_seconds: int | None = None
    retry_budget: int | None = None
    split_key_routing_enabled: bool | None = None


class AdminAuditLogRequest(BaseModel):
    action: str = Field(..., min_length=3, max_length=120)
    target: str = Field(..., min_length=2, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AdminPipelineActionRequest(BaseModel):
    url: str = Field(..., min_length=8)
    user_id: str | None = None
    target_lang: str | None = "vi"
    quiz_difficulty: str | None = "medium"
    force: bool = True

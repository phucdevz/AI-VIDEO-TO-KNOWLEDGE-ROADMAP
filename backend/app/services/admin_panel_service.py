from __future__ import annotations

import json
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path
from statistics import mean
from typing import Any

from app.config import Settings
from app.schemas.admin_panel import (
    AdminFeatureFlagsPayload,
    AdminFeatureFlagsUpdate,
    AdminKpiResponse,
    AdminPipelineRunItem,
    AdminPipelineRunsResponse,
    AdminQualitySummaryResponse,
)
from app.admin_storage import clear_all_temp, clear_temp_audio, storage_stats_markdown
from app.services.database_service import DatabaseService


class AdminPanelService:
    def __init__(self, db: DatabaseService, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def _list_logs(self, limit: int = 120) -> list[dict[str, Any]]:
        rows = self._db.list_recent_system_logs(limit)
        return [r for r in rows if isinstance(r, dict)]

    @staticmethod
    def _extract_accuracy_ratio_pct(row: dict[str, Any]) -> float | None:
        score = row.get("accuracy_score")
        if isinstance(score, (int, float)):
            return max(0.0, min(100.0, float(score) * 100.0))
        pm = row.get("pipeline_metrics")
        if isinstance(pm, dict):
            s = pm.get("accuracy_score")
            if isinstance(s, (int, float)):
                return max(0.0, min(100.0, float(s) * 100.0))
        return None

    def get_kpis(self) -> AdminKpiResponse:
        rows = self._list_logs(240)
        now = datetime.now(UTC)
        recent = []
        for row in rows:
            created_at = row.get("created_at")
            if isinstance(created_at, str):
                try:
                    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if created >= now - timedelta(minutes=10):
                    recent.append(row)

        denom = max(1, len(recent))
        success_count = sum(1 for r in recent if not (r.get("error_type") or r.get("error")))
        latencies = [float(r["latency_ms"]) for r in recent if isinstance(r.get("latency_ms"), (int, float))]
        ratios = [x for x in (self._extract_accuracy_ratio_pct(r) for r in recent) if x is not None]
        scores = [x / 100.0 for x in ratios]

        sorted_latency = sorted(latencies)
        p50 = 0.0
        p95 = 0.0
        if sorted_latency:
            mid = len(sorted_latency) // 2
            p50 = sorted_latency[mid]
            idx95 = min(len(sorted_latency) - 1, math.ceil(0.95 * len(sorted_latency)) - 1)
            p95 = sorted_latency[idx95]

        return AdminKpiResponse(
            requests_per_min=round(len(recent) / 10.0, 2),
            success_rate=round(success_count / denom, 4),
            error_400_count=sum(1 for r in recent if str(r.get("error_type", "")).endswith("400")),
            error_429_count=sum(1 for r in recent if "429" in str(r.get("error_type", ""))),
            error_502_count=sum(1 for r in recent if "502" in str(r.get("error_type", ""))),
            p50_latency_ms=round(p50, 2),
            p95_latency_ms=round(p95, 2),
            avg_accuracy_score=round(mean(scores), 4) if scores else 0.0,
            avg_accuracy_ratio_pct=round(mean(ratios), 2) if ratios else 0.0,
        )

    def list_pipeline_runs(self, limit: int = 50) -> AdminPipelineRunsResponse:
        rows = self._list_logs(max(1, min(limit, 200)))
        items: list[AdminPipelineRunItem] = []
        for row in rows:
            created = None
            created_at = row.get("created_at")
            if isinstance(created_at, str):
                try:
                    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                except ValueError:
                    created = None
            status = "unknown"
            if row.get("error_type") or row.get("error"):
                status = "error"
            elif row.get("event_type"):
                status = "success"
            ratio_pct = self._extract_accuracy_ratio_pct(row)
            items.append(
                AdminPipelineRunItem(
                    request_id=row.get("request_id"),
                    created_at=created,
                    event_type=row.get("event_type"),
                    provider=row.get("provider"),
                    model=row.get("model"),
                    latency_ms=row.get("latency_ms"),
                    error_type=row.get("error_type"),
                    status=status,
                    accuracy_score=(ratio_pct / 100.0) if ratio_pct is not None else None,
                    accuracy_ratio_pct=ratio_pct,
                    refined=row.get("refined"),
                ),
            )
        return AdminPipelineRunsResponse(items=items)

    def search_logs(
        self,
        *,
        query: str | None,
        provider: str | None,
        event_type: str | None,
        error_type: str | None,
        request_id: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        rows = self._list_logs(max(1, min(limit * 3, 300)))
        q = (query or "").strip().lower()
        provider_s = (provider or "").strip().lower()
        event_s = (event_type or "").strip().lower()
        error_s = (error_type or "").strip().lower()
        req_s = (request_id or "").strip().lower()
        out: list[dict[str, Any]] = []
        for row in rows:
            if provider_s and provider_s not in str(row.get("provider", "")).lower():
                continue
            if event_s and event_s not in str(row.get("event_type", "")).lower():
                continue
            if error_s and error_s not in str(row.get("error_type", "")).lower():
                continue
            if req_s and req_s not in str(row.get("request_id", "")).lower():
                continue
            if q:
                raw = json.dumps(row, ensure_ascii=False).lower()
                if q not in raw:
                    continue
            out.append(row)
            if len(out) >= limit:
                break
        return out

    def get_quality_summary(self) -> AdminQualitySummaryResponse:
        rows = self._list_logs(200)
        reviewed = [r for r in rows if self._extract_accuracy_ratio_pct(r) is not None]
        ratios = [self._extract_accuracy_ratio_pct(r) for r in reviewed]
        ratio_values = [float(x) for x in ratios if x is not None]
        pass_count = sum(1 for x in ratio_values if x >= 70.0)
        fail_count = max(0, len(ratio_values) - pass_count)
        reviewed_runs = len(ratio_values)
        return AdminQualitySummaryResponse(
            reviewed_runs=reviewed_runs,
            pass_count=pass_count,
            fail_count=fail_count,
            pass_rate=(pass_count / reviewed_runs) if reviewed_runs else 0.0,
            average_accuracy_score=(mean(ratio_values) / 100.0) if ratio_values else 0.0,
            average_accuracy_ratio_pct=mean(ratio_values) if ratio_values else 0.0,
        )

    @staticmethod
    def feature_flags_path() -> Path:
        return Path(__file__).resolve().parent.parent / "storage" / "admin_feature_flags.json"

    def get_feature_flags(self) -> AdminFeatureFlagsPayload:
        defaults = AdminFeatureFlagsPayload(
            ai_provider=self._settings.ai_provider,
            ai_refine_enabled=True,
            groq_cooldown_seconds=60,
            retry_budget=2,
            split_key_routing_enabled=True,
        )
        path = self.feature_flags_path()
        if not path.exists():
            return defaults
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return defaults
            return AdminFeatureFlagsPayload(
                ai_provider=str(data.get("ai_provider", defaults.ai_provider)),
                ai_refine_enabled=bool(data.get("ai_refine_enabled", defaults.ai_refine_enabled)),
                groq_cooldown_seconds=int(data.get("groq_cooldown_seconds", defaults.groq_cooldown_seconds)),
                retry_budget=int(data.get("retry_budget", defaults.retry_budget)),
                split_key_routing_enabled=bool(
                    data.get("split_key_routing_enabled", defaults.split_key_routing_enabled),
                ),
            )
        except Exception:
            return defaults

    def update_feature_flags(self, payload: AdminFeatureFlagsUpdate) -> AdminFeatureFlagsPayload:
        current = self.get_feature_flags().model_dump()
        updates = payload.model_dump(exclude_none=True)
        current.update(updates)
        final = AdminFeatureFlagsPayload(**current)
        path = self.feature_flags_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(final.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
        return final

    def get_quota_key_routing_status(self) -> dict[str, Any]:
        return {
            "split_key_routing_enabled": self.get_feature_flags().split_key_routing_enabled,
            "groq_chat_key_configured": bool((self._settings.effective_groq_chat_key or "").strip()),
            "groq_whisper_key_configured": bool((self._settings.effective_groq_whisper_key or "").strip()),
            "google_key_configured": bool((self._settings.google_api_key or "").strip()),
            "policy_hint": "chat->GROQ_CHAT_API_KEY, whisper->GROQ_WHISPER_API_KEY",
        }

    def run_data_cleanup(self, mode: str) -> dict[str, str]:
        mode_norm = (mode or "").strip().lower()
        if mode_norm == "audio":
            return {"mode": "audio", "message": clear_temp_audio()}
        if mode_norm == "all":
            return {"mode": "all", "message": clear_all_temp()}
        return {"mode": "stats", "message": storage_stats_markdown()}

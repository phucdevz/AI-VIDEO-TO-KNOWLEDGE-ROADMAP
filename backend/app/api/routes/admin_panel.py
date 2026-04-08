from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.admin_auth import require_admin_roles
from app.api.deps import get_database_service, get_settings_dep
from app.config import Settings
from app.schemas.admin_panel import (
    AdminAuditLogRequest,
    AdminFeatureFlagsPayload,
    AdminFeatureFlagsUpdate,
    AdminKpiResponse,
    AdminLogExplorerResponse,
    AdminPipelineActionRequest,
    AdminPipelineRunsResponse,
    AdminQualitySummaryResponse,
)
from app.services.pipeline import run_full_extraction_pipeline
from app.services.admin_panel_service import AdminPanelService
from app.services.database_service import DatabaseService

router = APIRouter()


def _panel_svc(db: DatabaseService, settings: Settings) -> AdminPanelService:
    return AdminPanelService(db, settings)


@router.get(
    "/kpis",
    response_model=AdminKpiResponse,
    summary="Operations KPIs for admin dashboard",
)
def get_kpis(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin", "viewer"))],
) -> AdminKpiResponse:
    return _panel_svc(db, settings).get_kpis()


@router.get(
    "/runs",
    response_model=AdminPipelineRunsResponse,
    summary="List recent pipeline runs for control center",
)
def list_runs(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin", "viewer"))],
    limit: int = Query(default=50, ge=1, le=200),
) -> AdminPipelineRunsResponse:
    return _panel_svc(db, settings).list_pipeline_runs(limit=limit)


@router.get(
    "/logs",
    response_model=AdminLogExplorerResponse,
    summary="Log explorer with filters and full-text query",
)
def list_logs(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin", "viewer"))],
    limit: int = Query(default=50, ge=1, le=200),
    q: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    error_type: str | None = Query(default=None),
    request_id: str | None = Query(default=None),
) -> AdminLogExplorerResponse:
    svc = _panel_svc(db, settings)
    items = svc.search_logs(
        query=q,
        provider=provider,
        event_type=event_type,
        error_type=error_type,
        request_id=request_id,
        limit=limit,
    )
    return AdminLogExplorerResponse(items=items, total=len(items))


@router.get(
    "/quality/summary",
    response_model=AdminQualitySummaryResponse,
    summary="Aggregate quality review snapshot",
)
def quality_summary(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _role: Annotated[str, Depends(require_admin_roles("super_admin", "content_admin", "viewer"))],
) -> AdminQualitySummaryResponse:
    return _panel_svc(db, settings).get_quality_summary()


@router.get(
    "/flags",
    response_model=AdminFeatureFlagsPayload,
    summary="Read admin feature flags",
)
def get_flags(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin", "viewer"))],
) -> AdminFeatureFlagsPayload:
    return _panel_svc(db, settings).get_feature_flags()


@router.patch(
    "/flags",
    response_model=AdminFeatureFlagsPayload,
    summary="Update feature flags with audit trail",
)
def patch_flags(
    body: AdminFeatureFlagsUpdate,
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin"))],
) -> AdminFeatureFlagsPayload:
    svc = _panel_svc(db, settings)
    updated = svc.update_feature_flags(body)
    db.insert_system_log(
        {
            "request_id": f"admin-flags-{datetime.now(UTC).timestamp()}",
            "event_type": "admin.flags.update",
            "provider": "admin_api",
            "model": "n/a",
            "latency_ms": 0.0,
            "error_type": None,
            "accuracy_score": None,
            "refined": False,
            "metadata": {"role": role, "updates": body.model_dump(exclude_none=True)},
        },
    )
    return updated


@router.post(
    "/audit/log",
    summary="Write admin action audit entry",
)
def post_audit(
    body: AdminAuditLogRequest,
    db: Annotated[DatabaseService, Depends(get_database_service)],
    _settings: Annotated[Settings, Depends(get_settings_dep)],
    role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin", "content_admin"))],
) -> dict[str, Any]:
    payload = body.model_dump()
    db.insert_system_log(
        {
            "request_id": f"admin-audit-{datetime.now(UTC).timestamp()}",
            "event_type": "admin.audit",
            "provider": "admin_api",
            "model": "n/a",
            "latency_ms": 0.0,
            "error_type": None,
            "accuracy_score": None,
            "refined": False,
            "metadata": {"role": role, **payload},
        },
    )
    return {"ok": True}


@router.post(
    "/pipeline/trigger",
    summary="Trigger extraction pipeline from admin",
)
async def trigger_pipeline(
    body: AdminPipelineActionRequest,
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin"))],
) -> dict[str, Any]:
    started = datetime.now(UTC)
    res = await run_full_extraction_pipeline(
        body.url,
        user_id=body.user_id,
        target_lang=body.target_lang,
        quiz_difficulty=body.quiz_difficulty,
        force=body.force,
    )
    elapsed = (datetime.now(UTC) - started).total_seconds() * 1000.0
    db.insert_system_log(
        {
            "request_id": f"admin-trigger-{started.timestamp()}",
            "event_type": "admin.pipeline.trigger",
            "provider": "admin_api",
            "model": "n/a",
            "latency_ms": elapsed,
            "error_type": None,
            "accuracy_score": (res.pipeline_metrics.accuracy_score if res.pipeline_metrics else None),
            "refined": (res.pipeline_metrics.refined if res.pipeline_metrics else False),
            "metadata": {"role": role, "url": body.url, "lecture_id": res.lecture_id},
        },
    )
    return {
        "ok": True,
        "lecture_id": res.lecture_id,
        "video_id": res.video_id,
        "source_url": res.source_url,
        "persisted": res.persisted,
    }


@router.get(
    "/quota-routing",
    summary="Read API key routing and quota policy status",
)
def get_quota_routing(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin", "viewer"))],
) -> dict[str, Any]:
    return _panel_svc(db, settings).get_quota_key_routing_status()


@router.post(
    "/data/cleanup",
    summary="Cleanup storage temp artifacts",
)
def data_cleanup(
    db: Annotated[DatabaseService, Depends(get_database_service)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    role: Annotated[str, Depends(require_admin_roles("super_admin", "ops_admin"))],
    mode: Annotated[str, Query(pattern="^(stats|audio|all)$")] = "stats",
) -> dict[str, Any]:
    svc = _panel_svc(db, settings)
    payload = svc.run_data_cleanup(mode)
    db.insert_system_log(
        {
            "request_id": f"admin-cleanup-{datetime.now(UTC).timestamp()}",
            "event_type": "admin.data.cleanup",
            "provider": "admin_api",
            "model": "n/a",
            "latency_ms": 0.0,
            "error_type": None,
            "accuracy_score": None,
            "refined": False,
            "metadata": {"role": role, "mode": mode},
        },
    )
    return {"ok": True, **payload}

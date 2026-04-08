# Admin Panel All-in-One Implementation

This document translates the approved plan into concrete implementation slices in the current backend codebase.

## 1) Hybrid Architecture Spec and Boundaries

- **Desktop shell**: keep `backend/run_desktop.py` + mounted Gradio at `/admin` for internal operators.
- **Web admin**: use the same backend APIs under `GET/POST/PATCH /api/v1/admin/*`.
- **Admin API boundary**: all control operations are centralized in `backend/app/api/routes/admin_panel.py`.
- **Service boundary**: aggregation and file-backed feature flags live in `backend/app/services/admin_panel_service.py`.
- **Security boundary**: header-based RBAC and optional token gate in `backend/app/api/admin_auth.py`.

## 2) Phase 1 - Operations Core

Implemented:

- **Realtime KPI endpoint**: `GET /api/v1/admin/kpis`
  - requests/min (10-minute window)
  - success rate
  - error counters (`400/429/502`)
  - p50/p95 latency
  - avg `accuracy_score` and `accuracy_ratio_pct`
- **Pipeline Control data endpoint**: `GET /api/v1/admin/runs?limit=...`
  - request id, provider/model, status, latency, error type, refined flag
  - includes both score `0..1` and ratio `%`
- **Log explorer endpoint**: `GET /api/v1/admin/logs`
  - supports `q`, `provider`, `event_type`, `error_type`, `request_id`, `limit`
  - full-text scan over normalized log JSON
- **Pipeline trigger endpoint**: `POST /api/v1/admin/pipeline/trigger`
  - allows ops to trigger/retry pipeline with `force=true` from admin plane
- **Telemetry normalization**:
  - normalized fields in API models: `request_id`, `event_type`, `provider`, `model`, `latency_ms`, `error_type`, `accuracy_score`, `accuracy_ratio_pct`.

## 3) Phase 2 - Quality and Governance

Implemented:

- **Quality summary endpoint**: `GET /api/v1/admin/quality/summary`
  - reviewed runs
  - pass/fail counts (pass threshold: 70%)
  - pass rate
  - average score and average accuracy ratio
- **Feature flags center**:
  - `GET /api/v1/admin/flags`
  - `PATCH /api/v1/admin/flags`
  - persistent file: `backend/app/storage/admin_feature_flags.json`
  - controlled flags:
    - `ai_provider`
    - `ai_refine_enabled`
    - `groq_cooldown_seconds`
    - `retry_budget`
    - `split_key_routing_enabled`
- **Rollback path**:
  - file-backed flags are reversible by patching previous values.

## 4) Phase 3 - User and Data Admin

Implemented:

- **RBAC roles**:
  - `super_admin`, `ops_admin`, `content_admin`, `viewer`
  - configured via `ADMIN_API_ROLES`.
- **Token gate**:
  - optional `ADMIN_API_TOKEN` for private admin traffic.
- **Audit policy**:
  - `POST /api/v1/admin/audit/log` for action audit records.
  - every flag update also emits an audit-like `system_logs` event.
- **Quota & key routing visibility**:
  - `GET /api/v1/admin/quota-routing` exposes split key routing status and key presence flags.
- **Data admin tools**:
  - `POST /api/v1/admin/data/cleanup?mode=stats|audio|all`
  - wraps existing storage cleanup ops with admin audit event.

## 5) Delivery, KPI, and Rollout Strategy

Delivery slices that can be released independently:

1. Read-only admin metrics (`/kpis`, `/runs`, `/quality/summary`).
2. Controlled write endpoint (`PATCH /flags`) for operations tuning.
3. Governance endpoint (`POST /audit/log`) for explicit audit entries.

Acceptance KPI mapping:

- **Traceability target**: all admin writes emit `system_logs` entries with event types.
- **Speed target**: dashboard data is one API call per panel (`kpis`, `runs`, `quality`).
- **Quality target**: accuracy score and ratio are both exposed for decision support.

## 6) AI Accuracy Ratio Scoring

The implementation adds a dedicated ratio output:

- `accuracy_ratio_pct = clamp(accuracy_score * 100, 0..100)`
- exposed in:
  - `GET /api/v1/admin/kpis`
  - `GET /api/v1/admin/runs`
  - `GET /api/v1/admin/quality/summary`

This supports non-technical operators who prefer a percentage-based quality signal.

"""
Gradio Admin Panel — production-style control plane (tabs, metrics, exports).
Mounted on FastAPI at /admin.
"""

from __future__ import annotations

import asyncio
import csv
import html
import io
import json
import logging
import shutil
import threading
from pathlib import Path
from typing import Any

import gradio as gr

from app.admin_env import env_file_path, read_env_values, reload_app_settings, write_env_updates
from app.admin_prompt_store import default_prompt_overrides, load_prompt_overrides, save_prompt_overrides
from app.admin_storage import clear_all_temp, clear_temp_audio, storage_stats_markdown
from app.config import get_settings
from app.services.database_service import DatabaseService
from app.services.pipeline import PipelineClientError, PipelineError, run_full_extraction_pipeline_with_progress

logger = logging.getLogger(__name__)

# EtherAI control plane — glass + neon (mockup-aligned)
_ADMIN_CSS = """
:root, body, .gradio-container, .contain {
  --background-fill-primary: #070d18 !important;
  --background-fill-secondary: rgba(12, 22, 42, 0.78) !important;
  --body-background-fill: #070d18 !important;
  --border-color-primary: rgba(0, 229, 255, 0.28) !important;
  --color-accent: #00e5ff !important;
  --button-primary-background-fill: linear-gradient(135deg, #5b21b6 0%, #7c4dff 55%, #00e5ff 100%) !important;
  --button-primary-border-color: rgba(124, 77, 255, 0.9) !important;
  --input-background-fill: rgba(8, 18, 38, 0.72) !important;
  --body-text-color: #e8f4ff !important;
  --block-label-text-color: #8aa0c2 !important;
}
footer { display: none !important; }
.gr-form { gap: 0.75rem; }

html, body {
  height: 100%;
  margin: 0;
  overflow: hidden !important;
}
.gradio-container {
  max-width: 100% !important;
  height: 100vh !important;
  overflow: hidden !important;
  background:
    radial-gradient(ellipse 120% 80% at 50% -20%, rgba(124, 77, 255, 0.22), transparent 50%),
    radial-gradient(ellipse 80% 50% at 100% 50%, rgba(0, 229, 255, 0.08), transparent 45%),
    #070d18 !important;
}
.gradio-container > div { height: 100% !important; min-height: 0 !important; }

/* Ẩn thanh cuộn (Chrome / Safari / Firefox / Edge) — vẫn cuộn bình thường */
.gradio-container * {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.gradio-container *::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent !important;
}
/* Bỏ mũi tên lên/xuống trên ô số (theme Gradio / dropdown width) */
.gradio-container input[type="number"]::-webkit-inner-spin-button,
.gradio-container input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none !important;
  margin: 0 !important;
}
.gradio-container input[type="number"] {
  -moz-appearance: textfield !important;
  appearance: textfield !important;
}

.admin-viewport {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.admin-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(1720px, 100%);
  margin: 0 auto;
  padding: clamp(6px, 1vw, 12px) clamp(10px, 1.4vw, 18px);
  box-sizing: border-box;
  width: 100%;
}

.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 20px;
  border-radius: 18px;
  background: rgba(10, 22, 48, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(0, 229, 255, 0.15);
  box-shadow: 0 8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.admin-brand h1 {
  font-size: clamp(15px, 1.5vw, 18px);
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: linear-gradient(90deg, #e8f4ff, #a5b4fc 40%, #22d3ee);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.admin-brand p { margin: 4px 0 0 0; font-size: 11px; color: #7b8aaf; }
.admin-pill {
  border: 1px solid rgba(0, 229, 255, 0.35);
  background: rgba(124, 77, 255, 0.15);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 11px;
  color: #c4d4f5;
  white-space: nowrap;
}

/* Full-width tabs: each tab is its own “screen”, not one boxed column */
.admin-tabs {
  flex: 1 !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}
.admin-tabs > .tab-nav {
  flex-shrink: 0 !important;
  border-bottom: 1px solid rgba(124, 77, 255, 0.2) !important;
  background: transparent !important;
  padding: 4px 0 10px 0 !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
}
.admin-tabs > .tab-nav button {
  border-radius: 999px !important;
  border: 1px solid rgba(136, 146, 176, 0.25) !important;
  background: rgba(16, 30, 56, 0.45) !important;
  color: #a8b8d8 !important;
  font-weight: 700 !important;
  font-size: 12px !important;
  padding: 8px 18px !important;
  margin: 0 !important;
  transition: border-color 0.2s, box-shadow 0.2s, color 0.2s !important;
}
.admin-tabs > .tab-nav button.selected {
  border-color: rgba(0, 229, 255, 0.55) !important;
  background: linear-gradient(135deg, rgba(91, 33, 182, 0.45), rgba(0, 229, 255, 0.12)) !important;
  color: #f0f7ff !important;
  box-shadow: 0 0 20px rgba(124, 77, 255, 0.25) !important;
}
.admin-tabs .tabitem {
  flex: 1 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 12px 4px 16px 4px !important;
  -webkit-overflow-scrolling: touch;
}

.admin-glass {
  border-radius: 16px;
  padding: 16px 18px;
  background: rgba(10, 22, 48, 0.5);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(124, 77, 255, 0.18);
  box-shadow: 0 12px 48px rgba(0,0,0,0.25);
}
.admin-tab-title {
  font-size: 13px !important;
  font-weight: 800 !important;
  color: #e8f4ff !important;
  margin-bottom: 8px !important;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.admin-muted { color: #8aa0c2; font-size: 12px; }

.admin-terminal textarea, .admin-terminal input {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace !important;
  font-size: 11px !important;
  line-height: 1.45 !important;
  background: rgba(4, 10, 24, 0.85) !important;
  border: 1px solid rgba(0, 229, 255, 0.12) !important;
  color: #7ee0c3 !important;
  box-shadow: inset 0 0 40px rgba(0,0,0,0.35) !important;
}

.admin-btn-row {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 10px !important;
}
.admin-btn-row button { flex-shrink: 0 !important; white-space: nowrap !important; }

.admin-gauge-wrap { padding: 8px 0 4px 0; }
.admin-gauge-score {
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(180deg, #fff, #7dd3fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.admin-gauge-formula {
  font-size: 11px;
  color: #7b8aaf;
  margin: 6px 0 14px 0;
}
.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}
@media (max-width: 720px) {
  .admin-stat-grid { grid-template-columns: 1fr; }
}
.admin-stat-card {
  border-radius: 12px;
  padding: 12px 14px;
  background: rgba(6, 14, 32, 0.65);
  border: 1px solid rgba(0, 229, 255, 0.12);
}
.admin-stat-card span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #7b8aaf; margin-bottom: 4px; }
.admin-stat-card b { font-size: 18px; font-variant-numeric: tabular-nums; color: #7ee0fd; }

.admin-gauge-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
  margin-top: 8px;
}
.admin-gauge-bar > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #7c4dff, #00e5ff);
  box-shadow: 0 0 16px rgba(0, 229, 255, 0.45);
}

.status-dot { display:inline-block; width:10px; height:10px; border-radius:999px; margin-right:8px; vertical-align:middle; }
.status-ok { background: #00e676; box-shadow: 0 0 8px rgba(0,230,118,0.5); }
.status-bad { background: #ff5252; box-shadow: 0 0 8px rgba(255,82,82,0.45); }
"""

_pipeline_lock = threading.Lock()
_pipeline_state: dict[str, Any] = {
    "running": False,
    "logs": [],
    "metrics": {},
    "error": None,
    "result_json": "",
    "last_run": None,
}


def _format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _temp_audio_stats() -> tuple[int, int]:
    settings = get_settings()
    root = settings.temp_audio_dir.resolve()
    if not root.is_dir():
        return 0, 0
    total = 0
    count = 0
    for p in root.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
                count += 1
            except OSError:
                pass
    return total, count


def _disk_free_bytes(path: Path) -> int | None:
    try:
        return shutil.disk_usage(path).free
    except OSError:
        return None


def _supabase_ping() -> bool:
    settings = get_settings()
    url, key = (settings.supabase_url or "").strip(), (settings.supabase_key or "").strip()
    if not url or not key:
        return False
    try:
        from supabase import create_client

        c = create_client(url, key)
        c.table("lectures").select("id").limit(1).execute()
        return True
    except Exception:
        return False


def connectivity_status_html() -> str:
    s = get_settings()
    groq_chat_ok = bool((s.effective_groq_chat_key or "").strip())
    groq_whisper_ok = bool((s.effective_groq_whisper_key or "").strip())
    gem_ok = bool((s.google_api_key or "").strip())
    supa_ok = _supabase_ping()

    def row(label: str, ok: bool) -> str:
        cls = "status-ok" if ok else "status-bad"
        txt = "Connected" if ok else "Not configured / failed"
        return f'<p style="margin:6px 0;"><span class="status-dot {cls}"></span><strong>{label}</strong> — {txt}</p>'

    return (
        '<div class="admin-card" style="padding:12px;">'
        f"{row('Groq Chat API', groq_chat_ok)}"
        f"{row('Groq Whisper API', groq_whisper_ok)}"
        f"{row('Google (Gemini)', gem_ok)}"
        f"{row('Supabase', supa_ok)}"
        "</div>"
    )


def _load_config_inputs() -> tuple[str, str, str, str, str, str, str]:
    v = read_env_values()
    return (
        v.get("GROQ_API_KEY", ""),
        v.get("GROQ_CHAT_API_KEY", ""),
        v.get("GROQ_WHISPER_API_KEY", ""),
        v.get("GOOGLE_API_KEY", ""),
        v.get("SUPABASE_URL", ""),
        v.get("SUPABASE_KEY", ""),
        v.get("AI_PROVIDER", "auto") or "auto",
    )


def _save_config(
    groq: str,
    groq_chat: str,
    groq_whisper: str,
    google: str,
    supabase_url: str,
    supabase_key: str,
    ai_provider: str,
) -> str:
    try:
        ap = (ai_provider or "auto").strip().lower()
        if ap not in ("auto", "groq", "google"):
            ap = "auto"
        write_env_updates(
            {
                "GROQ_API_KEY": groq.strip(),
                "GROQ_CHAT_API_KEY": groq_chat.strip(),
                "GROQ_WHISPER_API_KEY": groq_whisper.strip(),
                "GOOGLE_API_KEY": google.strip(),
                "SUPABASE_URL": supabase_url.strip(),
                "SUPABASE_KEY": supabase_key.strip(),
                "AI_PROVIDER": ap,
            },
        )
        reload_app_settings()
        return f"Saved `{env_file_path()}` and reloaded runtime settings."
    except OSError as e:
        return f"Write error: {e}"


def _metrics_markdown(m: dict[str, Any]) -> str:
    if not m:
        return "### Live metrics\n\n_Waiting for pipeline…_"
    ev = m.get("event")
    if ev == "ai_complete":
        return f"""### AI accuracy (real-time)

| Metric | Value |
|--------|-------|
| **Score** (0.4·S + 0.4·T + 0.2·K) | **{m.get('accuracy_score', 0):.4f}** |
| S — similarity | {m.get('similarity_s', 0):.4f} |
| T — timestamp alignment | {m.get('timestamp_t', 0):.4f} |
| K — keyword F1 | {m.get('keyword_f1_k', 0):.4f} |
| Provider | `{m.get('provider', '-')}` |
| Confidence | {m.get('confidence') if m.get('confidence') is not None else '—'} |
| Refined | {m.get('refined', False)} |
| Partial latency | {m.get('partial_latency_ms', 0):.1f} ms |
"""
    if ev == "pipeline_complete":
        return f"""### Pipeline complete

| Field | Value |
|-------|-------|
| **Total latency** | **{m.get('latency_ms', 0):.1f}** ms |
| **score** | **{m.get('accuracy_score', 0):.4f}** |
| Provider | `{m.get('provider', '-')}` |
| Confidence | {m.get('confidence') if m.get('confidence') is not None else '—'} |
| Refined | {m.get('refined', False)} |
| Lecture ID | `{m.get('lecture_id') or '—'}` |
| Persisted | {m.get('persisted')} |
"""
    return f"```json\n{json.dumps(m, ensure_ascii=False, indent=2)}\n```"


def _poll_live() -> tuple[str, str, str, str, str]:
    with _pipeline_lock:
        running = _pipeline_state["running"]
        logs = _pipeline_state["logs"]
        metrics = dict(_pipeline_state["metrics"])
        err = _pipeline_state.get("error")
        rj = _pipeline_state.get("result_json") or ""
        lr = _pipeline_state.get("last_run")

    log_text = "\n".join(f"- {s}" for s in logs) if logs else ("—" if running else "Idle.")
    md = _metrics_markdown(metrics)
    if err:
        md = f"### Error\n\n`{err}`\n\n" + md
    status = "Running…" if running else ("Done ✓" if rj else "Idle")
    if lr and isinstance(lr, dict):
        pm = lr.get("pipeline_metrics") or {}
        if pm and not metrics:
            md = _metrics_markdown(
                {
                    "event": "pipeline_complete",
                    **pm,
                    "lecture_id": lr.get("lecture_id"),
                    "persisted": lr.get("persisted"),
                },
            )
    if not rj and lr and isinstance(lr, dict):
        try:
            rj = json.dumps(lr, ensure_ascii=False, indent=2)
        except Exception:
            rj = ""
    gauge = _accuracy_gauge_html()
    return log_text, md, rj, status, gauge


def _accuracy_snapshot() -> dict[str, Any]:
    with _pipeline_lock:
        m = dict(_pipeline_state.get("metrics") or {})
        running = _pipeline_state.get("running")
        err = _pipeline_state.get("error")
        lr = _pipeline_state.get("last_run")
    pm: dict[str, Any] = {}
    if isinstance(lr, dict):
        raw = lr.get("pipeline_metrics")
        pm = raw if isinstance(raw, dict) else {}

    def pick(*keys: str) -> float | None:
        for k in keys:
            for src in (m, pm):
                if k in src and src[k] is not None:
                    try:
                        return float(src[k])
                    except (TypeError, ValueError):
                        pass
        return None

    return {
        "running": bool(running),
        "error": err,
        "score": pick("accuracy_score"),
        "s": pick("similarity_s"),
        "t_align": pick("timestamp_t"),
        "k": pick("keyword_f1_k"),
        "latency_ms": pick("latency_ms", "partial_latency_ms"),
    }


def _accuracy_gauge_html() -> str:
    snap = _accuracy_snapshot()
    score = snap["score"]
    s, t, k = snap["s"], snap["t_align"], snap["k"]
    pct = 0.0
    if score is not None:
        pct = max(0.0, min(100.0, score * 100.0))
    score_txt = f"{score:.4f}" if score is not None else "—"
    s_txt = f"{s:.4f}" if s is not None else "—"
    t_txt = f"{t:.4f}" if t is not None else "—"
    k_txt = f"{k:.4f}" if k is not None else "—"

    status_line = ""
    if snap["running"]:
        status_line = '<p class="admin-muted" style="margin:0 0 8px 0;">● Pipeline đang chạy…</p>'
    elif snap.get("error"):
        err_txt = html.escape(str(snap["error"]), quote=True)
        status_line = f'<p style="margin:0 0 8px 0;color:#ff8a80;font-size:12px;">⚠ {err_txt}</p>'

    return f"""<div class="admin-glass admin-gauge-wrap">
  {status_line}
  <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;">
    <div class="admin-gauge-score">{score_txt}</div>
    <span class="admin-muted" style="font-size:11px;">accuracy score (0–1)</span>
  </div>
  <p class="admin-gauge-formula">Score ≈ 0.4·S (similarity) + 0.4·T (timestamp) + 0.2·K (keywords)</p>
  <div class="admin-gauge-bar"><i style="width:{pct:.1f}%;"></i></div>
  <div class="admin-stat-grid">
    <div class="admin-stat-card"><span>Cosine similarity (S)</span><b>{s_txt}</b></div>
    <div class="admin-stat-card"><span>Timestamp alignment (T)</span><b>{t_txt}</b></div>
    <div class="admin-stat-card"><span>Keyword F1 (K)</span><b>{k_txt}</b></div>
  </div>
</div>"""


def _analytics_trend_html() -> str:
    settings = get_settings()
    db = DatabaseService(settings.supabase_url, settings.supabase_key)
    rows = db.list_recent_system_logs(12)
    scores: list[float] = []
    for r in reversed(rows):
        v = r.get("accuracy_score")
        if v is None:
            continue
        try:
            scores.append(float(v))
        except (TypeError, ValueError):
            pass
    if len(scores) < 2:
        return (
            '<div class="admin-glass admin-muted" style="padding:14px;">'
            "Chưa đủ dữ liệu <code>system_logs</code> để vẽ trend (cần ≥2 bản ghi có score)."
            "</div>"
        )
    w, h = 360, 100
    pad = 10
    smin, smax = min(scores), max(scores)
    if smax - smin < 1e-9:
        smax = smin + 0.001
    n = len(scores)
    pts: list[str] = []
    for i, sc in enumerate(scores):
        x = pad + (w - 2 * pad) * i / max(1, n - 1)
        y = pad + (h - 2 * pad) * (1.0 - (sc - smin) / (smax - smin))
        pts.append(f"{x:.1f},{y:.1f}")
    d_attr = "M " + " L ".join(pts)
    return f"""<div class="admin-glass" style="padding:12px 14px;">
  <span class="admin-tab-title" style="display:block;margin-bottom:8px;">Historical trend</span>
  <svg width="100%" height="{h}" viewBox="0 0 {w} {h}" style="max-width:100%;">
    <defs>
      <linearGradient id="admTrend" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#7c4dff"/><stop offset="100%" stop-color="#00e5ff"/>
      </linearGradient>
    </defs>
    <path d="{d_attr}" fill="none" stroke="url(#admTrend)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <p class="admin-muted" style="margin:6px 0 0 0;">{n} runs · min {smin:.4f} · max {smax:.4f}</p>
</div>"""


def _run_pipeline_worker(
    url: str,
    *,
    target_lang: str,
    quiz_difficulty: str,
    force: bool,
    user_id: str,
) -> None:
    with _pipeline_lock:
        _pipeline_state["running"] = True
        _pipeline_state["logs"] = []
        _pipeline_state["metrics"] = {}
        _pipeline_state["error"] = None
        _pipeline_state["result_json"] = ""

    async def _go() -> None:
        def on_stage(stage: str) -> None:
            with _pipeline_lock:
                _pipeline_state["logs"].append(stage)

        def on_metrics(payload: dict[str, object]) -> None:
            with _pipeline_lock:
                _pipeline_state["metrics"] = dict(payload)

        return await run_full_extraction_pipeline_with_progress(
            url,
            on_stage=on_stage,
            on_metrics=on_metrics,
            user_id=(user_id or "").strip() or None,
            target_lang=target_lang,
            quiz_difficulty=quiz_difficulty,
            force=bool(force),
        )

    try:
        result = asyncio.run(_go())
        with _pipeline_lock:
            _pipeline_state["result_json"] = result.model_dump_json(indent=2)
            _pipeline_state["last_run"] = result.model_dump()
    except PipelineClientError as e:
        with _pipeline_lock:
            _pipeline_state["error"] = f"Client: {e}"
    except PipelineError as e:
        with _pipeline_lock:
            _pipeline_state["error"] = f"Pipeline: {e}"
    except Exception as e:
        logger.exception("Admin pipeline failed")
        with _pipeline_lock:
            _pipeline_state["error"] = str(e)
    finally:
        with _pipeline_lock:
            _pipeline_state["running"] = False


def start_pipeline_run(
    url: str,
    target_lang: str,
    quiz_difficulty: str,
    force: bool,
    user_id: str,
) -> tuple[str, str, str, str]:
    url = (url or "").strip()
    if not url:
        return "Enter a URL.", "### Metrics\n\n_No URL._", "", "Idle"
    if _pipeline_state["running"]:
        log, md, rj, st = _poll_live()
        return "Already running — see progress below.", log, md, rj, st

    t = threading.Thread(
        target=_run_pipeline_worker,
        kwargs={
            "url": url,
            "target_lang": target_lang,
            "quiz_difficulty": quiz_difficulty,
            "force": bool(force),
            "user_id": user_id,
        },
        daemon=True,
    )
    t.start()
    return (
        "Pipeline started — streaming logs and metrics below.",
        "### Waiting…\n\n_Starting pipeline…_",
        "",
        "Running…",
    )


def build_health_markdown() -> str:
    settings = get_settings()
    used, n_files = _temp_audio_stats()
    audio_dir = settings.temp_audio_dir.resolve()
    free = _disk_free_bytes(audio_dir)
    free_line = f" | Free disk (approx): **{_format_bytes(free)}**" if free else ""

    return f"""### Storage

| Item | Value |
|------|-------|
| Temp audio dir | `{audio_dir}` |
| Downloaded | **{_format_bytes(used)}** ({n_files} files){free_line} |
"""


def _analytics_table_md() -> str:
    settings = get_settings()
    db = DatabaseService(settings.supabase_url, settings.supabase_key)
    rows = db.list_recent_system_logs(25)
    if not rows:
        return "### Recent runs\n\n_No `system_logs` rows yet or Supabase not configured._\n\nRun `supabase/sql/system_logs.sql` in the SQL editor."
    lines = ["| Time | Provider | Latency (ms) | Score | Refined |", "|---|---|---|---|---|"]
    for r in rows:
        ts = str(r.get("created_at") or "")[:19]
        lines.append(
            f"| {ts} | `{r.get('provider') or '—'}` | {r.get('latency_ms') or '—'} | "
            f"{r.get('accuracy_score') if r.get('accuracy_score') is not None else '—'} | {r.get('refined')} |",
        )
    return "### Recent pipeline runs (`system_logs`)\n\n" + "\n".join(lines)


def export_evaluation_csv() -> tuple[str, str | None]:
    with _pipeline_lock:
        lr = _pipeline_state.get("last_run")
    if not lr:
        return "No run data yet — execute a pipeline first.", None
    pm = lr.get("pipeline_metrics") or {}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["field", "value"])
    for k, v in sorted(lr.items()):
        if k == "pipeline_metrics":
            continue
        w.writerow([k, json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v])
    if isinstance(pm, dict):
        for k, v in pm.items():
            w.writerow([f"pipeline_metrics.{k}", v])
    data = buf.getvalue().encode("utf-8")
    path = Path(__file__).resolve().parent.parent / "storage" / "temp" / "admin_report.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"CSV written to `{path}`", str(path)


def export_evaluation_pdf() -> tuple[str, str | None]:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ImportError:
        return "Install `reportlab` (see backend/requirements.txt) for PDF export.", None

    with _pipeline_lock:
        lr = _pipeline_state.get("last_run")
    if not lr:
        return "No run data yet — execute a pipeline first.", None
    pm = lr.get("pipeline_metrics") or {}
    path = Path(__file__).resolve().parent.parent / "storage" / "temp" / "admin_report.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter
    y = h - 48
    c.setFont("Helvetica-Bold", 14)
    c.drawString(48, y, "AI Video-to-Knowledge — Evaluation Report")
    y -= 28
    c.setFont("Helvetica", 10)
    for line in (
        f"Title: {lr.get('title') or '—'}",
        f"Video ID: {lr.get('video_id')}",
        f"Lecture ID: {lr.get('lecture_id')}",
        f"Latency (ms): {pm.get('latency_ms')}",
        f"Provider: {pm.get('provider')}",
        f"Confidence: {pm.get('confidence')}",
        f"Accuracy score: {pm.get('accuracy_score')}",
        f"S / T / K: {pm.get('similarity_s')} / {pm.get('timestamp_t')} / {pm.get('keyword_f1_k')}",
        f"Refined: {pm.get('refined')}",
    ):
        c.drawString(48, y, line[:120])
        y -= 14
        if y < 72:
            c.showPage()
            y = h - 48
            c.setFont("Helvetica", 10)
    c.save()
    return f"PDF ready ({path.name}).", str(path)


def _admin_theme() -> gr.themes.Soft:
    return gr.themes.Soft(
        primary_hue="violet",
        secondary_hue="blue",
        neutral_hue="slate",
        font=["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
    )


def _load_prompt_fields() -> tuple[str, str, str, str]:
    v = load_prompt_overrides()
    return (
        v.get("risen_knowledge_append", ""),
        v.get("refinement_append", ""),
        v.get("timeline_rules_override", ""),
        v.get("tutor_qa_append", ""),
    )


def _save_prompt_fields(
    risen: str,
    refinement: str,
    timeline: str,
    tutor_qa: str,
) -> str:
    save_prompt_overrides(
        {
            "risen_knowledge_append": risen or "",
            "refinement_append": refinement or "",
            "timeline_rules_override": timeline or "",
            "tutor_qa_append": tutor_qa or "",
        },
    )
    return (
        "Đã lưu `storage/admin_prompt_overrides.json`. "
        "Lần gọi pipeline / tutor Q&A tiếp theo sẽ dùng nội dung này (không cần restart server)."
    )


def _reset_prompt_fields() -> tuple[str, str, str, str, str]:
    save_prompt_overrides(default_prompt_overrides())
    a, b, c, d = _load_prompt_fields()
    return a, b, c, d, "Đã khôi phục mặc định (các ô trống)."


def _clear_temp_audio_bundle() -> tuple[str, str]:
    return clear_temp_audio(), storage_stats_markdown()


def _clear_all_temp_bundle(confirmed: bool) -> tuple[str, str]:
    if not confirmed:
        return (
            "⚠️ Chọn checkbox **Xác nhận xóa toàn bộ `temp/`** rồi bấm lại nút.",
            storage_stats_markdown(),
        )
    return clear_all_temp(), storage_stats_markdown()


def _refresh_analytics_bundle() -> tuple[str, str]:
    return _analytics_trend_html(), _analytics_table_md()


def build_admin_blocks() -> gr.Blocks:
    with gr.Blocks(title="EtherAI — Admin Control Plane") as demo:
        with gr.Column(elem_classes=["admin-viewport"]):
            with gr.Column(elem_classes=["admin-shell"]):
                with gr.Row(elem_classes=["admin-topbar"]):
                    gr.HTML(
                        """
                    <div class="admin-brand">
                      <h1>EtherAI Admin Control Plane</h1>
                      <p>Live pipeline · AI accuracy · system config · prompt overrides</p>
                    </div>
                    """
                    )
                    gr.Markdown(f"<span class='admin-pill'>API `{get_settings().api_v1_prefix}`</span>")

                with gr.Tabs(elem_classes=["admin-tabs"]):
                    # —— Tab 1: Live ——
                    with gr.Tab("Live Pipeline"):
                        gr.Markdown(
                            "Monitor & trigger — **Extract → Transcribe → AI → Save**",
                            elem_classes=["admin-tab-title"],
                        )
                        gr.Markdown(
                            "Log realtime từ các bước pipeline; metrics chi tiết nằm ở tab **Analytics**.",
                            elem_classes=["admin-muted"],
                        )
                        url_in = gr.Textbox(
                            label="Video URL",
                            placeholder="https://www.youtube.com/watch?v=...",
                            lines=1,
                        )
                        with gr.Row():
                            target_lang = gr.Dropdown(
                                label="Language",
                                choices=[("Vietnamese (vi)", "vi"), ("English (en)", "en")],
                                value="vi",
                            )
                            quiz_diff = gr.Dropdown(
                                label="Quiz difficulty",
                                choices=[("Easy", "easy"), ("Medium", "medium"), ("Hard", "hard")],
                                value="medium",
                            )
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            force = gr.Checkbox(value=False, label="Force regenerate (bypass cache)")
                            user_id = gr.Textbox(
                                label="User ID (optional)",
                                placeholder="Supabase auth user uuid",
                                lines=1,
                            )
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            run_btn = gr.Button("Trigger pipeline", variant="primary")
                        run_status = gr.Markdown()
                        with gr.Row():
                            with gr.Column(scale=1):
                                run_log = gr.Textbox(
                                    label="Live log",
                                    lines=14,
                                    interactive=False,
                                    elem_classes=["admin-terminal"],
                                )
                            with gr.Column(scale=1):
                                metrics_md = gr.Markdown()
                        full_json = gr.Code(label="Full response (JSON)", language="json", lines=8)
                        pipe_status = gr.Markdown()
                        run_btn.click(
                            start_pipeline_run,
                            [url_in, target_lang, quiz_diff, force, user_id],
                            [run_status, metrics_md, full_json, pipe_status],
                        )

                    # —— Tab 2: Analytics ——
                    with gr.Tab("Analytics & Quality"):
                        gr.Markdown("AI accuracy & history", elem_classes=["admin-tab-title"])
                        gauge_html = gr.HTML(_accuracy_gauge_html())
                        gr.Markdown("### Chi tiết & dữ liệu lịch sử", elem_classes=["admin-muted"])
                        trend_html = gr.HTML(_analytics_trend_html())
                        analytics_md = gr.Markdown()
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            refresh_an = gr.Button("Refresh analytics", variant="primary")
                        refresh_an.click(_refresh_analytics_bundle, outputs=[trend_html, analytics_md])
                        gr.Markdown("### Export", elem_classes=["admin-muted"])
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            csv_btn = gr.Button("Export evaluation CSV")
                            pdf_btn = gr.Button("Export evaluation PDF")
                        export_msg = gr.Markdown()
                        with gr.Row():
                            export_csv_file = gr.File(label="Download CSV", interactive=False)
                            export_pdf_file = gr.File(label="Download PDF", interactive=False)
                        csv_btn.click(export_evaluation_csv, outputs=[export_msg, export_csv_file])
                        pdf_btn.click(export_evaluation_pdf, outputs=[export_msg, export_pdf_file])

                    # —— Tab 3: System ——
                    with gr.Tab("System & Config"):
                        gr.Markdown("API keys & health", elem_classes=["admin-tab-title"])
                        gr.HTML(connectivity_status_html)
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            refresh_conn = gr.Button("Refresh connectivity", variant="secondary")
                            conn_out = gr.HTML()
                        refresh_conn.click(connectivity_status_html, outputs=conn_out)
                        groq_in = gr.Textbox(label="GROQ_API_KEY", type="password", lines=1)
                        groq_chat_in = gr.Textbox(label="GROQ_CHAT_API_KEY (optional override)", type="password", lines=1)
                        groq_whisper_in = gr.Textbox(
                            label="GROQ_WHISPER_API_KEY (optional override)",
                            type="password",
                            lines=1,
                        )
                        google_in = gr.Textbox(label="GOOGLE_API_KEY (Gemini)", type="password", lines=1)
                        supa_url = gr.Textbox(label="SUPABASE_URL", lines=1)
                        supa_key = gr.Textbox(label="SUPABASE_KEY", type="password", lines=1)
                        ai_provider = gr.Dropdown(
                            label="AI_PROVIDER",
                            choices=["auto", "groq", "google"],
                            value="auto",
                        )
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            save_btn = gr.Button("Save .env", variant="primary")
                            reload_btn = gr.Button("Reload runtime settings")
                        save_out = gr.Markdown()
                        save_btn.click(
                            _save_config,
                            [groq_in, groq_chat_in, groq_whisper_in, google_in, supa_url, supa_key, ai_provider],
                            save_out,
                        )
                        reload_btn.click(
                            lambda: (reload_app_settings(), "Runtime settings reloaded."),
                            outputs=save_out,
                        )
                        health_md = gr.Markdown()

                    # —— Tab 4: Storage ——
                    with gr.Tab("Storage"):
                        gr.Markdown("Dọn dữ liệu tạm trên server", elem_classes=["admin-tab-title"])
                        gr.Markdown(
                            "Thư mục **`backend/storage/temp/`**: audio pipeline, export CSV/PDF từ tab Analytics. "
                            "File **`admin_prompt_overrides.json`** (tab AI Prompts) **không** bị xóa bởi các nút bên dưới.",
                            elem_classes=["admin-muted"],
                        )
                        storage_stats = gr.Markdown(storage_stats_markdown())
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            refresh_st = gr.Button("Làm mới số liệu", variant="secondary")
                            clear_audio_btn = gr.Button("Xóa temp/audio", variant="secondary")
                        confirm_clear_temp = gr.Checkbox(
                            label="Xác nhận xóa toàn bộ nội dung temp/ (CSV, PDF, audio, …)",
                            value=False,
                        )
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            clear_all_btn = gr.Button("Xóa hàng loạt — toàn bộ temp/", variant="primary")
                        storage_msg = gr.Markdown()
                        refresh_st.click(storage_stats_markdown, outputs=storage_stats)
                        clear_audio_btn.click(_clear_temp_audio_bundle, outputs=[storage_msg, storage_stats])
                        clear_all_btn.click(
                            _clear_all_temp_bundle,
                            [confirm_clear_temp],
                            [storage_msg, storage_stats],
                        )

                    # —— Tab 5: Prompts ——
                    with gr.Tab("AI Prompts"):
                        gr.Markdown("Tùy chỉnh prompt (append / override)", elem_classes=["admin-tab-title"])
                        gr.Markdown(
                            "Nội dung **nối thêm** hoặc **thay timeline** — file `storage/admin_prompt_overrides.json`.",
                            elem_classes=["admin-muted"],
                        )
                        prompt_risen = gr.Textbox(
                            label="RISEN knowledge — append",
                            placeholder="Append sau khối chính…",
                            lines=6,
                        )
                        prompt_timeline = gr.Textbox(
                            label="Timeline rules — override (để trống = mặc định)",
                            lines=4,
                        )
                        prompt_refine = gr.Textbox(
                            label="Refinement — append",
                            lines=4,
                        )
                        prompt_tutor_qa = gr.Textbox(
                            label="Tutor Q&A — append",
                            lines=4,
                        )
                        with gr.Row(elem_classes=["admin-btn-row"]):
                            save_prompt_btn = gr.Button("Lưu prompt", variant="primary")
                            reset_prompt_btn = gr.Button("Khôi phục mặc định", variant="secondary")
                        prompt_save_out = gr.Markdown()
                        save_prompt_btn.click(
                            _save_prompt_fields,
                            [prompt_risen, prompt_refine, prompt_timeline, prompt_tutor_qa],
                            prompt_save_out,
                        )
                        reset_prompt_btn.click(
                            _reset_prompt_fields,
                            outputs=[
                                prompt_risen,
                                prompt_refine,
                                prompt_timeline,
                                prompt_tutor_qa,
                                prompt_save_out,
                            ],
                        )

        poll_timer = gr.Timer(value=0.6)
        poll_timer.tick(
            _poll_live,
            outputs=[run_log, metrics_md, full_json, pipe_status, gauge_html],
        )

        demo.load(
            _load_config_inputs,
            outputs=[groq_in, groq_chat_in, groq_whisper_in, google_in, supa_url, supa_key, ai_provider],
        )
        demo.load(_refresh_analytics_bundle, outputs=[trend_html, analytics_md])
        demo.load(build_health_markdown, outputs=health_md)
        demo.load(
            _load_prompt_fields,
            outputs=[prompt_risen, prompt_refine, prompt_timeline, prompt_tutor_qa],
        )
        demo.load(storage_stats_markdown, outputs=storage_stats)

    return demo


def mount_admin_app(fastapi_app: object) -> object:
    blocks = build_admin_blocks()
    return gr.mount_gradio_app(
        fastapi_app,
        blocks,
        path="/admin",
        theme=_admin_theme(),
        css=_ADMIN_CSS,
    )

"""
Gradio Admin Panel — desktop-friendly control center.
Mounted on FastAPI at /admin.
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

import gradio as gr

from app.admin_env import env_file_path, read_env_values, reload_app_settings, write_env_updates
from app.config import get_settings
from app.services.pipeline import PipelineClientError, PipelineError, run_full_extraction_pipeline_with_progress

logger = logging.getLogger(__name__)

# Deep Navy + Electric Violet (đồng bộ apps/web ds-*)
_ADMIN_CSS = """
:root, body, .gradio-container, .contain {
  --background-fill-primary: #0a192f !important;
  --background-fill-secondary: rgba(16, 30, 56, 0.85) !important;
  --body-background-fill: #0a192f !important;
  --border-color-primary: rgba(124, 77, 255, 0.35) !important;
  --color-accent: #7c4dff !important;
  --button-primary-background-fill: linear-gradient(135deg, #6a37d4 0%, #7c4dff 100%) !important;
  --button-primary-border-color: #7c4dff !important;
  --input-background-fill: rgba(16, 30, 56, 0.6) !important;
  --body-text-color: #e6f1ff !important;
  --block-label-text-color: #8892b0 !important;
}
footer { display: none !important; }
.gr-form { gap: 0.75rem; }

/* Layout */
.admin-shell { max-width: 1160px; margin: 0 auto; }
.admin-topbar {
  display:flex; align-items:center; justify-content:space-between; gap: 14px;
  padding: 14px 16px; border: 1px solid rgba(136,146,176,0.22); border-radius: 16px;
  background: rgba(16,30,56,0.55); backdrop-filter: blur(12px);
  box-shadow: 0 10px 40px rgba(0,0,0,0.25);
}
.admin-brand { display:flex; flex-direction:column; gap:2px; min-width: 0; }
.admin-brand h1 { font-size: 16px; line-height: 20px; margin: 0; font-weight: 800; }
.admin-brand p { margin: 0; font-size: 12px; color: #8892b0; }
.admin-pill {
  border: 1px solid rgba(124,77,255,0.35);
  background: rgba(124,77,255,0.14);
  padding: 6px 10px; border-radius: 999px;
  font-size: 12px; color: #e6f1ff;
}
.admin-card {
  border: 1px solid rgba(136,146,176,0.22);
  background: rgba(16,30,56,0.55);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 12px 46px rgba(0,0,0,0.22);
}
.admin-card h2 { margin: 0 0 10px 0; font-size: 14px; font-weight: 800; }
.admin-muted { color: #8892b0; font-size: 12px; }
.admin-grid { display:grid; grid-template-columns: 280px 1fr; gap: 16px; }
.admin-nav .gr-radio { background: transparent !important; border: 0 !important; }
.admin-nav label span { font-weight: 700 !important; }
.admin-nav .wrap { gap: 8px !important; }
.admin-kv { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.admin-kv > div { border: 1px solid rgba(136,146,176,0.18); background: rgba(10,25,47,0.55); border-radius: 12px; padding: 12px; }
.admin-kv b { display:block; font-size: 11px; color:#8892b0; margin-bottom: 6px;}
.admin-kv span { font-size: 13px; color:#e6f1ff; }
"""


def _supabase_health_line() -> str:
    settings = get_settings()
    url, key = (settings.supabase_url or "").strip(), (settings.supabase_key or "").strip()
    if not url or not key:
        return "Supabase: **chưa cấu hình** (thiếu URL/key)"
    try:
        from supabase import create_client

        c = create_client(url, key)
        c.table("lectures").select("id").limit(1).execute()
        return "Supabase: **kết nối OK** (bảng `lectures` truy vấn được)"
    except Exception as e:
        return f"Supabase: **lỗi** — `{e!s}`"


def _format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _temp_audio_stats() -> tuple[int, int]:
    """Total bytes and file count under temp_audio_dir."""
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


def build_health_markdown() -> str:
    settings = get_settings()
    used, n_files = _temp_audio_stats()
    audio_dir = settings.temp_audio_dir.resolve()
    free = _disk_free_bytes(audio_dir)

    db_line = _supabase_health_line()

    groq_ok = bool((settings.groq_api_key or "").strip())
    gem_ok = bool((settings.google_api_key or "").strip())

    free_line = f" | Ổ đĩa trống (ước lượng): **{_format_bytes(free)}**" if free else ""

    return f"""### System Health

| Hạng mục | Trạng thái |
|----------|------------|
| Thư mục audio | `{audio_dir}` |
| Dung lượng file đã tải | **{_format_bytes(used)}** ({n_files} file){free_line} |
| Groq API key | {'**đã set**' if groq_ok else '**chưa set**'} |
| Google (Gemini) API key | {'**đã set**' if gem_ok else '**chưa set**'} |
| {db_line} |

*Quota chi tiết (Groq/Gemini) phụ thuộc console nhà cung cấp — API key chỉ xác nhận đã cấu hình.*
"""


def _load_config_inputs() -> tuple[str, str, str, str]:
    v = read_env_values()
    return (
        v.get("GROQ_API_KEY", ""),
        v.get("GOOGLE_API_KEY", ""),
        v.get("SUPABASE_URL", ""),
        v.get("SUPABASE_KEY", ""),
    )


def _save_config(
    groq: str,
    google: str,
    supabase_url: str,
    supabase_key: str,
) -> str:
    try:
        write_env_updates(
            {
                "GROQ_API_KEY": groq.strip(),
                "GOOGLE_API_KEY": google.strip(),
                "SUPABASE_URL": supabase_url.strip(),
                "SUPABASE_KEY": supabase_key.strip(),
            },
        )
        reload_app_settings()
        return f"Đã lưu `{env_file_path()}` và tải lại cấu hình."
    except OSError as e:
        return f"Lỗi ghi file: {e}"


async def _run_pipeline(
    url: str,
    *,
    target_lang: str,
    quiz_difficulty: str,
    force: bool,
    user_id: str,
) -> tuple[str, str, str]:
    url = (url or "").strip()
    if not url:
        return "Nhập URL YouTube.", "", ""
    logs: list[str] = []

    def _log(stage: str) -> None:
        logs.append(stage)

    try:
        uid = (user_id or "").strip() or None
        tl = (target_lang or "vi").strip().lower()
        if tl not in ("vi", "en"):
            tl = "vi"
        qd = (quiz_difficulty or "medium").strip().lower()
        if qd not in ("easy", "medium", "hard"):
            qd = "medium"

        result = await run_full_extraction_pipeline_with_progress(
            url,
            on_stage=_log,
            user_id=uid,
            target_lang=tl,
            quiz_difficulty=qd,
            force=bool(force),
        )
        summary = {
            "video_id": result.video_id,
            "title": result.title,
            "persisted": result.persisted,
            "lecture_id": result.lecture_id,
            "persist_message": result.persist_message,
            "segments": len(result.transcription.get("segments", [])),
            "target_lang": tl,
            "quiz_difficulty": qd,
            "force": bool(force),
            "user_id": uid,
        }
        pretty = json.dumps(summary, ensure_ascii=False, indent=2)
        full = result.model_dump_json(indent=2)
        log_text = "\n".join(f"- {s}" for s in logs) if logs else "- Completed"
        open_hint = ""
        if result.lecture_id:
            open_hint = f"\n\nMở trên web: `/workspace?lecture={result.lecture_id}`"
        return f"### Hoàn tất\n\n```json\n{pretty}\n```{open_hint}", full, log_text
    except PipelineClientError as e:
        log_text = "\n".join(f"- {s}" for s in logs) if logs else "- Failed"
        return f"### Lỗi client / tải audio\n\n`{e!s}`", "", log_text
    except PipelineError as e:
        log_text = "\n".join(f"- {s}" for s in logs) if logs else "- Failed"
        return f"### Pipeline lỗi\n\n`{e!s}`", "", log_text
    except Exception as e:
        logger.exception("Admin pipeline failed")
        log_text = "\n".join(f"- {s}" for s in logs) if logs else "- Failed"
        return f"### Lỗi không mong đợi\n\n`{e!s}`", "", log_text


def _admin_theme() -> gr.themes.Soft:
    return gr.themes.Soft(
        primary_hue="violet",
        secondary_hue="blue",
        neutral_hue="slate",
        font=["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
    )


def build_admin_blocks() -> gr.Blocks:
    with gr.Blocks(title="AI Video-to-Knowledge — Control Center") as demo:
        with gr.Column(elem_classes=["admin-shell"]):
            with gr.Row(elem_classes=["admin-topbar"]):
                gr.HTML(
                    """
                    <div class="admin-brand">
                      <h1>AI Video-to-Knowledge — Control Center</h1>
                      <p>Backend desktop · cấu hình key · chạy pipeline · theo dõi trạng thái</p>
                    </div>
                    """
                )
                gr.Markdown(f"<span class='admin-pill'>API prefix: `{get_settings().api_v1_prefix}`</span>")

            with gr.Row():
                gr.Markdown("", elem_classes=["admin-muted"])

            with gr.Row(elem_classes=["admin-grid"]):
                with gr.Column(elem_classes=["admin-card", "admin-nav"]):
                    gr.Markdown("## Navigation")
                    nav = gr.Radio(
                        choices=["Run pipeline", "API keys", "System health"],
                        value="Run pipeline",
                        label="",
                    )
                    gr.Markdown(
                        "Mẹo: **Run pipeline** để test nhanh. "
                        "**API keys** để cấu hình `.env`. "
                        "**System health** để kiểm tra Supabase/disk.",
                        elem_classes=["admin-muted"],
                    )

                with gr.Column(elem_classes=["admin-card"]):
                    # --- Run pipeline ---
                    run_wrap = gr.Column(visible=True)
                    with run_wrap:
                        gr.Markdown("## Run pipeline")
                        gr.Markdown(
                            "Chạy thử full pipeline: **download → transcribe → AI → save**. "
                            "Có thể **force regenerate** để bỏ cache.",
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
                                scale=1,
                            )
                            quiz_diff = gr.Dropdown(
                                label="Quiz difficulty",
                                choices=[("Easy (5)", "easy"), ("Medium (8)", "medium"), ("Hard (12)", "hard")],
                                value="medium",
                                scale=1,
                            )
                        with gr.Row():
                            force = gr.Checkbox(value=False, label="Force regenerate (bypass cache)", scale=1)
                            user_id = gr.Textbox(
                                label="User ID (optional)",
                                placeholder="Supabase auth user id (uuid) — dùng để test per-user keys",
                                lines=1,
                                scale=2,
                            )
                        run_btn = gr.Button("Run now", variant="primary")
                        run_summary = gr.Markdown()
                        with gr.Row():
                            run_log = gr.Textbox(label="Live log", lines=10, interactive=False)
                            run_json = gr.Code(label="Full response (JSON)", language="json", lines=18)
                        run_btn.click(
                            lambda u, tl, qd, f, uid: _run_pipeline(u, target_lang=tl, quiz_difficulty=qd, force=f, user_id=uid),
                            [url_in, target_lang, quiz_diff, force, user_id],
                            [run_summary, run_json, run_log],
                        )

                    # --- API keys ---
                    cfg_wrap = gr.Column(visible=False)
                    with cfg_wrap:
                        gr.Markdown("## API keys")
                        gr.Markdown("Lưu vào `.env` của backend và reload cấu hình.", elem_classes=["admin-muted"])
                        groq_in = gr.Textbox(label="GROQ_API_KEY", type="password", lines=1)
                        google_in = gr.Textbox(label="GOOGLE_API_KEY (Gemini)", type="password", lines=1)
                        supa_url = gr.Textbox(label="SUPABASE_URL", lines=1)
                        supa_key = gr.Textbox(label="SUPABASE_KEY", type="password", lines=1)
                        with gr.Row():
                            save_btn = gr.Button("Save .env", variant="primary")
                            reload_btn = gr.Button("Reload runtime settings")
                        save_out = gr.Markdown()
                        save_btn.click(_save_config, [groq_in, google_in, supa_url, supa_key], save_out)
                        reload_btn.click(lambda: (reload_app_settings(), "Đã reload cấu hình runtime."), outputs=save_out)

                    # --- System health ---
                    health_wrap = gr.Column(visible=False)
                    with health_wrap:
                        gr.Markdown("## System health")
                        health_md = gr.Markdown()
                        with gr.Row():
                            refresh_btn = gr.Button("Refresh", variant="primary")
                            open_docs = gr.Markdown("Docs: `/docs` · Health: `/api/v1/health`", elem_classes=["admin-muted"])
                        refresh_btn.click(lambda: build_health_markdown(), outputs=health_md)
                        demo.load(build_health_markdown, outputs=health_md)

                    def _set_view(v: str):
                        return (
                            gr.update(visible=v == "Run pipeline"),
                            gr.update(visible=v == "API keys"),
                            gr.update(visible=v == "System health"),
                        )

                    nav.change(_set_view, nav, [run_wrap, cfg_wrap, health_wrap])

        # Load saved env values into the API keys form (even if tab is not active).
        demo.load(_load_config_inputs, outputs=[groq_in, google_in, supa_url, supa_key])

    return demo


def mount_admin_app(fastapi_app: object) -> object:
    """Mount Gradio UI at `/admin` on the given FastAPI app."""
    blocks = build_admin_blocks()
    return gr.mount_gradio_app(
        fastapi_app,
        blocks,
        path="/admin",
        theme=_admin_theme(),
        css=_ADMIN_CSS,
    )

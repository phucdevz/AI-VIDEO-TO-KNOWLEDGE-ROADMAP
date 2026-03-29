"""
Gradio Admin Panel — cấu hình API, health, chạy thử pipeline.
Gắn vào FastAPI tại /admin (Deep Navy / ds-primary).
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

import gradio as gr

from app.admin_env import env_file_path, read_env_values, reload_app_settings, write_env_updates
from app.config import get_settings
from app.services.pipeline import PipelineClientError, PipelineError, run_full_extraction_pipeline

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


async def _run_pipeline(url: str) -> tuple[str, str]:
    url = (url or "").strip()
    if not url:
        return "Nhập URL YouTube.", ""
    try:
        result = await run_full_extraction_pipeline(url)
        summary = {
            "video_id": result.video_id,
            "title": result.title,
            "persisted": result.persisted,
            "lecture_id": result.lecture_id,
            "persist_message": result.persist_message,
            "segments": len(result.transcription.get("segments", [])),
        }
        pretty = json.dumps(summary, ensure_ascii=False, indent=2)
        full = result.model_dump_json(indent=2)
        return f"### Hoàn tất\n\n```json\n{pretty}\n```", full
    except PipelineClientError as e:
        return f"### Lỗi client / tải audio\n\n`{e!s}`", ""
    except PipelineError as e:
        return f"### Pipeline lỗi\n\n`{e!s}`", ""
    except Exception as e:
        logger.exception("Admin pipeline failed")
        return f"### Lỗi không mong đợi\n\n`{e!s}`", ""


def build_admin_blocks() -> gr.Blocks:
    theme = gr.themes.Soft(
        primary_hue="violet",
        secondary_hue="blue",
        neutral_hue="slate",
        font=["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
    )

    with gr.Blocks(
        title="AI Video-to-Knowledge — Admin",
        theme=theme,
        css=_ADMIN_CSS,
    ) as demo:
        gr.Markdown(
            "# Bảng điều hành Backend\n"
            "Cấu hình key, theo dõi health và chạy thử pipeline (Extract → Transcribe → AI → Save).",
        )

        with gr.Tabs():
            with gr.Tab("Cấu hình"):
                groq_in = gr.Textbox(label="GROQ_API_KEY", type="password", lines=1)
                google_in = gr.Textbox(label="GOOGLE_API_KEY (Gemini)", type="password", lines=1)
                supa_url = gr.Textbox(label="SUPABASE_URL", lines=1)
                supa_key = gr.Textbox(label="SUPABASE_KEY", type="password", lines=1)
                save_btn = gr.Button("Lưu vào .env", variant="primary")
                save_out = gr.Markdown()
                save_btn.click(_save_config, [groq_in, google_in, supa_url, supa_key], save_out)

            with gr.Tab("System Health"):
                health_md = gr.Markdown()
                refresh_btn = gr.Button("Làm mới")
                refresh_btn.click(lambda: build_health_markdown(), outputs=health_md)
                demo.load(build_health_markdown, outputs=health_md)

            with gr.Tab("Manual Trigger — Pipeline"):
                url_in = gr.Textbox(
                    label="URL YouTube / yt-dlp",
                    placeholder="https://www.youtube.com/watch?v=...",
                    lines=1,
                )
                run_btn = gr.Button("Chạy full pipeline", variant="primary")
                run_summary = gr.Markdown()
                run_json = gr.Code(label="JSON đầy đủ (response)", language="json", lines=18)
                run_btn.click(_run_pipeline, url_in, [run_summary, run_json])

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

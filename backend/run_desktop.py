"""
Chạy FastAPI + Gradio Admin trong cửa sổ desktop (pywebview), không mở tab trình duyệt.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request


def _wait_http(url: str, timeout_s: float = 45.0) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1.0)
            return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.15)
    return False


def main() -> int:
    backend = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend)

    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("BACKEND_PORT", "8000"))

    health_url = f"http://{host}:{port}/api/v1/health"
    admin_url = f"http://{host}:{port}/admin"

    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            host,
            "--port",
            str(port),
        ],
        cwd=backend,
    )

    try:
        time.sleep(0.2)
        if proc.poll() is not None:
            print("Uvicorn thoat som — kiem tra port", port, "hoac loi import. Chay: pip install -r requirements.txt")
            return 1

        if not _wait_http(health_url):
            print("Khong ket noi duoc API tai", health_url)
            return 1

        try:
            import webview
        except ImportError:
            print("Thieu pywebview. Chay: pip install pywebview")
            return 1

        window = webview.create_window(
            "AI Video-to-Knowledge — Admin",
            admin_url,
            width=1280,
            height=840,
            min_size=(900, 600),
        )
        webview.start()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

@echo off
title AI Video-to-Knowledge API
cd /d "%~dp0"

echo Starting FastAPI + Admin UI (Gradio at /admin)...
echo Working directory: %CD%
echo.

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

if errorlevel 1 (
  echo.
  echo Chay that bai. Thu: pip install -r requirements.txt
  pause
)

@echo off
REM Dev: uvicorn --reload, mo API/docs bang trinh duyet khi can
setlocal EnableExtensions
title AI Video-to-Knowledge API (dev server)
cd /d "%~dp0"

if not exist "app\main.py" (
  echo Loi: Khong tim thay app\main.py.
  pause
  exit /b 1
)

set "UVICORN_CMD="
where py >nul 2>&1 && set "UVICORN_CMD=py -3 -m uvicorn"
if not defined UVICORN_CMD where python >nul 2>&1 && set "UVICORN_CMD=python -m uvicorn"
if not defined UVICORN_CMD (
  echo Khong tim thay Python.
  pause
  exit /b 1
)

echo Dev server: http://127.0.0.1:8000  Admin: http://127.0.0.1:8000/admin
echo.

%UVICORN_CMD% app.main:app --reload --host 0.0.0.0 --port 8000

if errorlevel 1 (
  echo.
  echo Chay that bai. Thu: pip install -r requirements.txt
  pause
)

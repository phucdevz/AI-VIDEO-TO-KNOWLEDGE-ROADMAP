@echo off
setlocal EnableExtensions
title EtherAI - Backend + Admin

REM Must be first real command: go to folder where this .bat lives (ASCII only = no encoding bugs)
cd /d "%~dp0"
if not exist "app\main.py" (
  echo.
  echo [ERROR] app\main.py not found. Put run_backend.bat inside the backend folder.
  echo.
  pause
  exit /b 1
)

if not exist "run_desktop.py" (
  echo.
  echo [ERROR] run_desktop.py not found in this folder.
  echo.
  pause
  exit /b 1
)

cls
echo.
echo  ============================================================
echo   EtherAI  -  Video-to-Knowledge  -  Backend + Admin
echo  ============================================================
echo   API:  http://127.0.0.1:8000
echo   Docs: http://127.0.0.1:8000/docs
echo   Dir:  %CD%
echo  ============================================================
echo   Tip: run create_backend_shortcut.ps1 for Desktop shortcut with icon.
echo  ============================================================
echo.

set "PYEXE="
where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE (
  echo [ERROR] Python not found - need py or python in PATH.
  echo         Install Python 3.10+ then: pip install -r requirements.txt
  echo.
  pause
  exit /b 1
)

echo Starting server and Admin window - close window to stop server...
echo.

%PYEXE% run_desktop.py

if errorlevel 1 (
  echo.
  echo ------------------------------------------------------------
  echo  Exited with an error. Try:
  echo    pip install -r requirements.txt
  echo    Check port 8000 is free. Install pywebview: pip install pywebview
  echo ------------------------------------------------------------
  echo.
  pause
  exit /b 1
)

exit /b 0

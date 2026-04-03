@echo off
setlocal EnableExtensions
title AI Video-to-Knowledge — Admin (desktop)
cd /d "%~dp0"

if not exist "app\main.py" (
  echo Loi: Khong tim thay app\main.py. File .bat phai dat trong thu muc backend.
  pause
  exit /b 1
)

echo.
echo  ========================================
echo   Admin: cua so desktop ^(khong mo Chrome/Edge tab^)
echo   API: http://127.0.0.1:8000  ^(dong cua so = tat server^)
echo  Thu muc: %CD%
echo  ========================================
echo.

set "PYEXE="
where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE (
  echo Khong tim thay Python ^(py hoac python^).
  pause
  exit /b 1
)

%PYEXE% run_desktop.py

if errorlevel 1 (
  echo.
  echo Chay that bai. Thu: pip install -r requirements.txt
  pause
)

@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "%ROOT%backend\app\main.py" (
  echo Loi: Khong tim thay backend\app\main.py
  pause
  exit /b 1
)
if not exist "%ROOT%apps\web\package.json" (
  echo Loi: Khong tim thay apps\web\package.json
  pause
  exit /b 1
)

echo.
echo === EtherAI Project Run ===
echo Backend:  http://127.0.0.1:8000
echo Admin UI: http://127.0.0.1:8000/admin
echo Frontend: http://127.0.0.1:5173
echo.

REM Pick Python launcher for uvicorn
set "PYEXE="
where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE (
  where python >nul 2>&1 && set "PYEXE=python"
)
if not defined PYEXE (
  echo Khong tim thay Python ^(py hoac python^). Cai Python 3.12+ va Add to PATH.
  pause
  exit /b 1
)
where npm >nul 2>&1 || (
  echo Khong tim thay npm. Cai Node.js LTS va mo lai terminal.
  pause
  exit /b 1
)

REM Start FastAPI backend (separate window)
start "backend" cmd /k "cd /d \"%ROOT%backend\" ^& %PYEXE% -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

REM Start Vite frontend (separate window)
start "frontend" cmd /k "cd /d \"%ROOT%apps\\web\" ^& if not exist node_modules (npm install) ^& npm run dev"

REM Wait a bit then open admin UI
echo.
echo Doi server len... (khoang 5-10 giay)
ping -n 10 127.0.0.1 >nul
start "" http://127.0.0.1:8000/admin

echo.
echo Da chay. De thoat tat ca cua so, dong cac cua so backend/frontend.
pause


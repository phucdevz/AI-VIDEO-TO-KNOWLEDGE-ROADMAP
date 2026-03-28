@echo off
setlocal EnableExtensions
title EtherAI — Dev server
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies (first run^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    exit /b 1
  )
)

echo Starting Vite: http://localhost:5173
call npm run dev

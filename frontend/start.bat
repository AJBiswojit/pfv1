@echo off
REM ============================================================
REM  PRATIKSHYA FASHON - Frontend startup [Windows]
REM
REM  Run from the IDE embedded terminal - no external window needed.
REM  Vite dev server URL: http://localhost:5173
REM ============================================================
setlocal
title PRATIKSHYA FASHON - Frontend

REM This script now lives inside the frontend\ folder.
REM %~dp0 resolves to that folder at runtime.
set "FRONTEND_DIR=%~dp0"

if not exist "%FRONTEND_DIR%package.json" (
    echo [ERROR] package.json not found: "%FRONTEND_DIR%package.json"
    echo [ERROR] This script must live inside the "frontend" folder.
    echo.
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is required.
    echo [ERROR] Install the LTS version from https://nodejs.org/ and re-run this script.
    echo.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found even though node exists. Reinstall Node.js from https://nodejs.org/.
    echo.
    exit /b 1
)

cd /d "%FRONTEND_DIR%"
if errorlevel 1 (
    echo [ERROR] Could not enter frontend directory: "%FRONTEND_DIR%"
    echo.
    exit /b 1
)

if not exist "node_modules" (
    echo [ERROR] Frontend dependencies not installed - node_modules is missing.
    echo [ERROR] Run:  npm install
    echo.
    exit /b 1
)

if not exist ".env" (
    echo [INFO] No frontend\.env found - continuing with built-in defaults.
    echo [INFO] Vite proxies /api to the backend automatically.
    echo.
)

echo ============================================================
echo  PRATIKSHYA FASHON - Frontend
echo ============================================================
echo  Frontend        : http://localhost:5173
echo  Backend expected: http://localhost:8000
echo  Press Ctrl+C to stop.
echo.

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Frontend dev server exited with code %EXIT_CODE%.
) else (
    echo Frontend dev server stopped.
)
echo.

@echo off
REM ============================================================
REM  PRATIKSHYA FASHON - Frontend startup [Windows]
REM
REM  Double-click to start the Vite dev server.
REM  Actual command [from frontend\package.json "dev" script]: npm run dev
REM  Frontend URL: http://localhost:5173 [Vite default port]
REM ============================================================
setlocal
title PRATIKSHYA FASHON - Frontend

REM Resolve the repository root from this script's own location,
REM so the script works no matter the current working directory.
set "ROOT=%~dp0"
set "FRONTEND_DIR=%ROOT%frontend"

if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERROR] Frontend directory not found: "%FRONTEND_DIR%"
    echo [ERROR] This script must live in the repository root, next to the "frontend" folder.
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js/npm is required.
    echo [ERROR] Install the LTS version from https://nodejs.org/ and re-run this script.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js/npm is required.
    echo [ERROR] npm was not found even though node exists. Reinstall Node.js from https://nodejs.org/.
    echo.
    pause
    exit /b 1
)

cd /d "%FRONTEND_DIR%"
if errorlevel 1 (
    echo [ERROR] Could not enter frontend directory: "%FRONTEND_DIR%"
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [ERROR] Frontend dependencies are not installed - frontend\node_modules is missing.
    echo [ERROR] Run this once from "%FRONTEND_DIR%":
    echo [ERROR]   npm install
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [INFO] No frontend\.env found - continuing with built-in defaults.
    echo [INFO] No variables are required for local dev: Vite proxies /api to the backend.
    echo [INFO] Optional: copy .env.example to .env to customise VITE_API_BASE, VITE_MEDIA_URL_PREFIX, VITE_MEDIA_ORIGIN.
    echo.
)

echo Starting PRATIKSHYA FASHON Frontend...
echo Frontend: http://localhost:5173
echo Backend expected at: http://localhost:8000
echo.

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] The frontend dev server exited with code %EXIT_CODE%.
) else (
    echo Frontend dev server stopped.
)
echo.
pause

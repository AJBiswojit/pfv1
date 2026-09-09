@echo off
REM ============================================================
REM  PRATIKSHYA FASHON - One-click full-stack startup [Windows]
REM
REM  Double-click to start BOTH backend and frontend,
REM  each in its own terminal window. Neither blocks the other.
REM
REM  Backend:  http://localhost:8000 [Swagger /docs, Health /health]
REM  Frontend: http://localhost:5173
REM ============================================================
setlocal
title PRATIKSHYA FASHON - Launcher

REM Resolve the repository root from this script's own location,
REM so the script works no matter the current working directory.
set "ROOT=%~dp0"

if not exist "%ROOT%start-backend.bat" (
    echo [ERROR] Missing launcher script: "%ROOT%start-backend.bat"
    echo [ERROR] start.bat, start-backend.bat and start-frontend.bat must sit together in the repository root.
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%start-frontend.bat" (
    echo [ERROR] Missing launcher script: "%ROOT%start-frontend.bat"
    echo [ERROR] start.bat, start-backend.bat and start-frontend.bat must sit together in the repository root.
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo  PRATIKSHYA FASHON - starting full stack
echo ============================================================
echo  Backend:  http://localhost:8000 - Swagger /docs - Health /health
echo  Frontend: http://localhost:5173
echo.

start "PRATIKSHYA FASHON - Backend" "%ROOT%start-backend.bat"
start "PRATIKSHYA FASHON - Frontend" "%ROOT%start-frontend.bat"

echo  Backend is starting in its own window...
echo  Frontend is starting in its own window...
echo.
echo  Both servers run in separate windows - this window can now be closed.
echo  To stop a server, focus its window and press Ctrl+C.
echo.
pause

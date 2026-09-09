@echo off
REM ============================================================
REM  PRATIKSHYA FASHON - Full-stack startup [Windows]
REM
REM  Run from the IDE embedded terminal - no external window needed.
REM
REM  Backend:  http://localhost:8000  (Swagger /docs, Health /health)
REM  Frontend: http://localhost:5173
REM
REM  TIP: Open two separate IDE terminal tabs and run each script
REM  individually for parallel operation:
REM    Tab 1: backend\start.bat
REM    Tab 2: frontend\start.bat
REM ============================================================
setlocal
title PRATIKSHYA FASHON - Launcher

set "ROOT=%~dp0"
set "BACKEND_SCRIPT=%ROOT%backend\start.bat"
set "FRONTEND_SCRIPT=%ROOT%frontend\start.bat"

if not exist "%BACKEND_SCRIPT%" (
    echo [ERROR] Missing script: "%BACKEND_SCRIPT%"
    echo [ERROR] Expected at backend\start.bat
    echo.
    exit /b 1
)

if not exist "%FRONTEND_SCRIPT%" (
    echo [ERROR] Missing script: "%FRONTEND_SCRIPT%"
    echo [ERROR] Expected at frontend\start.bat
    echo.
    exit /b 1
)

echo ============================================================
echo  PRATIKSHYA FASHON - Full Stack Launcher
echo ============================================================
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  NOTE: To run both servers simultaneously, open two IDE
echo  terminal tabs and run each script individually:
echo    backend\start.bat
echo    frontend\start.bat
echo.
echo  Starting BACKEND now in this terminal...
echo  (Stop it with Ctrl+C, then run frontend\start.bat)
echo ============================================================
echo.

call "%BACKEND_SCRIPT%"

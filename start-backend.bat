@echo off
REM ============================================================
REM  PRATIKSHYA FASHON - Backend startup [Windows]
REM
REM  Double-click to start the FastAPI dev server with reload.
REM  Actual command [from backend\README.md "Quick Start"]: uvicorn app.main:app --reload
REM  Entrypoint: backend\app\main.py [app object: app.main:app]
REM  Backend URL: http://localhost:8000
REM ============================================================
setlocal
title PRATIKSHYA FASHON - Backend

REM Resolve the repository root from this script's own location,
REM so the script works no matter the current working directory.
set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"

if not exist "%BACKEND_DIR%\app\main.py" (
    echo [ERROR] Backend entrypoint not found: "%BACKEND_DIR%\app\main.py"
    echo [ERROR] This script must live in the repository root, next to the "backend" folder.
    echo.
    pause
    exit /b 1
)

REM --- Python / virtual-environment checks ---
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Backend virtual environment not found.
    echo [ERROR] Expected: "%VENV_PYTHON%"
    echo.
    echo The documented development setup uses backend\.venv. To create it, run:
    echo.
    echo   cd /d "%BACKEND_DIR%"
    echo   python -m venv .venv
    echo   .venv\Scripts\activate
    echo   pip install -r requirements.txt
    echo.
    echo Requirements: Python 3.11 - see backend\README.md "Quick Start" for details.
    echo If "python" itself is not recognised: Python is required.
    echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

call "%VENV_ACTIVATE%"
if errorlevel 1 (
    echo [ERROR] Failed to activate the virtual environment: "%VENV_ACTIVATE%"
    echo [ERROR] Try deleting the backend\.venv folder and recreating it - see backend\README.md.
    echo.
    pause
    exit /b 1
)

cd /d "%BACKEND_DIR%"
if errorlevel 1 (
    echo [ERROR] Could not enter backend directory: "%BACKEND_DIR%"
    echo.
    pause
    exit /b 1
)

REM --- Dependency check: fastapi + uvicorn must be importable from the venv ---
python -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Backend dependencies are not installed - fastapi/uvicorn not found in backend\.venv.
    echo [ERROR] Run this with the venv activated from "%BACKEND_DIR%":
    echo [ERROR]   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM --- Environment configuration: warn only, the app ships built-in defaults ---
if not exist ".env" (
    echo [INFO] No backend\.env found - starting with built-in defaults.
    echo [INFO] For local development, copy .env.example to .env and set at least:
    echo [INFO]   DATABASE_URL - e.g. postgresql+asyncpg://user:password@localhost:5432/pratikshya_fashon
    echo [INFO]   ALLOWED_ORIGINS - must include the Vite origin http://localhost:5173
    echo [INFO] See backend\.env.example for the full variable list. Secret values are never printed.
    echo.
)

echo Starting PRATIKSHYA FASHON Backend...
python --version
echo Backend: http://localhost:8000
echo Swagger: http://localhost:8000/docs
echo Health:  http://localhost:8000/health
echo.

uvicorn app.main:app --reload
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] The backend dev server exited with code %EXIT_CODE%.
) else (
    echo Backend dev server stopped.
)
echo.
pause

# PRATIKSHYA FASHON — Full-Stack Monorepo

Ladies-priority retail platform: React + Vite storefront (`frontend/`) backed by a
feature-based FastAPI API (`backend/`).

| Part     | Directory   | Stack                | Dev command (actual)            | URL                   |
|----------|-------------|----------------------|---------------------------------|-----------------------|
| Frontend | `frontend/` | React 19 + Vite 7    | `npm run dev` (= `vite`)        | http://localhost:5173 |
| Backend  | `backend/`  | FastAPI + Uvicorn    | `uvicorn app.main:app --reload` | http://localhost:8000 |

- Frontend port **5173** is the Vite default (no explicit port in `frontend/vite.config.js`).
  The dev server proxies `/api` → `http://localhost:8000`, so no frontend env vars are
  required for local development.
- Backend port **8000** is the Uvicorn default. Swagger UI: `/docs`, ReDoc: `/redoc`,
  health check: `/health`.
- Backend docs: [`backend/README.md`](backend/README.md).

## QUICK START — WINDOWS

### Prerequisites (one-time setup)

1. **Node.js LTS** (includes npm) — https://nodejs.org/
2. **Python 3.11** — https://www.python.org/downloads/
   (tick **"Add python.exe to PATH"** during install)
3. **PostgreSQL** running locally (or reachable) for database-backed features.
4. One-time dependency install:
   ```bat
   cd frontend
   npm install
   cd ..\backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   copy .env.example .env
   ```
   Then edit `backend\.env` — at minimum set `DATABASE_URL` to your PostgreSQL server
   (see [Environment requirements](#environment-requirements)).

### 1. Double-click `start.bat`

This starts **both** servers, each in its own terminal window:

- Backend window → http://localhost:8000
- Frontend window → http://localhost:5173

Neither blocks the other. The launcher window can be closed once both are up.
To stop a server, focus its window and press `Ctrl+C`.

### 2. Individual scripts

| Script              | What it does                                                                                          |
|---------------------|-------------------------------------------------------------------------------------------------------|
| `start.bat`         | Starts backend + frontend, each in its own window.                                                    |
| `start-backend.bat` | Activates `backend\.venv`, checks deps, runs `uvicorn app.main:app --reload` from `backend/`.         |
| `start-frontend.bat`| Checks Node/npm + `node_modules`, runs `npm run dev` from `frontend/`.                                |

All three resolve paths from their own location, so they work regardless of the
current working directory, and they never hardcode drive letters or usernames.

### 3. If startup fails

| Message | Fix |
|---------|-----|
| `Node.js/npm is required.` | Install Node.js LTS from https://nodejs.org/, then re-run. |
| `Frontend dependencies are not installed` | Run `npm install` inside `frontend/`. |
| `Python is required.` / venv not found at `backend\.venv` | Install Python 3.11, then create the venv: `cd backend` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt`. |
| `Backend dependencies are not installed` | With the venv activated, run `pip install -r requirements.txt` inside `backend/`. |
| `No backend\.env found` (warning) | Copy `backend\.env.example` to `backend\.env` and set `DATABASE_URL` (and `ALLOWED_ORIGINS` if your Vite origin differs). |
| Backend starts but API calls fail | Check `DATABASE_URL` points at a live PostgreSQL server; confirm the backend window shows `Uvicorn running on http://127.0.0.1:8000`. |
| Port already in use | Another process owns 5173/8000 — stop it or close the duplicate server window. |

The scripts never print secret values — they only name the missing variables/files.

## Environment requirements

**Frontend (`frontend/.env`, optional — all have working defaults):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | `/api/v1` | Relative API base; stays proxied in dev. |
| `VITE_MEDIA_URL_PREFIX` | `/api/v1/media/objects` | Must match backend `API_V1_PREFIX` + `MEDIA_URL_PREFIX`. |
| `VITE_MEDIA_ORIGIN` | _(empty = same origin)_ | Set only if media is served from another origin/CDN. |

See [`frontend/.env.example`](frontend/.env.example). Nothing here is a secret.

**Backend (`backend/.env` — copy from `backend/.env.example`; key variables):**

| Variable | Required for | Notes |
|----------|--------------|-------|
| `DATABASE_URL` | All DB-backed features | `postgresql+asyncpg://user:password@localhost:5432/pratikshya_fashon` |
| `ALLOWED_ORIGINS` | Browser CORS | Must include the Vite origin, e.g. `http://localhost:5173` |
| `SECRET_KEY` / `JWT_SECRET_KEY` | Auth | Change from placeholder in any shared environment |
| `STORAGE_PROVIDER` | Media | `local` (default, no credentials) vs `s3` (future) |
| `LOCAL_MEDIA_ROOT` | Media | Relative to `backend/`; persists across restarts |

The app boots on built-in defaults without a `.env`, but database-backed endpoints need
a real `DATABASE_URL`. Full list: [`backend/.env.example`](backend/.env.example) —
never commit real secrets.

## Non-Windows development (macOS / Linux)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then set DATABASE_URL
uvicorn app.main:app --reload   # http://localhost:8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Tests: `npm test` in `frontend/`; `python -m pytest` in `backend/`.

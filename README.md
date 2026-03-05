# ferrite-studio

Web platform layer for [ferrite-nn](../ferrite-nn/) — a from-scratch neural network library written in Rust.

This repository contains only the TypeScript and Python layers. All training, inference, and model mathematics live in the `ferrite-nn` sibling repository. The Rust service binary (`ferrite-studio`) is built and run from that repo; this repo consumes its HTTP API.

---

## Architecture

### Production

```
Browser
  |
  v
Nginx (:80 / :443)
  |-- static files  -->  frontend/dist/  (React SPA)
  |-- /api/*        -->  FastAPI (:8000)
  |-- /auth/*       -->  FastAPI (:8000)
                              |
                              |  validates JWT cookie
                              |  injects X-User-Id header
                              v
                        Rust studio service (:7878)
```

### Development

```
React dev server (Vite :5173)
  |
  |-- /api/*  (Vite proxy)  -->  Rust studio service (:7878)
```

In development the Vite proxy forwards all `/api/*` requests directly to the Rust service at `http://127.0.0.1:7878`. FastAPI is not in the request path and only needs to be running if you are testing authentication flows.

---

## Repository structure

```
ferrite-studio/
  frontend/                   React SPA (Vite + React 19 + TypeScript)
    package.json
    vite.config.ts            dev proxy: /api/* → localhost:7878
    tsconfig.json
    tailwind.config.ts
    src/
      api/                    typed fetch wrappers for every endpoint
      hooks/                  useSSE.ts, useModels.ts, etc.
      pages/                  ArchitectPage, DatasetPage, TrainPage, EvaluatePage, TestPage
      components/
        architect/
        dataset/
        train/                LiveLossChart.tsx — consumes SSE stream
        evaluate/
        test/                 InputModeToggle.tsx, CanvasDraw.tsx, ResultCard.tsx
        ui/                   shadcn/ui generated components
  api/                        Python FastAPI service
    main.py
    config.py                 pydantic-settings (env vars)
    dependencies.py           shared FastAPI deps (get_db, require_user)
    auth/                     JWT issuance + validation, bcrypt, OAuth stubs
    models/                   SQLAlchemy async ORM models (User)
    routes/                   auth.py, proxy.py, models_route.py (stub)
    alembic/                  DB migrations
    tests/                    18 pytest tests (auth + proxy, Rust mocked)
    requirements.txt
    .env.example
  CLAUDE.md
  README.md
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | Frontend build and dev server |
| Python | 3.11+ | FastAPI service |
| Rust toolchain | stable | Required for the `ferrite-nn` sibling repo |
| `ferrite-nn` repo | — | Must be cloned at `../ferrite-nn/` (sibling directory) |

The `ferrite-nn` repository provides the Rust binary that serves the studio API on port 7878. Without it running, the frontend has nothing to talk to.

---

## Quick start (development)

### Step 1 — Start the Rust backend

```bash
cd ../ferrite-nn
cargo run --bin studio --release
```

The Rust service starts at `http://127.0.0.1:7878`. Leave it running.

### Step 2 — Start the React dev server

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. The Vite proxy forwards all `/api/*` requests to the Rust service. This is the only step needed for normal UI development.

### Step 3 (optional) — Start FastAPI

Only required if you are testing authentication flows or the proxy middleware.

```bash
cd api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit SECRET_KEY at minimum
uvicorn main:app --port 8000 --reload
```

FastAPI starts at `http://localhost:8000`.

---

## The five workflow tabs

The studio follows a linear workflow. Each tab is unlocked by completing the previous step. The `tab_unlock` bitmask field on most GET responses communicates current unlock state to the frontend.

| Tab | Page component | Key API calls | Unlocked when |
|---|---|---|---|
| 1. Architect | `ArchitectPage.tsx` | `GET /api/architect`, `POST /api/architect/save` | Always |
| 2. Dataset | `DatasetPage.tsx` | `GET /api/dataset`, `POST /api/dataset/*` | Architecture spec saved |
| 3. Train | `TrainPage.tsx` | `POST /api/train/start`, `POST /api/train/stop`, `GET /api/train/events` | Dataset loaded |
| 4. Evaluate | `EvaluatePage.tsx` | `GET /api/evaluate`, `GET /api/evaluate/export` | Training done or stopped |
| 5. Test | `TestPage.tsx` | `GET /api/test`, `POST /api/test/infer`, `POST /api/test/import-model` | Always |

### tab_unlock bitmask

| Bit | Mask | Tab |
|---|---|---|
| 0 | `0x01` | Architect (always set) |
| 1 | `0x02` | Dataset |
| 2 | `0x04` | Train |
| 3 | `0x08` | Evaluate |
| 4 | `0x10` | Test (always set) |

### Test tab — input modes

The Test tab adapts its UI based on the `input_type` field in the selected model's metadata:

| `input_type` value | UI shown |
|---|---|
| `null` or missing | Three-way selector: Numeric / Grayscale Image / RGB Image |
| `{ "type": "Numeric" }` | Textarea for comma-separated floats only |
| `{ "type": "ImageGrayscale", "width": W, "height": H }` | Upload Image / Draw toggle. Draw mode: 280×280 canvas, white-on-black (MNIST style) |
| `{ "type": "ImageRgb", "width": W, "height": H }` | File upload only |

All inference submissions use `multipart/form-data` with a hidden `input_mode` field.

---

## REST API reference

Full reference: `../ferrite-nn/docs/api-reference.md`

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/architect` | Current network spec + hyperparams |
| `POST` | `/api/architect/save` | Save architecture (JSON body) |
| `GET` | `/api/dataset` | Current dataset state |
| `POST` | `/api/dataset/upload` | Upload CSV (`multipart/form-data`) |
| `POST` | `/api/dataset/upload-idx` | Upload MNIST IDX binary files (`multipart/form-data`) |
| `POST` | `/api/dataset/builtin` | Load built-in dataset: `xor`, `circles`, `blobs` |
| `GET` | `/api/train` | Training status + epoch history |
| `POST` | `/api/train/start` | Start training |
| `POST` | `/api/train/stop` | Stop training after current batch |
| `GET` | `/api/train/events` | SSE stream — real-time epoch stats |
| `GET` | `/api/evaluate` | Epoch history + aggregate metrics + confusion matrix |
| `GET` | `/api/evaluate/export` | Download epoch history as CSV |
| `GET` | `/api/test?model=NAME` | Available models + selected model metadata |
| `POST` | `/api/test/infer` | Run inference (`multipart/form-data`) |
| `POST` | `/api/test/import-model` | Import a model JSON file (`multipart/form-data`) |
| `GET` | `/api/models` | List all trained models |
| `GET` | `/api/models/:name/download` | Download model as JSON |

### SSE stream — `GET /api/train/events`

Connect with `EventSource`. The stream replays epoch history on reconnect and sends keep-alive pings (`: ping`) every 15 seconds.

```
event: epoch
data: {"epoch":1,"total_epochs":50,"train_loss":0.32,"val_loss":0.31,"train_accuracy":0.91,"val_accuracy":0.92,"elapsed_ms":843}

event: done
data: {"model_path":"trained_models/my_model.json","elapsed_total_ms":42000,"epochs_completed":50}

event: stopped
data: {"model_path":"trained_models/my_model.json","elapsed_total_ms":8000,"epoch_reached":10,"total_epochs":50}

event: failed
data: {"reason":"..."}
```

---

## API proxy flow (production)

In production, Nginx routes all `/api/*` and `/auth/*` traffic to FastAPI on port 8000. FastAPI:

1. Reads the httpOnly `access_token` cookie and validates the JWT signature against `SECRET_KEY`.
2. Extracts the user ID and injects an `X-User-Id` header onto the upstream request.
3. Forwards the full request (headers, body, query string) to the Rust service at `RUST_SERVICE_URL` using `httpx`.
4. Streams the response back to the client without buffering.

The Rust service is stateless with respect to users — it trusts the `X-User-Id` header injected by FastAPI and never issues or validates tokens itself.

SSE (`GET /api/train/events`) is proxied with streaming enabled; FastAPI does not buffer SSE frames.

---

## Auth endpoints

Implemented in `api/routes/auth.py`. All auth state is maintained via httpOnly cookies — the frontend never handles raw tokens.

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create a new account (email + password) |
| `POST` | `/auth/login` | Authenticate and set `access_token` + `refresh_token` cookies |
| `POST` | `/auth/logout` | Clear auth cookies |
| `POST` | `/auth/refresh` | Exchange a valid refresh token for a new access token |
| `GET` | `/auth/me` | Return the authenticated user's profile |
| `GET` | `/auth/oauth/github` | Redirect to GitHub OAuth consent screen |
| `GET` | `/auth/oauth/github/callback` | GitHub OAuth callback |
| `GET` | `/auth/oauth/google` | Redirect to Google OAuth consent screen |
| `GET` | `/auth/oauth/google/callback` | Google OAuth callback |

---

## Environment variables

Copy `api/.env.example` to `api/.env` and edit before running FastAPI.

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | _(required, no default)_ | HMAC key for JWT signing. FastAPI will not start without it. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `DATABASE_URL` | `sqlite+aiosqlite:///./ferrite.db` | SQLAlchemy async database URL. Use `postgresql+asyncpg://...` in production. |
| `RUST_SERVICE_URL` | `http://127.0.0.1:7878` | Base URL of the Rust studio service. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Lifetime of access tokens in minutes. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Lifetime of refresh tokens in days. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins. |
| `GITHUB_CLIENT_ID` | _(unset)_ | GitHub OAuth app client ID. |
| `GITHUB_CLIENT_SECRET` | _(unset)_ | GitHub OAuth app client secret. |
| `GOOGLE_CLIENT_ID` | _(unset)_ | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | _(unset)_ | Google OAuth client secret. |

---

## Running tests

### Frontend

There are no unit tests yet. TypeScript compilation is the primary correctness check:

```bash
cd frontend
npm run build       # runs tsc -b then vite build
```

ESLint:

```bash
cd frontend
npm run lint
```

### API

```bash
cd api
source .venv/bin/activate
pytest tests/ -v    # 18 tests
```

Tests use `pytest-asyncio` and `respx` to mock the upstream Rust service. No running Rust process is needed.

---

## Frontend stack

| Layer | Library | Version |
|---|---|---|
| Build | Vite | 7 |
| Framework | React + TypeScript | 19 / 5.9 |
| UI components | shadcn/ui (Radix + Tailwind CSS) | — |
| Charts | Recharts | 3 |
| Data fetching | TanStack Query | 5 |
| Routing | React Router | 7 |
| Forms | React Hook Form | 7 |

To add a shadcn/ui component:

```bash
npx shadcn@latest add <component>
```

## Python stack

| Library | Purpose |
|---|---|
| `fastapi` + `uvicorn` | ASGI web framework and server |
| `sqlalchemy[asyncio]` + `asyncpg` | Async PostgreSQL ORM |
| `aiosqlite` | Async SQLite driver (development default) |
| `alembic` | Database migrations |
| `python-jose[cryptography]` | JWT encode/decode |
| `bcrypt` | Password hashing |
| `authlib` | OAuth 2.0 (GitHub, Google) |
| `httpx` | Async HTTP client for proxying to Rust |
| `pydantic-settings` | Environment variable configuration |

---

## Production deployment

Docker Compose support (Phase 4) is not yet implemented. When complete it will orchestrate four services:

| Service | Description |
|---|---|
| `nginx` | Serves the React build from `frontend/dist/`, proxies `/api` and `/auth` to FastAPI |
| `fastapi` | Python auth and proxy service |
| `rust-studio` | Rust training and inference service |
| `postgres` | Persistent storage for users, model registry, and experiments |

Build the frontend for production:

```bash
cd frontend && npm run build    # outputs to frontend/dist/
```

---

## Related repositories

| Repository | Contents |
|---|---|
| [`ferrite-nn`](../ferrite-nn/) | Rust neural network library, training engine, and the `ferrite-studio` API binary |
| `ferrite-studio` (this repo) | React SPA, Python FastAPI auth/proxy layer, Docker Compose configuration |

- Full REST API reference: `../ferrite-nn/docs/api-reference.md`
- Long-term roadmap: `../ferrite-nn/ROADMAP.md`

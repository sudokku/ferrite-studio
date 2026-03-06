# ferrite-api-developer — Persistent Memory

## Project structure
- API layer lives in `/Users/radu/Developer/ferrite-studio/api/`
- Rust service docs at `/Users/radu/Developer/ferrite-nn/docs/api-reference.md`

## Implemented endpoints (as of Phase 3 + user management)
- `POST /auth/register` — create user, returns 201 + {ok, user_id}
- `POST /auth/login` — sets access_token + refresh_token httpOnly cookies
- `POST /auth/logout` — clears both cookies
- `POST /auth/refresh` — issues new access_token from refresh_token cookie (validates token_version)
- `GET  /auth/me` — returns {"user": {id, email, username, role, created_at}} when authed, or {"user": null} (200) when not — never 401 (reduces log noise)
- `PATCH /auth/me` — update username/email (409 on conflict)
- `POST /auth/change-password` — hashes new password, increments token_version, 204
- `DELETE /auth/me` — verify password, cascade delete + storage cleanup, clear cookies, 204
- `GET  /auth/oauth/github` + `/auth/oauth/github/callback`
- `GET  /auth/oauth/google` + `/auth/oauth/google/callback`
- `GET/POST /user/architectures`, `GET/DELETE /user/architectures/{id}`
- `GET /user/models`, `POST /user/models/import`, `GET /user/models/{id}`, `GET /user/models/{id}/download`, `DELETE /user/models/{id}`
- `GET /admin/users` (with `search` param), `DELETE /admin/users/{user_id}`, `PATCH /admin/users/{user_id}/role`, `PATCH /admin/users/{user_id}/active`, `GET /admin/users/{user_id}`, `GET /admin/users/{user_id}/architectures`, `GET /admin/users/{user_id}/models`, `GET /admin/stats`
- `GET /admin/architectures` (with `user_id`, `search`, `limit`, `offset`), `DELETE /admin/architectures/{arch_id}`
- `GET /admin/models` (with `user_id`, `search`, `limit`, `offset`), `DELETE /admin/models/{model_id}`
- `ALL  /api/{path}` — authenticated reverse proxy to Rust :7878

## Cookie names & settings
- `access_token` — httpOnly, samesite=lax, path="/", secure=COOKIE_SECURE, max_age = ACCESS_TOKEN_EXPIRE_MINUTES*60
- `refresh_token` — httpOnly, samesite=lax, path="/", secure=COOKIE_SECURE, max_age = REFRESH_TOKEN_EXPIRE_DAYS*86400
- `COOKIE_SECURE` env var (default False) — must be True in production (HTTPS)
- path="/" is REQUIRED: without it cookies default to the response path (e.g. /auth/login) and won't be sent on /api/* requests

## Key architectural decisions
- JWT payload: `{sub: user_id, token_version: int}` — version validated on every auth'd request
- `require_user` returns a `User` ORM object (not str) — proxy uses `current_user.id`
- `require_admin` = `Depends(require_user)` + role != admin → 403
- CRITICAL: `get_storage` must always be used via `Depends(get_storage)` in route handlers — never call it directly. This ensures test overrides work correctly.
- Storage backend: `StorageBackend` ABC in `storage/base.py`; `LocalStorageBackend` in `storage/local.py`
- Storage key pattern: `models/{user_id}/{uuid4}_{filename}`
- Storage deletes happen AFTER DB commit with `asyncio.gather(..., return_exceptions=True)`
- Ownership check: 404 (not 403) when wrong-owner access to prevent info leakage
- RBAC: `UserRole` enum (`user`/`admin`) stored with SAEnum in User model
- `FIRST_ADMIN_EMAIL` env var: on startup, promotes that email to admin if found in DB
- All `relationship()` use `lazy="raise"` to catch async lazy-load bugs

## Known compatibility issues
- **passlib + bcrypt>=4**: Use `bcrypt` directly in `auth/hashing.py`. Do NOT add passlib back.
- **email-validator** must be explicitly listed in requirements.txt for pydantic EmailStr.
- **SQLite timestamp resolution**: sequential inserts may have same-ms timestamps so `ORDER BY created_at DESC` is non-deterministic in tests. Tests must not assert exact ordering within same second.

## Database schema
- User: id, email, username, hashed_password (nullable), oauth_provider, oauth_id, created_at, is_active, role (UserRole enum, default "user"), token_version (int, default 0)
- Architecture: id, owner_id (FK→users CASCADE), name, spec (JSON), created_at
- TrainedModel: id, owner_id (FK→users CASCADE), name, storage_key (str 512), file_size_bytes (BigInteger), input_type (JSON nullable), output_labels (JSON nullable), created_at
- Dev: `sqlite+aiosqlite:///./ferrite.db`; Production: `postgresql+asyncpg://...`

## Key file structure
- `storage/base.py`, `storage/local.py`
- `schemas/auth.py`, `schemas/resources.py`, `schemas/admin.py`
- `models/resources.py` — Architecture + TrainedModel ORM models
- `routes/user_resources.py` — /user/* endpoints
- `routes/admin.py` — /admin/* endpoints
- Admin cross-resource JOIN pattern: `select(Architecture, User).join(User, Architecture.owner_id == User.id)` — never rely on lazy load (lazy="raise" on relationships). Rows come back as `(arch, user)` tuples.

## Testing
- pytest-asyncio with `asyncio_mode = auto` (see pytest.ini)
- In-memory SQLite for tests (`sqlite+aiosqlite:///:memory:`)
- `respx` used to mock Rust service in proxy tests
- `MemoryStorageBackend` (dict-backed) in conftest.py overrides `get_storage`
- Fixtures: `user_a`, `user_b`, `admin_user` (promoted directly in DB after register)

## Environment variables
See `config.py` Settings class. Required: SECRET_KEY.
New: STORAGE_BACKEND, LOCAL_STORAGE_ROOT, S3_BUCKET, S3_REGION, S3_ENDPOINT_URL, FIRST_ADMIN_EMAIL, COOKIE_SECURE

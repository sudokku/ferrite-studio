"""
ferrite-studio FastAPI application.

Startup order:
  1. Validate configuration (raises if SECRET_KEY is missing).
  2. Initialise the DB engine and create tables (dev only — production uses Alembic).
  3. Instantiate and attach the storage backend to app.state.
  4. Register OAuth providers if credentials are present.
  5. Optionally promote the first admin user.
  6. Mount routers: auth, user-resources, admin, proxy (proxy must be last).
"""
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from auth.oauth import register_oauth_providers
from config import get_settings
from dependencies import get_engine, init_db_engine
from models.base import Base
from routes.auth import router as auth_router
from routes.models_route import router as models_router
from routes.proxy import router as proxy_router
from routes.user_resources import router as user_resources_router
from routes.admin import router as admin_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def maybe_promote_first_admin(db, email: str) -> None:
    """
    If FIRST_ADMIN_EMAIL is set and a user with that email exists, promote them to admin.

    This is a one-time bootstrap helper — safe to call on every startup.
    """
    from models.user import User, UserRole  # local import to avoid circular

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user:
        if user.role != UserRole.admin:
            user.role = UserRole.admin
            await db.commit()
            logger.info("Promoted %s to admin role.", email)
        else:
            logger.info("First-admin %s already has admin role.", email)
    else:
        logger.warning("FIRST_ADMIN_EMAIL=%s not found in DB — skipping promotion.", email)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # --- startup ---
    settings = get_settings()  # raises pydantic ValidationError if SECRET_KEY missing

    init_db_engine()
    engine = get_engine()

    # Create tables from ORM metadata.
    # In production, run `alembic upgrade head` instead.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured.")

    # Instantiate storage backend
    from storage.local import LocalStorageBackend

    storage_root = Path(settings.LOCAL_STORAGE_ROOT)
    app.state.storage = LocalStorageBackend(root=storage_root)
    logger.info("Storage backend: local, root=%s", storage_root.resolve())

    register_oauth_providers()

    # Bootstrap first admin
    if settings.FIRST_ADMIN_EMAIL:
        from dependencies import get_session_factory
        factory = get_session_factory()
        async with factory() as db:
            await maybe_promote_first_admin(db, settings.FIRST_ADMIN_EMAIL)

    logger.info(
        "ferrite-studio API ready.  CORS origins: %s  Rust service: %s",
        settings.cors_origins_list,
        settings.RUST_SERVICE_URL,
    )

    yield  # application runs here

    # --- shutdown ---
    await engine.dispose()
    logger.info("Database engine disposed.")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="ferrite-studio API",
        description="Authentication, user management, and proxy layer for ferrite-nn studio.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — never use allow_origins=["*"] in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check — unauthenticated, used by Docker / load balancer
    @app.get("/health", tags=["health"])
    async def health():
        return {"ok": True}

    # Auth endpoints
    app.include_router(auth_router)

    # User resource management (architectures + trained models)
    app.include_router(user_resources_router)

    # Admin management
    app.include_router(admin_router)

    # Model registry stub (future Phase 4 features)
    app.include_router(models_router)

    # Proxy — must be last; catches all /api/* routes
    app.include_router(proxy_router)

    return app


app = create_app()

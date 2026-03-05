"""
Shared FastAPI dependencies.

Provides:
  - get_db        — async SQLAlchemy session
  - require_user  — extract and validate the access_token cookie, return user_id
"""
import logging
from typing import AsyncGenerator

from fastapi import Cookie, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from auth.jwt import decode_token
from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

_engine = None
_async_session_factory: async_sessionmaker | None = None


def init_db_engine() -> None:
    """Initialise the async engine and session factory. Called once on startup."""
    global _engine, _async_session_factory
    settings = get_settings()
    connect_args = {}
    if settings.DATABASE_URL.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    _engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        connect_args=connect_args,
    )
    _async_session_factory = async_sessionmaker(
        _engine, expire_on_commit=False, class_=AsyncSession
    )
    logger.info("Database engine initialised: %s", settings.DATABASE_URL)


def get_engine():
    if _engine is None:
        init_db_engine()
    return _engine


def get_session_factory() -> async_sessionmaker:
    if _async_session_factory is None:
        init_db_engine()
    return _async_session_factory  # type: ignore[return-value]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session per request."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def require_user(request: Request) -> str:
    """
    Extract the access_token from httpOnly cookies and validate it.

    Returns the user_id (str UUID) embedded in the token payload.
    Raises HTTP 401 if the cookie is missing or the token is invalid/expired.
    """
    token: str | None = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. No access token cookie present.",
        )
    payload = decode_token(token)  # raises 401 on invalid/expired
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing subject claim.",
        )
    return user_id

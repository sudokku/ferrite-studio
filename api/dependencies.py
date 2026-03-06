"""
Shared FastAPI dependencies.

Provides:
  - get_db             — async SQLAlchemy session
  - require_user       — extract and validate the access_token cookie, return User ORM object
  - require_admin      — require_user + admin role check
  - get_storage        — returns request.app.state.storage (StorageBackend)
  - get_owned_architecture  — fetch Architecture owned by current user (404 if not found/wrong owner)
  - get_owned_model         — fetch TrainedModel owned by current user (404 if not found/wrong owner)
"""
import logging
import uuid as _uuid_module
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
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

async def require_user(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Extract the access_token from httpOnly cookies, validate it, and return the User ORM object.

    Also validates token_version against the stored value to support JWT invalidation
    on password change.

    Raises HTTP 401 if the cookie is missing, the token is invalid/expired,
    or the token_version does not match.
    """
    from models.user import User  # local import to avoid circular dependency at module load

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

    # Validate token_version for JWT invalidation support
    token_version: int | None = payload.get("token_version")

    result = await db.execute(select(User).where(User.id == user_id))
    user: User | None = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled.",
        )

    # If token has a version claim, verify it matches DB; tokens without the claim
    # are still accepted (backward-compat for existing sessions before this feature).
    if token_version is not None and token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated. Please log in again.",
        )

    return user


async def require_admin(current_user=Depends(require_user)):
    """Require the current user to have the admin role. Raises 403 otherwise."""
    from models.user import UserRole  # local import

    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )
    return current_user


def get_storage(request: Request):
    """Return the StorageBackend instance from app state."""
    return request.app.state.storage


# ---------------------------------------------------------------------------
# Ownership helpers
# ---------------------------------------------------------------------------

async def get_owned_architecture(
    arch_id: str,
    current_user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch an Architecture that belongs to current_user.

    Returns 404 (not 403) whether the record does not exist or belongs to another user —
    this prevents information leakage.
    """
    from models.resources import Architecture  # local import

    result = await db.execute(
        select(Architecture).where(
            Architecture.id == arch_id,
            Architecture.owner_id == current_user.id,
        )
    )
    arch = result.scalars().first()
    if not arch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Architecture not found.")
    return arch


async def get_owned_model(
    model_id: str,
    current_user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch a TrainedModel that belongs to current_user.

    Returns 404 (not 403) whether the record does not exist or belongs to another user.
    """
    from models.resources import TrainedModel  # local import

    result = await db.execute(
        select(TrainedModel).where(
            TrainedModel.id == model_id,
            TrainedModel.owner_id == current_user.id,
        )
    )
    model = result.scalars().first()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found.")
    return model

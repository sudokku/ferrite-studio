"""
pytest fixtures for the ferrite-studio API tests.

- Uses an in-memory SQLite database so tests are hermetic and fast.
- Overrides the get_db dependency with a session backed by the test engine.
- Overrides get_storage with an in-memory MemoryStorageBackend.
- Provides an httpx.AsyncClient with ASGITransport wired to the FastAPI app.
- Provides user_a, user_b, and admin_user fixtures.
"""
import os

# Set required env vars before importing the app so Settings validation passes.
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from dependencies import get_db, get_storage
from main import app
from models.base import Base
from storage.base import StorageBackend

# ---------------------------------------------------------------------------
# In-memory SQLite engine shared across all tests in a session
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
_TestSessionFactory = async_sessionmaker(
    _test_engine, expire_on_commit=False, class_=AsyncSession
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_test_tables():
    """Create all tables once per test session."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(autouse=True)
async def clean_tables():
    """Truncate all tables between tests to ensure isolation."""
    yield
    async with _test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest_asyncio.fixture
async def db_session():
    """Yield a test AsyncSession."""
    async with _TestSessionFactory() as session:
        yield session


async def _override_get_db():
    async with _TestSessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# In-memory storage backend
# ---------------------------------------------------------------------------

class MemoryStorageBackend(StorageBackend):
    """Simple dict-backed storage for tests — no disk I/O."""

    def __init__(self):
        self._store: dict[str, bytes] = {}

    async def write(self, key: str, data: bytes) -> None:
        self._store[key] = data

    async def read(self, key: str) -> bytes:
        if key not in self._store:
            raise FileNotFoundError(key)
        return self._store[key]

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def exists(self, key: str) -> bool:
        return key in self._store


_memory_storage = MemoryStorageBackend()


def _override_get_storage(_request=None):
    return _memory_storage


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client():
    """
    httpx.AsyncClient backed by the FastAPI ASGI app.

    Overrides:
      - get_db      → in-memory SQLite
      - get_storage → MemoryStorageBackend
    """
    # Reset memory storage between tests
    _memory_storage._store.clear()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_storage] = _override_get_storage
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

_REGISTER_URL = "/auth/register"
_LOGIN_URL = "/auth/login"


@pytest_asyncio.fixture
async def user_a(client: AsyncClient) -> dict:
    """Register and log in user A. Returns {user_id, access_token, email, username}."""
    reg = await client.post(_REGISTER_URL, json={
        "email": "user_a@example.com",
        "username": "user_a",
        "password": "securepassword",
    })
    assert reg.status_code == 201, reg.text
    user_id = reg.json()["user_id"]

    login = await client.post(_LOGIN_URL, json={
        "email": "user_a@example.com",
        "password": "securepassword",
    })
    assert login.status_code == 200, login.text
    return {
        "user_id": user_id,
        "access_token": login.cookies["access_token"],
        "email": "user_a@example.com",
        "username": "user_a",
    }


@pytest_asyncio.fixture
async def user_b(client: AsyncClient) -> dict:
    """Register and log in user B. Returns {user_id, access_token, email, username}."""
    reg = await client.post(_REGISTER_URL, json={
        "email": "user_b@example.com",
        "username": "user_b",
        "password": "securepassword",
    })
    assert reg.status_code == 201, reg.text
    user_id = reg.json()["user_id"]

    login = await client.post(_LOGIN_URL, json={
        "email": "user_b@example.com",
        "password": "securepassword",
    })
    assert login.status_code == 200, login.text
    return {
        "user_id": user_id,
        "access_token": login.cookies["access_token"],
        "email": "user_b@example.com",
        "username": "user_b",
    }


@pytest_asyncio.fixture
async def admin_user(client: AsyncClient) -> dict:
    """
    Register a user and promote them to admin role directly in the DB.

    Returns {user_id, access_token, email, username}.
    """
    from models.user import User, UserRole
    from sqlalchemy import select

    reg = await client.post(_REGISTER_URL, json={
        "email": "admin@example.com",
        "username": "admin_user",
        "password": "securepassword",
    })
    assert reg.status_code == 201, reg.text
    user_id = reg.json()["user_id"]

    # Promote to admin directly in DB
    async with _TestSessionFactory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        user.role = UserRole.admin
        await session.commit()

    # Re-login so the access_token reflects the current state
    login = await client.post(_LOGIN_URL, json={
        "email": "admin@example.com",
        "password": "securepassword",
    })
    assert login.status_code == 200, login.text
    return {
        "user_id": user_id,
        "access_token": login.cookies["access_token"],
        "email": "admin@example.com",
        "username": "admin_user",
    }

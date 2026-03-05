"""
pytest fixtures for the ferrite-studio API tests.

- Uses an in-memory SQLite database so tests are hermetic and fast.
- Overrides the get_db dependency with a session backed by the test engine.
- Provides an httpx.AsyncClient with ASGITransport wired to the FastAPI app.
"""
import os

# Set required env vars before importing the app so Settings validation passes.
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from dependencies import get_db
from main import app
from models.base import Base

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


@pytest_asyncio.fixture
async def client():
    """
    httpx.AsyncClient backed by the FastAPI ASGI app.

    The get_db dependency is overridden to use the in-memory test database.
    """
    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()

"""
Alembic environment configuration.

Supports async migrations via SQLAlchemy's async engine.
Run migrations with:
    alembic upgrade head
"""
import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

# Ensure the api/ package root is on sys.path so that imports work when
# alembic is invoked from the api/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from config import get_settings
from models.base import Base

# Alembic Config object (gives access to values in alembic.ini)
config = context.config

# Set up logging from alembic.ini if present
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The SQLAlchemy MetaData object for 'autogenerate' support
target_metadata = Base.metadata


def get_url() -> str:
    return get_settings().DATABASE_URL


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection required)."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode using an async engine."""
    engine = create_async_engine(get_url(), echo=False)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())

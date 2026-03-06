import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./ferrite.db"

    # JWT
    SECRET_KEY: str  # required — app raises on startup if missing
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Rust backend
    RUST_SERVICE_URL: str = "http://127.0.0.1:7878"

    # OAuth (optional)
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # CORS — comma-separated list of allowed origins
    CORS_ORIGINS: str = "http://localhost:5173"

    # Storage
    STORAGE_BACKEND: str = "local"
    LOCAL_STORAGE_ROOT: Path = Path("./data/storage")
    S3_BUCKET: str = ""
    S3_REGION: str = "us-east-1"
    S3_ENDPOINT_URL: str = ""

    # Cookie security — set to True in production (HTTPS only)
    COOKIE_SECURE: bool = False

    # Admin bootstrap — if set, promote this email to admin on startup
    FIRST_ADMIN_EMAIL: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()  # type: ignore[call-arg]
    logger.info("Settings loaded. DB: %s  Rust: %s", settings.DATABASE_URL, settings.RUST_SERVICE_URL)
    return settings

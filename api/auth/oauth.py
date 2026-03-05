"""
OAuth 2.0 stubs for GitHub and Google via Authlib.

Full implementation is wired up in routes/auth.py. This module holds
the Authlib OAuth registry and provider registration so that the
client objects are created once and reused.
"""
import logging
from typing import Optional

from authlib.integrations.starlette_client import OAuth

from config import get_settings

logger = logging.getLogger(__name__)

oauth = OAuth()


def register_oauth_providers() -> None:
    """
    Register GitHub and Google OAuth providers if credentials are configured.

    Called once during application startup (lifespan).
    """
    settings = get_settings()

    if settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
        oauth.register(
            name="github",
            client_id=settings.GITHUB_CLIENT_ID,
            client_secret=settings.GITHUB_CLIENT_SECRET,
            access_token_url="https://github.com/login/oauth/access_token",
            access_token_params=None,
            authorize_url="https://github.com/login/oauth/authorize",
            authorize_params=None,
            api_base_url="https://api.github.com/",
            client_kwargs={"scope": "user:email"},
        )
        logger.info("GitHub OAuth provider registered.")
    else:
        logger.info("GitHub OAuth not configured (GITHUB_CLIENT_ID/SECRET missing).")

    if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
        oauth.register(
            name="google",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
        logger.info("Google OAuth provider registered.")
    else:
        logger.info("Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET missing).")


def get_github_client() -> Optional[object]:
    return getattr(oauth, "github", None)


def get_google_client() -> Optional[object]:
    return getattr(oauth, "google", None)

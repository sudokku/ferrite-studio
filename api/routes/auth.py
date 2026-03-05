"""
Authentication routes.

POST /auth/register   — create a new user account
POST /auth/login      — validate credentials, set httpOnly cookies
POST /auth/logout     — clear auth cookies
POST /auth/refresh    — exchange refresh token for new access token
GET  /auth/me         — return current user info
GET  /auth/oauth/github          — redirect to GitHub OAuth
GET  /auth/oauth/github/callback — handle GitHub OAuth callback
GET  /auth/oauth/google          — redirect to Google OAuth
GET  /auth/oauth/google/callback — handle Google OAuth callback
"""
import logging
import uuid
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth.hashing import hash_password, verify_password
from auth.jwt import create_access_token, create_refresh_token, decode_token
from auth.oauth import get_github_client, get_google_client
from config import get_settings
from dependencies import get_db, require_user
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

_ACCESS_COOKIE = "access_token"
_REFRESH_COOKIE = "refresh_token"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=_ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,  # set to True behind HTTPS in production
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(_ACCESS_COOKIE)
    response.delete_cookie(_REFRESH_COOKIE)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("username must not be blank")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    created_at: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new password-based user account."""
    # Check for duplicates
    existing = await db.execute(
        select(User).where((User.email == body.email) | (User.username == body.username))
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with that email or username already exists.",
        )

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with that email or username already exists.",
        )

    logger.info("New user registered: %s (%s)", user.username, user.id)
    return {"ok": True, "user_id": user.id}


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Validate credentials and set httpOnly auth cookies."""
    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalars().first()

    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled.",
        )

    token_data = {"sub": user.id}
    _set_auth_cookies(response, create_access_token(token_data), create_refresh_token(token_data))

    logger.info("User logged in: %s", user.id)
    return {"ok": True, "username": user.username}


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookies."""
    _clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    """Issue a new access token using the refresh token cookie."""
    token: str | None = request.cookies.get(_REFRESH_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token cookie present.",
        )
    payload = decode_token(token)  # raises 401 on invalid/expired
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token payload is invalid.",
        )

    new_access = create_access_token({"sub": user_id})
    settings = get_settings()
    response.set_cookie(
        key=_ACCESS_COOKIE,
        value=new_access,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(require_user),
):
    """Return the currently authenticated user's profile."""
    result = await db.execute(select(User).where(User.id == user_id))
    user: User | None = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        created_at=user.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# OAuth — GitHub
# ---------------------------------------------------------------------------

@router.get("/oauth/github")
async def oauth_github_redirect(request: Request):
    """Redirect the browser to GitHub for OAuth authorisation."""
    client = get_github_client()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth is not configured on this server.",
        )
    redirect_uri = str(request.url_for("oauth_github_callback"))
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/oauth/github/callback", name="oauth_github_callback")
async def oauth_github_callback(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Handle the GitHub OAuth callback: exchange code, upsert user, set cookies."""
    client = get_github_client()
    if not client:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="GitHub OAuth is not configured.")

    token = await client.authorize_access_token(request)
    resp = await client.get("user", token=token)
    resp.raise_for_status()
    github_user = resp.json()

    # Fetch primary email if not public
    email: str | None = github_user.get("email")
    if not email:
        emails_resp = await client.get("user/emails", token=token)
        emails_resp.raise_for_status()
        for e in emails_resp.json():
            if e.get("primary") and e.get("verified"):
                email = e["email"]
                break

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not retrieve email from GitHub.")

    oauth_id = str(github_user["id"])
    user = await _upsert_oauth_user(db, email=email, provider="github", provider_id=oauth_id,
                                    username=github_user.get("login", email.split("@")[0]))

    token_data = {"sub": user.id}
    _set_auth_cookies(response, create_access_token(token_data), create_refresh_token(token_data))

    settings = get_settings()
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(url=frontend_url)


# ---------------------------------------------------------------------------
# OAuth — Google
# ---------------------------------------------------------------------------

@router.get("/oauth/google")
async def oauth_google_redirect(request: Request):
    """Redirect the browser to Google for OAuth authorisation."""
    client = get_google_client()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured on this server.",
        )
    redirect_uri = str(request.url_for("oauth_google_callback"))
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/oauth/google/callback", name="oauth_google_callback")
async def oauth_google_callback(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Handle the Google OAuth callback: exchange code, upsert user, set cookies."""
    client = get_google_client()
    if not client:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth is not configured.")

    token = await client.authorize_access_token(request)
    userinfo = token.get("userinfo") or await client.userinfo(token=token)

    email: str | None = userinfo.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not retrieve email from Google.")

    oauth_id = str(userinfo["sub"])
    username = userinfo.get("name") or email.split("@")[0]
    user = await _upsert_oauth_user(db, email=email, provider="google", provider_id=oauth_id, username=username)

    token_data = {"sub": user.id}
    _set_auth_cookies(response, create_access_token(token_data), create_refresh_token(token_data))

    settings = get_settings()
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(url=frontend_url)


# ---------------------------------------------------------------------------
# OAuth helper
# ---------------------------------------------------------------------------

async def _upsert_oauth_user(
    db: AsyncSession,
    *,
    email: str,
    provider: str,
    provider_id: str,
    username: str,
) -> User:
    """
    Find or create a user for an OAuth login.

    If a user with this email already exists, link the OAuth provider to it.
    """
    # Try to find by provider + id first (most specific)
    result = await db.execute(
        select(User).where(User.oauth_provider == provider, User.oauth_id == provider_id)
    )
    user: User | None = result.scalars().first()

    if not user:
        # Try to link by email
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        if user:
            user.oauth_provider = provider
            user.oauth_id = provider_id
            await db.commit()
            await db.refresh(user)

    if not user:
        # New OAuth user — generate a unique username if needed
        safe_username = await _unique_username(db, username)
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            username=safe_username,
            hashed_password=None,
            oauth_provider=provider,
            oauth_id=provider_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("New OAuth user created: %s via %s", user.id, provider)

    return user


async def _unique_username(db: AsyncSession, base: str) -> str:
    """Return a username derived from *base* that is not already taken."""
    # Sanitise to alphanumeric + underscores
    safe = "".join(c if c.isalnum() or c == "_" else "_" for c in base)[:80] or "user"
    candidate = safe
    suffix = 1
    while True:
        result = await db.execute(select(User).where(User.username == candidate))
        if not result.scalars().first():
            return candidate
        candidate = f"{safe}_{suffix}"
        suffix += 1

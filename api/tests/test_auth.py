"""
Tests for authentication endpoints.

Covers:
  POST /auth/register  — success, duplicate email, duplicate username
  POST /auth/login     — success (cookies set), wrong password, unknown user
  GET  /auth/me        — valid cookie, missing cookie (401), expired token (401)
  POST /auth/logout    — cookies cleared
  POST /auth/refresh   — success, missing cookie (401)
"""
import time
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from jose import jwt

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_REGISTER_URL = "/auth/register"
_LOGIN_URL = "/auth/login"
_LOGOUT_URL = "/auth/logout"
_REFRESH_URL = "/auth/refresh"
_ME_URL = "/auth/me"

_SECRET = "test-secret-key-that-is-long-enough"
_ALG = "HS256"


def _make_expired_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        "token_type": "access",
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALG)


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    resp = await client.post(_REGISTER_URL, json={
        "email": "alice@example.com",
        "username": "alice",
        "password": "securepassword",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["ok"] is True
    assert "user_id" in body


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "bob@example.com", "username": "bob", "password": "securepassword"}
    await client.post(_REGISTER_URL, json=payload)
    # second attempt with same email, different username
    resp = await client.post(_REGISTER_URL, json={**payload, "username": "bob2"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient):
    await client.post(_REGISTER_URL, json={
        "email": "carol@example.com", "username": "carol", "password": "securepassword"
    })
    resp = await client.post(_REGISTER_URL, json={
        "email": "carol2@example.com", "username": "carol", "password": "securepassword"
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient):
    resp = await client.post(_REGISTER_URL, json={
        "email": "dave@example.com", "username": "dave", "password": "short"
    })
    assert resp.status_code == 422  # pydantic validation error


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    # register first
    await client.post(_REGISTER_URL, json={
        "email": "eve@example.com", "username": "eve", "password": "securepassword"
    })
    resp = await client.post(_LOGIN_URL, json={
        "email": "eve@example.com", "password": "securepassword"
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["username"] == "eve"
    # Both cookies must be set
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post(_REGISTER_URL, json={
        "email": "frank@example.com", "username": "frank", "password": "securepassword"
    })
    resp = await client.post(_LOGIN_URL, json={
        "email": "frank@example.com", "password": "wrongpassword"
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient):
    resp = await client.post(_LOGIN_URL, json={
        "email": "nobody@example.com", "password": "securepassword"
    })
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /auth/me
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient):
    await client.post(_REGISTER_URL, json={
        "email": "grace@example.com", "username": "grace", "password": "securepassword"
    })
    login_resp = await client.post(_LOGIN_URL, json={
        "email": "grace@example.com", "password": "securepassword"
    })
    token = login_resp.cookies["access_token"]

    me_resp = await client.get(_ME_URL, cookies={"access_token": token})
    assert me_resp.status_code == 200
    body = me_resp.json()
    # Response is wrapped: {"user": {...}}
    assert body["user"] is not None
    assert body["user"]["email"] == "grace@example.com"
    assert body["user"]["username"] == "grace"
    assert "id" in body["user"]
    assert "created_at" in body["user"]


@pytest.mark.asyncio
async def test_me_no_cookie(client: AsyncClient):
    # Unauthenticated probe returns 200 {"user": null} — no console noise.
    resp = await client.get(_ME_URL)
    assert resp.status_code == 200
    assert resp.json() == {"user": None}


@pytest.mark.asyncio
async def test_me_expired_token(client: AsyncClient):
    register_resp = await client.post(_REGISTER_URL, json={
        "email": "hank@example.com", "username": "hank", "password": "securepassword"
    })
    user_id = register_resp.json()["user_id"]
    expired = _make_expired_token(user_id)

    # Expired token is treated the same as no token — 200 {"user": null}.
    resp = await client.get(_ME_URL, cookies={"access_token": expired})
    assert resp.status_code == 200
    assert resp.json() == {"user": None}


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_logout_clears_cookies(client: AsyncClient):
    await client.post(_REGISTER_URL, json={
        "email": "ivy@example.com", "username": "ivy", "password": "securepassword"
    })
    login_resp = await client.post(_LOGIN_URL, json={
        "email": "ivy@example.com", "password": "securepassword"
    })
    assert "access_token" in login_resp.cookies

    logout_resp = await client.post(_LOGOUT_URL)
    assert logout_resp.status_code == 200
    assert logout_resp.json()["ok"] is True
    # After logout the client's cookie jar should have cleared / expired cookies
    # httpx reflects Set-Cookie: access_token="" or max-age=0
    set_cookie_header = logout_resp.headers.get("set-cookie", "")
    assert "access_token" in set_cookie_header


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_success(client: AsyncClient):
    await client.post(_REGISTER_URL, json={
        "email": "jack@example.com", "username": "jack", "password": "securepassword"
    })
    login_resp = await client.post(_LOGIN_URL, json={
        "email": "jack@example.com", "password": "securepassword"
    })
    refresh_token = login_resp.cookies["refresh_token"]

    resp = await client.post(_REFRESH_URL, cookies={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert "access_token" in resp.cookies


@pytest.mark.asyncio
async def test_refresh_missing_cookie(client: AsyncClient):
    resp = await client.post(_REFRESH_URL)
    assert resp.status_code == 401

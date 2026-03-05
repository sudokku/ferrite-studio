"""
Tests for the authenticated proxy layer (routes/proxy.py).

The Rust service is mocked with respx so no real service needs to be running.

Covers:
  1. Unauthenticated request to /api/architect → 401
  2. Authenticated GET /api/architect → forwarded, X-User-Id injected
  3. Authenticated POST /api/train/start → forwarded correctly
  4. X-User-Id in forwarded request matches logged-in user's ID
  5. /api/train/events → StreamingResponse with text/event-stream content-type
"""
import os

import pytest
import respx
from httpx import AsyncClient, Response

_REGISTER_URL = "/auth/register"
_LOGIN_URL = "/auth/login"
_RUST_BASE = "http://127.0.0.1:7878"


async def _register_and_login(client: AsyncClient, suffix: str = "") -> tuple[str, str]:
    """Register a user and return (user_id, access_token)."""
    email = f"proxy_user{suffix}@example.com"
    username = f"proxy_user{suffix}"
    reg = await client.post(_REGISTER_URL, json={
        "email": email,
        "username": username,
        "password": "securepassword",
    })
    assert reg.status_code == 201, reg.text
    user_id = reg.json()["user_id"]

    login = await client.post(_LOGIN_URL, json={"email": email, "password": "securepassword"})
    assert login.status_code == 200, login.text
    token = login.cookies["access_token"]
    return user_id, token


# ---------------------------------------------------------------------------
# 1. Unauthenticated request → 401
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_proxy_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/architect")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 2. Authenticated GET /api/architect → forwarded, X-User-Id injected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@respx.mock
async def test_proxy_get_architect(client: AsyncClient):
    user_id, token = await _register_and_login(client, suffix="1")

    captured_headers: dict = {}

    def capture(request):
        captured_headers.update(dict(request.headers))
        return Response(200, json={"spec": None, "hyperparams": None, "tab_unlock": 1, "flash": None})

    respx.get(f"{_RUST_BASE}/api/architect").mock(side_effect=capture)

    resp = await client.get("/api/architect", cookies={"access_token": token})
    assert resp.status_code == 200

    # X-User-Id must equal the logged-in user's ID
    assert captured_headers.get("x-user-id") == user_id

    # Cookie headers must NOT be forwarded
    assert "cookie" not in captured_headers


# ---------------------------------------------------------------------------
# 3. Authenticated POST /api/train/start → forwarded correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@respx.mock
async def test_proxy_post_train_start(client: AsyncClient):
    user_id, token = await _register_and_login(client, suffix="2")

    respx.post(f"{_RUST_BASE}/api/train/start").mock(return_value=Response(200, json={"ok": True}))

    resp = await client.post("/api/train/start", cookies={"access_token": token})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


# ---------------------------------------------------------------------------
# 4. X-User-Id matches logged-in user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@respx.mock
async def test_proxy_x_user_id_matches(client: AsyncClient):
    user_id, token = await _register_and_login(client, suffix="3")

    injected_user_id: list[str] = []

    def capture(request):
        injected_user_id.append(request.headers.get("x-user-id", ""))
        return Response(200, json={"ok": True})

    respx.post(f"{_RUST_BASE}/api/train/stop").mock(side_effect=capture)

    await client.post("/api/train/stop", cookies={"access_token": token})

    assert len(injected_user_id) == 1
    assert injected_user_id[0] == user_id


# ---------------------------------------------------------------------------
# 5. SSE /api/train/events → StreamingResponse with correct content-type
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@respx.mock
async def test_proxy_sse_content_type(client: AsyncClient):
    user_id, token = await _register_and_login(client, suffix="4")

    sse_body = b"event: epoch\ndata: {}\n\n"
    respx.get(f"{_RUST_BASE}/api/train/events").mock(
        return_value=Response(
            200,
            content=sse_body,
            headers={"content-type": "text/event-stream"},
        )
    )

    resp = await client.get(
        "/api/train/events",
        cookies={"access_token": token},
        headers={"Accept": "text/event-stream"},
    )
    assert resp.status_code == 200
    content_type = resp.headers.get("content-type", "")
    assert "text/event-stream" in content_type

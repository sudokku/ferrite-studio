"""
Tests for admin endpoints (/admin/*).

Covers:
  1. GET  /admin/users        — admin can list users
  2. GET  /admin/users        — non-admin gets 403
  3. DELETE /admin/users/{id} — deletes user and their models
  4. PATCH /admin/users/{id}/role — promotes user to admin
  5. GET  /admin/stats        — returns counts
  6. Admin cannot delete themselves (400)
"""
import io
import json

import pytest
from httpx import AsyncClient

_ADMIN_USERS_URL = "/admin/users"
_ADMIN_STATS_URL = "/admin/stats"
_MODELS_URL = "/user/models"
_REGISTER_URL = "/auth/register"
_LOGIN_URL = "/auth/login"
_SAMPLE_MODEL_JSON = json.dumps({"w": [1, 2]}).encode()


# ---------------------------------------------------------------------------
# 1. Admin can list users
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_users(client: AsyncClient, admin_user: dict, user_a: dict):
    token = admin_user["access_token"]
    resp = await client.get(_ADMIN_USERS_URL, cookies={"access_token": token})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "total" in body
    assert "items" in body
    assert body["total"] >= 2  # admin + user_a at minimum
    ids = [item["id"] for item in body["items"]]
    assert admin_user["user_id"] in ids
    assert user_a["user_id"] in ids


# ---------------------------------------------------------------------------
# 2. Non-admin gets 403
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_non_admin_cannot_list_users(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]
    resp = await client.get(_ADMIN_USERS_URL, cookies={"access_token": token})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 3. Admin deletes user and their models
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_delete_user(client: AsyncClient, admin_user: dict, user_a: dict):
    from tests.conftest import _memory_storage

    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_a_id = user_a["user_id"]

    # user_a imports a model first
    import_resp = await client.post(
        f"{_MODELS_URL}/import",
        data={"name": "UserAModel"},
        files={"file": ("m.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": user_a_token},
    )
    assert import_resp.status_code == 201
    storage_key = import_resp.json()["storage_key"]
    assert await _memory_storage.exists(storage_key)

    # Admin deletes user_a
    del_resp = await client.delete(
        f"{_ADMIN_USERS_URL}/{user_a_id}",
        cookies={"access_token": admin_token},
    )
    assert del_resp.status_code == 204, del_resp.text

    # user_a no longer appears in list
    list_resp = await client.get(_ADMIN_USERS_URL, cookies={"access_token": admin_token})
    ids = [item["id"] for item in list_resp.json()["items"]]
    assert user_a_id not in ids

    # Storage file should be deleted too
    assert not await _memory_storage.exists(storage_key)


# ---------------------------------------------------------------------------
# 4. Admin promotes user to admin
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_promote_user(client: AsyncClient, admin_user: dict, user_a: dict):
    admin_token = admin_user["access_token"]
    user_a_id = user_a["user_id"]

    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/{user_a_id}/role",
        json={"role": "admin"},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_demote_user(client: AsyncClient, admin_user: dict, user_a: dict):
    """Admin can also demote another user back to regular user."""
    admin_token = admin_user["access_token"]
    user_a_id = user_a["user_id"]

    # First promote
    await client.patch(
        f"{_ADMIN_USERS_URL}/{user_a_id}/role",
        json={"role": "admin"},
        cookies={"access_token": admin_token},
    )

    # Then demote
    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/{user_a_id}/role",
        json={"role": "user"},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "user"


# ---------------------------------------------------------------------------
# 5. Admin stats
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_stats(client: AsyncClient, admin_user: dict, user_a: dict):
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]

    # user_a imports a model
    await client.post(
        f"{_MODELS_URL}/import",
        data={"name": "StatsModel"},
        files={"file": ("m.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": user_a_token},
    )

    resp = await client.get(_ADMIN_STATS_URL, cookies={"access_token": admin_token})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "users" in body
    assert "architectures" in body
    assert "models" in body
    assert body["users"] >= 2
    assert body["models"] >= 1


# ---------------------------------------------------------------------------
# 6. Admin cannot delete themselves
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_cannot_delete_self(client: AsyncClient, admin_user: dict):
    admin_token = admin_user["access_token"]
    admin_id = admin_user["user_id"]

    resp = await client.delete(
        f"{_ADMIN_USERS_URL}/{admin_id}",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 400, resp.text


# ---------------------------------------------------------------------------
# 7. Admin cannot demote themselves
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_cannot_demote_self(client: AsyncClient, admin_user: dict):
    admin_token = admin_user["access_token"]
    admin_id = admin_user["user_id"]

    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/{admin_id}/role",
        json={"role": "user"},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 400, resp.text


# ---------------------------------------------------------------------------
# 8. Unauthenticated request to admin endpoints → 401
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_unauthenticated(client: AsyncClient):
    resp = await client.get(_ADMIN_USERS_URL)
    assert resp.status_code == 401

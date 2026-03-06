"""
Tests for admin endpoints (/admin/*).

Covers:
  1.  GET  /admin/users             — admin can list users
  2.  GET  /admin/users             — non-admin gets 403
  3.  DELETE /admin/users/{id}      — deletes user and their models
  4.  PATCH /admin/users/{id}/role  — promotes user to admin
  5.  GET  /admin/stats             — returns counts
  6.  Admin cannot delete themselves (400)
  7.  Admin cannot demote themselves (400)
  8.  Unauthenticated request → 401
  9.  GET  /admin/users?search=     — filters correctly
  10. PATCH /admin/users/{id}/active — suspend / unsuspend; admin cannot suspend self
  11. GET  /admin/users/{id}         — single user detail with counts
  12. GET  /admin/users/{id}/architectures — user's architectures
  13. GET  /admin/users/{id}/models        — user's models
  14. GET  /admin/architectures            — all architectures with owner info
  15. GET  /admin/architectures?user_id=  — filter by owner
  16. GET  /admin/models                  — all models with owner info
  17. DELETE /admin/architectures/{id}   — admin can delete any arch
  18. DELETE /admin/models/{id}          — admin can delete any model
"""
import io
import json

import pytest
from httpx import AsyncClient

_ADMIN_USERS_URL = "/admin/users"
_ADMIN_STATS_URL = "/admin/stats"
_ADMIN_ARCHS_URL = "/admin/architectures"
_ADMIN_MODELS_URL = "/admin/models"
_USER_ARCHS_URL = "/user/architectures"
_MODELS_URL = "/user/models"
_REGISTER_URL = "/auth/register"
_LOGIN_URL = "/auth/login"
_SAMPLE_MODEL_JSON = json.dumps({"w": [1, 2]}).encode()
_SAMPLE_ARCH_SPEC = {"layers": [{"type": "Dense", "size": 10}]}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_arch(client: AsyncClient, token: str, name: str = "TestArch") -> dict:
    """Create an architecture for the given user and return the response JSON."""
    resp = await client.post(
        _USER_ARCHS_URL,
        json={"name": name, "spec": _SAMPLE_ARCH_SPEC},
        cookies={"access_token": token},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _import_model(client: AsyncClient, token: str, name: str = "TestModel") -> dict:
    """Import a model for the given user and return the response JSON."""
    resp = await client.post(
        f"{_MODELS_URL}/import",
        data={"name": name},
        files={"file": ("m.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": token},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


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


# ---------------------------------------------------------------------------
# 9. GET /admin/users?search= — search filters correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_users_search_by_email(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Search by partial email matches only the matching user."""
    token = admin_user["access_token"]

    # Search for user_a's email prefix
    resp = await client.get(
        _ADMIN_USERS_URL,
        params={"search": "user_a"},
        cookies={"access_token": token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = [item["id"] for item in body["items"]]
    assert user_a["user_id"] in ids
    # user_b email/username doesn't contain "user_a"
    assert user_b["user_id"] not in ids


@pytest.mark.asyncio
async def test_admin_list_users_search_no_match(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """Search with a term that matches nothing returns empty list."""
    token = admin_user["access_token"]

    resp = await client.get(
        _ADMIN_USERS_URL,
        params={"search": "xyznosuchemail"},
        cookies={"access_token": token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_admin_list_users_empty_search_returns_all(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Empty search string returns all users (no filter applied)."""
    token = admin_user["access_token"]

    resp = await client.get(
        _ADMIN_USERS_URL,
        params={"search": ""},
        cookies={"access_token": token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 3  # admin + user_a + user_b


# ---------------------------------------------------------------------------
# 10. PATCH /admin/users/{id}/active — suspend / unsuspend
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_suspend_user(client: AsyncClient, admin_user: dict, user_a: dict):
    """Admin can suspend a user; suspended user gets 401 on login."""
    admin_token = admin_user["access_token"]
    user_a_id = user_a["user_id"]

    # Suspend user_a
    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/{user_a_id}/active",
        json={"is_active": False},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_active"] is False
    assert body["id"] == user_a_id

    # Suspended user cannot log in
    login_resp = await client.post(
        _LOGIN_URL,
        json={"email": user_a["email"], "password": "securepassword"},
    )
    assert login_resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_unsuspend_user(client: AsyncClient, admin_user: dict, user_a: dict):
    """Admin can unsuspend a previously suspended user."""
    admin_token = admin_user["access_token"]
    user_a_id = user_a["user_id"]

    # Suspend first
    await client.patch(
        f"{_ADMIN_USERS_URL}/{user_a_id}/active",
        json={"is_active": False},
        cookies={"access_token": admin_token},
    )

    # Unsuspend
    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/{user_a_id}/active",
        json={"is_active": True},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_admin_cannot_suspend_self(client: AsyncClient, admin_user: dict):
    """Admin cannot suspend their own account."""
    admin_token = admin_user["access_token"]
    admin_id = admin_user["user_id"]

    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/{admin_id}/active",
        json={"is_active": False},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 400, resp.text


@pytest.mark.asyncio
async def test_admin_suspend_nonexistent_user(client: AsyncClient, admin_user: dict):
    """Suspending a non-existent user returns 404."""
    admin_token = admin_user["access_token"]

    resp = await client.patch(
        f"{_ADMIN_USERS_URL}/nonexistent-uuid/active",
        json={"is_active": False},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# 11. GET /admin/users/{id} — single user detail with counts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_get_user_detail_no_resources(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """User detail returns zero counts when user has no resources."""
    token = admin_user["access_token"]
    user_a_id = user_a["user_id"]

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/{user_a_id}",
        cookies={"access_token": token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == user_a_id
    assert body["email"] == user_a["email"]
    assert body["architecture_count"] == 0
    assert body["model_count"] == 0


@pytest.mark.asyncio
async def test_admin_get_user_detail_with_resources(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """User detail counts match the number of resources created."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_a_id = user_a["user_id"]

    # Create 2 architectures and 1 model for user_a
    await _create_arch(client, user_a_token, "Arch1")
    await _create_arch(client, user_a_token, "Arch2")
    await _import_model(client, user_a_token, "Model1")

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/{user_a_id}",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["architecture_count"] == 2
    assert body["model_count"] == 1


@pytest.mark.asyncio
async def test_admin_get_user_detail_not_found(client: AsyncClient, admin_user: dict):
    """Returns 404 for a non-existent user."""
    token = admin_user["access_token"]

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/nonexistent-uuid",
        cookies={"access_token": token},
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# 12. GET /admin/users/{id}/architectures
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_user_architectures(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Admin can list architectures for a specific user."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_b_token = user_b["access_token"]
    user_a_id = user_a["user_id"]

    # Create architectures for both users
    arch_a1 = await _create_arch(client, user_a_token, "UserA-Arch1")
    arch_a2 = await _create_arch(client, user_a_token, "UserA-Arch2")
    await _create_arch(client, user_b_token, "UserB-Arch1")

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/{user_a_id}/architectures",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    ids = [item["id"] for item in body["items"]]
    assert arch_a1["id"] in ids
    assert arch_a2["id"] in ids


@pytest.mark.asyncio
async def test_admin_list_user_architectures_empty(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """Returns empty list when user has no architectures."""
    token = admin_user["access_token"]
    user_a_id = user_a["user_id"]

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/{user_a_id}/architectures",
        cookies={"access_token": token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_admin_list_user_architectures_not_found(client: AsyncClient, admin_user: dict):
    """Returns 404 for a non-existent user."""
    token = admin_user["access_token"]

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/nonexistent-uuid/architectures",
        cookies={"access_token": token},
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# 13. GET /admin/users/{id}/models
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_user_models(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Admin can list models for a specific user."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_b_token = user_b["access_token"]
    user_a_id = user_a["user_id"]

    model_a = await _import_model(client, user_a_token, "UserA-Model")
    await _import_model(client, user_b_token, "UserB-Model")

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/{user_a_id}/models",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == model_a["id"]


@pytest.mark.asyncio
async def test_admin_list_user_models_not_found(client: AsyncClient, admin_user: dict):
    """Returns 404 for a non-existent user."""
    token = admin_user["access_token"]

    resp = await client.get(
        f"{_ADMIN_USERS_URL}/nonexistent-uuid/models",
        cookies={"access_token": token},
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# 14. GET /admin/architectures — all architectures with owner info
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_all_architectures(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Admin sees all architectures across all users with owner info."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_b_token = user_b["access_token"]

    arch_a = await _create_arch(client, user_a_token, "Arch-A")
    arch_b = await _create_arch(client, user_b_token, "Arch-B")

    resp = await client.get(_ADMIN_ARCHS_URL, cookies={"access_token": admin_token})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 2

    items_by_id = {item["id"]: item for item in body["items"]}

    # Check owner info is present and correct for arch_a
    assert arch_a["id"] in items_by_id
    item_a = items_by_id[arch_a["id"]]
    assert item_a["owner_id"] == user_a["user_id"]
    assert item_a["owner_username"] == user_a["username"]
    assert item_a["owner_email"] == user_a["email"]

    # Check owner info is correct for arch_b
    assert arch_b["id"] in items_by_id
    item_b = items_by_id[arch_b["id"]]
    assert item_b["owner_id"] == user_b["user_id"]


# ---------------------------------------------------------------------------
# 15. GET /admin/architectures?user_id= — filter by owner
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_architectures_filter_by_user(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Filtering by user_id returns only that user's architectures."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_b_token = user_b["access_token"]

    arch_a = await _create_arch(client, user_a_token, "FilterArch-A")
    await _create_arch(client, user_b_token, "FilterArch-B")

    resp = await client.get(
        _ADMIN_ARCHS_URL,
        params={"user_id": user_a["user_id"]},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == arch_a["id"]


@pytest.mark.asyncio
async def test_admin_list_architectures_search_by_name(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """Search by name filters correctly (case-insensitive)."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]

    await _create_arch(client, user_a_token, "ResNet50")
    await _create_arch(client, user_a_token, "VGG16")

    resp = await client.get(
        _ADMIN_ARCHS_URL,
        params={"search": "resnet"},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "ResNet50"


# ---------------------------------------------------------------------------
# 16. GET /admin/models — all models with owner info
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_list_all_models(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Admin sees all models across all users with owner info."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_b_token = user_b["access_token"]

    model_a = await _import_model(client, user_a_token, "Model-A")
    model_b = await _import_model(client, user_b_token, "Model-B")

    resp = await client.get(_ADMIN_MODELS_URL, cookies={"access_token": admin_token})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 2

    items_by_id = {item["id"]: item for item in body["items"]}

    assert model_a["id"] in items_by_id
    item_a = items_by_id[model_a["id"]]
    assert item_a["owner_id"] == user_a["user_id"]
    assert item_a["owner_username"] == user_a["username"]
    assert item_a["owner_email"] == user_a["email"]
    assert "storage_key" in item_a
    assert "file_size_bytes" in item_a

    assert model_b["id"] in items_by_id


@pytest.mark.asyncio
async def test_admin_list_models_filter_by_user(
    client: AsyncClient, admin_user: dict, user_a: dict, user_b: dict
):
    """Filtering by user_id returns only that user's models."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]
    user_b_token = user_b["access_token"]

    model_a = await _import_model(client, user_a_token, "FilterModel-A")
    await _import_model(client, user_b_token, "FilterModel-B")

    resp = await client.get(
        _ADMIN_MODELS_URL,
        params={"user_id": user_a["user_id"]},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == model_a["id"]


@pytest.mark.asyncio
async def test_admin_list_models_search_by_name(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """Search by model name filters correctly (case-insensitive)."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]

    await _import_model(client, user_a_token, "MNIST-Classifier")
    await _import_model(client, user_a_token, "CIFAR-Net")

    resp = await client.get(
        _ADMIN_MODELS_URL,
        params={"search": "mnist"},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "MNIST-Classifier"


# ---------------------------------------------------------------------------
# 17. DELETE /admin/architectures/{id} — admin can delete any arch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_delete_architecture(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """Admin can delete an architecture owned by another user."""
    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]

    arch = await _create_arch(client, user_a_token, "ToBeDeleted")
    arch_id = arch["id"]

    # Admin deletes it
    resp = await client.delete(
        f"{_ADMIN_ARCHS_URL}/{arch_id}",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 204, resp.text

    # It no longer appears in global list
    list_resp = await client.get(_ADMIN_ARCHS_URL, cookies={"access_token": admin_token})
    ids = [item["id"] for item in list_resp.json()["items"]]
    assert arch_id not in ids


@pytest.mark.asyncio
async def test_admin_delete_architecture_not_found(client: AsyncClient, admin_user: dict):
    """Returns 404 when architecture does not exist."""
    token = admin_user["access_token"]

    resp = await client.delete(
        f"{_ADMIN_ARCHS_URL}/nonexistent-arch-id",
        cookies={"access_token": token},
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# 18. DELETE /admin/models/{id} — admin can delete any model
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_delete_model(
    client: AsyncClient, admin_user: dict, user_a: dict
):
    """Admin can delete a model owned by another user; storage file is removed."""
    from tests.conftest import _memory_storage

    admin_token = admin_user["access_token"]
    user_a_token = user_a["access_token"]

    model = await _import_model(client, user_a_token, "AdminDeleteMe")
    model_id = model["id"]
    storage_key = model["storage_key"]

    assert await _memory_storage.exists(storage_key)

    # Admin deletes it
    resp = await client.delete(
        f"{_ADMIN_MODELS_URL}/{model_id}",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 204, resp.text

    # Storage file gone
    assert not await _memory_storage.exists(storage_key)

    # No longer in global list
    list_resp = await client.get(_ADMIN_MODELS_URL, cookies={"access_token": admin_token})
    ids = [item["id"] for item in list_resp.json()["items"]]
    assert model_id not in ids


@pytest.mark.asyncio
async def test_admin_delete_model_not_found(client: AsyncClient, admin_user: dict):
    """Returns 404 when model does not exist."""
    token = admin_user["access_token"]

    resp = await client.delete(
        f"{_ADMIN_MODELS_URL}/nonexistent-model-id",
        cookies={"access_token": token},
    )
    assert resp.status_code == 404, resp.text

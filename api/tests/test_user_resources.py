"""
Tests for user resource endpoints (/user/architectures, /user/models).

Covers:
  1. POST /user/architectures       — create arch, returns 201
  2. GET  /user/architectures       — list, returns created arch
  3. DELETE /user/architectures/{id} — deletes, 204
  4. POST /user/models/import       — upload a small JSON file, returns 201 with storage_key
  5. GET  /user/models/{id}/download — returns file bytes
  6. DELETE /user/models/{id}       — deletes record and storage file, 204
  7. Ownership: user A cannot access user B's resources (404)
"""
import io
import json

import pytest
from httpx import AsyncClient

_ARCH_URL = "/user/architectures"
_MODELS_URL = "/user/models"

_SAMPLE_SPEC = {
    "layers": [
        {"type": "dense", "units": 128, "activation": "relu"},
        {"type": "dense", "units": 10, "activation": "softmax"},
    ]
}
_SAMPLE_MODEL_JSON = json.dumps({"model": "test", "weights": [1, 2, 3]}).encode()


# ---------------------------------------------------------------------------
# Architecture tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_architecture(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]
    resp = await client.post(
        _ARCH_URL,
        json={"name": "My Network", "spec": _SAMPLE_SPEC},
        cookies={"access_token": token},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "My Network"
    assert body["spec"] == _SAMPLE_SPEC
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_list_architectures(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]

    # Create two architectures
    names = {"Net 0", "Net 1"}
    for name in names:
        await client.post(
            _ARCH_URL,
            json={"name": name, "spec": _SAMPLE_SPEC},
            cookies={"access_token": token},
        )

    resp = await client.get(_ARCH_URL, cookies={"access_token": token})
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 2
    # Both names must appear (order may vary in SQLite due to same-ms timestamps)
    returned_names = {item["name"] for item in items}
    assert returned_names == names


@pytest.mark.asyncio
async def test_get_architecture(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]
    create_resp = await client.post(
        _ARCH_URL,
        json={"name": "GetMe", "spec": _SAMPLE_SPEC},
        cookies={"access_token": token},
    )
    arch_id = create_resp.json()["id"]

    resp = await client.get(f"{_ARCH_URL}/{arch_id}", cookies={"access_token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == arch_id


@pytest.mark.asyncio
async def test_delete_architecture(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]
    create_resp = await client.post(
        _ARCH_URL,
        json={"name": "ToDelete", "spec": _SAMPLE_SPEC},
        cookies={"access_token": token},
    )
    arch_id = create_resp.json()["id"]

    del_resp = await client.delete(f"{_ARCH_URL}/{arch_id}", cookies={"access_token": token})
    assert del_resp.status_code == 204, del_resp.text

    # Should be gone
    get_resp = await client.get(f"{_ARCH_URL}/{arch_id}", cookies={"access_token": token})
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_architecture_unauthenticated(client: AsyncClient):
    resp = await client.get(_ARCH_URL)
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Model import / download / delete tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_import_model(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]
    resp = await client.post(
        f"{_MODELS_URL}/import",
        data={"name": "My Model"},
        files={"file": ("model.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": token},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "My Model"
    assert "storage_key" in body
    assert body["file_size_bytes"] == len(_SAMPLE_MODEL_JSON)


@pytest.mark.asyncio
async def test_list_models(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]

    for i in range(2):
        await client.post(
            f"{_MODELS_URL}/import",
            data={"name": f"Model {i}"},
            files={"file": ("m.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
            cookies={"access_token": token},
        )

    resp = await client.get(_MODELS_URL, cookies={"access_token": token})
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_download_model(client: AsyncClient, user_a: dict):
    token = user_a["access_token"]
    import_resp = await client.post(
        f"{_MODELS_URL}/import",
        data={"name": "DLModel"},
        files={"file": ("model.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": token},
    )
    model_id = import_resp.json()["id"]

    dl_resp = await client.get(f"{_MODELS_URL}/{model_id}/download", cookies={"access_token": token})
    assert dl_resp.status_code == 200, dl_resp.text
    assert dl_resp.content == _SAMPLE_MODEL_JSON
    assert "attachment" in dl_resp.headers.get("content-disposition", "")


@pytest.mark.asyncio
async def test_delete_model(client: AsyncClient, user_a: dict):
    from tests.conftest import _memory_storage

    token = user_a["access_token"]
    import_resp = await client.post(
        f"{_MODELS_URL}/import",
        data={"name": "DelModel"},
        files={"file": ("m.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": token},
    )
    body = import_resp.json()
    model_id = body["id"]
    storage_key = body["storage_key"]

    assert await _memory_storage.exists(storage_key)

    del_resp = await client.delete(f"{_MODELS_URL}/{model_id}", cookies={"access_token": token})
    assert del_resp.status_code == 204, del_resp.text

    # DB record should be gone
    get_resp = await client.get(f"{_MODELS_URL}/{model_id}", cookies={"access_token": token})
    assert get_resp.status_code == 404

    # Storage file should be gone
    assert not await _memory_storage.exists(storage_key)


# ---------------------------------------------------------------------------
# Ownership isolation: user A cannot access user B's resources
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_architecture_ownership_isolation(client: AsyncClient, user_a: dict, user_b: dict):
    """User A creates an arch; user B should get 404 when accessing it."""
    token_a = user_a["access_token"]
    token_b = user_b["access_token"]

    create_resp = await client.post(
        _ARCH_URL,
        json={"name": "PrivateArch", "spec": _SAMPLE_SPEC},
        cookies={"access_token": token_a},
    )
    arch_id = create_resp.json()["id"]

    # User B tries to get it
    resp = await client.get(f"{_ARCH_URL}/{arch_id}", cookies={"access_token": token_b})
    assert resp.status_code == 404

    # User B tries to delete it
    resp = await client.delete(f"{_ARCH_URL}/{arch_id}", cookies={"access_token": token_b})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_model_ownership_isolation(client: AsyncClient, user_a: dict, user_b: dict):
    """User A imports a model; user B should get 404 when accessing it."""
    token_a = user_a["access_token"]
    token_b = user_b["access_token"]

    import_resp = await client.post(
        f"{_MODELS_URL}/import",
        data={"name": "PrivateModel"},
        files={"file": ("m.json", io.BytesIO(_SAMPLE_MODEL_JSON), "application/json")},
        cookies={"access_token": token_a},
    )
    model_id = import_resp.json()["id"]

    # User B tries to access it
    resp = await client.get(f"{_MODELS_URL}/{model_id}", cookies={"access_token": token_b})
    assert resp.status_code == 404

    resp = await client.get(f"{_MODELS_URL}/{model_id}/download", cookies={"access_token": token_b})
    assert resp.status_code == 404

    resp = await client.delete(f"{_MODELS_URL}/{model_id}", cookies={"access_token": token_b})
    assert resp.status_code == 404

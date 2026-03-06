# Implementation Patterns

## Proxy (routes/proxy.py)

The proxy uses a **per-request** `httpx.AsyncClient` with streaming:

```python
timeout = httpx.Timeout(connect=10.0, write=30.0, read=None, pool=10.0)
client = httpx.AsyncClient(timeout=timeout)
upstream_request = client.build_request(method, url, headers=headers, content=request.stream())
upstream_response = await client.send(upstream_request, stream=True)
```

`read=None` is essential — SSE connections stay open until training ends.

The inner generator closes both `upstream_response` and `client` in a `finally` block to prevent connection leaks.

`StreamingResponse` is always used (never buffered), even for JSON responses. This keeps the proxy uniform and handles SSE, CSV downloads, and model JSON downloads correctly.

## Hop-by-hop header stripping

The `_HOP_BY_HOP` frozenset in proxy.py covers: connection, keep-alive, proxy-*, te, trailers, transfer-encoding, upgrade, cookie, set-cookie, host, content-length.

Applied to **both** the incoming request headers (before forwarding) and the upstream response headers (before returning to client).

## bcrypt hashing

Using `bcrypt` library directly (not passlib). API:
```python
salt = bcrypt.gensalt()
hashed = bcrypt.hashpw(plain.encode("utf-8"), salt)  # returns bytes
hashed.decode("utf-8")  # store as str

bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))  # verify
```

## JWT token shape

```python
# Access token
{"sub": user_id, "exp": <datetime>, "token_type": "access"}

# Refresh token
{"sub": user_id, "exp": <datetime>, "token_type": "refresh"}
```

`require_user` dependency reads `access_token` cookie, decodes it, returns `payload["sub"]`.

## OAuth upsert logic

`_upsert_oauth_user()` in routes/auth.py:
1. Look up by (provider, provider_id) — return if found
2. Look up by email — if found, link OAuth to existing account
3. Otherwise create new user with null hashed_password

## conftest.py pattern for test isolation

Session-scoped fixture creates tables once. Function-scoped autouse fixture deletes all rows between tests using `table.delete()` on reversed sorted_tables (respects FK order).

`app.dependency_overrides[get_db] = _override_get_db` is set per client fixture and cleared after.

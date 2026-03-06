"""
Authenticated reverse proxy: forwards all /api/* requests to the Rust service.

Key behaviours:
- Requires a valid access_token httpOnly cookie (HTTP 401 otherwise)
- Injects X-User-Id header before forwarding
- Strips hop-by-hop and cookie headers before forwarding
- Streams the response — never buffers (critical for SSE /api/train/events)
- Passes through status code and response headers verbatim
"""
import logging
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse

from config import get_settings
from dependencies import require_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["proxy"])

# Headers that must not be forwarded to the upstream service.
# These are hop-by-hop headers defined in RFC 2616 §14.10.
_HOP_BY_HOP = frozenset(
    [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        # Also strip cookies — the Rust service doesn't need them
        "cookie",
        "set-cookie",
        # Strip host — httpx will set the correct one
        "host",
        # Strip content-length — httpx recalculates for streaming
        "content-length",
    ]
)

# SSE content-type prefix
_SSE_CONTENT_TYPE = "text/event-stream"


def _build_upstream_headers(request: Request, user_id: str) -> dict[str, str]:
    """Return headers to forward, with hop-by-hop stripped and X-User-Id injected."""
    headers: dict[str, str] = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP
    }
    headers["x-user-id"] = user_id
    return headers


async def _stream_response(response: httpx.Response) -> AsyncIterator[bytes]:
    """Async generator that yields chunks from the upstream httpx response."""
    async for chunk in response.aiter_bytes():
        yield chunk


@router.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
)
async def proxy(
    path: str,
    request: Request,
    current_user=Depends(require_user),
):
    """
    Authenticated transparent proxy to the Rust ferrite-nn studio service.

    1. Validates the access_token cookie (via require_user dependency).
    2. Injects X-User-Id into the upstream request.
    3. Streams the response back to the client without buffering.
    """
    settings = get_settings()
    upstream_url = f"{settings.RUST_SERVICE_URL}/api/{path}"

    # Preserve query parameters
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    headers = _build_upstream_headers(request, current_user.id)

    # Use a per-request client with generous timeouts for long-running SSE streams.
    # read timeout is None so SSE connections can remain open indefinitely.
    timeout = httpx.Timeout(connect=10.0, write=30.0, read=None, pool=10.0)

    client = httpx.AsyncClient(timeout=timeout)
    try:
        upstream_request = client.build_request(
            method=request.method,
            url=upstream_url,
            headers=headers,
            content=request.stream(),
        )

        upstream_response = await client.send(upstream_request, stream=True)

        # Determine content-type to decide whether to use StreamingResponse
        content_type: str = upstream_response.headers.get("content-type", "")

        # Build response headers — strip hop-by-hop from upstream response too
        response_headers: dict[str, str] = {
            k: v
            for k, v in upstream_response.headers.items()
            if k.lower() not in _HOP_BY_HOP
        }

        # Always use StreamingResponse so we never buffer the body.
        # This is mandatory for SSE (text/event-stream) and also correct for
        # large downloads (CSV, model JSON files).
        async def _body_and_close() -> AsyncIterator[bytes]:
            try:
                async for chunk in upstream_response.aiter_bytes():
                    yield chunk
            finally:
                await upstream_response.aclose()
                await client.aclose()

        media_type = content_type.split(";")[0].strip() or "application/octet-stream"

        return StreamingResponse(
            content=_body_and_close(),
            status_code=upstream_response.status_code,
            headers=response_headers,
            media_type=media_type,
        )

    except httpx.ConnectError as exc:
        logger.error("Cannot connect to Rust service at %s: %s", settings.RUST_SERVICE_URL, exc)
        await client.aclose()
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The backend Rust service is unreachable.",
        ) from exc
    except Exception:
        await client.aclose()
        raise

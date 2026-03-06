"""
Local-filesystem storage backend.

Stores files under a configurable root directory.
Uses aiofiles for all I/O to stay non-blocking.
"""
import logging
from pathlib import Path

import aiofiles
import aiofiles.os

from .base import StorageBackend

logger = logging.getLogger(__name__)


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: Path) -> None:
        self._root = root.resolve()

    def _path(self, key: str) -> Path:
        """
        Resolve *key* to an absolute path under self._root.

        Raises ValueError on path-traversal attempts (resolved path escapes root).
        """
        # Normalise key — strip leading slashes so Path resolution works predictably
        clean_key = key.lstrip("/")
        resolved = (self._root / clean_key).resolve()
        if not str(resolved).startswith(str(self._root)):
            raise ValueError(f"Path traversal detected for key: {key!r}")
        return resolved

    async def write(self, key: str, data: bytes) -> None:
        path = self._path(key)
        await aiofiles.os.makedirs(str(path.parent), exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(data)
        logger.debug("Storage write: %s (%d bytes)", key, len(data))

    async def read(self, key: str) -> bytes:
        path = self._path(key)
        async with aiofiles.open(path, "rb") as f:
            data = await f.read()
        return data

    async def delete(self, key: str) -> None:
        path = self._path(key)
        try:
            await aiofiles.os.remove(str(path))
            logger.debug("Storage delete: %s", key)
        except FileNotFoundError:
            pass  # silent no-op

    async def exists(self, key: str) -> bool:
        path = self._path(key)
        return await aiofiles.os.path.exists(str(path))

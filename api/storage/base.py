"""
Abstract storage backend interface.

Implementations:
  - LocalStorageBackend  (storage/local.py) — writes to the local filesystem
  - S3StorageBackend     (future)           — writes to AWS S3 or compatible

All methods are async to allow non-blocking I/O regardless of backend.
"""
from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """Abstract base for file storage backends."""

    @abstractmethod
    async def write(self, key: str, data: bytes) -> None:
        """Persist *data* at *key*. Creates the key if it does not exist."""

    @abstractmethod
    async def read(self, key: str) -> bytes:
        """Return the bytes stored at *key*. Raises FileNotFoundError if missing."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Remove the object at *key*. Silent no-op if the key does not exist."""

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Return True if *key* exists in the backend."""

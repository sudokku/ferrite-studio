"""
Model registry stub.

This module is a placeholder for Phase 4 model registry features
(persisting model metadata in PostgreSQL, sharing links, etc.).
Currently empty — all /api/models/* requests are handled by the proxy.
"""
from fastapi import APIRouter

router = APIRouter(tags=["model-registry"])

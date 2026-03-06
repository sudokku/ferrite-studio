"""
Pydantic schemas for admin endpoints.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.user import UserRole


class UserAdminResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    created_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class UpdateRoleSchema(BaseModel):
    role: UserRole


class SuspendUserSchema(BaseModel):
    is_active: bool


class AdminStatsResponse(BaseModel):
    users: int
    architectures: int
    models: int


class UserAdminDetailResponse(UserAdminResponse):
    """Extends UserAdminResponse with resource counts for the single-user detail view."""

    architecture_count: int
    model_count: int


class ArchitectureAdminResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    owner_id: str
    owner_username: str
    owner_email: str

    model_config = ConfigDict(from_attributes=True)


class ModelAdminResponse(BaseModel):
    id: str
    name: str
    storage_key: str
    file_size_bytes: int
    created_at: datetime
    owner_id: str
    owner_username: str
    owner_email: str

    model_config = ConfigDict(from_attributes=True)

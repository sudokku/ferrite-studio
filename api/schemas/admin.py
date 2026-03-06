"""
Pydantic schemas for admin endpoints.
"""
from datetime import datetime

from pydantic import BaseModel

from models.user import UserRole


class UserAdminResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class UpdateRoleSchema(BaseModel):
    role: UserRole


class AdminStatsResponse(BaseModel):
    users: int
    architectures: int
    models: int

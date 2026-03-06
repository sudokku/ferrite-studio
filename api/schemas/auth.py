"""
Pydantic schemas for auth update endpoints.
"""
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class UpdateProfileSchema(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None


class ChangePasswordSchema(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("new_password must be at least 8 characters")
        return v


class DeleteSelfSchema(BaseModel):
    password: str

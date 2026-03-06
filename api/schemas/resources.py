"""
Pydantic schemas for user resource endpoints.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ArchitectureCreateSchema(BaseModel):
    name: str
    spec: dict


class ArchitectureResponse(BaseModel):
    id: str
    name: str
    spec: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainedModelResponse(BaseModel):
    id: str
    name: str
    storage_key: str
    file_size_bytes: int
    input_type: Optional[dict] = None
    output_labels: Optional[list] = None
    created_at: datetime

    model_config = {"from_attributes": True}
